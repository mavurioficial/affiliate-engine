-- Mavuri Shopee Cloud: one product, all eligible channels, one transaction.
-- Service-only. Publishing remains DISABLED until operator cutover.
-- Serialize all cloud enqueue operations through the same control row.
CREATE OR REPLACE FUNCTION public.mavuri_shopee_cloud_enqueue(
 p_run_id uuid, p_user_id uuid, p_offer_id uuid, p_channel_ids uuid[],
 p_expected_price numeric, p_expected_affiliate_url text,
 p_expected_category_slug text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $enqueue$
DECLARE
  cfg mavuri_internal.discovery_cloud_control%ROWTYPE;
  runrow mavuri_internal.discovery_cloud_runs%ROWTYPE;
  offrow public.flow_offers%ROWTYPE;
  category_slug text;
  key_prefix text;
  destination uuid;
  new_job_id uuid;
  inserted integer:=0;
  existing_count integer;
  family text;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'shopee_cloud_service_role_required' USING ERRCODE='42501';
  END IF;
  IF p_run_id IS NULL OR p_user_id IS NULL OR p_offer_id IS NULL
    OR p_expected_price IS NULL OR p_expected_price<=0
    OR p_expected_affiliate_url IS NULL
    OR p_expected_affiliate_url NOT LIKE 'https://%'
    OR coalesce(btrim(p_expected_category_slug),'')=''
    OR coalesce(array_length(p_channel_ids,1),0) NOT BETWEEN 1 AND 4
    OR EXISTS (SELECT 1 FROM unnest(p_channel_ids) AS x(id) WHERE x.id IS NULL)
    OR (SELECT count(DISTINCT id) FROM unnest(p_channel_ids) AS x(id))
        <> array_length(p_channel_ids,1) THEN
    RETURN jsonb_build_object('accepted',false,'reason','invalid_arguments');
  END IF;
  SELECT * INTO cfg FROM mavuri_internal.discovery_cloud_control
    WHERE id=true FOR UPDATE;
  IF NOT FOUND OR cfg.enabled IS DISTINCT FROM true OR cfg.active_executor<>'cloud' THEN
    RETURN jsonb_build_object('accepted',false,'reason','cloud_disabled');
  END IF;
  SELECT * INTO runrow FROM mavuri_internal.discovery_cloud_runs
    WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR runrow.executor<>'cloud' OR runrow.status<>'running'
    OR NOT mavuri_internal.discovery_cloud_run_time_valid(
      runrow.started_at,runrow.lease_expires_at,clock_timestamp()) THEN
    RETURN jsonb_build_object('accepted',false,'reason','run_not_authorized');
  END IF;
  SELECT * INTO offrow FROM public.flow_offers
    WHERE id=p_offer_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR offrow.price IS DISTINCT FROM p_expected_price
    OR offrow.affiliate_url IS DISTINCT FROM p_expected_affiliate_url
    OR offrow.price<=0 OR coalesce(offrow.discount_percent,0)<10
    OR coalesce(offrow.title,'')='' OR offrow.source_ref IS NULL
    OR offrow.image_url NOT LIKE 'https://%' THEN
    RETURN jsonb_build_object('accepted',false,'reason','commercial_or_offer_changed');
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.flow_marketplaces m
    JOIN public.flow_affiliate_accounts a
      ON a.marketplace_id=m.id AND a.id=offrow.affiliate_account_id
      AND a.user_id=p_user_id AND a.status='connected'
      AND nullif(btrim(a.external_account_id),'') IS NOT NULL
      AND a.settings->>'open_api_status'='active'
    WHERE m.id=offrow.marketplace_id AND m.slug='shopee'
  ) THEN
    RETURN jsonb_build_object('accepted',false,'reason','affiliate_not_verified');
  END IF;
  SELECT c.slug INTO category_slug FROM public.mavuri_categories c
    WHERE c.id=offrow.mavuri_category_id AND c.active;
  IF category_slug IS NULL OR category_slug<>p_expected_category_slug
    OR offrow.metadata #>> '{mavuri,category_slug}' IS DISTINCT FROM category_slug
    OR offrow.mavuri_tags IS NULL THEN
    RETURN jsonb_build_object('accepted',false,'reason','classification_changed');
  END IF;
  key_prefix:='shopee-cloud:'||p_run_id::text||':';
  -- A selected offer consumes one product slot regardless of destination count.
  IF EXISTS(SELECT 1 FROM public.flow_delivery_jobs j
    WHERE j.user_id=p_user_id AND j.offer_id=p_offer_id
      AND left(j.delivery_key,length(key_prefix))=key_prefix) THEN
    RETURN jsonb_build_object('accepted',false,'reason','already_selected_this_cycle');
  END IF;
  SELECT count(DISTINCT j.offer_id) INTO existing_count
    FROM public.flow_delivery_jobs j
    WHERE j.user_id=p_user_id AND left(j.delivery_key,length(key_prefix))=key_prefix;
  IF existing_count>=least(8,cfg.max_shopee) THEN
    RETURN jsonb_build_object('accepted',false,'reason','product_cap');
  END IF;
  SELECT count(DISTINCT j.offer_id) INTO existing_count
    FROM public.flow_delivery_jobs j
    JOIN public.flow_offers previous ON previous.id=j.offer_id
    JOIN public.mavuri_categories cat ON cat.id=previous.mavuri_category_id
    WHERE j.user_id=p_user_id AND left(j.delivery_key,length(key_prefix))=key_prefix
      AND cat.slug=category_slug;
  IF existing_count>=2 THEN
    RETURN jsonb_build_object('accepted',false,'reason','category_cap');
  END IF;
  family:=public.mavuri_offer_family(offrow.title);
  IF family IS NULL OR length(family)<10 THEN
    RETURN jsonb_build_object('accepted',false,'reason','invalid_family');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.flow_delivery_jobs j
    JOIN public.flow_offers previous ON previous.id=j.offer_id
    WHERE j.user_id=p_user_id AND left(j.delivery_key,length(key_prefix))=key_prefix
      AND public.mavuri_offer_family(previous.title)=family
  ) THEN
    RETURN jsonb_build_object('accepted',false,'reason','family_cap');
  END IF;
  -- Check every requested channel BEFORE inserting anything.
  FOREACH destination IN ARRAY p_channel_ids LOOP
    IF NOT EXISTS(
      SELECT 1 FROM public.flow_channels c
      WHERE c.id=destination AND c.user_id=p_user_id
        AND c.type='telegram' AND c.status='connected'
        AND nullif(btrim(c.external_ref),'') IS NOT NULL
        AND c.name IN('Mavuri Ofertas','Mavuri Mulher',
          'Mavuri Casa & Cozinha','Mavuri Tecnologia')
    ) THEN
      RETURN jsonb_build_object('accepted',false,'reason','channel_invalid');
    END IF;
    IF NOT mavuri_internal.shopee_cloud_rule_matches(
      p_user_id,p_offer_id,destination) THEN
      RETURN jsonb_build_object('accepted',false,'reason','rule_changed');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.flow_delivery_jobs j
      JOIN public.flow_offers prior ON prior.id=j.offer_id
      WHERE j.user_id=p_user_id AND j.channel_id=destination
        AND prior.user_id=p_user_id AND prior.marketplace_id=offrow.marketplace_id
        AND prior.source_ref=offrow.source_ref
        AND (j.status IN ('queued','processing') OR
          (j.status='sent' AND j.sent_at>=clock_timestamp()-interval '48 hours'))
    ) THEN
      RETURN jsonb_build_object('accepted',false,'reason','cooldown_or_pending');
    END IF;
  END LOOP;
  -- If any BEFORE INSERT dedup trigger skips a job (RETURN NULL), raise
  -- to ROLLBACK the entire per-product multi-channel transaction.
  FOREACH destination IN ARRAY p_channel_ids LOOP
    new_job_id:=NULL;
    INSERT INTO public.flow_delivery_jobs (
      user_id,offer_id,channel_id,status,attempts,scheduled_for,delivery_key
    ) VALUES (
      p_user_id,p_offer_id,destination,'queued',0,clock_timestamp(),
      key_prefix||p_offer_id::text||':'||destination::text
    ) RETURNING id INTO new_job_id;
    IF new_job_id IS NULL THEN
      RAISE EXCEPTION 'shopee_cloud_atomic_dedup_rejection' USING ERRCODE='23505';
    END IF;
    inserted:=inserted+1;
  END LOOP;
  RETURN jsonb_build_object('accepted',true,
    'unique_products',1,'jobs_created',inserted);
END;
$enqueue$;
REVOKE ALL ON FUNCTION public.mavuri_shopee_cloud_enqueue(
 uuid,uuid,uuid,uuid[],numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mavuri_shopee_cloud_enqueue(
 uuid,uuid,uuid,uuid[],numeric,text,text) TO service_role;

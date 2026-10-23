-- Shopee Cloud: safely refresh existing classified product commerce by signed API caller.
-- No creation, no reclassification, no queueing, no Telegram publication.
CREATE OR REPLACE FUNCTION public.mavuri_shopee_cloud_refresh_existing(
 p_run_id uuid,p_user_id uuid,p_offer_id uuid,p_source_ref text,
 p_expected_old_price numeric,p_expected_old_link text,
 p_current_price numeric,p_current_discount numeric,p_current_link text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $refresh$
DECLARE
 cfg mavuri_internal.discovery_cloud_control%ROWTYPE;
 r mavuri_internal.discovery_cloud_runs%ROWTYPE;
 o public.flow_offers%ROWTYPE;
 actual_category uuid;
 actual_tags text[];
 actual_mavuri jsonb;
 current_cat text;
 new_id uuid;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN
  RAISE EXCEPTION 'shopee_refresh_service_role_required' USING ERRCODE='42501';
 END IF;
 IF p_run_id IS NULL OR p_user_id IS NULL OR p_offer_id IS NULL
   OR p_source_ref !~ '^[0-9]{1,24}$'
   OR p_current_price<=0 OR p_current_discount<10 OR p_current_discount>99
   OR p_current_price IS NULL OR p_current_discount IS NULL
   OR coalesce(p_current_link,'') !~* '^https://(s\.shopee\.com\.br|([a-z0-9-]+\.)?shopee\.com\.br)/'
   THEN RETURN jsonb_build_object('accepted',false,'reason','invalid_commercial_input');
 END IF;
 SELECT * INTO cfg FROM mavuri_internal.discovery_cloud_control WHERE id=true FOR SHARE;
 IF NOT FOUND OR NOT cfg.enabled OR cfg.active_executor<>'cloud' THEN
  RETURN jsonb_build_object('accepted',false,'reason','cloud_disabled');
 END IF;
 SELECT * INTO r FROM mavuri_internal.discovery_cloud_runs WHERE id=p_run_id FOR SHARE;
 IF NOT FOUND OR r.status<>'running' OR r.executor<>'cloud'
   OR NOT mavuri_internal.discovery_cloud_run_time_valid(
    r.started_at,r.lease_expires_at,clock_timestamp()) THEN
  RETURN jsonb_build_object('accepted',false,'reason','run_expired_or_invalid');
 END IF;
 SELECT * INTO o FROM public.flow_offers
 WHERE id=p_offer_id AND user_id=p_user_id AND source_ref=p_source_ref
   AND price=p_expected_old_price
   AND affiliate_url=p_expected_old_link
 FOR UPDATE;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('accepted',false,'reason','old_commercial_data_changed');
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.flow_marketplaces m
  JOIN public.flow_affiliate_accounts a
    ON a.marketplace_id=m.id AND a.id=o.affiliate_account_id
    AND a.user_id=p_user_id AND a.status='connected'
    AND nullif(btrim(a.external_account_id),'') IS NOT NULL
    AND a.settings->>'open_api_status'='active'
  WHERE m.id=o.marketplace_id AND m.slug='shopee'
 ) OR o.mavuri_category_id IS NULL OR o.image_url NOT LIKE 'https://%'
   OR coalesce(o.title,'')=''
   OR coalesce(o.affiliate_url,'') !~* '^https://(s\.shopee\.com\.br|([a-z0-9-]+\.)?shopee\.com\.br)/'
   OR o.price<=0
   OR p_current_price<o.price*0.30 OR p_current_price>o.price*3
   OR NOT EXISTS(SELECT 1 FROM public.mavuri_categories cat
      WHERE cat.id=o.mavuri_category_id AND cat.active
        AND cat.slug=o.metadata #>> '{mavuri,category_slug}')
 THEN RETURN jsonb_build_object('accepted',false,'reason','unsafe_existing_offer');
 END IF;
 IF EXISTS (SELECT 1 FROM public.flow_delivery_jobs j
  WHERE j.offer_id=o.id AND j.status IN('queued','processing')) THEN
   RETURN jsonb_build_object('accepted',false,'reason','offer_in_flight');
 END IF;
 IF o.price=p_current_price AND o.affiliate_url=p_current_link
   AND o.discount_percent=p_current_discount THEN
  RETURN jsonb_build_object('accepted',true,'updated',false,'reason','unchanged');
 END IF;
 actual_category:=o.mavuri_category_id;
 actual_tags:=o.mavuri_tags;
 actual_mavuri:=o.metadata->'mavuri';
 UPDATE public.flow_offers SET price=p_current_price,
  discount_percent=p_current_discount, affiliate_url=p_current_link,
  captured_at=clock_timestamp()
 WHERE id=o.id
 RETURNING id,mavuri_category_id,mavuri_tags,metadata->'mavuri'
 INTO new_id,actual_category,actual_tags,actual_mavuri;
 IF new_id IS NULL
    OR actual_category IS DISTINCT FROM o.mavuri_category_id
    OR actual_tags IS DISTINCT FROM o.mavuri_tags
    OR actual_mavuri IS DISTINCT FROM o.metadata->'mavuri' THEN
  RAISE EXCEPTION 'shopee_refresh_classification_change_blocked'
    USING ERRCODE='23514';
 END IF;
 RETURN jsonb_build_object('accepted',true,'updated',true);
END;
$refresh$;
REVOKE ALL ON FUNCTION public.mavuri_shopee_cloud_refresh_existing(
 uuid,uuid,uuid,text,numeric,text,numeric,numeric,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mavuri_shopee_cloud_refresh_existing(
 uuid,uuid,uuid,text,numeric,text,numeric,numeric,text) TO service_role;

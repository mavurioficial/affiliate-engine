-- Mavuri Shopee Cloud. Fail-closed queue fence. No cron or jobs created.
CREATE OR REPLACE FUNCTION public.mavuri_shopee_cloud_queue_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  run_uuid uuid;
  cfg mavuri_internal.discovery_cloud_control%ROWTYPE;
  offer_row public.flow_offers%ROWTYPE;
  channel_ok boolean;
BEGIN
  IF NEW.delivery_key NOT LIKE 'shopee-cloud:%' THEN RETURN NEW; END IF;
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'shopee_cloud_service_role_required' USING ERRCODE='42501';
  END IF;
  IF NEW.status IS DISTINCT FROM 'queued'
     OR NEW.offer_id IS NULL OR NEW.channel_id IS NULL OR NEW.user_id IS NULL
     OR NEW.delivery_key !~ '^shopee-cloud:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}$'
     OR split_part(NEW.delivery_key,':',3) <> NEW.offer_id::text
     OR split_part(NEW.delivery_key,':',4) <> NEW.channel_id::text THEN
    RAISE EXCEPTION 'shopee_cloud_invalid_job_key' USING ERRCODE='22023';
  END IF;
  run_uuid:=split_part(NEW.delivery_key,':',2)::uuid;
  SELECT * INTO cfg FROM mavuri_internal.discovery_cloud_control
    WHERE id=true FOR SHARE;
  IF NOT FOUND OR NOT cfg.enabled OR cfg.active_executor<>'cloud' THEN
    RAISE EXCEPTION 'shopee_cloud_disabled' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM mavuri_internal.discovery_cloud_runs
    WHERE id=run_uuid AND executor='cloud' AND status='running'
      AND lease_expires_at>clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'shopee_cloud_invalid_lease' USING ERRCODE='42501';
  END IF;
  SELECT o.* INTO offer_row FROM public.flow_offers o
  JOIN public.flow_marketplaces m ON m.id=o.marketplace_id AND m.slug='shopee'
  JOIN public.flow_affiliate_accounts a ON a.id=o.affiliate_account_id
    AND a.user_id=NEW.user_id AND a.marketplace_id=o.marketplace_id
    AND a.status='connected' AND nullif(btrim(a.external_account_id),'') IS NOT NULL
    AND a.settings->>'open_api_status'='active'
  WHERE o.id=NEW.offer_id AND o.user_id=NEW.user_id FOR UPDATE OF o;
  IF NOT FOUND OR coalesce(offer_row.price,0) <= 0
     OR coalesce(offer_row.discount_percent,0) < 10
     OR offer_row.mavuri_category_id IS NULL OR offer_row.source_ref IS NULL
     OR offer_row.affiliate_url IS NULL OR offer_row.affiliate_url NOT LIKE 'https://%'
     OR offer_row.image_url IS NULL OR offer_row.image_url NOT LIKE 'https://%'
     OR NOT EXISTS (
       SELECT 1 FROM public.mavuri_categories c
       WHERE c.id=offer_row.mavuri_category_id AND c.active
         AND c.slug=offer_row.metadata #>> '{mavuri,category_slug}'
     ) THEN
    RAISE EXCEPTION 'shopee_cloud_offer_not_verified' USING ERRCODE='23514';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.flow_channels c WHERE c.id=NEW.channel_id
      AND c.user_id=NEW.user_id AND c.type='telegram'
      AND c.status='connected' AND nullif(btrim(c.external_ref),'') IS NOT NULL
      AND c.name IN ('Mavuri Ofertas','Mavuri Mulher',
           'Mavuri Casa & Cozinha','Mavuri Tecnologia')
  ) INTO channel_ok;
  IF NOT channel_ok THEN
    RAISE EXCEPTION 'shopee_cloud_channel_not_authorized' USING ERRCODE='42501';
  END IF;
  -- Exact-product 48h cooldown. Additional family/rules checks belong
  -- to the separate transactional enqueue RPC (not yet enabled).
  IF EXISTS (
    SELECT 1 FROM public.flow_delivery_jobs j
    JOIN public.flow_offers previous ON previous.id=j.offer_id
    WHERE j.user_id=NEW.user_id AND j.channel_id=NEW.channel_id
      AND previous.user_id=NEW.user_id
      AND previous.marketplace_id=offer_row.marketplace_id
      AND previous.source_ref=offer_row.source_ref
      AND (j.status IN ('queued','processing') OR
        (j.status='sent' AND j.sent_at >= now()-interval '48 hours'))
  ) THEN
    RAISE EXCEPTION 'shopee_cloud_recent_or_pending' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.mavuri_shopee_cloud_queue_fence()
FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_mavuri_shopee_cloud_queue_fence
ON public.flow_delivery_jobs;
CREATE TRIGGER trg_mavuri_shopee_cloud_queue_fence
  BEFORE INSERT ON public.flow_delivery_jobs
  FOR EACH ROW WHEN (NEW.delivery_key LIKE 'shopee-cloud:%')
  EXECUTE FUNCTION public.mavuri_shopee_cloud_queue_fence();

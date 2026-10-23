-- Restrict new cloud runs to 08:00-22:00 America/Sao_Paulo.
-- Do not interrupt an already authorized cycle at 22:00.
-- No new jobs or cloud enablement.


-- Pure timestamp rule, testable without starting a run or publishing.
CREATE OR REPLACE FUNCTION mavuri_internal.discovery_cloud_run_time_valid(
  p_started_at timestamptz, p_lease_expires_at timestamptz, p_at timestamptz
) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $time$
SELECT coalesce(
  p_started_at <= p_at
  AND p_at < p_lease_expires_at
  AND p_at < p_started_at + interval '30 minutes'
  AND mavuri_internal.discovery_cloud_within_publish_window(p_started_at),
  false
);
$time$;
REVOKE ALL ON FUNCTION mavuri_internal.discovery_cloud_run_time_valid(timestamptz,timestamptz,timestamptz)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mavuri_internal.discovery_cloud_run_time_valid(timestamptz,timestamptz,timestamptz)
TO service_role;

-- service-only verification by immutable run ID in the job key.
-- A run starting at 21:59 can continue after 22:00, within a maximum of
-- 30 minutes and its original (possibly shorter) lease.
CREATE OR REPLACE FUNCTION public.mavuri_shopee_cloud_run_delivery_allowed(
  p_delivery_key text, p_at timestamptz DEFAULT clock_timestamp()
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $run_gate$
DECLARE run_id uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN RETURN false; END IF;
  IF p_delivery_key IS NULL OR p_delivery_key !~
    '^shopee-cloud:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}$'
    THEN RETURN false;
  END IF;
  run_id := split_part(p_delivery_key,':',2)::uuid;
  RETURN EXISTS (
    SELECT 1
    FROM mavuri_internal.discovery_cloud_control cfg
    JOIN mavuri_internal.discovery_cloud_runs r ON r.id=run_id
    WHERE cfg.id=true AND cfg.enabled AND cfg.active_executor='cloud'
      AND r.executor='cloud' AND r.status='running'
      AND mavuri_internal.discovery_cloud_run_time_valid(
        r.started_at,r.lease_expires_at,p_at
      )
  );
END;
$run_gate$;
REVOKE ALL ON FUNCTION public.mavuri_shopee_cloud_run_delivery_allowed(text,timestamptz)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mavuri_shopee_cloud_run_delivery_allowed(text,timestamptz)
TO service_role;

CREATE OR REPLACE FUNCTION public.mavuri_discovery_claim_run(p_lease_seconds integer DEFAULT 900)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cfg mavuri_internal.discovery_cloud_control%ROWTYPE;
  latest_start timestamptz;
  new_id uuid;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO cfg
    FROM mavuri_internal.discovery_cloud_control
    WHERE id = true FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false,'reason','not_configured'); END IF;
  IF NOT cfg.enabled OR cfg.active_executor <> 'cloud' THEN
    RETURN jsonb_build_object('claimed',false,'reason','cloud_disabled');
  END IF;
  -- The start time is restricted; authorized in-flight runs may complete later.
  IF NOT mavuri_internal.discovery_cloud_within_publish_window(clock_timestamp()) THEN
    RETURN jsonb_build_object('claimed',false,'reason','outside_publish_window');
  END IF;
  UPDATE mavuri_internal.discovery_cloud_runs
    SET status='expired', finished_at=now(), error_message='Lease expired before completion'
    WHERE status='running' AND lease_expires_at <= now();
  IF EXISTS (SELECT 1 FROM mavuri_internal.discovery_cloud_runs WHERE status='running') THEN
    RETURN jsonb_build_object('claimed',false,'reason','already_running');
  END IF;
  SELECT max(started_at) INTO latest_start FROM mavuri_internal.discovery_cloud_runs;
  IF latest_start IS NOT NULL AND latest_start > now() - make_interval(mins => cfg.interval_minutes) THEN
    RETURN jsonb_build_object('claimed',false,'reason','interval_not_elapsed');
  END IF;
  INSERT INTO mavuri_internal.discovery_cloud_runs(executor,status,lease_expires_at)
  VALUES ('cloud','running',now() + make_interval(secs => LEAST(1800, GREATEST(60,p_lease_seconds))))
  RETURNING id INTO new_id;
  RETURN jsonb_build_object(
    'claimed',true,'run_id',new_id,
    'limits',jsonb_build_object('mercadolivre',cfg.max_meli,'shopee',cfg.max_shopee,'magalu',cfg.max_magalu)
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.mavuri_shopee_cloud_queue_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Configurable Brasilia publication hours; default [08:00,22:00).
  IF NOT coalesce(public.mavuri_shopee_cloud_run_delivery_allowed(NEW.delivery_key,clock_timestamp()),false) THEN
    RAISE EXCEPTION 'shopee_cloud_run_not_authorized' USING ERRCODE='42501';
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
$function$;
CREATE OR REPLACE FUNCTION public.mavuri_shopee_cloud_claim_window_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.delivery_key LIKE 'shopee-cloud:%'
     AND OLD.status='queued' AND NEW.status='processing'
     AND NOT coalesce(public.mavuri_shopee_cloud_run_delivery_allowed(OLD.delivery_key,clock_timestamp()),false)
  THEN
    RAISE EXCEPTION 'shopee_cloud_claim_run_not_authorized' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;

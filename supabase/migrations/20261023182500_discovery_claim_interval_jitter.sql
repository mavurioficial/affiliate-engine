-- Allow <=30s cron execution jitter between 30-minute slots, never overlap active runs.
-- Interval remains 30 minutes in control and cron; this only avoids seconds drift.
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
  IF latest_start IS NOT NULL AND latest_start > clock_timestamp() - make_interval(secs => greatest(60,cfg.interval_minutes*60-30)) THEN
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


-- Cloud Discovery foundation. INACTIVE BY DEFAULT: no cron schedule, no marketplace calls.
CREATE TABLE IF NOT EXISTS mavuri_internal.discovery_cloud_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  active_executor text NOT NULL DEFAULT 'local' CHECK (active_executor IN ('local','cloud')),
  interval_minutes integer NOT NULL DEFAULT 30 CHECK (interval_minutes BETWEEN 5 AND 1440),
  max_meli integer NOT NULL DEFAULT 8 CHECK (max_meli BETWEEN 0 AND 100),
  max_shopee integer NOT NULL DEFAULT 8 CHECK (max_shopee BETWEEN 0 AND 100),
  max_magalu integer NOT NULL DEFAULT 5 CHECK (max_magalu BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO mavuri_internal.discovery_cloud_control (id, enabled, active_executor, interval_minutes, max_meli, max_shopee, max_magalu)
VALUES (true, false, 'local', 30, 8, 8, 5)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS mavuri_internal.discovery_cloud_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executor text NOT NULL CHECK (executor IN ('cloud')),
  status text NOT NULL CHECK (status IN ('running','succeeded','failed','expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL,
  finished_at timestamptz,
  result_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text
);
CREATE UNIQUE INDEX IF NOT EXISTS discovery_cloud_single_active_run_idx
  ON mavuri_internal.discovery_cloud_runs (status)
  WHERE status = 'running';
CREATE INDEX IF NOT EXISTS discovery_cloud_runs_recent_idx
  ON mavuri_internal.discovery_cloud_runs (started_at DESC);

REVOKE ALL ON mavuri_internal.discovery_cloud_control FROM PUBLIC, anon, authenticated;
REVOKE ALL ON mavuri_internal.discovery_cloud_runs FROM PUBLIC, anon, authenticated;

-- Server-to-server only. Row lock + unique partial index prevent simultaneous claims.
CREATE OR REPLACE FUNCTION public.mavuri_discovery_claim_run(p_lease_seconds integer DEFAULT 900)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
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
$func$;

CREATE OR REPLACE FUNCTION public.mavuri_discovery_finish_run(
  p_run_id uuid,
  p_status text,
  p_counts jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role only' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('succeeded','failed') OR p_status IS NULL THEN
    RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023';
  END IF;
  UPDATE mavuri_internal.discovery_cloud_runs
    SET status=p_status, finished_at=now(),
        result_counts=COALESCE(p_counts,'{}'::jsonb),
        error_message=left(p_error,2000)
    WHERE id=p_run_id AND executor='cloud' AND status='running';
  RETURN FOUND;
END;
$func$;

REVOKE ALL ON FUNCTION public.mavuri_discovery_claim_run(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mavuri_discovery_finish_run(uuid,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mavuri_discovery_claim_run(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mavuri_discovery_finish_run(uuid,text,jsonb,text) TO service_role;

COMMENT ON TABLE mavuri_internal.discovery_cloud_control IS 'Cloud Discovery opt-in switch. Do not enable until Windows runner has been stopped and full V85 logic migrated.';
COMMENT ON TABLE mavuri_internal.discovery_cloud_runs IS 'Cloud Discovery exclusive lease and execution audit log. No offer data is stored here.';

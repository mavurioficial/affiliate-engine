-- Mavuri cloud publication hours (initial preference: 08:00 <= local < 22:00).
-- The existing readonly discovery preview may run outside this window.
-- This migration does not enable cloud publishing or create any jobs.
ALTER TABLE mavuri_internal.discovery_cloud_control
  ADD COLUMN IF NOT EXISTS publish_start_local time without time zone NOT NULL DEFAULT time '08:00',
  ADD COLUMN IF NOT EXISTS publish_end_local time without time zone NOT NULL DEFAULT time '22:00',
  ADD COLUMN IF NOT EXISTS publish_timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE mavuri_internal.discovery_cloud_control
  ADD CONSTRAINT discovery_publish_hours_valid
  CHECK (
    publish_start_local < publish_end_local
    AND publish_timezone = 'America/Sao_Paulo'
  );

CREATE OR REPLACE FUNCTION mavuri_internal.discovery_cloud_within_publish_window(
  p_at timestamptz DEFAULT clock_timestamp()
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
SELECT coalesce(
  (c.publish_start_local <= (p_at AT TIME ZONE c.publish_timezone)::time
   AND (p_at AT TIME ZONE c.publish_timezone)::time < c.publish_end_local),
  false)
FROM mavuri_internal.discovery_cloud_control c WHERE c.id=true;
$fn$;

-- Server-only query used before claim and immediately before sending Telegram.
-- Denies by default when there is no live cloud authorization.
CREATE OR REPLACE FUNCTION public.mavuri_shopee_cloud_delivery_allowed(
  p_at timestamptz DEFAULT clock_timestamp()
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN RETURN false; END IF;
  RETURN coalesce((
    SELECT c.enabled AND c.active_executor='cloud'
       AND mavuri_internal.discovery_cloud_within_publish_window(p_at)
    FROM mavuri_internal.discovery_cloud_control c WHERE c.id=true
  ),false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.mavuri_shopee_cloud_delivery_allowed(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mavuri_shopee_cloud_delivery_allowed(timestamptz)
  TO service_role;

-- Reject new cloud enqueue attempts outside the configured hours.
-- This function is already guarded by service_role, lease and account checks.
-- Recreate from existing deployed source in a separate migration below to
-- avoid broad changes to the existing delivery triggers.

-- Prevent legacy Shopee collector and cloud sender from writing concurrently.
-- The existing local worker remains unchanged while cloud is disabled.
CREATE OR REPLACE FUNCTION public.mavuri_shopee_legacy_writer_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $guard$
BEGIN
  IF NEW.delivery_key LIKE 'shopee:%'
     AND EXISTS (
       SELECT 1 FROM mavuri_internal.discovery_cloud_control c
       WHERE c.id=true AND c.enabled AND c.active_executor='cloud'
     )
  THEN
    RAISE EXCEPTION 'shopee_legacy_writer_disabled_during_cloud'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.mavuri_shopee_legacy_writer_fence()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_mavuri_shopee_legacy_writer_fence
  ON public.flow_delivery_jobs;
CREATE TRIGGER trg_mavuri_shopee_legacy_writer_fence
  BEFORE INSERT ON public.flow_delivery_jobs
  FOR EACH ROW WHEN (NEW.delivery_key LIKE 'shopee:%')
  EXECUTE FUNCTION public.mavuri_shopee_legacy_writer_fence();

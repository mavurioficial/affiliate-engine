-- Supabase pg_cron is the Shopee Cloud scheduler of record.
-- Does NOTHING while discovery_cloud_control.enabled=false.
CREATE OR REPLACE FUNCTION mavuri_internal.invoke_shopee_cloud_executor()
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $invoke$
DECLARE project_url text; scheduler_secret text; request_id bigint;
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM mavuri_internal.discovery_cloud_control cfg
  WHERE cfg.id=true AND cfg.enabled AND cfg.active_executor='cloud'
    AND mavuri_internal.discovery_cloud_within_publish_window(clock_timestamp())
 ) THEN RETURN NULL; END IF;
 SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets
  WHERE name='mavuri_flow_project_url';
 SELECT decrypted_secret INTO scheduler_secret FROM vault.decrypted_secrets
  WHERE name='mavuri_flow_scheduler_secret';
 IF coalesce(project_url,'')='' OR coalesce(scheduler_secret,'')='' THEN
  RETURN NULL;
 END IF;
 SELECT net.http_post(
   url:=project_url||'/functions/v1/discovery-cloud-shopee-executor',
   headers:=jsonb_build_object('Content-Type','application/json',
     'Authorization','Bearer '||scheduler_secret),
   body:='{"mode":"cloud_cycle"}'::jsonb,timeout_milliseconds:=90000
 ) INTO request_id;
 RETURN request_id;
END;
$invoke$;
REVOKE ALL ON FUNCTION mavuri_internal.invoke_shopee_cloud_executor()
FROM PUBLIC,anon,authenticated;
-- The scheduling job is harmless while cloud is disabled.
SELECT cron.schedule('mavuri-shopee-cloud-discovery','*/30 * * * *',
  'select mavuri_internal.invoke_shopee_cloud_executor()');
SELECT cron.schedule('mavuri-shopee-cloud-reconcile','* * * * *',
  'select mavuri_internal.reconcile_shopee_cloud_runs()');

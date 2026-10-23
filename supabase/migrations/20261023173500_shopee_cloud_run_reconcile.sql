-- Shopee Cloud run lifecycle: keep run live until Telegram delivery settles.
-- Reconcile in pg_cron every minute. Does not create/publicize jobs.
CREATE OR REPLACE FUNCTION public.mavuri_shopee_cloud_mark_submitted(
  p_run_id uuid,p_jobs integer,p_offers integer
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $mark$
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN
   RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
 END IF;
 IF p_run_id IS NULL OR p_jobs NOT BETWEEN 0 AND 32
     OR p_offers NOT BETWEEN 0 AND 8 THEN
   RETURN false;
 END IF;
 UPDATE mavuri_internal.discovery_cloud_runs
 SET result_counts=jsonb_build_object('phase','submitted',
   'jobs',p_jobs,'offers',p_offers)
 WHERE id=p_run_id AND executor='cloud' AND status='running'
   AND lease_expires_at>clock_timestamp();
 RETURN FOUND;
END;
$mark$;
REVOKE ALL ON FUNCTION public.mavuri_shopee_cloud_mark_submitted(uuid,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mavuri_shopee_cloud_mark_submitted(uuid,integer,integer)
  TO service_role;

CREATE OR REPLACE FUNCTION mavuri_internal.reconcile_shopee_cloud_runs()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $reconcile$
DECLARE
  r mavuri_internal.discovery_cloud_runs%ROWTYPE;
  prefix text;
  total_jobs integer;
  pending_jobs integer;
  sent_jobs integer;
  failed_jobs integer;
  modified integer:=0;
BEGIN
 FOR r IN
  SELECT * FROM mavuri_internal.discovery_cloud_runs
  WHERE status='running'
  ORDER BY started_at FOR UPDATE SKIP LOCKED
 LOOP
  prefix:='shopee-cloud:'||r.id::text||':';
  SELECT count(*),
   count(*) FILTER(WHERE j.status IN('queued','processing')),
   count(*) FILTER(WHERE j.status='sent'),
   count(*) FILTER(WHERE j.status NOT IN('queued','processing','sent'))
  INTO total_jobs,pending_jobs,sent_jobs,failed_jobs
  FROM public.flow_delivery_jobs j
  WHERE left(j.delivery_key,length(prefix))=prefix;
  IF r.lease_expires_at<=clock_timestamp()
     OR r.started_at + interval '30 minutes'<=clock_timestamp() THEN
    -- An expired run MUST NOT deliver queued messages later.
    UPDATE public.flow_delivery_jobs j SET status='failed',
      error_message='Shopee Cloud lease expirado; sem envio'
      WHERE left(j.delivery_key,length(prefix))=prefix
        AND j.status='queued';
    UPDATE mavuri_internal.discovery_cloud_runs
      SET status='expired',finished_at=clock_timestamp(),
        error_message='Lease expirado antes de concluir entregas'
    WHERE id=r.id AND status='running';
    modified:=modified+1;
  ELSIF r.result_counts->>'phase'='submitted' AND pending_jobs=0 THEN
    UPDATE mavuri_internal.discovery_cloud_runs
      SET status=CASE WHEN total_jobs=sent_jobs THEN 'succeeded' ELSE 'failed' END,
          finished_at=clock_timestamp(),
          result_counts=coalesce(r.result_counts,'{}'::jsonb)||
            jsonb_build_object('delivered',sent_jobs,'errors',failed_jobs)
    WHERE id=r.id AND status='running';
    modified:=modified+1;
  END IF;
 END LOOP;
 -- Cleanup earlier expired/failed runs, including those expired by claim_run.
 UPDATE public.flow_delivery_jobs j
 SET status='failed',error_message='Shopee Cloud run encerrado sem entrega'
 FROM mavuri_internal.discovery_cloud_runs r
 WHERE r.status IN('expired','failed')
   AND j.status='queued'
   AND j.delivery_key LIKE ('shopee-cloud:'||r.id::text||':%');
 RETURN modified;
END;
$reconcile$;
REVOKE ALL ON FUNCTION mavuri_internal.reconcile_shopee_cloud_runs()
  FROM PUBLIC,anon,authenticated;

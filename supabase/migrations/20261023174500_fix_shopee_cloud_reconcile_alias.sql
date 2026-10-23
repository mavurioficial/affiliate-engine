CREATE OR REPLACE FUNCTION mavuri_internal.reconcile_shopee_cloud_runs()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $reconcile$
DECLARE
  run_item mavuri_internal.discovery_cloud_runs%ROWTYPE;
  prefix text;
  total_jobs integer;
  pending_jobs integer;
  sent_jobs integer;
  failed_jobs integer;
  modified integer:=0;
BEGIN
 FOR run_item IN
  SELECT * FROM mavuri_internal.discovery_cloud_runs
  WHERE status='running'
  ORDER BY started_at FOR UPDATE SKIP LOCKED
 LOOP
  prefix:='shopee-cloud:'||run_item.id::text||':';
  SELECT count(*),
   count(*) FILTER(WHERE j.status IN('queued','processing')),
   count(*) FILTER(WHERE j.status='sent'),
   count(*) FILTER(WHERE j.status NOT IN('queued','processing','sent'))
  INTO total_jobs,pending_jobs,sent_jobs,failed_jobs
  FROM public.flow_delivery_jobs j
  WHERE left(j.delivery_key,length(prefix))=prefix;
  IF run_item.lease_expires_at<=clock_timestamp()
     OR run_item.started_at + interval '30 minutes'<=clock_timestamp() THEN
    -- An expired run MUST NOT deliver queued messages laterun_item.
    UPDATE public.flow_delivery_jobs j SET status='failed',
      error_message='Shopee Cloud lease expirado; sem envio'
      WHERE left(j.delivery_key,length(prefix))=prefix
        AND j.status='queued';
    UPDATE mavuri_internal.discovery_cloud_runs
      SET status='expired',finished_at=clock_timestamp(),
        error_message='Lease expirado antes de concluir entregas'
    WHERE id=run_item.id AND status='running';
    modified:=modified+1;
  ELSIF run_item.result_counts->>'phase'='submitted' AND pending_jobs=0 THEN
    UPDATE mavuri_internal.discovery_cloud_runs
      SET status=CASE WHEN total_jobs=sent_jobs THEN 'succeeded' ELSE 'failed' END,
          finished_at=clock_timestamp(),
          result_counts=coalesce(run_item.result_counts,'{}'::jsonb)||
            jsonb_build_object('delivered',sent_jobs,'errors',failed_jobs)
    WHERE id=run_item.id AND status='running';
    modified:=modified+1;
  END IF;
 END LOOP;
 -- Cleanup earlier expired/failed runs, including those expired by claim_run.
 UPDATE public.flow_delivery_jobs j
 SET status='failed',error_message='Shopee Cloud run encerrado sem entrega'
 FROM mavuri_internal.discovery_cloud_runs ended_run
 WHERE ended_run.status IN('expired','failed')
   AND j.status='queued'
   AND j.delivery_key LIKE ('shopee-cloud:'||ended_run.id::text||':%');
 RETURN modified;
END;
$reconcile$;
REVOKE ALL ON FUNCTION mavuri_internal.reconcile_shopee_cloud_runs()
  FROM PUBLIC,anon,authenticated;

create or replace function mavuri_internal.invoke_magalu_cloud_executor() returns bigint
language plpgsql security definer set search_path='' as $$
declare project_url text; scheduler_secret text; request_id bigint; local_time time;
begin
 if not exists(select 1 from mavuri_internal.magalu_cloud_control where id and enabled) then return null;end if;
 local_time:=(clock_timestamp() at time zone 'America/Sao_Paulo')::time;
 if local_time<time '08:00' or local_time>time '22:00:30' then return null;end if;
 select decrypted_secret into project_url from vault.decrypted_secrets where name='mavuri_flow_project_url';
 select decrypted_secret into scheduler_secret from vault.decrypted_secrets where name='mavuri_flow_scheduler_secret';
 if coalesce(project_url,'')='' or coalesce(scheduler_secret,'')='' then return null;end if;
 select net.http_post(url:=project_url||'/functions/v1/discovery-cloud-magalu-executor',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||scheduler_secret),body:='{"mode":"cloud_cycle"}'::jsonb,timeout_milliseconds:=90000) into request_id;
 return request_id;
end $$;
revoke all on function mavuri_internal.invoke_magalu_cloud_executor() from public,anon,authenticated;
select cron.schedule('mavuri-magalu-cloud-discovery','*/30 * * * *','select mavuri_internal.invoke_magalu_cloud_executor()');

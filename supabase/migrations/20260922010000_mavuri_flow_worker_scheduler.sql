-- Mavuri Flow worker scheduler.
-- pg_net is recreated in the extensions schema to avoid exposing the extension in public.
drop extension if exists pg_net;
create extension pg_net with schema extensions;

create extension if not exists pg_cron;

create schema if not exists mavuri_internal;

create or replace function mavuri_internal.invoke_flow_worker()
returns bigint
language plpgsql
security definer
set search_path = mavuri_internal, public, extensions, vault, net
as $$
declare
  project_url text;
  secret_key text;
  request_id bigint;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'mavuri_flow_project_url';

  select decrypted_secret into secret_key
  from vault.decrypted_secrets
  where name = 'mavuri_flow_supabase_secret_key';

  if coalesce(project_url, '') = '' or coalesce(secret_key, '') = '' then
    return null;
  end if;

  select net.http_post(
    url := project_url || '/functions/v1/flow-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', secret_key
    ),
    body := jsonb_build_object('limit', 25),
    timeout_milliseconds := 10000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function mavuri_internal.invoke_flow_worker() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'mavuri-flow-worker';

select cron.schedule(
  'mavuri-flow-worker',
  '*/1 * * * *',
  $$select mavuri_internal.invoke_flow_worker()$$
);

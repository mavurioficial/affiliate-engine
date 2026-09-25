-- Fix PostgREST RPC overload ambiguity introduced by the account-aware token wrappers.
-- The account-aware functions must not have defaults because legacy 2/7-argument
-- wrappers intentionally coexist with them. With a default, PostgREST cannot
-- reliably choose between the two overloads when legacy callers omit account_id.

drop function if exists public.mavuri_get_meli_token(uuid, uuid, uuid);
drop function if exists public.mavuri_store_meli_token(uuid, uuid, text, text, text, integer, text[], uuid);

create function public.mavuri_get_meli_token(
  p_user_id uuid,
  p_marketplace_id uuid,
  p_affiliate_account_id uuid
)
returns table(
  access_token text,
  refresh_token text,
  external_account_id text,
  expires_at timestamptz,
  scopes text[]
)
language plpgsql
security definer
set search_path = public, auth
as $function$
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized';
  end if;
  return query
    select * from mavuri_internal.get_flow_meli_token(
      p_user_id, p_marketplace_id, p_affiliate_account_id
    );
end;
$function$;

create function public.mavuri_store_meli_token(
  p_user_id uuid,
  p_marketplace_id uuid,
  p_external_account_id text,
  p_access_token text,
  p_refresh_token text,
  p_expires_in integer,
  p_scopes text[],
  p_affiliate_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $function$
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized';
  end if;
  perform mavuri_internal.upsert_flow_meli_token(
    p_user_id, p_marketplace_id, p_external_account_id,
    p_access_token, p_refresh_token, p_expires_in, p_scopes,
    p_affiliate_account_id
  );
end;
$function$;

grant execute on function public.mavuri_get_meli_token(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.mavuri_store_meli_token(uuid, uuid, text, text, text, integer, text[], uuid) to authenticated, service_role;

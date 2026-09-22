create table if not exists public.flow_marketplace_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  marketplace_id uuid not null references public.flow_marketplaces(id),
  external_account_id text,
  access_token_enc bytea not null,
  refresh_token_enc bytea,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, marketplace_id)
);

alter table public.flow_marketplace_tokens enable row level security;
revoke all on public.flow_marketplace_tokens from public, anon, authenticated;

create or replace function mavuri_internal.upsert_flow_meli_token(
  p_user_id uuid, p_marketplace_id uuid, p_external_account_id text,
  p_access_token text, p_refresh_token text, p_expires_in integer, p_scopes text[]
) returns void language plpgsql security definer
set search_path = mavuri_internal, public, extensions, vault
as $$
declare encryption_key text;
begin
  select decrypted_secret into encryption_key from vault.decrypted_secrets where name = 'mavuri_flow_token_encryption_key';
  if coalesce(encryption_key, '') = '' then raise exception 'Mavuri token encryption key is not configured.'; end if;
  insert into public.flow_marketplace_tokens (user_id, marketplace_id, external_account_id, access_token_enc, refresh_token_enc, expires_at, scopes)
  values (p_user_id, p_marketplace_id, p_external_account_id, pgp_sym_encrypt(p_access_token, encryption_key),
    case when coalesce(p_refresh_token, '') <> '' then pgp_sym_encrypt(p_refresh_token, encryption_key) else null end,
    case when p_expires_in is not null then now() + make_interval(secs => greatest(p_expires_in, 0)) else null end, coalesce(p_scopes, '{}'))
  on conflict (user_id, marketplace_id) do update set external_account_id=excluded.external_account_id,
    access_token_enc=excluded.access_token_enc, refresh_token_enc=excluded.refresh_token_enc,
    expires_at=excluded.expires_at, scopes=excluded.scopes, updated_at=now();
end; $$;

create or replace function mavuri_internal.get_flow_meli_token(p_user_id uuid, p_marketplace_id uuid)
returns table (access_token text, refresh_token text, external_account_id text, expires_at timestamptz, scopes text[])
language plpgsql security definer
set search_path = mavuri_internal, public, extensions, vault
as $$
declare encryption_key text;
begin
  select decrypted_secret into encryption_key from vault.decrypted_secrets where name = 'mavuri_flow_token_encryption_key';
  if coalesce(encryption_key, '') = '' then raise exception 'Mavuri token encryption key is not configured.'; end if;
  return query select pgp_sym_decrypt(t.access_token_enc, encryption_key),
    case when t.refresh_token_enc is not null then pgp_sym_decrypt(t.refresh_token_enc, encryption_key) else null end,
    t.external_account_id, t.expires_at, t.scopes
  from public.flow_marketplace_tokens t where t.user_id=p_user_id and t.marketplace_id=p_marketplace_id limit 1;
end; $$;

revoke all on function mavuri_internal.upsert_flow_meli_token(uuid,uuid,text,text,text,integer,text[]) from public, anon, authenticated;
revoke all on function mavuri_internal.get_flow_meli_token(uuid,uuid) from public, anon, authenticated;
grant execute on function mavuri_internal.upsert_flow_meli_token(uuid,uuid,text,text,text,integer,text[]) to service_role;
grant execute on function mavuri_internal.get_flow_meli_token(uuid,uuid) to service_role;

create table if not exists public.flow_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.flow_oauth_states enable row level security;
revoke all on public.flow_oauth_states from public, anon, authenticated;

create or replace function public.mavuri_store_meli_token(
  p_user_id uuid, p_marketplace_id uuid, p_external_account_id text,
  p_access_token text, p_refresh_token text, p_expires_in integer, p_scopes text[]
) returns void language sql security definer set search_path = public
as $$ select mavuri_internal.upsert_flow_meli_token(p_user_id,p_marketplace_id,p_external_account_id,p_access_token,p_refresh_token,p_expires_in,p_scopes); $$;

create or replace function public.mavuri_get_meli_token(p_user_id uuid, p_marketplace_id uuid)
returns table (access_token text, refresh_token text, external_account_id text, expires_at timestamptz, scopes text[])
language sql security definer set search_path = public
as $$ select * from mavuri_internal.get_flow_meli_token(p_user_id,p_marketplace_id); $$;

revoke all on function public.mavuri_store_meli_token(uuid,uuid,text,text,text,integer,text[]) from public, anon, authenticated;
revoke all on function public.mavuri_get_meli_token(uuid,uuid) from public, anon, authenticated;
grant execute on function public.mavuri_store_meli_token(uuid,uuid,text,text,text,integer,text[]) to service_role;
grant execute on function public.mavuri_get_meli_token(uuid,uuid) to service_role;

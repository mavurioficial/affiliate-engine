-- Mavuri: explicit affiliate-account identity.
-- Keeps the existing single-account setup compatible while allowing
-- multiple Mercado Livre accounts per Mavuri user.

create table if not exists public.flow_affiliate_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  marketplace_id uuid not null references public.flow_marketplaces(id),
  name text not null,
  status text not null default 'active',
  external_account_id text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flow_affiliate_accounts_user_idx
  on public.flow_affiliate_accounts(user_id);

create index if not exists flow_affiliate_accounts_marketplace_idx
  on public.flow_affiliate_accounts(marketplace_id);

create unique index if not exists flow_affiliate_accounts_user_marketplace_external_uidx
  on public.flow_affiliate_accounts(user_id, marketplace_id, external_account_id)
  where external_account_id is not null;

alter table public.flow_marketplace_tokens
  add column if not exists affiliate_account_id uuid references public.flow_affiliate_accounts(id);

alter table public.flow_offers
  add column if not exists affiliate_account_id uuid references public.flow_affiliate_accounts(id);

create index if not exists flow_offers_affiliate_account_idx
  on public.flow_offers(affiliate_account_id);


-- Backfill the current connection into a named account so the existing
-- lucasbrasildf connection has a stable identity.
insert into public.flow_affiliate_accounts
  (user_id, marketplace_id, name, status, external_account_id, settings)
select
  t.user_id,
  t.marketplace_id,
  'Mercado Livre — Conta atual',
  'active',
  t.external_account_id,
  jsonb_build_object('role', 'default')
from public.flow_marketplace_tokens t
where t.affiliate_account_id is null
  and not exists (
    select 1
    from public.flow_affiliate_accounts a
    where a.user_id = t.user_id
      and a.marketplace_id = t.marketplace_id
      and a.external_account_id is not distinct from t.external_account_id
  );

update public.flow_marketplace_tokens t
set affiliate_account_id = a.id
from public.flow_affiliate_accounts a
where t.affiliate_account_id is null
  and a.user_id = t.user_id
  and a.marketplace_id = t.marketplace_id
  and a.external_account_id is not distinct from t.external_account_id;

-- One token set per explicit affiliate account.
drop index if exists public.flow_marketplace_tokens_user_id_marketplace_id_key;

create unique index if not exists flow_marketplace_tokens_account_uidx
  on public.flow_marketplace_tokens(affiliate_account_id);

-- Default compatibility functions below keep existing callers working.
-- New account-aware functions are provided separately.

create or replace function mavuri_internal.get_flow_meli_token(
  p_user_id uuid,
  p_marketplace_id uuid,
  p_affiliate_account_id uuid default null
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
set search_path = mavuri_internal, public, extensions, vault
as $function$
declare
  encryption_key text;
begin
  select decrypted_secret into encryption_key
  from vault.decrypted_secrets
  where name = 'mavuri_flow_token_encryption_key';

  if coalesce(encryption_key, '') = '' then
    raise exception 'Mavuri token encryption key is not configured.';
  end if;

  return query
  select
    pgp_sym_decrypt(t.access_token_enc, encryption_key),
    case when t.refresh_token_enc is not null then pgp_sym_decrypt(t.refresh_token_enc, encryption_key) else null end,
    t.external_account_id,
    t.expires_at,
    t.scopes
  from public.flow_marketplace_tokens t
  where t.user_id = p_user_id
    and t.marketplace_id = p_marketplace_id
    and (
      t.affiliate_account_id = p_affiliate_account_id
      or (
        p_affiliate_account_id is null
        and t.affiliate_account_id = (
          select a.id
          from public.flow_affiliate_accounts a
          where a.user_id = p_user_id
            and a.marketplace_id = p_marketplace_id
            and a.status = 'active'
          order by (a.settings->>'role' = 'default') desc, a.created_at asc
          limit 1
        )
      )
    )
  limit 1;
end;
$function$;

create or replace function mavuri_internal.upsert_flow_meli_token(
  p_user_id uuid,
  p_marketplace_id uuid,
  p_external_account_id text,
  p_access_token text,
  p_refresh_token text,
  p_expires_in integer,
  p_scopes text[],
  p_affiliate_account_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = mavuri_internal, public, extensions, vault
as $function$
declare
  encryption_key text;
  account_id uuid;
begin
  select decrypted_secret into encryption_key
  from vault.decrypted_secrets
  where name = 'mavuri_flow_token_encryption_key';

  if coalesce(encryption_key, '') = '' then
    raise exception 'Mavuri token encryption key is not configured.';
  end if;

  account_id := p_affiliate_account_id;

  if account_id is null then
    select a.id into account_id
    from public.flow_affiliate_accounts a
    where a.user_id = p_user_id
      and a.marketplace_id = p_marketplace_id
      and a.status = 'active'
      and (
        a.external_account_id is not distinct from p_external_account_id
        or a.settings->>'role' = 'default'
      )
    order by (a.external_account_id is not distinct from p_external_account_id) desc,
             (a.settings->>'role' = 'default') desc,
             a.created_at asc
    limit 1;
  end if;

  if account_id is null then
    insert into public.flow_affiliate_accounts
      (user_id, marketplace_id, name, status, external_account_id, settings)
    values
      (p_user_id, p_marketplace_id, 'Mercado Livre — Conta', 'active', p_external_account_id, '{}'::jsonb)
    returning id into account_id;
  else
    update public.flow_affiliate_accounts
    set external_account_id = p_external_account_id,
        updated_at = now()
    where id = account_id
      and user_id = p_user_id;
  end if;

  insert into public.flow_marketplace_tokens (
    user_id, marketplace_id, affiliate_account_id, external_account_id,
    access_token_enc, refresh_token_enc, expires_at, scopes
  )
  values (
    p_user_id,
    p_marketplace_id,
    account_id,
    p_external_account_id,
    pgp_sym_encrypt(p_access_token, encryption_key),
    case when coalesce(p_refresh_token, '') <> '' then pgp_sym_encrypt(p_refresh_token, encryption_key) else null end,
    case when p_expires_in is not null then now() + make_interval(secs => greatest(p_expires_in, 0)) else null end,
    coalesce(p_scopes, '{}')
  )
  on conflict (affiliate_account_id) do update set
    external_account_id = excluded.external_account_id,
    access_token_enc = excluded.access_token_enc,
    refresh_token_enc = excluded.refresh_token_enc,
    expires_at = excluded.expires_at,
    scopes = excluded.scopes,
    updated_at = now();

  update public.flow_affiliate_accounts
  set external_account_id = p_external_account_id,
      updated_at = now()
  where id = account_id;
end;
$function$;

-- Public wrappers retain the original signature and use the user's
-- active/default account when no explicit account is supplied.
create or replace function public.mavuri_get_meli_token(
  p_user_id uuid,
  p_marketplace_id uuid,
  p_affiliate_account_id uuid default null
)
returns table(
  access_token text,
  refresh_token text,
  external_account_id text,
  expires_at timestamptz,
  scopes text[]
)
language sql
security definer
set search_path = public
as $function$
  select * from mavuri_internal.get_flow_meli_token(
    p_user_id, p_marketplace_id, p_affiliate_account_id
  );
$function$;

create or replace function public.mavuri_store_meli_token(
  p_user_id uuid,
  p_marketplace_id uuid,
  p_external_account_id text,
  p_access_token text,
  p_refresh_token text,
  p_expires_in integer,
  p_scopes text[],
  p_affiliate_account_id uuid default null
)
returns void
language sql
security definer
set search_path = public
as $function$
  select mavuri_internal.upsert_flow_meli_token(
    p_user_id, p_marketplace_id, p_external_account_id,
    p_access_token, p_refresh_token, p_expires_in, p_scopes,
    p_affiliate_account_id
  );
$function$;

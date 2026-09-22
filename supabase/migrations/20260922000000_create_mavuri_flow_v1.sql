create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.affiliate_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  marketplace_id uuid not null references public.marketplaces(id),
  name text not null,
  status text not null default 'pending' check (status in ('pending','connected','error','disabled')),
  external_account_id text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  marketplace_id uuid references public.marketplaces(id),
  external_product_id text,
  title text not null,
  category text,
  brand text,
  image_url text,
  product_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_external_unique on public.products(user_id, marketplace_id, external_product_id) where external_product_id is not null;

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  marketplace_id uuid references public.marketplaces(id),
  source_type text not null default 'manual' check (source_type in ('manual','whatsapp','telegram','api','import')),
  source_ref text,
  title text not null,
  price numeric(12,2) not null check (price >= 0),
  previous_price numeric(12,2),
  discount_percent numeric(5,2),
  coupon text,
  shipping_text text,
  affiliate_url text,
  product_url text,
  image_url text,
  fingerprint text,
  status text not null default 'processed' check (status in ('captured','processed','approved','published','ignored','failed')),
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists offers_user_status_idx on public.offers(user_id, status);
create index if not exists offers_fingerprint_idx on public.offers(user_id, fingerprint);
create index if not exists offers_captured_at_idx on public.offers(user_id, captured_at desc);

create table if not exists public.destination_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('telegram','whatsapp','web')),
  name text not null,
  external_ref text,
  status text not null default 'pending' check (status in ('pending','connected','error','disabled')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  priority integer not null default 100,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete cascade,
  channel_id uuid references public.destination_channels(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','cancelled')),
  attempts integer not null default 0,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists delivery_jobs_queue_idx on public.delivery_jobs(status, scheduled_for);

create table if not exists public.delivery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery_job_id uuid references public.delivery_jobs(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  channel_id uuid references public.destination_channels(id) on delete set null,
  status text not null,
  external_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.clicks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  channel_id uuid references public.destination_channels(id) on delete set null,
  tracking_id text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.marketplaces enable row level security;
alter table public.affiliate_accounts enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.destination_channels enable row level security;
alter table public.automation_rules enable row level security;
alter table public.delivery_jobs enable row level security;
alter table public.delivery_logs enable row level security;
alter table public.clicks enable row level security;

create policy profiles_self on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy marketplaces_read on public.marketplaces for select to authenticated using (true);
create policy affiliate_accounts_owner on public.affiliate_accounts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy products_owner on public.products for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy offers_owner on public.offers for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy channels_owner on public.destination_channels for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy rules_owner on public.automation_rules for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy jobs_owner on public.delivery_jobs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy logs_owner on public.delivery_logs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy clicks_owner on public.clicks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into public.marketplaces (slug, name)
values ('mercadolivre','Mercado Livre'), ('shopee','Shopee'), ('amazon','Amazon')
on conflict (slug) do nothing;
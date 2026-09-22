-- Mavuri Flow V1 runtime layer. Existing Affiliate Engine tables are preserved.
create extension if not exists pgcrypto;

create table if not exists public.flow_marketplaces (id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null, active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.flow_affiliate_accounts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, marketplace_id uuid not null references public.flow_marketplaces(id), name text not null, status text not null default 'pending' check (status in ('pending','connected','error','disabled')), external_account_id text, settings jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.flow_offers (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, marketplace_id uuid references public.flow_marketplaces(id), source_type text not null default 'manual' check (source_type in ('manual','whatsapp','telegram','api','import')), source_ref text, title text not null, price numeric(12,2) not null check (price >= 0), previous_price numeric(12,2), discount_percent numeric(5,2), coupon text, shipping_text text, affiliate_url text, product_url text, image_url text, fingerprint text, status text not null default 'processed' check (status in ('captured','processed','approved','published','ignored','failed')), metadata jsonb not null default '{}'::jsonb, captured_at timestamptz not null default now(), created_at timestamptz not null default now());
create table if not exists public.flow_channels (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, type text not null check (type in ('telegram','whatsapp','web')), name text not null, external_ref text, status text not null default 'pending' check (status in ('pending','connected','error','disabled')), settings jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.flow_rules (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, enabled boolean not null default true, priority integer not null default 100, conditions jsonb not null default '{}'::jsonb, actions jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.flow_delivery_jobs (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, offer_id uuid references public.flow_offers(id) on delete cascade, channel_id uuid references public.flow_channels(id) on delete cascade, status text not null default 'queued' check (status in ('queued','processing','sent','failed','cancelled')), attempts integer not null default 0, scheduled_for timestamptz not null default now(), sent_at timestamptz, error_message text, created_at timestamptz not null default now());
create table if not exists public.flow_delivery_logs (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, delivery_job_id uuid references public.flow_delivery_jobs(id) on delete set null, offer_id uuid references public.flow_offers(id) on delete set null, channel_id uuid references public.flow_channels(id) on delete set null, status text not null, external_message_id text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists public.flow_clicks (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, offer_id uuid references public.flow_offers(id) on delete set null, channel_id uuid references public.flow_channels(id) on delete set null, tracking_id text, created_at timestamptz not null default now());

create index if not exists flow_affiliate_accounts_user_idx on public.flow_affiliate_accounts(user_id);
create index if not exists flow_affiliate_accounts_marketplace_idx on public.flow_affiliate_accounts(marketplace_id);
create index if not exists flow_offers_user_status_idx on public.flow_offers(user_id,status);
create index if not exists flow_offers_fingerprint_idx on public.flow_offers(user_id,fingerprint);
create index if not exists flow_channels_user_idx on public.flow_channels(user_id);
create index if not exists flow_rules_user_idx on public.flow_rules(user_id);
create index if not exists flow_delivery_jobs_user_idx on public.flow_delivery_jobs(user_id);
create index if not exists flow_delivery_jobs_offer_idx on public.flow_delivery_jobs(offer_id);
create index if not exists flow_delivery_jobs_channel_idx on public.flow_delivery_jobs(channel_id);
create index if not exists flow_delivery_logs_user_idx on public.flow_delivery_logs(user_id);
create index if not exists flow_delivery_logs_job_idx on public.flow_delivery_logs(delivery_job_id);
create index if not exists flow_delivery_logs_offer_idx on public.flow_delivery_logs(offer_id);
create index if not exists flow_delivery_logs_channel_idx on public.flow_delivery_logs(channel_id);
create index if not exists flow_clicks_user_idx on public.flow_clicks(user_id);
create index if not exists flow_clicks_offer_idx on public.flow_clicks(offer_id);
create index if not exists flow_clicks_channel_idx on public.flow_clicks(channel_id);

alter table public.flow_marketplaces enable row level security;
alter table public.flow_affiliate_accounts enable row level security;
alter table public.flow_offers enable row level security;
alter table public.flow_channels enable row level security;
alter table public.flow_rules enable row level security;
alter table public.flow_delivery_jobs enable row level security;
alter table public.flow_delivery_logs enable row level security;
alter table public.flow_clicks enable row level security;

create policy flow_marketplaces_read on public.flow_marketplaces for select to authenticated using (true);
create policy flow_affiliate_accounts_owner on public.flow_affiliate_accounts for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy flow_offers_owner on public.flow_offers for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy flow_channels_owner on public.flow_channels for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy flow_rules_owner on public.flow_rules for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy flow_jobs_owner on public.flow_delivery_jobs for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy flow_logs_owner on public.flow_delivery_logs for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy flow_clicks_owner on public.flow_clicks for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

insert into public.flow_marketplaces(slug,name) values ('mercadolivre','Mercado Livre'),('shopee','Shopee'),('amazon','Amazon') on conflict(slug) do nothing;
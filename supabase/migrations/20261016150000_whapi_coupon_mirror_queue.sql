create table if not exists public.flow_whapi_coupon_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.flow_channels(id) on delete cascade,
  source text not null check (source in ('mercadolivre','magalu')),
  bundle_key text not null,
  part_index integer not null check (part_index >= 0),
  kind text not null check (kind in ('image','text')),
  body text not null,
  media text,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed')),
  attempts integer not null default 0,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  external_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (bundle_key, channel_id, part_index)
);
create index if not exists flow_whapi_coupon_jobs_pending_idx
 on public.flow_whapi_coupon_jobs(status,scheduled_for,created_at);
alter table public.flow_whapi_coupon_jobs enable row level security;
-- Magalu only. Disabled until source, coupons, dry run and handoff are verified.
create table if not exists mavuri_internal.magalu_cloud_control(
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 owner_id uuid not null,
 active_run uuid,
 lease_until timestamptz,
 last_started_at timestamptz,
 last_finished_at timestamptz,
 last_result jsonb not null default '{}'::jsonb,
 activated_at timestamptz
);
alter table mavuri_internal.magalu_cloud_control enable row level security;
revoke all on mavuri_internal.magalu_cloud_control from public,anon,authenticated;
grant usage on schema mavuri_internal to service_role;
grant select,update on mavuri_internal.magalu_cloud_control to service_role;
insert into mavuri_internal.magalu_cloud_control(owner_id)
select a.user_id from public.flow_affiliate_accounts a
join public.flow_marketplaces m on m.id=a.marketplace_id
where m.slug='magalu' and a.status='connected' on conflict(id) do nothing;

create or replace function public.mavuri_magalu_cloud_state(p_action text default 'state',p_run uuid default null,p_result jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c mavuri_internal.magalu_cloud_control%rowtype; local_time time;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_required' using errcode='42501';end if;
 select * into c from mavuri_internal.magalu_cloud_control where id for update;
 if not found then raise exception 'magalu_control_missing';end if;
 if p_action='state' then return to_jsonb(c);end if;
 if p_action='claim' then
  local_time:=(clock_timestamp() at time zone 'America/Sao_Paulo')::time;
  if not c.enabled then return jsonb_build_object('claimed',false,'reason','disabled');end if;
  if local_time<time '08:00' or local_time>time '22:00:30' then return jsonb_build_object('claimed',false,'reason','outside_window');end if;
  if c.lease_until>clock_timestamp() then return jsonb_build_object('claimed',false,'reason','running');end if;
  if c.last_started_at>clock_timestamp()-interval '29 minutes' then return jsonb_build_object('claimed',false,'reason','interval');end if;
  if c.activated_at>clock_timestamp()-interval '180 seconds' then return jsonb_build_object('claimed',false,'reason','handoff_wait');end if;
  update mavuri_internal.magalu_cloud_control set active_run=gen_random_uuid(),lease_until=clock_timestamp()+interval '10 minutes',last_started_at=clock_timestamp() where id returning * into c;
  return jsonb_build_object('claimed',true,'run_id',c.active_run,'owner_id',c.owner_id);
 elsif p_action='finish' then
  if c.active_run is distinct from p_run or p_run is null then raise exception 'invalid_run';end if;
  update mavuri_internal.magalu_cloud_control set lease_until=null,last_finished_at=clock_timestamp(),last_result=p_result where id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on function public.mavuri_magalu_cloud_state(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mavuri_magalu_cloud_state(text,uuid,jsonb) to service_role;

create or replace function mavuri_internal.magalu_job_gate() returns trigger
language plpgsql security definer set search_path='' as $$
declare c mavuri_internal.magalu_cloud_control%rowtype; o public.flow_offers%rowtype; origin text; run uuid; h record; same_product boolean; same_family boolean; old_price numeric; count_offers integer;
begin
 if new.status<>'queued' then return new;end if;
 select x.* into o from public.flow_offers x join public.flow_marketplaces m on m.id=x.marketplace_id where x.id=new.offer_id and m.slug='magalu';
 if not found then return new;end if;
 origin:=coalesce(new.delivery_key,'');
 if origin like 'fanout:%' then select j.delivery_key into origin from public.flow_delivery_jobs j where j.id=split_part(new.delivery_key,':',2)::uuid;end if;
 -- Manual keys remain outside this automatic-only handoff.
 if origin not like 'magalu:%' and origin not like 'repub:magalu:%' then return new;end if;
 select * into c from mavuri_internal.magalu_cloud_control where id;
 if c.enabled is not true then
  if origin like 'magalu:cloud:%' then return null;else return new;end if;
 end if;
 if origin not like 'magalu:cloud:%' then return null;end if;
 if split_part(origin,':',3)!~'^[0-9a-f-]{36}$' then return null;end if;
 run:=split_part(origin,':',3)::uuid;
 if coalesce(auth.role(),'')<>'service_role' or run is distinct from c.active_run or c.lease_until is null or c.lease_until<clock_timestamp() or c.owner_id<>new.user_id or o.user_id<>new.user_id then return null;end if;
 if split_part(origin,':',4)<>o.id::text then return null;end if;
 if not exists(select 1 from public.flow_channels x where x.id=new.channel_id and x.user_id=new.user_id and x.type='telegram' and x.status in ('active','connected') and nullif(x.external_ref,'') is not null) then return null;end if;
 if not exists(select 1 from public.flow_affiliate_accounts a where a.id=o.affiliate_account_id and a.user_id=new.user_id and a.status='connected' and o.affiliate_url like 'https://www.magazinevoce.com.br/'||a.external_account_id||'/%') then return null;end if;
 if coalesce(o.price,0)<=0 or coalesce(o.image_url,'') not like 'https://%' or coalesce(o.metadata#>>'{magalu,cloud_run_id}','')<>run::text or nullif(o.metadata#>>'{magalu,price_checked_at}','') is null or (o.metadata#>>'{magalu,price_checked_at}')::timestamptz<clock_timestamp()-interval '5 minutes' then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('mavuri-magalu-cloud-jobs',0));
 select count(distinct j.offer_id) into count_offers from public.flow_delivery_jobs j where j.user_id=new.user_id and j.delivery_key like 'magalu:cloud:'||run::text||':%' and j.offer_id<>o.id;
 if count_offers>=5 then return null;end if;
 -- Avoid an entire cycle consisting of the same category.
 if (select count(distinct j.offer_id) from public.flow_delivery_jobs j join public.flow_offers x on x.id=j.offer_id where j.user_id=new.user_id and j.delivery_key like 'magalu:cloud:'||run::text||':%' and x.mavuri_category_id=o.mavuri_category_id and x.id<>o.id)>=2 then return null;end if;
 for h in
  select x.id,x.source_ref,x.marketplace_id,x.title,j.status,j.sent_at,
    (select (l.metadata#>>'{offer_snapshot,price}')::numeric from public.flow_delivery_logs l where l.delivery_job_id=j.id and l.status='sent' and (l.metadata#>>'{offer_snapshot,price}')~'^[0-9]+(\.[0-9]+)?$' order by l.created_at desc limit 1) as snapshot_price
  from public.flow_delivery_jobs j join public.flow_offers x on x.id=j.offer_id
  where j.user_id=new.user_id and j.channel_id=new.channel_id and (j.status in ('queued','processing') or (j.status='sent' and j.sent_at>clock_timestamp()-interval '48 hours'))
 loop
  same_product:=h.id=o.id or (h.marketplace_id=o.marketplace_id and lower(h.source_ref)=lower(o.source_ref));
  same_family:=public.mavuri_offer_family(h.title)=public.mavuri_offer_family(o.title);
  if not same_product and not same_family then continue;end if;
  if h.status in ('queued','processing') then return null;end if;
  if not same_product and h.sent_at<clock_timestamp()-interval '24 hours' then continue;end if;
  old_price:=h.snapshot_price;
  -- Never compare different sizes/capacities for the price-drop exception.
  if old_price>0 and o.price<=old_price*0.90
    and substring(lower(h.title) from '\m(casal|queen|king|solteiro|solteira)\M') is not distinct from substring(lower(o.title) from '\m(casal|queen|king|solteiro|solteira)\M')
    and substring(lower(h.title) from '\m[0-9]+([.,][0-9]+)?[[:space:]]*(kg|g|ml|l|mah)\M') is not distinct from substring(lower(o.title) from '\m[0-9]+([.,][0-9]+)?[[:space:]]*(kg|g|ml|l|mah)\M') then continue;end if;
  return null;
 end loop;
 return new;
end $$;
revoke all on function mavuri_internal.magalu_job_gate() from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.flow_delivery_jobs'::regclass and tgname='aaa_mavuri_magalu_cloud_gate') then
 create trigger aaa_mavuri_magalu_cloud_gate before insert on public.flow_delivery_jobs for each row execute function mavuri_internal.magalu_job_gate();
 end if;
end $$;

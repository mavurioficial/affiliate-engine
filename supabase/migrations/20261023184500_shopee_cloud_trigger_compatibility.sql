-- Only changes behavior for future shopee-cloud:* delivery keys.
-- Existing local, manual, Magalu, ML and Amazon routes are unchanged.
CREATE OR REPLACE FUNCTION public.mavuri_delivery_job_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_channel record;
 v_offer record;
 v_old record;
 v_parent_key text;
 v_prefix text;
 v_automatic boolean;
 v_same boolean;
 v_similar boolean;
 v_last_price numeric;
 v_recent record;
 v_family text;
 v_old_family text;
 v_new_tokens text[];
 v_old_tokens text[];
 v_intersection integer;
 v_matchscore numeric;
 v_size_new text;
 v_size_old text;
 v_capacity_new text;
 v_capacity_old text;
begin
 if new.status <> 'queued' then return new; end if;

 select c.type,c.name into v_channel
 from public.flow_channels c where c.id=new.channel_id and c.user_id=new.user_id;
 if not found or v_channel.type <> 'telegram'
    or v_channel.name not in ('Mavuri Ofertas','Mavuri Mulher','Mavuri Casa & Cozinha','Mavuri Tecnologia') then
   return new;
 end if;

 -- Manual publications use a direct UUID:UUID key. Recursive fanout inherits
 -- the originating publication's intent and MUST retain manual bypass.
 v_prefix := split_part(coalesce(new.delivery_key,''),':',1);
 if v_prefix='fanout' then
   select delivery_key into v_parent_key
   from public.flow_delivery_jobs
   where id=(case when split_part(new.delivery_key,':',2) ~ '^[0-9a-fA-F-]{36}$'
     then split_part(new.delivery_key,':',2)::uuid else null end);
   v_prefix:=split_part(coalesce(v_parent_key,''),':',1);
 end if;
 v_automatic := v_prefix in ('discovery','shopee','shopee-cloud','magalu','repub','amazon-collector');
 if not v_automatic then return new; end if;

 select o.id,o.title,o.product_url,o.price,o.marketplace_id
   into v_offer from public.flow_offers o where o.id=new.offer_id and o.user_id=new.user_id;
 if not found then return new; end if;
 v_family:=public.mavuri_offer_family(v_offer.title);
 v_new_tokens:=regexp_split_to_array(replace(v_family,'title:',''),' ');
 v_size_new:=substring(lower(v_offer.title) from '\m(casal|queen|king|solteiro|solteira)\M');
 v_capacity_new:=substring(lower(v_offer.title) from '\m[0-9]+([.,][0-9]+)?[[:space:]]*(kg|g|ml|l|mah)\M');

 -- An in-flight job for exactly the same product/destination cannot be duplicated.
 if exists(select 1 from public.flow_delivery_jobs j
   where j.user_id=new.user_id and j.offer_id=new.offer_id and j.channel_id=new.channel_id
     and j.status in ('queued','processing')) then return null; end if;

 -- Process only this channel: publishing in a niche must not block the general channel.
 -- Compare product families across marketplaces, but only when confidently similar.
 for v_recent in
   select j.status,j.sent_at,o.id,o.title,o.product_url,o.price,o.marketplace_id,
          (select nullif(l.metadata->'offer_snapshot'->>'price','')::numeric
           from public.flow_delivery_logs l
           where l.delivery_job_id=j.id and l.status='sent'
             and l.metadata->'offer_snapshot'->>'price' ~ '^[0-9]+(\.[0-9]+)?$'
           order by l.created_at desc limit 1) as snapshot_price
   from public.flow_delivery_jobs j
   join public.flow_offers o on o.id=j.offer_id
   where j.user_id=new.user_id and j.channel_id=new.channel_id
     and (j.status in ('queued','processing') or
          (j.status='sent' and j.sent_at >= now()-interval '48 hours'))
   order by coalesce(j.sent_at,j.created_at) desc limit 400
 loop
   v_same := v_recent.id=v_offer.id
     or (nullif(v_offer.product_url,'') is not null
       and nullif(v_recent.product_url,'') is not null
       and split_part(split_part(v_offer.product_url,'?',1),'#',1)
         =split_part(split_part(v_recent.product_url,'?',1),'#',1));
   v_similar:=false;
   if not v_same then
     v_old_family:=public.mavuri_offer_family(v_recent.title);
     if v_family=v_old_family and length(v_family)>=14 then
       v_similar:=true;
     elsif left(v_family,6)='title:' and left(v_old_family,6)='title:' then
       v_old_tokens:=regexp_split_to_array(replace(v_old_family,'title:',''),' ');
       if coalesce(array_length(v_new_tokens,1),0)>=5 and coalesce(array_length(v_old_tokens,1),0)>=5 then
         select count(*) into v_intersection
         from (select distinct unnest(v_new_tokens) token intersect select distinct unnest(v_old_tokens) token) x
         where length(x.token)>=3;
         v_matchscore:=v_intersection::numeric/greatest(array_length(v_new_tokens,1),array_length(v_old_tokens,1));
         v_similar:=(v_intersection>=5 and v_matchscore>=0.78);
       end if;
     end if;
   end if;
   if not (v_same or v_similar) then continue; end if;
   if v_recent.status in ('queued','processing') then return null; end if;
   if v_same and v_recent.sent_at < now()-interval '48 hours' then continue; end if;
   if v_similar and not v_same and v_recent.sent_at < now()-interval '24 hours' then continue; end if;

   v_last_price:=v_recent.snapshot_price;
   if v_last_price is null and v_recent.id<>v_offer.id then v_last_price:=v_recent.price; end if;
   v_size_old:=substring(lower(v_recent.title) from '\m(casal|queen|king|solteiro|solteira)\M');
   v_capacity_old:=substring(lower(v_recent.title) from '\m[0-9]+([.,][0-9]+)?[[:space:]]*(kg|g|ml|l|mah)\M');
   -- Price changes between sizes are not comparable; don't use them as overrides.
   if v_last_price>0 and v_offer.price>0
      and v_offer.price <= v_last_price*0.90
      and (v_size_new is not distinct from v_size_old)
      and (v_capacity_new is not distinct from v_capacity_old) then
     continue;
   end if;
   return null;
 end loop;
 return new;
end $function$


CREATE OR REPLACE FUNCTION public.mavuri_delivery_job_fanout()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_title text;
  v_text text;
  v_tags text[];
  v_category_slug text;
  v_general uuid;
  v_mulher uuid;
  v_casa uuid;
  v_tech uuid;
  v_target uuid;
  v_targets uuid[] := array[]::uuid[];
  v_is_repub boolean := false;
begin
  if new.status <> 'queued' or pg_trigger_depth() > 1 then
    return new;
  end if;
  -- Cloud executor supplies explicitly verified channels; never fan out.
  if coalesce(new.delivery_key,'') like 'shopee-cloud:%' then
    return new;
  end if;
  -- Publicacao manual deve respeitar apenas os canais escolhidos pelo operador.
  if coalesce(new.delivery_key,'') ~ '^[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}$'
     or coalesce(new.delivery_key,'') ~ '^(amazon-manual|shopee-manual-test|manual-)' then
    return new;
  end if;

  select o.title, coalesce(o.mavuri_tags, array[]::text[])
    into v_title, v_tags
  from public.flow_offers o
  where o.id = new.offer_id and o.user_id = new.user_id;

  select mc.slug into v_category_slug
  from public.flow_offers o
  left join public.mavuri_categories mc on mc.id=o.mavuri_category_id
  where o.id = new.offer_id and o.user_id = new.user_id;

  if v_title is null then
    return new;
  end if;

  v_text := translate(lower(v_title),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc');

  select id into v_general from public.flow_channels
   where user_id=new.user_id and type='telegram' and status in ('active','connected')
     and external_ref is not null and name='Mavuri Ofertas' limit 1;
  select id into v_mulher from public.flow_channels
   where user_id=new.user_id and type='telegram' and status in ('active','connected')
     and external_ref is not null and name='Mavuri Mulher' limit 1;
  select id into v_casa from public.flow_channels
   where user_id=new.user_id and type='telegram' and status in ('active','connected')
     and external_ref is not null and name='Mavuri Casa & Cozinha' limit 1;
  select id into v_tech from public.flow_channels
   where user_id=new.user_id and type='telegram' and status in ('active','connected')
     and external_ref is not null and name='Mavuri Tecnologia' limit 1;

  if v_general is not null then
    v_targets := array_append(v_targets, v_general);
  end if;

  if v_mulher is not null and (
    (
      v_category_slug in ('moda','beleza')
      and (
        v_tags && array['feminino','maquiagem','skincare','cabelo','unhas','acessorios-femininos']::text[]
        or v_text ~ '(feminin|batom|maquiagem|rimel|delineador|blush|gloss|skincare|serum facial|hidratante facial|shampoo|condicionador|mascara capilar|chapinha|escova secadora|vestido|saia|legging|sutia|calcinha|lingerie)'
      )
    )
    or (
      v_category_slug='saude-bem-estar'
      and (
        v_tags && array['feminino','controle-peso','bem-estar']::text[]
        or v_text ~ '(psyllium|quitosana|quitossana|spirulina|termogen|controle de peso|saciedade)'
      )
    )
  )
  and not (v_tags && array['masculino','infantil','casa','cozinha','limpeza','decoracao']::text[])
  and v_text !~ '(masculin|(^|[^a-z])homem([^a-z]|$)|(^|[^a-z])men([^a-z]|$)|cuecas?|after shave|pos barba|barba)'
  -- Do not route automotive shampoos and detailing kits as women's hair care.
  and v_text !~ '(automotiv|vonixx|v[- ]?floc|v[- ]?mol|vexus|shampoo para carros|limpeza de veiculos|estetica automotiva)' then
    v_targets := array_append(v_targets, v_mulher);
  end if;

  if v_casa is not null and (
    v_category_slug in ('casa','cozinha')
    and (
      v_tags && array['casa','cozinha','limpeza','decoracao','moveis','gamer-setup','escritorio']::text[]
      or v_text ~ '(copo|caneca|taca|garrafa termica|panela|frigideira|pote|talher|chaleira|cozedor|egg cooker|forno eletrico|forninho|mixer|batedeira|picador|processador|moedor|liquidificador|cafeteira|sanduicheira|torradeira|air fryer|fritadeira|panela eletrica|pipoqueira|espremedor|cooktop|micro-ondas|microondas|ventilador de teto|armario|organizador|estante|prateleira|balde|lixeira|cabide|varal|tapete|cortina|luminaria|abajur|lampada|decoracao|difusor|umidificador|cadeira gamer|gaming chair|cadeira de escritorio|cadeira escritorio|cadeira ergonomica|cadeira executiva|cadeira presidente|cadeira office|office chair)'
    )
  ) then
    v_targets := array_append(v_targets, v_casa);
  end if;

  if v_tech is not null and (
    (
      v_category_slug in ('eletronicos','informatica')
      and (
        v_tags && array['eletronicos','informatica','celular']::text[]
        or v_text ~ '(monitor|notebook|computador|mouse|teclado|ssd|hd externo|roteador|webcam|impressora|smartphone|celular|iphone|galaxy|fone|headset|smartwatch|caixa de som|projetor|tablet|carregador|playstation|ps[345]|xbox|nintendo switch|videogame|console|steam deck)'
      )
    )
    or (
      v_text ~ '(cadeira gamer|gaming chair)'
      and (
        v_tags && array['gamer-setup','tecnologia']::text[]
        or v_category_slug='casa'
      )
    )
  ) then
    v_targets := array_append(v_targets, v_tech);
  end if;

  v_is_repub := coalesce(new.delivery_key,'') like 'repub:%';

  foreach v_target in array v_targets loop
    if v_target = new.channel_id then
      continue;
    end if;

    if exists (
      select 1 from public.flow_delivery_jobs j
      where j.user_id = new.user_id
        and j.offer_id = new.offer_id
        and j.channel_id = v_target
        and j.status in ('queued','processing')
    ) then
      continue;
    end if;

    if not v_is_repub and exists (
      select 1 from public.flow_delivery_jobs j
      where j.user_id = new.user_id
        and j.offer_id = new.offer_id
        and j.channel_id = v_target
        and j.status = 'sent'
        and j.sent_at >= now() - interval '24 hours'
    ) then
      continue;
    end if;

    insert into public.flow_delivery_jobs(
      user_id, offer_id, channel_id, status, attempts, scheduled_for, delivery_key, error_message
    ) values (
      new.user_id,new.offer_id,v_target,'queued',0,
      coalesce(new.scheduled_for,now()),
      'fanout:' || new.id::text || ':' || v_target::text,
      null
    )
    on conflict (user_id, delivery_key) do nothing;
  end loop;

  return new;
end;
$function$


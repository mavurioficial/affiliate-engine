-- DRAFT ONLY. NOT APPLIED.
-- Deploy together with the exact v38 worker candidate.
-- This DB trigger is currently populated AFTER a successful Telegram send.
-- Existing DB-only price can drift if flow_offers changes in between.
-- When the service-role worker explicitly states its rendered price, preserve
-- that price as the immutable snapshot. Other producers keep database fallback.
-- Guard deployment against drift: production trigger must still match the
-- baseline retrieved for function version 2026-10-22.
CREATE OR REPLACE FUNCTION public.mavuri_delivery_log_snapshot_offer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_offer jsonb;
begin
  if new.status = 'sent' and new.offer_id is not null then
    select jsonb_build_object(
      'price', o.price,
      'discount_percent', o.discount_percent,
      'coupon', o.coupon,
      'fingerprint', o.fingerprint,
      'captured_at', o.captured_at
    ) into v_offer
    from public.flow_offers o
    where o.id = new.offer_id;

    -- PREPARED GUARD: prefer the actual price used in the Telegram caption,
    -- supplied by a trusted service-role Flow worker. Old callers retain
    -- the existing fallback behavior. NEVER trust browser-provided price.
    if coalesce(auth.jwt()->>'role','') = 'service_role'
       and new.metadata #>> '{rendered_offer_snapshot,source}' = 'flow-worker-rendered-v1'
       and new.metadata #>> '{rendered_offer_snapshot,price}' ~ '^[0-9]{1,14}(\\.[0-9]{1,2})?
  end if;
  return new;
end;
$function$

       and (new.metadata #>> '{rendered_offer_snapshot,price}')::numeric > 0 then
      new.metadata := coalesce(new.metadata, '{}'::jsonb) ||
        jsonb_build_object('offer_snapshot',
          coalesce(v_offer, '{}'::jsonb) ||
          jsonb_build_object(
            'price', (new.metadata #>> '{rendered_offer_snapshot,price}')::numeric,
            'price_source', 'worker_rendered',
            'display_price', new.metadata #>> '{rendered_offer_snapshot,display_price}'
          )
        );
    else
      -- Compatibility fallback for pre-migration/manual integrations. It is
      -- NOT sufficient to authorize a Cloud 10% price-drop exception.
      new.metadata := coalesce(new.metadata, '{}'::jsonb) ||
        jsonb_build_object('offer_snapshot',
          coalesce(v_offer, '{}'::jsonb) ||
          jsonb_build_object('price_source','database_fallback')
        );
    end if;
  end if;
  return new;
end;
$function$

-- Future price-drop authorization must require:
-- status='sent', offer_snapshot.price_source='worker_rendered',
-- numerical snapshot price and >=10% exact monetary drop. An old/fallback
-- snapshot alone MUST NOT authorize the early republish exception.

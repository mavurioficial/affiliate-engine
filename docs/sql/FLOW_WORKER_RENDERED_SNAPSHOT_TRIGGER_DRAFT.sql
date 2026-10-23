-- DRAFT ONLY, UNAPPLIED. Stage together with Flow Worker v38 snapshot candidate.
-- Preserve the exact price rendered in the Telegram message via service-role
-- log metadata, not a mutable flow_offers.price reread after sending.
-- Historic callers still receive database_fallback price_source.
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

    -- Prefer a verified service-role Telegram worker rendered-price snapshot.
    -- Historic/manual callers retain the original database snapshot fallback.
    if coalesce(auth.jwt()->>'role','') = 'service_role'
       and new.metadata #>> '{rendered_offer_snapshot,source}' = 'flow-worker-rendered-v1'
       and new.metadata #>> '{rendered_offer_snapshot,price}' ~ '^[0-9]{1,14}(\.[0-9]{1,2})?$'
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
      -- Fallback is NOT eligible for a cloud 10% early price-drop override.
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
-- Guard before deployment: evaluate concurrent writes, active worker version,
-- role claims, RLS, historical price snapshots, and Telegram caption presence.
-- Future early-price-drop exception MUST require price_source='worker_rendered'.

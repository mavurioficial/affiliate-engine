-- DRAFT ONLY — not deployed; no DDL has been applied.
-- Database-owned rule evaluation *after* category classification triggers.
-- Security invoker. Intended only for a future service-only enqueue RPC.
CREATE OR REPLACE FUNCTION mavuri_internal.shopee_cloud_rule_matches_draft(
  p_user_id uuid,
  p_offer_id uuid,
  p_channel_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
WITH valid_offer AS (
  SELECT
    o.title,
    o.price,
    o.discount_percent,
    COALESCE(o.mavuri_tags, ARRAY[]::text[]) AS tags,
    mc.slug AS category_slug
  FROM public.flow_offers o
  JOIN public.flow_marketplaces mp ON mp.id=o.marketplace_id AND mp.slug='shopee'
  JOIN public.mavuri_categories mc ON mc.id=o.mavuri_category_id AND mc.active
  JOIN public.flow_affiliate_accounts aa ON aa.id=o.affiliate_account_id
    AND aa.user_id=p_user_id AND aa.marketplace_id=o.marketplace_id
    AND aa.status='connected'
  WHERE o.id=p_offer_id AND o.user_id=p_user_id AND
    o.metadata #>> '{mavuri,category_slug}' = mc.slug
),
active_channel AS (
  SELECT id FROM public.flow_channels c
  WHERE c.id=p_channel_id AND c.user_id=p_user_id AND c.type='telegram'
    AND c.status IN ('connected','active') AND c.external_ref IS NOT NULL
    AND c.name IN ('Mavuri Ofertas','Mavuri Mulher',
                   'Mavuri Casa & Cozinha','Mavuri Tecnologia')
),
known_rules AS (
  SELECT r.name,r.conditions,r.actions
  FROM public.flow_rules r
  WHERE r.user_id=p_user_id AND r.enabled
    AND r.conditions->>'marketplace'='shopee'
),
matching_rules AS (
  SELECT r.*
  FROM known_rules r CROSS JOIN active_channel c
  WHERE r.name IN ('SHOPEE — Geral','SHOPEE — Mulher',
                   'SHOPEE — Casa & Cozinha','SHOPEE — Tecnologia')
    AND jsonb_typeof(r.actions->'channel_ids')='array'
    AND r.actions->'channel_ids' @> jsonb_build_array(c.id::text)
    -- Never silently authorize rules with new, unsupported conditions.
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(r.conditions) AS keys(condition_key)
      WHERE condition_key NOT IN (
        'marketplace','minDiscount','maxDiscount','minPrice','maxPrice',
        'mavuriCategories','mavuriTagsAny','mavuriTagsAll',
        'deniedMavuriTags','deniedWords'
      )
    )
)
SELECT (
  (SELECT count(*) FROM known_rules)=4
  AND (SELECT count(DISTINCT name) FROM known_rules
       WHERE name IN ('SHOPEE — Geral','SHOPEE — Mulher',
                      'SHOPEE — Casa & Cozinha','SHOPEE — Tecnologia'))=4
  AND (SELECT count(*) FROM matching_rules)=1
  AND EXISTS (
    SELECT 1 FROM valid_offer o CROSS JOIN matching_rules r
    WHERE
      o.discount_percent IS NOT NULL
      AND o.discount_percent >= 10
      AND o.discount_percent >= COALESCE((r.conditions->>'minDiscount')::numeric,10)
      AND (NOT (r.conditions ? 'maxDiscount')
           OR o.discount_percent <= (r.conditions->>'maxDiscount')::numeric)
      AND (NOT (r.conditions ? 'minPrice')
           OR o.price >= (r.conditions->>'minPrice')::numeric)
      AND (NOT (r.conditions ? 'maxPrice')
           OR o.price <= (r.conditions->>'maxPrice')::numeric)
      AND (
        NOT (r.conditions ? 'mavuriCategories')
        OR o.category_slug IN (
          SELECT jsonb_array_elements_text(r.conditions->'mavuriCategories')
        )
      )
      AND (
        NOT (r.conditions ? 'mavuriTagsAny')
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(r.conditions->'mavuriTagsAny') t
          WHERE t = ANY(o.tags)
        )
      )
      AND (
        NOT (r.conditions ? 'mavuriTagsAll')
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(r.conditions->'mavuriTagsAll') t
          WHERE NOT t = ANY(o.tags)
        )
      )
      AND (
        NOT (r.conditions ? 'deniedMavuriTags')
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(r.conditions->'deniedMavuriTags') t
          WHERE t = ANY(o.tags)
        )
      )
      AND (
        NOT (r.conditions ? 'deniedWords')
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(r.conditions->'deniedWords') t
          -- JS matchesRule is case- and accent-insensitive; comparing only
          -- lower() would miss "sofa" vs "sofá" and route a denied item.
          WHERE position(
            translate(lower(t),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')
            IN translate(lower(o.title),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')
          )>0
        )
      )
  )
);
$fn$;

-- The internal schema is not exposed through PostgREST.
-- On eventual deployment, prohibit ordinary clients explicitly.
REVOKE ALL ON FUNCTION mavuri_internal.shopee_cloud_rule_matches_draft(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
-- Do not grant EXECUTE to the browser.

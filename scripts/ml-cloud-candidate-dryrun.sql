-- Mavuri Mercado Livre experimental gate / READ-ONLY
-- Safe to execute by an authorized operator. No writes, no external calls.
-- IMPORTANT: This is a historical-candidate eligibility audit,
-- NOT proof of commission attribution or freshness of current product price.
WITH ml AS (
  SELECT o.*
  FROM public.flow_offers o
  JOIN public.flow_marketplaces m ON m.id = o.marketplace_id
  WHERE m.slug = 'mercadolivre'
), candidates AS (
  SELECT *
  FROM ml
  WHERE affiliate_url IS NULL
    AND product_url ~ '/p/MLB[0-9]{6,}'
)
SELECT
  COUNT(*)::integer AS historical_unlinked_catalog_candidates,
  COUNT(*) FILTER (WHERE captured_at >= NOW() - INTERVAL '48 hours')::integer AS recently_captured_48h,
  COUNT(*) FILTER (WHERE captured_at >= NOW() - INTERVAL '7 days')::integer AS recently_captured_7d,
  COUNT(*) FILTER (WHERE discount_percent >= 10)::integer AS historical_discount_at_least_10,
  COUNT(*) FILTER (WHERE mavuri_category_id IS NOT NULL)::integer AS already_categorized,
  COUNT(*) FILTER (
    WHERE captured_at >= NOW() - INTERVAL '48 hours'
      AND discount_percent >= 10
      AND mavuri_category_id IS NOT NULL
  )::integer AS preliminary_review_candidates,
  MAX(captured_at) AS most_recent_capture,
  0::integer AS published_by_this_query,
  FALSE AS commission_attribution_verified
FROM candidates;

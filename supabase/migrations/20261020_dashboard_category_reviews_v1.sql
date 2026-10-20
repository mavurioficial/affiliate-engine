-- Mavuri v0.1.45: auditoria individual somente leitura, vinculada ao usuário autenticado.
CREATE OR REPLACE FUNCTION public.mavuri_dashboard_category_reviews_v1(p_days integer DEFAULT 1, p_view text DEFAULT 'review'::text, p_marketplace text DEFAULT ''::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_start timestamptz;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE='42501';
  END IF;
  IF p_days NOT IN (1,7,30) OR p_days IS NULL THEN
    RAISE EXCEPTION 'Period must be 1, 7 or 30 days' USING ERRCODE='22023';
  END IF;
  IF p_view NOT IN ('review','other','all') OR p_view IS NULL THEN
    RAISE EXCEPTION 'Unknown review view' USING ERRCODE='22023';
  END IF;
  IF p_marketplace NOT IN ('','mercadolivre','shopee','magalu','amazon') OR p_marketplace IS NULL THEN
    RAISE EXCEPTION 'Unknown marketplace' USING ERRCODE='22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 5000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023';
  END IF;
  v_start := (((v_now AT TIME ZONE 'America/Sao_Paulo')::date - (p_days-1))::timestamp AT TIME ZONE 'America/Sao_Paulo');

  WITH source_rows AS MATERIALIZED (
    SELECT a.offer_id,a.title,a.marketplace_slug,a.source_category_id,
       a.source_category_name,a.mavuri_category_slug,
       mc.name as mavuri_category_name,
       a.mavuri_tags,a.classification_source,a.confidence,
       a.needs_review,a.review_reason,a.classified_at,a.updated_at,
       o.created_at,o.image_url,o.affiliate_url,
       mapped_cat.slug AS official_map_slug,mapped_cat.name AS official_map_name
      FROM public.mavuri_category_audit a
      JOIN public.flow_offers o ON o.id=a.offer_id AND o.user_id=v_user
      LEFT JOIN public.mavuri_categories mc ON mc.id=a.mavuri_category_id
      LEFT JOIN public.mavuri_marketplace_category_map mapping
        ON mapping.marketplace_id=a.marketplace_id
        AND mapping.external_category_id=a.source_category_id
        AND a.source_category_id IS NOT NULL
        AND mapping.active=true
      LEFT JOIN public.mavuri_categories mapped_cat ON mapped_cat.id=mapping.mavuri_category_id
      WHERE a.user_id=v_user
        AND o.created_at >= v_start AND o.created_at <= v_now
        AND (p_marketplace='' OR a.marketplace_slug=p_marketplace)
  ),
  filtered AS MATERIALIZED (
    SELECT * FROM source_rows
    WHERE (p_view='review' AND needs_review)
       OR (p_view='other' AND mavuri_category_slug='outros')
       OR p_view='all'
  ),
  page AS MATERIALIZED (
    SELECT *
      FROM filtered
      ORDER BY created_at DESC,offer_id DESC
      LIMIT p_limit OFFSET p_offset
  ),
  grouped_suggestions AS MATERIALIZED (
    SELECT s.marketplace_slug,s.source_category_id,
      s.mavuri_category_slug AS suggested_category,
      count(*) AS suggested_occurrences,
      min(s.confidence) AS suggested_confidence,
      row_number() over(partition by s.marketplace_slug,s.source_category_id
                        order by count(*) desc,min(s.confidence) desc nulls last) AS rn
    FROM public.mavuri_category_audit s
    JOIN (SELECT DISTINCT marketplace_slug,source_category_id FROM page
          WHERE source_category_id IS NOT NULL) relevant
      ON relevant.marketplace_slug=s.marketplace_slug
      AND relevant.source_category_id=s.source_category_id
    WHERE s.user_id=v_user
      AND s.needs_review=true
      AND s.review_reason='official_category_unmapped'
      AND s.mavuri_category_slug <> 'outros'
    GROUP BY s.marketplace_slug,s.source_category_id,s.mavuri_category_slug
  ),
  cards AS (
    SELECT p.*,
      sugg.suggested_category,sugg.suggested_occurrences,sugg.suggested_confidence
    FROM page p
    LEFT JOIN grouped_suggestions sugg ON sugg.marketplace_slug=p.marketplace_slug
      AND sugg.source_category_id=p.source_category_id AND sugg.rn=1
  )
  SELECT jsonb_build_object(
    'generated_at', v_now,
    'period_start', v_start,
    'days',p_days,'view',p_view,'marketplace',p_marketplace,
    'total',(SELECT count(*) FROM filtered),
    'review_total',(SELECT count(*) FROM source_rows WHERE needs_review),
    'other_total',(SELECT count(*) FROM source_rows WHERE mavuri_category_slug='outros'),
    'limit',p_limit,'offset',p_offset,
    'items',coalesce((
       SELECT jsonb_agg(jsonb_build_object(
        'offer_id',offer_id,
        'title',title,
        'marketplace',marketplace_slug,
        'source_category_id',source_category_id,
        'source_category_name',source_category_name,
        'category_slug',mavuri_category_slug,
        'category_name',mavuri_category_name,
        'tags',coalesce(to_jsonb(mavuri_tags),'[]'::jsonb),
        'classification_source',classification_source,
        'confidence',confidence,
        'needs_review',needs_review,
        'review_reason',review_reason,
        'created_at',created_at,
        'classified_at',classified_at,
        'updated_at',updated_at,
        'image_url',image_url,
        'affiliate_url',affiliate_url,
        'official_map_slug',official_map_slug,
        'official_map_name',official_map_name,
        'statistical_suggestion',case
          when suggested_category is not null
          then jsonb_build_object('slug',suggested_category,
            'occurrences',suggested_occurrences,'confidence',suggested_confidence,
            'note','Distribuição histórica: NÃO é validação do mapeamento.')
          else null end
       ) ORDER BY created_at DESC,offer_id DESC)
       FROM cards
    ),'[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

REVOKE ALL ON FUNCTION public.mavuri_dashboard_category_reviews_v1(integer,text,text,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mavuri_dashboard_category_reviews_v1(integer,text,text,integer,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.mavuri_dashboard_category_reviews_v1(integer,text,text,integer,integer) TO authenticated;

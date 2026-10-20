-- Mavuri v0.1.46: audited decisions scoped by auth.uid().
-- Secure manual approvals/corrections; no global category mappings.
CREATE TABLE IF NOT EXISTS public.mavuri_category_manual_reviews (
  offer_id uuid PRIMARY KEY REFERENCES public.flow_offers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.mavuri_categories(id),
  decision text NOT NULL CHECK(decision IN ('approve','correct')),
  title_snapshot text NOT NULL,
  decided_by uuid NOT NULL REFERENCES auth.users(id),
  decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mavuri_category_manual_reviews_user_idx
 ON public.mavuri_category_manual_reviews(user_id,decided_at DESC);

CREATE TABLE IF NOT EXISTS public.mavuri_category_review_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id uuid NOT NULL REFERENCES public.flow_offers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL CHECK(action IN ('approve','correct','undo')),
  prior_category_slug text,
  resulting_category_slug text,
  previous_override jsonb,
  resulting_override jsonb,
  prior_review_reason text,
  resulting_review_reason text,
  note text,
  undo_of_action_id bigint UNIQUE REFERENCES public.mavuri_category_review_history(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mavuri_category_review_history_owner_idx
 ON public.mavuri_category_review_history(user_id,offer_id,id DESC);

ALTER TABLE public.mavuri_category_manual_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mavuri_category_review_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mavuri_manual_reviews_read_own ON public.mavuri_category_manual_reviews;
CREATE POLICY mavuri_manual_reviews_read_own ON public.mavuri_category_manual_reviews
 FOR SELECT TO authenticated USING (user_id=auth.uid());
DROP POLICY IF EXISTS mavuri_review_history_read_own ON public.mavuri_category_review_history;
CREATE POLICY mavuri_review_history_read_own ON public.mavuri_category_review_history
 FOR SELECT TO authenticated USING (user_id=auth.uid());

REVOKE ALL ON public.mavuri_category_manual_reviews FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.mavuri_category_review_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mavuri_category_manual_reviews TO authenticated;
GRANT SELECT ON public.mavuri_category_review_history TO authenticated;

-- mavuri_manual_category_review_guard
CREATE OR REPLACE FUNCTION public.mavuri_manual_category_review_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_review record;
  v_slug text;
  v_tags text[] := ARRAY[]::text[];
  v_title text := public.mavuri_normalize_text(coalesce(NEW.title,''));
  v_meta jsonb := coalesce(NEW.metadata->'mavuri','{}'::jsonb);
BEGIN
  SELECT r.category_id,r.decision,r.title_snapshot,r.decided_by,r.decided_at,mc.slug
  INTO v_review
  FROM public.mavuri_category_manual_reviews r
  JOIN public.mavuri_categories mc ON mc.id=r.category_id AND mc.active
  WHERE r.offer_id=NEW.id AND r.user_id=NEW.user_id
  LIMIT 1;

  IF NOT FOUND OR public.mavuri_normalize_text(coalesce(v_review.title_snapshot,'')) <> v_title THEN
    IF v_meta ? 'manual_reviewed_at' THEN
      NEW.metadata := jsonb_set(
        coalesce(NEW.metadata,'{}'::jsonb),'{mavuri}',
        v_meta-'manual_reviewed_at'-'manual_reviewed_by'-'manual_review_action',true
      );
    END IF;
    RETURN NEW;
  END IF;

  v_slug := v_review.slug;
  NEW.mavuri_category_id := v_review.category_id;

  IF v_review.decision='correct' THEN
    -- Apply only safe primary-category tags. Never preserve stale competing niche tags.
    CASE v_slug
      WHEN 'casa' THEN v_tags:=ARRAY['casa'];
      WHEN 'cozinha' THEN v_tags:=ARRAY['casa','cozinha'];
      WHEN 'eletronicos' THEN v_tags:=ARRAY['eletronicos'];
      WHEN 'informatica' THEN v_tags:=ARRAY['informatica'];
      WHEN 'infantil' THEN v_tags:=ARRAY['infantil'];
      WHEN 'pet' THEN v_tags:=ARRAY['pet'];
      WHEN 'moto' THEN v_tags:=ARRAY['moto'];
      WHEN 'beleza' THEN
        IF v_title ~ '(shampoo|condicionador|capilar|cabelo|secador)' THEN
          v_tags:=array_append(v_tags,'cabelo');
        END IF;
        IF v_title ~ '(batom|maquiagem|rimel|delineador|blush|gloss)' THEN
          v_tags:=array_append(v_tags,'maquiagem');
        END IF;
        IF v_title ~ '(skincare|serum facial|hidratante facial|retinol|niacinamida)' THEN
          v_tags:=array_append(v_tags,'skincare');
        END IF;
        IF v_title ~ '(feminin|mulher|women)' THEN
          v_tags:=array_append(v_tags,'feminino');
        END IF;
      WHEN 'moda' THEN
        IF v_title ~ '(feminin|mulher|women|vestido|saia|lingerie)' THEN
          v_tags:=ARRAY['feminino'];
        END IF;
      ELSE v_tags:=ARRAY[]::text[];
    END CASE;
    NEW.mavuri_tags := v_tags;
  END IF;

  NEW.metadata := jsonb_set(
    coalesce(NEW.metadata,'{}'::jsonb),'{mavuri}',
    v_meta || jsonb_build_object(
      'category_slug',v_slug,
      'tags',to_jsonb(coalesce(NEW.mavuri_tags,ARRAY[]::text[])),
      'classification_source',
        CASE WHEN v_review.decision='approve' THEN 'manual_approved' ELSE 'manual_corrected' END,
      'classification_confidence',1.0,
      'classification_needs_review',false,
      'classification_review_reason',NULL,
      'manual_review_action',v_review.decision,
      'manual_reviewed_at',v_review.decided_at,
      'manual_reviewed_by',v_review.decided_by
    ),true
  );
  RETURN NEW;
END;
$function$
;

-- mavuri_dashboard_category_decide_v1
CREATE OR REPLACE FUNCTION public.mavuri_dashboard_category_decide_v1(p_offer_id uuid, p_action text, p_category_slug text, p_expected_updated_at timestamp with time zone, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_offer public.flow_offers%ROWTYPE;
  v_before public.mavuri_category_audit%ROWTYPE;
  v_after public.mavuri_category_audit%ROWTYPE;
  v_previous jsonb;
  v_current jsonb;
  v_target public.mavuri_categories%ROWTYPE;
  v_prev_slug text;
  v_action_id bigint;
  v_note text:=NULLIF(btrim(p_note),'');
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_offer_id IS NULL OR p_action NOT IN ('approve','correct') OR p_action IS NULL
     OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Invalid decision parameters' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(v_note,''))>500 THEN
    RAISE EXCEPTION 'Note may not exceed 500 characters' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_offer FROM public.flow_offers o
    WHERE o.id=p_offer_id AND o.user_id=v_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found or access denied' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_before FROM public.mavuri_category_audit a
    WHERE a.offer_id=v_offer.id AND a.user_id=v_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit record missing' USING ERRCODE='P0002'; END IF;
  IF v_before.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Audit changed; reload before deciding' USING ERRCODE='40001';
  END IF;
  IF NOT v_before.needs_review THEN
    RAISE EXCEPTION 'Offer already reviewed; reload before deciding' USING ERRCODE='22023';
  END IF;

  SELECT slug INTO v_prev_slug FROM public.mavuri_categories WHERE id=v_offer.mavuri_category_id;
  IF p_action='approve' THEN
    IF v_prev_slug IS NULL OR v_prev_slug='outros' THEN
      RAISE EXCEPTION 'Choose a specific category before approval' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_target FROM public.mavuri_categories
    WHERE id=v_offer.mavuri_category_id AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Current category is inactive' USING ERRCODE='22023'; END IF;
  ELSE
    SELECT * INTO v_target FROM public.mavuri_categories
      WHERE slug=p_category_slug AND active AND slug<>'outros';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid target category' USING ERRCODE='22023'; END IF;
    IF v_target.id IS NOT DISTINCT FROM v_offer.mavuri_category_id THEN
      RAISE EXCEPTION 'Select Approve for an unchanged category' USING ERRCODE='22023';
    END IF;
  END IF;

  SELECT to_jsonb(m) INTO v_previous FROM public.mavuri_category_manual_reviews m
    WHERE m.offer_id=p_offer_id AND m.user_id=v_actor FOR UPDATE;

  INSERT INTO public.mavuri_category_manual_reviews
     (offer_id,user_id,category_id,decision,title_snapshot,decided_by,decided_at)
  VALUES (p_offer_id,v_actor,v_target.id,p_action,v_offer.title,v_actor,clock_timestamp())
  ON CONFLICT (offer_id) DO UPDATE
  SET category_id=excluded.category_id,decision=excluded.decision,
      title_snapshot=excluded.title_snapshot,decided_by=excluded.decided_by,
      decided_at=excluded.decided_at
  WHERE public.mavuri_category_manual_reviews.user_id=v_actor;

  UPDATE public.flow_offers SET title=title
    WHERE id=p_offer_id AND user_id=v_actor;

  SELECT * INTO v_after FROM public.mavuri_category_audit
    WHERE offer_id=p_offer_id AND user_id=v_actor;
  IF v_after.mavuri_category_id IS DISTINCT FROM v_target.id OR v_after.needs_review THEN
    RAISE EXCEPTION 'Review was not applied consistently' USING ERRCODE='P0001';
  END IF;
  SELECT to_jsonb(m) INTO v_current FROM public.mavuri_category_manual_reviews m
    WHERE m.offer_id=p_offer_id AND m.user_id=v_actor;

  INSERT INTO public.mavuri_category_review_history(
    offer_id,user_id,actor_id,action,prior_category_slug,
    resulting_category_slug,previous_override,resulting_override,
    prior_review_reason,resulting_review_reason,note
  ) VALUES (
    p_offer_id,v_actor,v_actor,p_action,v_prev_slug,
    v_after.mavuri_category_slug,v_previous,v_current,
    v_before.review_reason,v_after.review_reason,v_note
  ) RETURNING id INTO v_action_id;

  RETURN jsonb_build_object('ok',true,'action_id',v_action_id,
       'action',p_action,'offer_id',p_offer_id,'category',v_after.mavuri_category_slug,
       'needs_review',v_after.needs_review);
END;
$function$
;

-- mavuri_dashboard_category_undo_v1
CREATE OR REPLACE FUNCTION public.mavuri_dashboard_category_undo_v1(p_action_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_record public.mavuri_category_review_history%ROWTYPE;
  v_offer public.flow_offers%ROWTYPE;
  v_last bigint;
  v_before public.mavuri_category_audit%ROWTYPE;
  v_after public.mavuri_category_audit%ROWTYPE;
  v_prior jsonb;
  v_current jsonb;
  v_undo_id bigint;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_action_id IS NULL THEN RAISE EXCEPTION 'Missing action ID' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_record
    FROM public.mavuri_category_review_history a
    WHERE a.id=p_action_id AND a.user_id=v_actor FOR UPDATE;
  IF NOT FOUND OR v_record.action='undo' THEN
    RAISE EXCEPTION 'Decision not found or not reversible' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_offer FROM public.flow_offers o
    WHERE o.id=v_record.offer_id AND o.user_id=v_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found' USING ERRCODE='42501'; END IF;
  SELECT max(id) INTO v_last FROM public.mavuri_category_review_history
    WHERE offer_id=v_record.offer_id AND user_id=v_actor;
  IF v_last IS DISTINCT FROM p_action_id THEN
    RAISE EXCEPTION 'Only the latest decision can be undone' USING ERRCODE='40001';
  END IF;
  IF EXISTS(SELECT 1 FROM public.mavuri_category_review_history
    WHERE undo_of_action_id=p_action_id) THEN
    RAISE EXCEPTION 'Decision has already been undone' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_before FROM public.mavuri_category_audit
    WHERE offer_id=v_record.offer_id AND user_id=v_actor FOR UPDATE;
  IF v_before.classification_source NOT IN ('manual_approved','manual_corrected')
    OR public.mavuri_normalize_text(v_offer.title) IS DISTINCT FROM
      (SELECT public.mavuri_normalize_text(title_snapshot)
         FROM public.mavuri_category_manual_reviews
         WHERE offer_id=v_offer.id AND user_id=v_actor) THEN
    RAISE EXCEPTION 'Offer changed; manual decision is stale' USING ERRCODE='40001';
  END IF;

  v_prior:=v_record.previous_override;
  SELECT to_jsonb(m) INTO v_current FROM public.mavuri_category_manual_reviews m
     WHERE m.offer_id=v_offer.id AND m.user_id=v_actor FOR UPDATE;
  IF v_prior IS NULL OR v_prior='null'::jsonb THEN
    DELETE FROM public.mavuri_category_manual_reviews
      WHERE offer_id=v_offer.id AND user_id=v_actor;
  ELSE
    UPDATE public.mavuri_category_manual_reviews
       SET category_id=(v_prior->>'category_id')::uuid,
           decision=v_prior->>'decision',
           title_snapshot=v_prior->>'title_snapshot',
           decided_by=(v_prior->>'decided_by')::uuid,
           decided_at=(v_prior->>'decided_at')::timestamptz
     WHERE offer_id=v_offer.id AND user_id=v_actor;
  END IF;

  UPDATE public.flow_offers SET title=title
    WHERE id=v_offer.id AND user_id=v_actor;
  SELECT * INTO v_after FROM public.mavuri_category_audit
    WHERE offer_id=v_offer.id AND user_id=v_actor;
  INSERT INTO public.mavuri_category_review_history(
    offer_id,user_id,actor_id,action,prior_category_slug,
    resulting_category_slug,previous_override,resulting_override,
    prior_review_reason,resulting_review_reason,undo_of_action_id
  ) VALUES (
    v_offer.id,v_actor,v_actor,'undo',v_before.mavuri_category_slug,
    v_after.mavuri_category_slug,v_current,v_prior,
    v_before.review_reason,v_after.review_reason,p_action_id
  ) RETURNING id INTO v_undo_id;

  RETURN jsonb_build_object('ok',true,'undo_id',v_undo_id,
    'undone_action_id',p_action_id,'category',v_after.mavuri_category_slug,
    'needs_review',v_after.needs_review);
END;
$function$
;

-- mavuri_dashboard_category_history_v1
CREATE OR REPLACE FUNCTION public.mavuri_dashboard_category_history_v1(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_actor uuid:=auth.uid(); v_items jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.flow_offers WHERE id=p_offer_id AND user_id=v_actor) THEN
     RAISE EXCEPTION 'Offer not found or access denied' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
       'id',id,'action',action,'category_before',prior_category_slug,
       'category_after',resulting_category_slug,'note',note,
       'created_at',created_at,'undo_of_action_id',undo_of_action_id
  ) ORDER BY id DESC),'[]'::jsonb) INTO v_items
  FROM (SELECT * FROM public.mavuri_category_review_history
    WHERE offer_id=p_offer_id AND user_id=v_actor ORDER BY id DESC LIMIT 30) x;
  RETURN jsonb_build_object('offer_id',p_offer_id,'items',v_items,
    'latest_action_id',coalesce((v_items->0->>'id')::bigint,NULL));
END;
$function$
;

-- mavuri_dashboard_category_reviews_v1
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
  IF p_view NOT IN ('review','other','reviewed','all') OR p_view IS NULL THEN
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
       mr.decision AS manual_decision,mr.decided_at AS manual_reviewed_at,
       hist.id AS last_action_id,hist.action AS last_action_kind,
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
      LEFT JOIN public.mavuri_category_manual_reviews mr
        ON mr.offer_id=a.offer_id AND mr.user_id=v_user
        AND public.mavuri_normalize_text(mr.title_snapshot)=public.mavuri_normalize_text(o.title)
      LEFT JOIN LATERAL(
        SELECT h.id,h.action FROM public.mavuri_category_review_history h
        WHERE h.offer_id=o.id AND h.user_id=v_user
        ORDER BY h.id DESC LIMIT 1
      ) hist ON true
      WHERE a.user_id=v_user
        AND o.created_at >= v_start AND o.created_at <= v_now
        AND (p_marketplace='' OR a.marketplace_slug=p_marketplace)
  ),
  filtered AS MATERIALIZED (
    SELECT * FROM source_rows
    WHERE (p_view='review' AND needs_review)
       OR (p_view='other' AND mavuri_category_slug='outros')
       OR (p_view='reviewed' AND manual_decision IS NOT NULL)
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
    'reviewed_total',(SELECT count(*) FROM source_rows WHERE manual_decision IS NOT NULL),
    'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('slug',slug,'name',name) ORDER BY name)
      FROM public.mavuri_categories WHERE active AND slug<>'outros'),'[]'::jsonb),
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
        'audit_updated_at',updated_at,
        'manual_decision',manual_decision,
        'manual_reviewed_at',manual_reviewed_at,
        'last_action_id',last_action_id,
        'last_action_kind',last_action_kind,
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


DROP TRIGGER IF EXISTS zzzzzzzzz_mavuri_manual_review_guard ON public.flow_offers;
CREATE TRIGGER zzzzzzzzz_mavuri_manual_review_guard
 BEFORE INSERT OR UPDATE OF title,metadata,marketplace_id,mavuri_category_id,mavuri_tags
 ON public.flow_offers FOR EACH ROW
 EXECUTE FUNCTION public.mavuri_manual_category_review_guard();

REVOKE ALL ON FUNCTION public.mavuri_dashboard_category_decide_v1(uuid,text,text,timestamptz,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mavuri_dashboard_category_undo_v1(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mavuri_dashboard_category_history_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mavuri_dashboard_category_decide_v1(uuid,text,text,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mavuri_dashboard_category_undo_v1(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mavuri_dashboard_category_history_v1(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.mavuri_dashboard_category_reviews_v1(integer,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mavuri_dashboard_category_reviews_v1(integer,text,text,integer,integer) TO authenticated;

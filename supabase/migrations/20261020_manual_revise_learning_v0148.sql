-- V0.1.48 — manual reclassification with confirmation, history and reversal.
-- Run only via migrations; no automatic category mapping changes.
ALTER TABLE public.mavuri_category_review_history
  DROP CONSTRAINT IF EXISTS mavuri_category_review_history_action_check;
ALTER TABLE public.mavuri_category_review_history
  ADD CONSTRAINT mavuri_category_review_history_action_check
  CHECK (action IN ('approve','correct','revise','undo'));

CREATE OR REPLACE FUNCTION public.mavuri_dashboard_category_revise_v1(p_offer_id uuid, p_category_slug text, p_expected_updated_at timestamp with time zone, p_expected_action_id bigint, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_offer public.flow_offers%ROWTYPE;
  v_before public.mavuri_category_audit%ROWTYPE;
  v_after public.mavuri_category_audit%ROWTYPE;
  v_prior public.mavuri_category_manual_reviews%ROWTYPE;
  v_target public.mavuri_categories%ROWTYPE;
  v_last record;
  v_previous jsonb;
  v_current jsonb;
  v_old_slug text;
  v_new_action_id bigint;
  v_note text:=NULLIF(btrim(p_note),'');
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_offer_id IS NULL OR p_category_slug IS NULL OR p_expected_updated_at IS NULL
     OR p_expected_action_id IS NULL OR p_expected_action_id<=0 THEN
    RAISE EXCEPTION 'Invalid revision parameters' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(v_note,''))>500 THEN
    RAISE EXCEPTION 'Note may not exceed 500 characters' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_offer
  FROM public.flow_offers
  WHERE id=p_offer_id AND user_id=v_actor
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found or access denied' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_before
  FROM public.mavuri_category_audit
  WHERE offer_id=p_offer_id AND user_id=v_actor
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit record missing' USING ERRCODE='P0002'; END IF;
  IF v_before.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Audit changed; reload before changing the category' USING ERRCODE='40001';
  END IF;

  SELECT * INTO v_prior
  FROM public.mavuri_category_manual_reviews
  WHERE offer_id=p_offer_id AND user_id=v_actor
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer has not been manually reviewed; use standard correction' USING ERRCODE='22023';
  END IF;
  IF public.mavuri_normalize_text(v_prior.title_snapshot)
     IS DISTINCT FROM public.mavuri_normalize_text(v_offer.title) THEN
    RAISE EXCEPTION 'Offer title changed; reload its classification' USING ERRCODE='40001';
  END IF;
  IF v_before.classification_source NOT IN ('manual_approved','manual_corrected') OR v_before.needs_review THEN
    RAISE EXCEPTION 'Current manual review is not active' USING ERRCODE='40001';
  END IF;

  SELECT id,action INTO v_last
  FROM public.mavuri_category_review_history
  WHERE offer_id=p_offer_id AND user_id=v_actor
  ORDER BY id DESC LIMIT 1;
  IF NOT FOUND OR v_last.id<>p_expected_action_id OR v_last.action NOT IN ('approve','correct','revise') THEN
    RAISE EXCEPTION 'Another category decision was recorded; reload first' USING ERRCODE='40001';
  END IF;

  SELECT * INTO v_target FROM public.mavuri_categories
  WHERE slug=p_category_slug AND active AND slug<>'outros';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid target category' USING ERRCODE='22023'; END IF;
  IF v_target.id=v_before.mavuri_category_id THEN
    RAISE EXCEPTION 'Choose a category different from the current one' USING ERRCODE='22023';
  END IF;

  SELECT slug INTO v_old_slug
  FROM public.mavuri_categories WHERE id=v_before.mavuri_category_id;
  v_previous:=to_jsonb(v_prior);

  UPDATE public.mavuri_category_manual_reviews
  SET category_id=v_target.id,decision='correct',decided_by=v_actor,
      title_snapshot=v_offer.title,decided_at=clock_timestamp()
  WHERE offer_id=p_offer_id AND user_id=v_actor;

  -- Triggers recalculate category/audit; NOT a new offer, job, or publication.
  UPDATE public.flow_offers SET title=title WHERE id=p_offer_id AND user_id=v_actor;

  SELECT * INTO v_after
  FROM public.mavuri_category_audit
  WHERE offer_id=p_offer_id AND user_id=v_actor;
  IF v_after.mavuri_category_id IS DISTINCT FROM v_target.id
     OR v_after.needs_review OR v_after.classification_source<>'manual_corrected' THEN
    RAISE EXCEPTION 'Revision was not applied consistently' USING ERRCODE='P0001';
  END IF;

  SELECT to_jsonb(m) INTO v_current
  FROM public.mavuri_category_manual_reviews m
  WHERE m.offer_id=p_offer_id AND m.user_id=v_actor;

  INSERT INTO public.mavuri_category_review_history(
    offer_id,user_id,actor_id,action,prior_category_slug,resulting_category_slug,
    previous_override,resulting_override,prior_review_reason,resulting_review_reason,note
  ) VALUES (
    p_offer_id,v_actor,v_actor,'revise',v_old_slug,v_after.mavuri_category_slug,
    v_previous,v_current,v_before.review_reason,v_after.review_reason,v_note
  )
  RETURNING id INTO v_new_action_id;

  RETURN jsonb_build_object('ok',true,'action','revise','offer_id',p_offer_id,
    'action_id',v_new_action_id,'category_before',v_old_slug,
    'category_after',v_after.mavuri_category_slug,'needs_review',v_after.needs_review);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mavuri_dashboard_learning_candidates_v1(p_min_examples integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_data jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_min_examples IS NULL OR p_min_examples < 2 OR p_min_examples > 10 THEN
    RAISE EXCEPTION 'Invalid minimum examples' USING ERRCODE='22023';
  END IF;

  WITH decisions AS MATERIALIZED (
    SELECT
      a.marketplace_slug,a.source_category_id,a.source_category_name,
      a.mavuri_category_slug,a.title,a.offer_id,
      a.updated_at
    FROM public.mavuri_category_manual_reviews r
    JOIN public.mavuri_category_audit a
      ON a.offer_id=r.offer_id AND a.user_id=r.user_id
    JOIN public.flow_offers o
      ON o.id=a.offer_id AND o.user_id=v_user
    WHERE r.user_id=v_user
      AND a.source_category_id IS NOT NULL
      AND length(btrim(a.source_category_id))>0
      AND a.classification_source IN ('manual_approved','manual_corrected')
      AND public.mavuri_normalize_text(r.title_snapshot)=public.mavuri_normalize_text(o.title)
  ),
  groups AS (
    SELECT marketplace_slug,source_category_id,
      max(source_category_name) AS source_category_name,
      count(DISTINCT offer_id) AS reviewed_examples,
      count(DISTINCT mavuri_category_slug) AS distinct_destinations,
      min(mavuri_category_slug) AS proposed_slug,
      jsonb_agg(jsonb_build_object('offer_id',offer_id,'title',title,
        'category',mavuri_category_slug) ORDER BY updated_at DESC) AS full_examples
    FROM decisions
    GROUP BY marketplace_slug,source_category_id
    HAVING count(DISTINCT offer_id)>=p_min_examples
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'marketplace',marketplace_slug,
    'source_category_id',source_category_id,
    'source_category_name',source_category_name,
    'reviewed_examples',reviewed_examples,
    'destinations',distinct_destinations,
    'suggested_category',CASE WHEN distinct_destinations=1 THEN proposed_slug ELSE NULL END,
    'confidence_label',CASE
      WHEN distinct_destinations>1 THEN 'conflito'
      WHEN reviewed_examples>=3 THEN 'candidato_forte'
      ELSE 'validar_mais_exemplos' END,
    'examples', (SELECT coalesce(jsonb_agg(e),'[]'::jsonb)
       FROM (SELECT e FROM jsonb_array_elements(full_examples) e LIMIT 3) x)
  ) ORDER BY reviewed_examples DESC,marketplace_slug,source_category_id),'[]'::jsonb)
  INTO v_data
  FROM groups;

  RETURN jsonb_build_object(
     'generated_at',now(),
     'items',v_data,
     'total',jsonb_array_length(v_data),
     'automatic_rules_applied',false,
     'policy','Only suggestions. Never propagate one manual decision to other offers.'
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.mavuri_dashboard_category_revise_v1(uuid,text,timestamptz,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mavuri_dashboard_category_revise_v1(uuid,text,timestamptz,bigint,text) TO authenticated;
REVOKE ALL ON FUNCTION public.mavuri_dashboard_learning_candidates_v1(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mavuri_dashboard_learning_candidates_v1(integer) TO authenticated;

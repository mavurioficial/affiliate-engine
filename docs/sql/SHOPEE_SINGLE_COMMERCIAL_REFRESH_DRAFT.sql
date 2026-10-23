-- REVIEW DRAFT, NOT DEPLOYED. One-off Shopee price + affiliate-link refresh only.
-- Must be called server-side with service_role AFTER a genuine Shopee API read,
-- manual/operator App ID binding, and an explicit user-approved one-off attempt.
-- This function DOES NOT enqueue or publish. Do NOT invoke from a browser.
-- Manual classification is protected by an exception that rolls back ALL UPDATE effects.
BEGIN;
CREATE OR REPLACE FUNCTION public.mavuri_shopee_refresh_one_draft(
  p_user_id uuid,
  p_offer_id uuid,
  p_marketplace_id uuid,
  p_account_id uuid,
  p_source_ref text,
  p_expected_price numeric,
  p_expected_link text,
  p_new_price numeric,
  p_new_link text,
  p_new_discount numeric,
  p_api_app_id_sha256 text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_old public.flow_offers%ROWTYPE;
  v_new public.flow_offers%ROWTYPE;
  v_category_slug text;
  v_count integer;
BEGIN
  -- Only server-side invocations with the backend service role.
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  IF p_user_id IS NULL OR p_offer_id IS NULL OR p_marketplace_id IS NULL
     OR p_account_id IS NULL
     OR p_source_ref IS NULL OR p_source_ref !~ '^[0-9]{1,24}$'
     OR p_expected_price IS NULL OR p_expected_price<=0
     OR p_new_price IS NULL OR p_new_price<=0
     OR p_new_price <> round(p_new_price,2)
     OR p_new_discount IS NULL OR p_new_discount<10 OR p_new_discount>99
     OR p_expected_link IS NULL OR p_new_link IS NULL
     OR p_expected_link !~ '^https://s[.]shopee[.]com[.]br/[^[:space:]]+$'
     OR p_new_link !~ '^https://s[.]shopee[.]com[.]br/[^[:space:]]+$'
     OR p_api_app_id_sha256 IS NULL OR p_api_app_id_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid_commercial_refresh' USING ERRCODE='22023';
  END IF;

  -- Affiliation evidence must have been established through the official
  -- Shopee portal and recorded by an authorized operator. A row merely
  -- marked connected or an App ID hash ALONE is not independent proof.
  IF NOT EXISTS (
    SELECT 1 FROM public.flow_marketplaces m
    JOIN public.flow_affiliate_accounts a ON a.marketplace_id=m.id
    WHERE m.id=p_marketplace_id AND m.slug='shopee'
      AND a.id=p_account_id AND a.user_id=p_user_id AND a.status='connected'
      AND a.settings->>'open_api_status'='active'
      AND a.settings->>'open_api_binding_source'='user_confirmed_portal_app_id'
      AND a.settings->>'open_api_verified_at' IS NOT NULL
      AND a.settings->>'open_api_app_id_sha256'=p_api_app_id_sha256
  ) THEN
    RETURN jsonb_build_object('updated',false,'reason','api_account_binding_unverified');
  END IF;

  -- Never silently pick among duplicated affiliate records for the same SKU.
  SELECT count(*) INTO v_count FROM public.flow_offers o
  WHERE o.user_id=p_user_id AND o.marketplace_id=p_marketplace_id
    AND o.affiliate_account_id=p_account_id AND o.source_ref=p_source_ref;
  IF v_count<>1 THEN
    RETURN jsonb_build_object('updated',false,'reason','ambiguous_or_missing_offer');
  END IF;
  SELECT * INTO v_old FROM public.flow_offers o
  WHERE o.id=p_offer_id AND o.user_id=p_user_id
    AND o.marketplace_id=p_marketplace_id
    AND o.affiliate_account_id=p_account_id AND o.source_ref=p_source_ref
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('updated',false,'reason','offer_scope_changed');
  END IF;
  IF v_old.price IS DISTINCT FROM p_expected_price
    OR v_old.affiliate_url IS DISTINCT FROM p_expected_link THEN
    RETURN jsonb_build_object('updated',false,'reason','stale_old_offer');
  END IF;

  SELECT c.slug INTO v_category_slug
  FROM public.mavuri_categories c
  WHERE c.id=v_old.mavuri_category_id AND c.active=true;
  IF v_category_slug IS NULL
    OR v_old.metadata #>> '{mavuri,category_slug}' IS DISTINCT FROM v_category_slug
    OR v_old.mavuri_tags IS NULL
    OR coalesce(v_old.image_url,'') NOT LIKE 'https://%' THEN
    RETURN jsonb_build_object('updated',false,'reason','final_category_not_verified');
  END IF;
  IF v_old.price=p_new_price AND v_old.affiliate_url=p_new_link
    AND v_old.discount_percent=p_new_discount THEN
    RETURN jsonb_build_object('updated',false,'reason','already_current');
  END IF;

  -- Important: the semantic classification BEFORE UPDATE trigger runs for
  -- EVERY UPDATE, even when only the commercial columns below are changed.
  UPDATE public.flow_offers o SET
    price=p_new_price,
    affiliate_url=p_new_link,
    discount_percent=p_new_discount,
    captured_at=clock_timestamp()
  WHERE o.id=v_old.id AND o.user_id=p_user_id
    AND o.price=p_expected_price AND o.affiliate_url=p_expected_link
  RETURNING * INTO v_new;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('updated',false,'reason','optimistic_guard_failed');
  END IF;

  -- A RETURN here would COMMIT the UPDATE; use an exception to force rollback.
  IF v_new.title IS DISTINCT FROM v_old.title
    OR v_new.metadata IS DISTINCT FROM v_old.metadata
    OR v_new.mavuri_category_id IS DISTINCT FROM v_old.mavuri_category_id
    OR v_new.mavuri_tags IS DISTINCT FROM v_old.mavuri_tags
    OR v_new.affiliate_account_id IS DISTINCT FROM v_old.affiliate_account_id
    OR v_new.marketplace_id IS DISTINCT FROM v_old.marketplace_id
    OR v_new.source_ref IS DISTINCT FROM v_old.source_ref
    OR v_new.image_url IS DISTINCT FROM v_old.image_url
    OR v_new.product_url IS DISTINCT FROM v_old.product_url THEN
    RAISE EXCEPTION 'category_or_identity_changed_by_trigger'
      USING ERRCODE='23514';
  END IF;
  RETURN jsonb_build_object('updated',true,'jobs_created',0,'messages_sent',0,
    'manual_category_preserved',true);
END;
$fn$;

-- PUBLIC/anon/authenticated must NEVER be able to submit arbitrary links
-- to the database. Even owner RLS is insufficient to prove link attribution.
REVOKE ALL ON FUNCTION public.mavuri_shopee_refresh_one_draft(
 uuid,uuid,uuid,uuid,text,numeric,text,numeric,text,numeric,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mavuri_shopee_refresh_one_draft(
 uuid,uuid,uuid,uuid,text,numeric,text,numeric,text,numeric,text
) TO service_role;
COMMIT;

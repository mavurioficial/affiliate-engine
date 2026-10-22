-- DRAFT ONLY. DO NOT RUN IN PRODUCTION.
-- Proposed atomic enqueue contract for the eventual Shopee cloud executor.
-- Deliberately fails closed while cloud_control.enabled is false.
-- Requires the separate, NOT YET APPLIED queue guards migration and a fenced local V85.
CREATE OR REPLACE FUNCTION public.mavuri_shopee_cloud_enqueue_draft(
  p_run_id uuid,
  p_user_id uuid,
  p_marketplace_id uuid,
  p_affiliate_account_id uuid,
  p_offer_id uuid,
  p_channel_ids uuid[],
  p_expected_price numeric,
  p_expected_affiliate_url text,
  p_expected_category_slug text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_cfg mavuri_internal.discovery_cloud_control%ROWTYPE;
  v_run mavuri_internal.discovery_cloud_runs%ROWTYPE;
  v_offer public.flow_offers%ROWTYPE;
  v_category text;
  v_channel uuid;
  v_verified_channels integer;
  v_shopee_marketplace boolean;
  v_category_fk text;
  v_pending_or_recent boolean;
  v_unique_in_cycle integer;
  v_category_in_cycle integer;
  v_cycle_keyprefix text;
BEGIN
  -- Service-role authentication AND explicit expected account identity.
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  IF p_run_id IS NULL OR p_user_id IS NULL OR p_marketplace_id IS NULL
      OR p_affiliate_account_id IS NULL OR p_offer_id IS NULL
      OR p_expected_price IS NULL OR p_expected_price<=0
      OR p_expected_affiliate_url IS NULL
      OR p_expected_affiliate_url NOT LIKE 'https://%'
      OR p_expected_category_slug IS NULL
      OR array_length(p_channel_ids,1) IS NULL
      OR array_length(p_channel_ids,1)>4 THEN
    RAISE EXCEPTION 'invalid_enqueue_scope' USING ERRCODE='22023';
  END IF;

  -- The control row is the global serialization point. A separate deployment
  -- must ensure the old Windows executor cannot write in parallel.
  SELECT * INTO v_cfg
  FROM mavuri_internal.discovery_cloud_control WHERE id=true FOR UPDATE;
  IF NOT FOUND OR NOT v_cfg.enabled OR v_cfg.active_executor<>'cloud' THEN
    RETURN jsonb_build_object('accepted',false,'reason','cloud_disabled');
  END IF;
  SELECT * INTO v_run
  FROM mavuri_internal.discovery_cloud_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.executor<>'cloud' OR v_run.status<>'running'
     OR v_run.lease_expires_at<=clock_timestamp() THEN
    RETURN jsonb_build_object('accepted',false,'reason','invalid_lease');
  END IF;

  -- Lock the *persisted* offer AFTER all BEFORE INSERT/UPDATE classification
  -- triggers have run. Never trust a pre-trigger or unclassified candidate.
  SELECT * INTO v_offer FROM public.flow_offers
  WHERE id=p_offer_id AND user_id=p_user_id
    AND marketplace_id=p_marketplace_id
    AND affiliate_account_id=p_affiliate_account_id
  FOR UPDATE;
  IF NOT FOUND OR v_offer.price IS DISTINCT FROM p_expected_price
     OR v_offer.affiliate_url IS DISTINCT FROM p_expected_affiliate_url THEN
    RETURN jsonb_build_object('accepted',false,'reason','offer_changed');
  END IF;
  -- The supplied marketplace ID must actually be Shopee.
  SELECT EXISTS (
    SELECT 1 FROM public.flow_marketplaces m
    WHERE m.id=p_marketplace_id AND m.slug='shopee'
  ) INTO v_shopee_marketplace;
  IF NOT v_shopee_marketplace THEN
    RETURN jsonb_build_object('accepted',false,'reason','marketplace_not_shopee');
  END IF;

  -- Strict FK/category parity: a manual review may have updated the FK
  -- independently from the metadata supplied by the initial collector.
  SELECT c.slug INTO v_category_fk
  FROM public.mavuri_categories c WHERE c.id=v_offer.mavuri_category_id;
  v_category:=v_offer.metadata #>> '{mavuri,category_slug}';
  IF v_category IS NULL OR v_category<>p_expected_category_slug
      OR v_category_fk IS DISTINCT FROM v_category
      OR v_offer.mavuri_category_id IS NULL OR v_offer.mavuri_tags IS NULL THEN
    RETURN jsonb_build_object('accepted',false,'reason','classification_changed');
  END IF;

  -- Validate destination scope, even though the DRAFT never queues.
  -- Any invalid or disabled Telegram route fails the entire request.
  IF EXISTS (SELECT 1 FROM unnest(p_channel_ids) AS entries(channel_id) WHERE channel_id IS NULL)
    OR (SELECT count(DISTINCT channel_id) FROM unnest(p_channel_ids) AS entries(channel_id))
       <> array_length(p_channel_ids,1) THEN
    RETURN jsonb_build_object('accepted',false,'reason','invalid_or_duplicate_channels');
  END IF;
  SELECT count(*) INTO v_verified_channels FROM public.flow_channels c
  WHERE c.id=ANY(p_channel_ids) AND c.user_id=p_user_id
    AND c.type='telegram' AND c.status IN ('active','connected')
    AND c.external_ref IS NOT NULL
    AND c.name IN ('Mavuri Ofertas','Mavuri Mulher',
      'Mavuri Casa & Cozinha','Mavuri Tecnologia');
  IF v_verified_channels<>array_length(p_channel_ids,1) THEN
    RETURN jsonb_build_object('accepted',false,'reason','channel_scope_or_status_changed');
  END IF;

  -- Re-evaluate every proposed channel using the final persisted category,
  -- active flow_rules and the current connected affiliate account. This helper
  -- belongs to an UNDEPLOYED draft and never grants browser access.
  FOREACH v_channel IN ARRAY p_channel_ids LOOP
    IF NOT mavuri_internal.shopee_cloud_rule_matches_draft(
      p_user_id,p_offer_id,v_channel
    ) THEN
      RETURN jsonb_build_object('accepted',false,'reason','channel_rule_mismatch');
    END IF;
  END LOOP;

  -- Use the active run UUID in stable idempotency keys (NOT random UUIDs).
  -- These checks are still only preflight; final atomic INSERT is disabled.
  v_cycle_keyprefix := 'shopee-cloud:' || p_run_id::text || ':';
  SELECT count(DISTINCT j.offer_id) INTO v_unique_in_cycle
  FROM public.flow_delivery_jobs j
  WHERE j.user_id=p_user_id
    AND left(j.delivery_key,length(v_cycle_keyprefix))=v_cycle_keyprefix
    AND j.status IN ('queued','processing','sent');
  IF v_unique_in_cycle >= LEAST(8,v_cfg.max_shopee) THEN
    RETURN jsonb_build_object('accepted',false,'reason','shopee_cycle_max_unique');
  END IF;

  -- Limit maximum two UNIQUE offers with the same effective database category
  -- in this cloud run. Multiple channels for a single offer count only once.
  SELECT count(DISTINCT j.offer_id) INTO v_category_in_cycle
  FROM public.flow_delivery_jobs j
  JOIN public.flow_offers o ON o.id=j.offer_id
  JOIN public.mavuri_categories mc ON mc.id=o.mavuri_category_id
  WHERE j.user_id=p_user_id
    AND left(j.delivery_key,length(v_cycle_keyprefix))=v_cycle_keyprefix
    AND j.status IN ('queued','processing','sent')
    AND mc.slug=v_category;
  IF v_category_in_cycle >= 2 THEN
    RETURN jsonb_build_object('accepted',false,'reason','shopee_cycle_category_cap');
  END IF;

  -- Exact item/channel cooldown. A different account or duplicate flow_offer
  -- row does not evade it when marketplace + source_ref match.
  -- A verified price-drop exception will need its own immutable rendered-price
  -- check; do NOT approximate it using current mutable offer.price here.
  FOREACH v_channel IN ARRAY p_channel_ids LOOP
    SELECT EXISTS(
      SELECT 1
      FROM public.flow_delivery_jobs j
      JOIN public.flow_offers prior ON prior.id=j.offer_id
      WHERE j.user_id=p_user_id AND j.channel_id=v_channel
        AND prior.user_id=p_user_id AND prior.marketplace_id=p_marketplace_id
        AND prior.source_ref=v_offer.source_ref
        AND (
          j.status IN ('queued','processing')
          OR (j.status='sent' AND j.sent_at>=now()-interval '48 hours')
        )
    ) INTO v_pending_or_recent;
    IF v_pending_or_recent THEN
      RETURN jsonb_build_object('accepted',false,'reason','shopee_recent_or_pending_48h');
    END IF;
  END LOOP;

  -- A pending-job UNIQUE partial index must be present before this
  -- function can ever be allowed to insert; the runtime guard must verify it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='public' AND tablename='flow_delivery_jobs'
      AND indexname='flow_delivery_jobs_inflight_product_channel_uidx'
  ) THEN
    RETURN jsonb_build_object('accepted',false,'reason','pending_unique_missing');
  END IF;

  -- DRAFT INTENTIONALLY FAILS CLOSED: the 24h verified cross-seller
  -- family check, precise rendered-price drop exception, max-1 broad family
  -- per cycle, and atomic job insert have NOT been integrated/tested.
  -- Never remove this block until those checks are implemented and tested.
  RETURN jsonb_build_object(
    'accepted',false,'reason','transactional_policy_not_implemented',
    'run_verified',true,'persisted_offer_verified',true
  );

  -- Future writes, NOT ACTIVE:
  -- validate each p_channel_ids member against the four authorized Telegram
  -- channels and flow_rules AFTER reading stored category/tags.
  -- choose a unique delivery_key based on run,offer,channel.
  -- INSERT ... ON CONFLICT DO NOTHING, then verify actual row count.
  -- The BEFORE INSERT dedup trigger can RETURN NULL, so record actual result.
END;
$fn$;

-- Revoke Postgres's default PUBLIC function-EXECUTE privilege.
-- The draft is NOT APPLIED. If deployed later, only an authenticated
-- service_role JWT should be permitted to invoke the RPC.
REVOKE ALL ON FUNCTION public.mavuri_shopee_cloud_enqueue_draft(
  uuid,uuid,uuid,uuid,uuid,uuid[],numeric,text,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mavuri_shopee_cloud_enqueue_draft(
  uuid,uuid,uuid,uuid,uuid,uuid[],numeric,text,text
) TO service_role;

-- Required deployment review before any future application:
-- 0. Draft now checks each channel against a companion SQL rule matcher.
--    This matcher has NOT been applied or integration-tested; dynamic rule
--    changes, price snapshots, cooldown and lock behavior still block release.
--    The hard-coded refusal remains mandatory until all those checks pass.
-- 1. Move to private/secured RPC design with explicit REVOKE EXECUTE FROM PUBLIC,
--    anon, authenticated; only grant service_role if absolutely required.
-- 2. Validate the rule matching, cooldown/family checks, cycle caps and precise
--    sent-price snapshot in the SAME transaction, not only in an Edge Function.
-- 3. Test advisory/row locks and concurrent duplicates, plus fanout behavior.
-- 4. Verify V85 Windows has fully stopped before enabling cloud.
-- 5. Do NOT create a cron or switch active_executor in this change.

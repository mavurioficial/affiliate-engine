-- Mercado Livre Cloud: SEPARATE execution ownership from Shopee.
-- Fail-closed: this migration does NOT schedule or enable ML publishing.
-- Existing Shopee discovery_cloud_control and its cron are UNCHANGED.
CREATE TABLE IF NOT EXISTS mavuri_internal.ml_cloud_control (
 id boolean PRIMARY KEY DEFAULT true CHECK(id=true),
 enabled boolean NOT NULL DEFAULT false,
 active_executor text NOT NULL DEFAULT 'local'
   CHECK(active_executor IN ('local','cloud')),
 interval_minutes integer NOT NULL DEFAULT 30
   CHECK(interval_minutes BETWEEN 15 AND 240),
 max_offers integer NOT NULL DEFAULT 8
   CHECK(max_offers BETWEEN 1 AND 8),
 publish_start_local time NOT NULL DEFAULT time '08:00',
 publish_end_local time NOT NULL DEFAULT time '22:00',
 publish_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ml_cloud_hours_valid CHECK(
   publish_start_local<publish_end_local
   AND publish_timezone='America/Sao_Paulo')
);
ALTER TABLE mavuri_internal.ml_cloud_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mavuri_internal.ml_cloud_control FROM PUBLIC,anon,authenticated;
INSERT INTO mavuri_internal.ml_cloud_control(id)
VALUES(true) ON CONFLICT(id) DO NOTHING;
-- Guard only old Mercado Livre Discovery jobs. Other marketplace jobs and
-- manual flows are intentionally not touched.
CREATE OR REPLACE FUNCTION public.mavuri_ml_legacy_writer_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
BEGIN
 IF coalesce(NEW.delivery_key,'') LIKE 'discovery:%'
    AND EXISTS (
      SELECT 1 FROM public.flow_offers o
      JOIN public.flow_marketplaces m ON m.id=o.marketplace_id
      WHERE o.id=NEW.offer_id AND o.user_id=NEW.user_id
        AND m.slug='mercadolivre'
    )
    AND EXISTS (
      SELECT 1 FROM mavuri_internal.ml_cloud_control c
      WHERE c.id=true AND c.enabled AND c.active_executor='cloud'
    )
 THEN
   RAISE EXCEPTION 'ml_legacy_writer_disabled_during_cloud'
     USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$f$;
REVOKE ALL ON FUNCTION public.mavuri_ml_legacy_writer_fence()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_mavuri_ml_legacy_writer_fence
 ON public.flow_delivery_jobs;
CREATE TRIGGER trg_mavuri_ml_legacy_writer_fence
BEFORE INSERT ON public.flow_delivery_jobs
FOR EACH ROW WHEN (NEW.delivery_key LIKE 'discovery:%')
EXECUTE FUNCTION public.mavuri_ml_legacy_writer_fence();

-- Applied to Mavuri production on 2026-10-23.
-- Enforce one queued/processing job per owner, product and channel.
-- Sent/failed/cancelled history remains unrestricted.
CREATE UNIQUE INDEX IF NOT EXISTS flow_delivery_jobs_inflight_product_channel_uidx
ON public.flow_delivery_jobs (user_id,offer_id,channel_id)
WHERE status IN ('queued','processing')
  AND offer_id IS NOT NULL AND channel_id IS NOT NULL;

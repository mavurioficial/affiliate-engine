# Magalu cloud — production enabled, 24 October 2026

## Result
Magalu now discovers offers without Windows, Chrome or a Telegram user session. It reads the public official Telegram page, paginates the last 24 hours (bounded to 250 messages/13 pages), resolves the exact code at the connected magazinemavuri store, and checks product JSON-LD identity, BRL price, image and InStock availability. Divergent announced prices/coupon conditions are excluded conservatively. Unknown previous prices remain null.

Supabase Cron mavuri-magalu-cloud-discovery runs every 30 minutes. Source requests and new runs are restricted to 08:00–22:00 Brasilia. The first transition cycle ran at 10:53 BRT, so the 11:00 tick is intentionally suppressed by the minimum interval; the next eligible aligned run is 11:30. Subsequent aligned cycles are 30 minutes apart.

## Architecture
- discovery-cloud-magalu-preview: authenticated counters only, no business writes/publication.
- discovery-cloud-magalu-executor: exclusive service execution; coupons before product enrichment, target 5 distinct eligible offers, not a guaranteed fill.
- flow-magalu-cloud-ingest: service/run authorization, fresh commercial data, existing category overrides/manual decisions, existing Flow worker for deliveries.
- magalu-cloud-coupon-publish: existing fixed official art and bundle format; explicit campaign restrictions link to the exact official source post.
- Legacy flow-magalu-ingest and magalu-coupon-publish now return cloud_owned while Magalu cloud is enabled. User authentication remains required on those legacy endpoints. They resume their original flow if Magalu cloud is disabled.
- Private magalu_cloud_control and service-only RPC prevent overlapping runs. A Magalu-only queue trigger fences automatic local writers, pending duplicates, 48h same product and 24h family, permitting a real >=10% price drop only with a sent price snapshot and comparable size/capacity. Per-cycle caps: 5 products, 2/category. Manual UUID keys remain outside the automatic fence.
- Existing generic family similarity and category fanout guards remain in place.

No Shopee code/cron, ML executor, Amazon flow or WhatsApp channel configuration changed. No VM, payment plan or card added.

## Measured evidence
- Expanded preview: 27 messages, 21 source candidates, 4 coupons, 20 product checks, 9 commercially verified; 19.0 seconds.
- Integrated audit request46768: 29 messages/2 pages, complete24h, 17 candidates, 8 valid products, 6 coupon render validations, no publications; 15.4 seconds.
- Real execution request46782: HTTP200, 25.949 seconds, 5 selected unique offers, 5 explicit queued jobs. Existing fanout added 2 Casa & Cozinha deliveries. Database subsequently confirmed ALL7 offer deliveries sent (5 Geral,2 Casa).
- Six coupons were bundled and confirmed sent in Geral. One Casa coupon destination was recovered separately. The obsolete duplicate pending job was cancelled only after a confirmed same-coupon/channel delivery. No additional Geral resend was made.
- A second immediate cloud_cycle request46789 returned claimed=false/reason=interval, without source requests or posts.
- Scheduler and Shopee cron both active; Magalu uses separate ownership and lease state.

## Verification
Node source tests cover BRL amounts, no invented discount, campaign exclusion, installment rejection, HTML messages, exact affiliate store/host/code matching, JSON-LD identity/currency/stock, price mismatch exclusion, coupon product restrictions and pagination.

A temporary service-only database fixture test passed disabled claim, local handoff fence, null lease, valid cloud insert, pending duplicate, 5% rejection,10% exception,48h expiry and24h family cases. All fixture writes rolled back; zero fixture offers persisted. The temporary RPC execution privilege was revoked and its executor test branch removed.

Real dry-run ingress and real deliveries verified deployed runtime behavior. Local Deno checking could not resolve external JSR/npm dependencies in the workspace; it is not claimed as passed. Pure Node tests are included in GitHub CI.

## Operations and limits
Use the existing scheduler secret from Vault; never copy it to the repository, extension or logs. New scheduler-authenticated Edge Functions need verify_jwt=false because they validate the scheduler credential themselves; legacy user endpoints keep verify_jwt=true. Only deploy named Magalu functions when using the CLI.

Control and scheduler SQL are recorded in Supabase migration history and saved under the returned versions. Both are safe to reapply. Control defaults disabled on a new database; production activation is a separate operational action.

Coupon same-benefit sends have a24h/channel check; confirmed sends reconcile obsolete automatic queued rows. Failed/queued automatic coupon jobs can be resumed, while sent/processing/cancelled jobs are not resent. A network timeout after Telegram accepts a request can still leave an ambiguous delivery; this is not a claim of transport-level exactly-once delivery.

Initial end-to-end operation is confirmed.24h+ autonomous stability has not yet been observed. Public Telegram/store HTML may change; failures stop that cycle rather than bypass verification. Link-only posts lacking a recoverable product code are skipped. Shared Shopee behavior remains unchanged.

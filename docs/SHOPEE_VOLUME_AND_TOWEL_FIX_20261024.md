# Shopee volume and bath-towel diversity correction
24 October2026.

## Evidence
Morning8:00/8:30 Brasilia runs succeeded with5/2 products. All seven runs9:00 through12:00 failed atomic_queue_failed, sometimes after submitting1–3 earlier products. Postgres logs identify shopee_cloud_atomic_dedup_rejection. A per-product insertion guard returned NULL for a blocked destination; the atomic enqueue RPC intentionally rolled back that product, but the executor treated that ordinary policy rejection as fatal for the whole cycle.

Both pictured towel ads were sent8:01 from Pink Toalhas: item58268146480 is a3-piece kit,58267776581 is a single towel. They have different stored title-family signatures, and the prior diversityFamily list had no bath towels. These are distinct packages of a similar line, not proof of duplicate delivery of one offer.

## Correction
The enqueue RPC now catches ONLY the specific expected atomic-dedup unique_violation and returns accepted=false/delivery_policy_blocked. Its PLpgSQL exception block rolls back the entire per-product multi-channel insertion before returning. Unknown unique violations and other errors still raise.

The executor backfills rejected products from the SAME signed candidate snapshot, retaining accepted category/family reservations and limits8 products/2 per category. Rejected products do not consume slots. A new bath-towel diversity group allows at most one bath-towel ad per cycle, including the actual kit/single titles. The Shopee-only SQL enqueue RPC independently checks that cycle family. Shared Magalu/ML/Amazon policies, cron frequency, cooldowns, pricing, affiliate identity and routing checks are not loosened.

A scheduler-authenticated mode=diagnostic performs only signed API reads, DB reads and simulated refresh/planning; no lease claim, refresh writes, jobs or publication.

## Verification
Pure test passed actual title pair, exclusion of tablecloths, backfill to8 after known rejections, preservation of2/category/family reservations and fatal unexpected DB errors.

A temporary service-only database regression passed: ordinary policy rejection returns accepted=false; an earlier successful destination rolls back if the second destination is blocked; another authorized destination can proceed; a second bath-towel offer is rejected by SQL family_cap. Every fixture write rolled back; zero fixture products remain. Test RPC privileges revoked and temporary executor branch removed.

Read-only live diagnostic request46868:43 signed API candidates,29 known stored products,14 unknown products;7 projected offers/11 destinations before final SQL guard,34 recent/pending destination blocks. Projection is not a promise of delivered volume. Current API sources read the first page of three lists; newly discovered products absent from the verified catalog remain excluded.

First post-fix scheduled production result still needs observation. No forced extra publication run was used to bypass the30-minute interval.

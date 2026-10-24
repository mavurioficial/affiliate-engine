# Magalu cloud migration — measured progress

Status: source preview deployed; production cutover NOT complete.

## Existing production audited

Runner V85 supplied 22 October: runMagaluTargetCycle reads Telegram using MTProto, handles coupons first, enriches store pages using Chrome, feeds flow-magalu-ingest, and counts changed offers toward target 5. Supabase flow-magalu-ingest v11 already stores offers and queues Flow deliveries. It uses authenticated-user access, not scheduler access. It has its own 5%/discount/coupon republish conditions and is not sufficient as the cloud release gate.

Connected store configuration read from the existing account: magazinemavuri.

## Implemented

Isolated Supabase discovery-cloud-magalu-preview v2. POST authentication uses the existing scheduler secret digest (never the secret itself in source). Only fixed public Telegram/store GETs. No browser, MTProto session, ingestion, offer writes, Telegram sends, run claims or recurring schedule. Results contain counters only. HTTP redirects are not followed; response size and fetch duration bounded. Exact product links must match the configured store path and requested code. Tests cover parser amounts, missing baseline, campaign exclusion, installment rejection, public message parsing, store host/path/code checks and Product JSON-LD identity/currency.

Source parser extracted from the real V85, with local pure helpers only; no runner credentials copied. Unknown original price stays null. Preview reads only one public page, NOT the full 250-message runner window. Link-only/coupon parity and pagination are not implemented yet.

## Actual cloud tests

pg_net request 46128: HTTP200, 20 recent public messages, 17 structured unique offers, 2 store searches HTTP200 and exact product links found, elapsed3565ms.

Request46130: HTTP200, same20/17. Both direct product pages HTTP200; both identified one Product JSON-LD with title, BRL price, image and InStock. One price matched the Telegram announcement and one differed. Elapsed2167ms including source, searches and direct product reads. This is a 2-product probe, NOT the full cycle duration or proof of ongoing availability.

No offers or delivery jobs were written by either test. pg_net request/response transport records are infrastructure diagnostics.

## Remaining before activation

1. Expand public-source pagination with bounded 24-hour coverage and report gaps explicitly; preserve coupon priority and link-only handling.
2. Extract full candidate product data with exact identity and fresh price/availability checks; handle Pix/installment/coupon conditions explicitly. The price mismatch must not be ignored or silently described as a discount.
3. Integrate category overrides, 48h same-product /24h equivalent-family per-channel policy, 10% real price-drop exception using published snapshots, pending-delivery checks, and target5 unique eligible offers (blocked offers do not consume target).
4. Isolated Magalu owner/executor control and atomic run/job fencing. Do not reuse or alter Shopee run ownership or schedule. Existing local V86 is not yet fenced for Magalu.
5. Compare production history in read-only mode, verify affiliate attribution and images, then controlled publication and local/cloud handoff. No automatic publication before those gates.

Shopee and Amazon untouched. Mercado Livre unchanged. No paid infrastructure provisioned.

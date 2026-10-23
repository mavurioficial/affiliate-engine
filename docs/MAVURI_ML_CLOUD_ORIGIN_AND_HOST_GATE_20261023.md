# Mavuri Mercado Livre — cloud migration decision gate (23/10/2026)

**Status: CLOUD PUBLISHING DISABLED FOR MERCADO LIVRE. Shopee is separately active.**

## What has actually been tested

1. Prior GitHub Actions hosted-runner probe: public Mercado Livre home + affiliate hub + public Mercado Libre REST API returned **HTTP 403** from that origin.
2. New authenticated Mavuri Supabase Edge read-only probe (Github run [40024988042](https://github.com/mavurioficial/affiliate-engine/actions/runs/40024988042)): public Mercado Livre homepage **HTTP 200**, guest affiliate hub **HTTP 302** (redirect), `api.mercadolibre.com/sites/MLB` and `/currencies/BRL` both **HTTP 403**. No Mercado Livre cookies, passwords, tokens, affiliate link generation, or DB writes were involved.
3. Public ML origin reachable does NOT establish authenticated affiliate-hub access, commission entitlement, permission to automate, nor reachability of browser-internal endpoints.
4. The real private V86 of 22/10/2026 was inspected offline. It uses persistent authenticated Chrome/CDP, diverse pool discovery, ML Best Price, conditional coupon pricing, Flow preselection and owner-generated `meli.la` links.
5. Database inventory: **798 ML offers**, **566** with `https://meli.la/` URLs, **0** refreshed within 24h of audit. These are historic affiliate-link records, NOT verified current-price offers. Do not auto-post stale prices.

## Work prepared, without exposing user browser credentials

- `supabase/functions/discovery-cloud-ml-origin-probe/index.ts`: owner-authenticated, public-read-only egress test, deployed in Supabase with JWT verification.
- `scripts/cloud-runner/ml-v86-pure.mjs`: dependency-free V86 catalog grouping, cheapest-alternative comparison, theme rotation, 2-link diversity reserve, conservative affiliate provenance check.
- `scripts/cloud-runner/prepare-ml-only-v86.mjs`: isolated PRIVATE V86 patcher, requires an already-sanitized local script; skips Shopee, Magalu, Telegram MTProto coupons, auxiliary affiliate queue, and automatic republishing unless separately reviewed. The output must never go into GitHub.
- `scripts/cloud-runner/ml-vm-safe-preflight.sh`: safe, cookie-free check of RAM and public ML HTTP statuses on a candidate Linux server; returns only aggregate flags.
- `mavuri_internal.ml_cloud_control`: independent table, defaults `enabled=false`, `active_executor=local`, `max_offers=8`, `interval_minutes=30`, local start window 08:00–22:00 `America/Sao_Paulo`. Does not touch the active Shopee control or scheduler.
- `mavuri_ml_legacy_writer_fence`: old `discovery:` jobs for **Mercado Livre only** are fenced if ML cloud is ever enabled. Currently not blocking because ML remains disabled.
- CI offline unit and security regression tests are included on the feature branch.

## Next HOST gate: one real authorized browser origin

Use a dedicated Linux host with persistent private storage and at least 2 GiB RAM (4 GiB preferred for Chrome) that can reach the affiliate hub **legitimately**. Do not deploy production credentials or publish anything until this gate passes.

The existing Oracle **AMD E2.1.Micro has only 1 GiB RAM**, so it is not suitable for reliably hosting another persistent Chrome alongside WAHA. Official Oracle Always Free Ampere A1 quota may provide a larger ARM VM if capacity exists; the VM must be in the account's home region. This is an option, not proof Mercado Livre will grant affiliate-hub access from its egress IP. Do not spend money or migrate sessions to test unapproved locations.

### Preflight on an existing/candidate Linux VM
In a private SSH shell, **inspect before executing** the script:
```bash
curl -fsSL 'https://raw.githubusercontent.com/mavurioficial/affiliate-engine/feat/discovery-cloud-foundation-20261022/scripts/cloud-runner/ml-vm-safe-preflight.sh' -o /tmp/mavuri-ml-safe-preflight.sh
less /tmp/mavuri-ml-safe-preflight.sh
bash /tmp/mavuri-ml-safe-preflight.sh
```
The result is a single JSON line with `ram_mb`, `public_home_http`, `guest_hub_http`, `api_site_http`, `origin` and `capacity`. It contains no credentials, local IPs, account IDs, cookies or URLs of products. HTTP 200/302 guest is **not enough**: a later user-authorized login in a secured persistent Chrome must prove access to the Affiliate Hub.

After installing Chrome on a suitably sized, permission-approved host with CDP bound to **127.0.0.1 only**, use `scripts/cloud-runner/ml-origin-readonly.mjs` to confirm authenticated Hub access **without generating links**. If denied (403), stop, diagnose permissions/official support — don't attempt IP/browser-fingerprint bypasses.

## Preconditions before ML Cloud publishing

- [ ] Accessible persistent Chrome on an authorized Linux host (not a GitHub Actions ephemeral runner), legitimate affiliate session and verified ability to generate own `meli.la`.
- [ ] Test ML-only private V86 dry-run; ensure other platforms' collectors/publishers do NOT start.
- [ ] Split ML ingest routing by an explicit `ml-cloud:` source so the legacy `discovery:` write fence cannot reject the new authorized cloud worker. Preserve 48h cooldown, families, coupons and Best Price.
- [ ] Run a supervised one-product publication, verify commission-linked URL and `sent` Telegram job, then dual-executor denial.
- [ ] Only then activate `ml_cloud_control`, install periodic 30-minute ML dispatch, preserve start window 08:00–22:00 BRT with bounded in-flight completion.

No Mercado Livre link was generated and no Mercado Livre offer published during this investigation. Shopee cloud publishing remains separate and unchanged.

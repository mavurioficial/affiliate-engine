# Mercado Livre — Free Cloudflare Browser Run POC

**Goal:** test whether a hosted Chromium can reach *public guest* Mercado Livre pages. No Oracle, no Google Cloud billing, no local runner, no ML cookies, no login and no publishing. This does **not** prove affiliated-browser automation will work.

The Workers Free tier gives **10 browser minutes per day** shared across sessions, not 10 minutes per cycle. The MVP must be limited to a few sessions daily and optimized after measuring real browser duration. Plan-specific limits may change; verify Cloudflare dashboard before using.

## Setup (only after user creates a Cloudflare Free account)

1. In Cloudflare Workers & Pages, confirm plan **Free**, not Workers Paid.
2. Deploy this Worker with Wrangler using a one-time credential *kept in Cloudflare Secrets or a private protected CI secret*. Do not paste the credential in ChatGPT or GitHub code. There is no scheduled run configured.
3. Generate a private random **PROBE_TOKEN** of at least 32 characters and save with `wrangler secret put PROBE_TOKEN` (never commit it).
4. Call `POST /probe` with the token in the Authorization: Bearer header. Only aggregate HTTP status and whether the guest Hub redirected to login are returned. `GET /health` needs no token and does not start a browser.
5. If ML guest pages return 403 or explicit access restrictions, stop instead of attempting proxy/fingerprint workarounds.

**No automatic 30-minute cycle is enabled.** After guest reachability, the second gate is user-authorized login/session continuity plus generation of a provably user-bound `meli.la` link, under the Mercado Livre rules. The user must approve that step. The Supabase `ml_cloud_control` remains `enabled=false` and Shopee stays unchanged.

Platform references:
- https://developers.cloudflare.com/browser-run/pricing/
- https://developers.cloudflare.com/browser-run/limits/
- https://developers.cloudflare.com/browser-run/how-to/deploy-worker/

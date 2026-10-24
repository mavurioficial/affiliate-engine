# Mavuri Mercado Livre — Cloudflare Browser Run Free

## Goal

Test a REAL remote Chromium browser reaching two public, unauthenticated Mercado Livre pages, while measuring its browser-on time. No user session, no links generated, no Telegram messages, and no new scheduled jobs.

The official Workers Free plan currently allows 10 minutes (600 seconds) of Browser Run time **per UTC day, shared across every use in the account**. Cloudflare applies other Free limits including new-browser rate, concurrency and browser idle timeout. Verify the account remains on the FREE plan.

The pilot intentionally leaves 120 seconds of spare daily quota. Therefore the estimate uses only 480 seconds for testing. The result reports: page HTTP statuses; navigation milliseconds; browser launch/close times; total estimated browser-on time; and a theoretical maximum number of GUEST probe sessions per day. It is not a real V86 cycle estimate until the actual signed-in V86 has been measured.

| Browser time per session | Guest-probe daily cap with 2-minute reserve |
|---:|---:|
| 10s | 28 |
| 20s | 24 |
| 30s | 16 |
| 45s | 10 |
| 60s | 8 |
| 120s | 4 |

The estimate is capped at 28 starts (08:00–21:30, every 30 minutes). Cloudflare's **Browser Run usage dashboard** is authoritative for billed/quota time; the app's elapsed-time measurement is an approximation.

## Cloudflare dashboard deployment — no local installation

1. Open https://dash.cloudflare.com/ and confirm **Workers Free**, not Workers Paid. Don't register a payment method or upgrade.
2. Under Workers & Pages select **Create application → Import a Git repository → GitHub**.
3. If needed, grant the Cloudflare GitHub integration access ONLY to the repo mavurioficial/affiliate-engine.
4. Repository: mavurioficial/affiliate-engine.
5. Worker name: mavuri-ml-public-browser-probe (must match the name in wrangler.jsonc).
6. Production branch: feat/discovery-cloud-foundation-20261022.
7. Root directory: cloud/mercadolivre-cloudflare-free.
8. Build command: npm install --ignore-scripts --no-audit --no-fund (or the platform-provided npm install stage).
9. Deploy command: npx wrangler deploy.
10. Deploy. This does NOT start a browser; the HTTP GET /health endpoint responds without launching Chrome. The POST /probe route will return 401 until its secret is configured.
11. In the Worker settings under **Variables and Secrets**, add an encrypted secret named PROBE_TOKEN, whose value is a unique random string of at least 32 characters. Never send this value through chat, screenshots, console output, or GitHub source.
12. Then manually trigger **one authenticated POST /probe**, capture the aggregate JSON and compare the usage with Compute → Browser Run in Cloudflare. Only then decide whether to use more sessions.

Workers Builds supports GitHub imports and branch/root-directory settings without having to install Node or acquire Windows admin permission. Dashboard labels may vary.

## Safety

- Only two hard-coded public URLs: the Mercado Livre homepage and the guest Affiliate Hub.
- No Mercado Livre session, cookies, API keys, passwords, downloads, linking or ingestion.
- POST /probe requires PROBE_TOKEN; GET /health does not launch Chromium.
- Each navigation times out after 10 seconds. The pilot skips further work after ~27 seconds of browser runtime.
- A browser is closed in a finally block even if a page fails.
- No schedule. No infinite loops. No account changes.
- If Mercado Livre denies public guest access, stop: do not evade blocks or try proxies or browser fingerprint tricks.
- Visiting a page as a guest is NOT proof a legitimate authenticated affiliate workflow works.

## Next stages

First measure the real guest probe. Then, only with the user's approval, test login within an authorized browser, verify user-bound meli.la links, and time a small subset of the real V86. Compute the daily capacity using those REAL cycle durations. If fewer cycles fit, limit frequency and keep stable local fallback rather than charging a monthly fee. The Shopee Supabase cloud remains live; Mercado Livre Supabase cloud control remains DISABLED.

Official documentation:
- https://developers.cloudflare.com/browser-run/pricing/
- https://developers.cloudflare.com/browser-run/limits/
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/

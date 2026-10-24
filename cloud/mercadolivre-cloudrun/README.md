# Mavuri Mercado Livre — Cloud Run public browser feasibility gate

**Purpose:** confirm whether **Google Cloud Run Jobs**, with an ephemeral Chromium instance, can access Mercado Livre from its egress network. This is a *read-only guest connectivity probe*, not ML Discovery and not a login workflow.

## Decision: one provider for the real ML workload

Candidate: Google Cloud Run Job with 1 vCPU and 2 GiB of RAM, one execution per 30-minute slot (08:00–21:30 `America/Sao_Paulo`). Supabase continues to own filtering, final classification, cooldown, delivery, messages and cloud scheduling parity.

A Chrome container runs per cycle and exits. It does not need a 24h VM. However **Cloud Run filesystem is ephemeral**: authenticated affiliate sessions, if later approved, must use secure external storage (Google Secret Manager or similarly protected source) and a user-authorized, maintainable sign-in process. Do not put cookies, passwords, SSH keys or live runner V86 code in public GitHub or environment logs.

Google Cloud requires a **billing-enabled project** for its free quota. The plan is conditional and **does not guarantee $0**. Build costs, Artifact Registry, network egress, secrets, monitoring and usage beyond monthly allowances may incur costs. Do NOT enable automatic jobs until a cost budget, safeguards and a measured runtime exist. Set billing budget alerts; note alerts do not hard-stop charges. If billing/card authorization is unacceptable, **do not deploy** this option.

## Quota estimate (not a forecast)

28 start slots per day × 30 days = **840 job executions**. At 1 vCPU, 2 GiB and 3 min per run: 151,200 vCPU-seconds and 302,400 GiB-seconds in 30 days. Cloud Run **Jobs** (instance-billed) currently lists **240,000 vCPU-sec and 450,000 GiB-sec free per month** at Tier 1 reference pricing; this example is below both *compute* thresholds, but does not establish free operation in a specific region, for network transfer, build, storage or any other SKU. Four minutes/run would use **201,600 vCPU-sec and 403,200 GiB-sec**, also within those reference compute allowances; ~4.5 minutes/run would exceed the 450,000 GiB-sec memory allowance. **Measure actual costs before enabling production.** Cloud Scheduler has 3 free jobs per billing account and supports `0,30 8-21 * * *` with timezone `America/Sao_Paulo` for a *later* deployment.

Cloudflare Browser Run Free (10 min/day) is too small for 28 cycles daily unless the browser workload is reduced to about 21 sec per start. Apify Free ($5 monthly platform credit) is useful for a manual POC, not guaranteed to sustain ~840 Chrome sessions per month. No provider is confirmed to be accepted by Mercado Livre's authenticated Affiliate Hub.

## Deploy **read-only preflight** — Google Cloud Shell; no local admin

1. Sign into [Google Cloud Console](https://console.cloud.google.com/) and create/select a project. If the project is not billing-enabled, stop here rather than consenting without reviewing the risk.
2. Open **Cloud Shell** in Google Cloud Console (not the Oracle Cloud Shell).
3. Confirm the project: `gcloud config get-value project`.
4. Run the following commands **only after checking the target project and billing**:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
git clone --depth 1 --branch feat/discovery-cloud-foundation-20261022 https://github.com/mavurioficial/affiliate-engine.git
cd affiliate-engine/cloud/mercadolivre-cloudrun
gcloud run jobs deploy mavuri-ml-egress-probe \
  --source . \
  --region us-central1 \
  --cpu 1 --memory 2Gi \
  --tasks 1 --max-retries 0 --task-timeout 180s \
  --set-env-vars MAVURI_ML_PROBE_ONLY=YES_PUBLIC_READONLY
gcloud run jobs execute mavuri-ml-egress-probe --region us-central1 --wait
gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="mavuri-ml-egress-probe"' --limit 15 --format='value(textPayload)'
```

5. Send back only the aggregate JSON with `http_status` and `reason` for two **public** URLs. The container never accepts ML credentials, persists sessions, sends messages or changes Supabase.

**Go/no-go:** If homepage and guest Hub are inaccessible / 403, do not add authentication or try browser-fingerprint/IP evasion. If HTTP works, the **next separate test** must validate the user's *legitimately authorized* affiliate session in an approved secure browser. HTTP 200 or 302 in guest mode is **not** evidence that the affiliate session will work.

## Later production design (NOT active)

- Job invokes secure ML V86-only cycle; ML Cloud control remains `enabled=false` until the signed, approved link flow is verified.
- True owner-issued `meli.la` links must be generated or verifiably mapped with the user's affiliate account. A generic link shortener, arbitrary query tracking tag or an unverified link is never sufficient.
- Discovery, Best Price, coupons, category diversity and 48-hour cooldown must pass SQL gates before Telegram posting, reusing Supabase worker.
- Preserve ML-only lease and atomic queueing. No duplicate Shopee/Magalu/coupon workload.
- After 1 supervised ML publication and at least one scheduled-cycle audit, optionally schedule via Cloud Scheduler as a single job `0,30 8-21 * * *` with timezone `America/Sao_Paulo`, or use an authenticated Supabase bridge.

**Nothing in this path enables ML publication or changes Shopee.**

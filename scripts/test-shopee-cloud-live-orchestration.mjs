import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root="supabase/migrations/";
const enqueue=readFileSync(root+"20261023172000_shopee_cloud_atomic_enqueue.sql","utf8");
const reconcile=readFileSync(root+"20261023174500_fix_shopee_cloud_reconcile_alias.sql","utf8");
const scheduler=readFileSync(root+"20261023180500_shopee_cloud_cron_scheduler.sql","utf8");
const jitter=readFileSync(root+"20261023182500_discovery_claim_interval_jitter.sql","utf8");
const executor=readFileSync("supabase/functions/discovery-cloud-shopee-executor/index.ts","utf8");
for(const k of [
 "mavuri_discovery_claim_run","mavuri_shopee_cloud_enqueue","mavuri_shopee_cloud_mark_submitted"
])assert.ok(executor.includes(k),"missing "+k);
assert.ok(executor.includes("planFourChannelCycle"),"must reuse verified routing planner");
assert.ok(executor.includes("fetchCommercialCandidates"),"must use signed Shopee API");
assert.ok(executor.includes("schedulerHash"),"require scheduler auth");
assert.ok(!/fetch\(["']https:\/\/api\.telegram\.org/.test(executor),"no second Telegram publisher");
assert.match(enqueue,/WHERE id=true FOR UPDATE/);
assert.match(enqueue,/RETURNING id INTO new_job_id/);
assert.match(reconcile,/run_item mavuri_internal.discovery_cloud_runs%ROWTYPE/);
assert.match(reconcile,/ended_run.status IN\('expired','failed'\)/);
assert.match(scheduler,/schedule\('mavuri-shopee-cloud-discovery','\*\/30 \* \* \* \*'/);
assert.match(scheduler,/schedule\('mavuri-shopee-cloud-reconcile','\* \* \* \* \*'/);
assert.match(scheduler,/cfg.enabled AND cfg.active_executor='cloud'/);
assert.match(jitter,/cfg.interval_minutes\*60-30/);
assert.match(jitter,/already_running/);
assert.ok(!/UPDATE mavuri_internal\.discovery_cloud_control|INSERT INTO public\.flow_delivery_jobs/i.test(scheduler),
 "cron setup never enables or directly enqueues");
console.log("Mavuri Shopee cloud executor, lifecycle, scheduler and jitter: safety tests passed.");

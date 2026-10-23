import assert from "node:assert/strict";
import {pilotReady} from "./cloud-runner/shopee-single-pilot-gate.mjs";
const required=["api_owner_verified","affiliate_account_verified","live_price_matches_stored",
 "affiliate_link_matches_api","final_category_verified","telegram_channel_verified",
 "cooldown_48h_verified","queue_fanout_bypassed","atomic_idempotency_verified",
 "local_runner_stopped","single_job_worker_scoped","whatsapp_disabled"];
assert.deepEqual(new Set(pilotReady({}).blocked),new Set(required));
for(const item of required){
 const values=Object.fromEntries(required.map(k=>[k,true]));
 values[item]=false;
 const fail=pilotReady(values);
 assert.equal(fail.ready,false,item+" must block");
 assert.deepEqual(fail.blocked,[item]);
 assert.equal(fail.sent,false);
}
const pass=pilotReady(Object.fromEntries(required.map(k=>[k,true])));
assert.equal(pass.ready,true);
assert.equal(pass.queued,false);
assert.equal(pass.sent,false);
console.log("Shopee one-off pilot gate: 12 fail-closed checks passed.");

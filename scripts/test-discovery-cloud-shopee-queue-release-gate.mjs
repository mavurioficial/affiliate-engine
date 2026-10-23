import assert from "node:assert/strict";
import {MAVURI_QUEUE_GUARD_KEYS,evaluateShopeeCloudQueueReadiness,analyzeMavuriQueueSchema}
 from "../supabase/functions/discovery-cloud-shopee/shopee-queue-release-gate.mjs";
const current=evaluateShopeeCloudQueueReadiness({
 cloud_control_enabled:false,cloud_selected_executor:false,whatsapp_disabled:true,
 after_trigger_classification_verified:true,channel_rules_verified:true
});
assert.equal(current.ready_for_release,false);
assert.ok(current.blocked_by.includes("local_runner_fenced"));
assert.ok(current.blocked_by.includes("unique_inflight_product_channel"));
assert.ok(current.blocked_by.includes("fanout_skips_cloud_authorized_routes"));
assert.equal(current.mutation_performed,false);
assert.equal(MAVURI_QUEUE_GUARD_KEYS.length,14);
const unverified=evaluateShopeeCloudQueueReadiness(Object.fromEntries(MAVURI_QUEUE_GUARD_KEYS.map(k=>[k,true])));
assert.equal(unverified.ready_for_release,true);
assert.equal(unverified.mutation_performed,false); // even fully attested preflight cannot queue
const falseString=evaluateShopeeCloudQueueReadiness({cloud_control_enabled:"true"});
assert.equal(falseString.verified.cloud_control_enabled,false);
const existing=analyzeMavuriQueueSchema({
 job_indexes:[
  {indexdef:"CREATE UNIQUE INDEX flow_delivery_jobs_delivery_key_uidx ON public.flow_delivery_jobs USING btree (user_id, delivery_key)"},
  {indexdef:"CREATE INDEX flow_delivery_jobs_channel_idx ON public.flow_delivery_jobs USING btree (channel_id)"}
 ],
 trigger_definitions:[
  {tgname:"trg_mavuri_delivery_job_before_insert",tgenabled:"O"},
  {tgname:"trg_mavuri_delivery_job_fanout",tgenabled:"O"}
 ],
 trigger_functions:{
  before_insert:"v_automatic := v_prefix in ('discovery','shopee','magalu','repub','amazon-collector');",
  fanout:"v_targets := array_append(v_targets,v_general); return new;"
 }
});
assert.equal(existing.inflight_unique_index,false);
assert.equal(existing.before_insert_trigger_active,true);
assert.equal(existing.fanout_trigger_active,true);
assert.equal(existing.cloud_is_automatic_for_cooldown,false);
assert.equal(existing.fanout_explicitly_bypasses_cloud,false);
const proposed=analyzeMavuriQueueSchema({
 job_indexes:[{indexdef:"CREATE UNIQUE INDEX flow_delivery_jobs_inflight_unique ON public.flow_delivery_jobs (user_id, offer_id, channel_id) WHERE status IN ('queued','processing')"}],
 trigger_definitions:[
  {tgname:"trg_mavuri_delivery_job_before_insert",tgenabled:"O"},
  {tgname:"trg_mavuri_delivery_job_fanout",tgenabled:"O"}
 ],
 trigger_functions:{
   before_insert:"v_automatic := v_prefix in ('shopee','shopee-cloud');",
   fanout:"if new.delivery_key like 'shopee-cloud:%' then return new; end if;"
 }
});
assert.equal(proposed.inflight_unique_index,true);
assert.equal(proposed.cloud_is_automatic_for_cooldown,true);
assert.equal(proposed.fanout_explicitly_bypasses_cloud,true);
assert.equal(proposed.race_free_at_runtime_not_proven,true);
console.log("Shopee atomic queue release gate tests passed; no writes or real queue jobs.");

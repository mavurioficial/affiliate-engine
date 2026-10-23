// Dry-run contract for the handoff from Windows V85 to cloud Shopee.
// Does not acquire locks, modify Supabase or authorize publication.
// All booleans must be attested by real integration checks before a cutover.
export const MAVURI_QUEUE_GUARD_KEYS=Object.freeze([
  "cloud_control_enabled",
  "cloud_selected_executor",
  "local_runner_fenced",
  "active_run_lease_valid",
  "shared_writer_serialization",
  "unique_inflight_product_channel",
  "cloud_jobs_use_automatic_cooldown_trigger",
  "fanout_skips_cloud_authorized_routes",
  "after_trigger_classification_verified",
  "affiliate_identity_and_link_verified",
  "channel_rules_verified",
  "sent_pending_rechecked_atomically",
  "published_price_snapshot_verified",
  "whatsapp_disabled"
]);
export function evaluateShopeeCloudQueueReadiness(attestations={}) {
  const details={},blocking=[];
  for(const key of MAVURI_QUEUE_GUARD_KEYS) {
    const checked=attestations?.[key]===true;
    details[key]=checked;
    if(!checked)blocking.push(key);
  }
  const ready=blocking.length===0;
  return Object.freeze({
    scope:"shopee_atomic_enqueue_gate",
    ready_for_release:ready,
    mutation_performed:false,
    blocked_by:blocking,
    verified:details,
    requires_transactional_recheck:true,
    disclaimer:"Pure preflight only; no locks acquired and no publication authorized. Positive attestations require runtime verification."
  });
}
// Decode the exact queue state relevant to Mavuri in a resilient way.
// This only uses aggregate/schema metadata, no secrets or user records.
export function analyzeMavuriQueueSchema({
  job_indexes=[],trigger_functions={},trigger_definitions=[]
}={}) {
  const indexes=(Array.isArray(job_indexes)?job_indexes:[])
    .map(x=>String(x.indexdef||"").toLowerCase().replace(/\s+/g," "));
  const hasUniquePending=indexes.some(x=>
    x.includes("create unique index")&&x.includes("flow_delivery_jobs")&&
    /\(\s*user_id\s*,\s*offer_id\s*,\s*channel_id\s*\)/.test(x)&&
    /where/.test(x)&&/status/.test(x)&&/queued/.test(x)&&/processing/.test(x)
  );
  const active=new Set((Array.isArray(trigger_definitions)?trigger_definitions:[])
    .filter(x=>String(x.tgenabled||"")==="O").map(x=>String(x.tgname||"")));
  const before=String(trigger_functions.before_insert||"");
  const fanout=String(trigger_functions.fanout||"");
  const automaticCloudPrefix=before.includes("'shopee-cloud'")&&
    before.includes("v_automatic :=");
  const fanoutCloudBypass=/delivery_key[\s\S]*?shopee-cloud/.test(fanout)&&
    /return new/i.test(fanout);
  return {
    inflight_unique_index:hasUniquePending,
    before_insert_trigger_active:active.has("trg_mavuri_delivery_job_before_insert"),
    fanout_trigger_active:active.has("trg_mavuri_delivery_job_fanout"),
    cloud_is_automatic_for_cooldown:automaticCloudPrefix,
    fanout_explicitly_bypasses_cloud:fanoutCloudBypass,
    needs_schema_review:true,
    // Schema checks do not prove advisory locks or runtime correctness.
    race_free_at_runtime_not_proven:true
  };
}

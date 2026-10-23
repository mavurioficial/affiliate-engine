// Pilot gate for ONE Shopee publication. Pure, no side effects.
export function pilotReady(x={}) {
  const gates=[
    "api_owner_verified","affiliate_account_verified",
    "live_price_matches_stored","affiliate_link_matches_api",
    "final_category_verified","telegram_channel_verified",
    "cooldown_48h_verified","queue_fanout_bypassed",
    "atomic_idempotency_verified","local_runner_stopped",
    "single_job_worker_scoped","whatsapp_disabled"
  ];
  const blocked=gates.filter(k=>x[k]!==true);
  return {ready:blocked.length===0,blocked,queued:false,sent:false,
    note:"A green checklist alone does not enqueue or publish an offer."};
}

import {planShopeeAfterPersistence} from "./shopee-postpersist-plan.mjs";

// FIRST SINGLE-OFFER CLOUD PUBLICATION PREFLIGHT (NO WRITES).
// Select at most ONE post-trigger existing Shopee product, enforce all available
// route/cooldown/affiliate checks, and return only aggregate results.
// This does NOT grant authorization to enqueue/send. Database rules, reliable
// snapshot comparison and a distributed lease must be verified transactionally
// at the eventual actual enqueue.
/**
 * @param {{
 *   candidates?: Array<Record<string,unknown>>,
 *   stored_offers?: Array<Record<string,unknown>>,
 *   rules?: Array<Record<string,unknown>>,
 *   channels?: Array<Record<string,unknown>>,
 *   scope?: Record<string,string>,
 *   sent_history?: Array<Record<string,unknown>>,
 *   pending_history?: Array<Record<string,unknown>>,
 *   now_iso?: string
 * }} [input]
 */
export function firstShopeeControlledPreflight({
  candidates,stored_offers,rules,channels,scope,sent_history=[],pending_history=[],
  now_iso
}={}) {
  const plan=planShopeeAfterPersistence({
    candidates,stored_offers,rules,channels,scope,sent_history,pending_history,
    now_iso,max_unique:1,snapshot_price_verified:false
  });
  const selected=plan.selected||[];
  if(selected.length>1)throw Error("one_offer_limit_broken");
  const jobCount=(plan.jobs||[]).length;
  if(selected.length&&jobCount!==selected[0].channels.length)
    throw Error("one_offer_channel_mapping_mismatch");
  const caps=selected.length===1?selected[0].channels.length:0;
  const counters=plan.counters;
  return {
    ok:true,mode:"single_offer_preflight",dry_run:true,
    cloud_publishing:false,cloud_schedule:false,
    selected_unique_offers:selected.length,projected_jobs:caps,
    known_persisted_offers:(Array.isArray(stored_offers)?stored_offers.length:0),
    eligibility:{
      input_candidates:counters.received,
      missing_persisted:counters.missing_persisted,
      ambiguous_persisted:counters.ambiguous_persisted,
      final_category_unavailable:counters.final_category_unavailable,
      invalid_affiliate_or_price:counters.invalid_affiliate_or_price,
      blocked_under_10_percent:counters.below_discount,
      rules_not_matched:counters.no_rule_match,
      blocked_recent_48h:counters.same_item_48h,
      blocked_pending:counters.already_pending,
      blocked_category_diversity:counters.category_diversity
    },
    safety:{
      one_offer_limit:true,requires_database_classification:true,
      snapshot_price_override_disabled:true,reads_only:true,
      distributed_lease_checked:false,atomic_enqueue_checked:false,
      ready_to_publish:false
    }
  };
}

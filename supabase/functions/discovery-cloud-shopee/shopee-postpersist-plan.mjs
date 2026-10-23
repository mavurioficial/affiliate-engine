// Mavuri V85 -> Cloud: POST-PERSISTENCE Shopee routing plan, OFFLINE and READ-ONLY.
// The executor MUST persist with normal database triggers before passing "stored" rows.
// Never send this plan directly to Telegram or enqueue jobs without a shared lease and
// an atomic recheck of sent/pending histories, channel status and current offer version.
import {matchesRule,diversityFamily} from "./shopee-production-rules.mjs";
import {validateShopeeRoutingRules} from "./shopee-routing-shadow.mjs";
import {compareShopeeCandidates,shopeeSignificantPriceDropStrict,SHOPEE_CLOUD_POLICY}
  from "./shopee-policy.mjs";

const validId=x=>typeof x==="string"&&x.length>0;
const age=(value,now)=>{
  const date=Date.parse(String(value||""));
  return Number.isFinite(date)?(now-date)/(60*60*1000):NaN;
};
function finalClassification(row){
  const slug=String(row?.metadata?.mavuri?.category_slug||"");
  if(!/^[a-z][a-z0-9-]{1,48}$/.test(slug)||!Array.isArray(row?.mavuri_tags)
      ||row.mavuri_tags.some(x=>typeof x!=="string"))return null;
  return {category:slug,tags:row.mavuri_tags,source:String(row.metadata.mavuri.classification_source||"")};
}
function findLatestByScope(rows,scope){
  const latest=new Map(),ambiguous=new Set();
  for(const row of Array.isArray(rows)?rows:[]) {
    if(row?.user_id!==scope.user_id||
        row?.marketplace_id!==scope.marketplace_id||
        row?.affiliate_account_id!==scope.affiliate_account_id)continue;
    const id=String(row?.source_ref||"");
    if(!id)continue;
    if(latest.has(id)) {
      // Reject potentially ambiguous duplicate source references; never pick a row
      // silently across historical affiliate identities.
      ambiguous.add(id);
    }else latest.set(id,row);
  }
  return {latest,ambiguous};
}
export function planShopeeAfterPersistence({
  candidates=[],stored_offers=[],rules=[],channels=[],
  sent_history=[],pending_history=[],now_iso,scope,
  snapshot_price_verified=false,max_unique=8
}={}) {
  if(!validId(scope?.user_id)||!validId(scope?.marketplace_id)||
     !validId(scope?.affiliate_account_id))throw Error("missing_verified_account_scope");
  const now=Date.parse(String(now_iso||""));
  if(!Number.isFinite(now))throw Error("invalid_now");
  const routes=validateShopeeRoutingRules(rules,channels);
  const {latest,ambiguous}=findLatestByScope(stored_offers,scope);
  const cap=Math.min(SHOPEE_CLOUD_POLICY.target_unique_offers,Math.max(0,Number(max_unique)||0));
  const counters={
    received:0,selected_unique:0,projected_jobs:0,
    missing_persisted:0,ambiguous_persisted:0,final_category_unavailable:0,
    invalid_affiliate_or_price:0,
    invalid_candidate_price:0,invalid_stored_price:0,
    bad_persisted_affiliate_url:0,bad_persisted_image_url:0,
    affiliate_url_changed:0,price_changed:0,
    below_discount:0,no_rule_match:0,
    already_pending:0,same_item_48h:0,price_drop_override:0,
    different_seller_same_verified_family_24h:0,
    unverified_cross_seller_identity:0,
    category_diversity:0,family_diversity:0,cycle_cap:0,
    protected_manual_selection:0
  };
  const selected=[], jobs=[],categoryCounts=new Map(),familyCounts=new Map(),seen=new Set();
  const sent=(Array.isArray(sent_history)?sent_history:[]).filter(h=>h.status==="sent");
  const pending=(Array.isArray(pending_history)?pending_history:[])
    .filter(h=>["queued","processing"].includes(h.status));
  for(const candidate of [...(Array.isArray(candidates)?candidates:[])].sort(compareShopeeCandidates)){
    counters.received++;
    const itemid=String(candidate?.itemid||"");
    if(!itemid||seen.has(itemid))continue;
    seen.add(itemid);
    if(ambiguous.has(itemid)){counters.ambiguous_persisted++;continue;}
    const row=latest.get(itemid);
    if(!row){counters.missing_persisted++;continue;}
    const cls=finalClassification(row);
    if(!cls){counters.final_category_unavailable++;continue;}
    const price=Number(candidate?.sale_price??candidate?.price);
    const link=String(row?.affiliate_url||"").trim();
    // Count each staleness reason independently, but never expose
    // any private price, URL, identifier or auth data to consumers.
    // A newer price/link MUST be persisted and rechecked under a write lease;
    // diagnostic counters must NEVER relax this rejection.
    const badCandidatePrice=!Number.isFinite(price)||price<=0;
    const badStoredPrice=!Number.isFinite(Number(row?.price))||Number(row?.price)<=0;
    const badLink=!/^https:\/\//i.test(link);
    const badImage=!/^https:\/\//i.test(String(row?.image_url||""));
    const linkChanged=String(candidate?.affiliate_url||"")!==link;
    const priceChanged=Number(row?.price)!==price;
    if(badCandidatePrice)counters.invalid_candidate_price++;
    if(badStoredPrice)counters.invalid_stored_price++;
    if(badLink)counters.bad_persisted_affiliate_url++;
    if(badImage)counters.bad_persisted_image_url++;
    if(linkChanged)counters.affiliate_url_changed++;
    if(priceChanged)counters.price_changed++;
    if(badCandidatePrice||badStoredPrice||badLink||badImage||linkChanged||priceChanged){
      counters.invalid_affiliate_or_price++;continue;
    }
    const discount=Number(candidate?.discount_percentage);
    if(!Number.isFinite(discount)||discount<10){counters.below_discount++;continue;}
    const eligibleRuleOffer={title:String(row.title||""),price,
      discount,mavuriCategory:cls.category,mavuriTags:cls.tags};
    const matched=routes.filter(({rule})=>matchesRule(rule,eligibleRuleOffer));
    if(!matched.length){counters.no_rule_match++;continue;}
    const wantedChannels=[];
    for(const route of matched){
      const channel=route.channel_id;
      if(pending.some(h=>String(h.channel_id)===channel&&String(h.itemid)===itemid)){
        counters.already_pending++;continue;
      }
      const recent=sent.filter(h=>String(h.channel_id)===channel&&String(h.itemid)===itemid
        &&Number.isFinite(age(h.sent_at,now))&&age(h.sent_at,now)>=0&&age(h.sent_at,now)<48)
        .sort((a,b)=>Date.parse(b.sent_at)-Date.parse(a.sent_at));
      if(recent.length){
        const exceptionAllowed=snapshot_price_verified &&
          shopeeSignificantPriceDropStrict(recent[0].published_price,price);
        if(!exceptionAllowed){counters.same_item_48h++;continue;}
        counters.price_drop_override++;
      }
      // Cross-seller cooldown uses proven catalog identity only. Never treat a
      // fuzzy title match as proof that two products are equivalent.
      const family=String(row?.metadata?.shopee?.verified_catalog_family||"");
      const shop=String(row?.metadata?.shopee?.shop_id||"");
      if(family&&shop) {
        const equivalent=sent.some(h=>String(h.channel_id)===channel&&String(h.itemid)!==itemid
          &&h.identity_verified===true&&String(h.verified_catalog_family||"")===family
          &&String(h.shop_id||"")&&String(h.shop_id)!==shop
          &&Number.isFinite(age(h.sent_at,now))&&age(h.sent_at,now)>=0&&age(h.sent_at,now)<24);
        if(equivalent){counters.different_seller_same_verified_family_24h++;continue;}
      }else counters.unverified_cross_seller_identity++;
      wantedChannels.push(channel);
    }
    if(!wantedChannels.length)continue;
    // Global 8-product cap; channel count does NOT count against the unique product quota.
    if(selected.length>=cap){counters.cycle_cap++;continue;}
    const familyKey=diversityFamily(String(row.title||""));
    if((categoryCounts.get(cls.category)||0)>=2){counters.category_diversity++;continue;}
    if(familyKey&&(familyCounts.get(familyKey)||0)>=1){counters.family_diversity++;continue;}
    categoryCounts.set(cls.category,(categoryCounts.get(cls.category)||0)+1);
    if(familyKey)familyCounts.set(familyKey,(familyCounts.get(familyKey)||0)+1);
    if(["manual_corrected","manual_approved"].includes(cls.source))
      counters.protected_manual_selection++;
    selected.push({itemid,category:cls.category,channels:wantedChannels});
    for(const channel_id of wantedChannels)jobs.push({itemid,channel_id});
    counters.selected_unique++;
    counters.projected_jobs+=wantedChannels.length;
  }
  return {
    // NEVER serialize selected/jobs to the browser or place them in logs.
    selected,jobs,counters,
    safety:{
      offline_only:true,post_trigger_category_required:true,
      snapshot_price_verified:Boolean(snapshot_price_verified),
      cloud_lease_checked:false,atomic_sent_pending_recheck:false,
      verified_cross_seller_coverage_complete:false,
      ready_to_publish:false
    }
  };
}
export function summarizePostPersistPlan(plan){
  return {
    read_only:true,ready_to_publish:false,
    ...plan.counters,
    limits:{max_unique:8,max_per_category:2},
    missing_guards: Object.entries(plan.safety)
      .filter(([key,value])=>["cloud_lease_checked","atomic_sent_pending_recheck","verified_cross_seller_coverage_complete"].includes(key)&&!value)
      .map(([key])=>key)
  };
}

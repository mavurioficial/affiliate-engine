// READ-ONLY Shopee rule-routing shadow audit.
// Counts what the currently deployed ingest classifier/rule matcher would *match*
// BEFORE database classification override triggers, cooldown, and per-cycle quotas.
// Never returns offer identifiers, titles, prices, URLs, or channel refs.
import {classifyShopee,matchesRule,channelIdsForRule} from "./shopee-production-rules.mjs";
import {shopeeCategoryBucket} from "./shopee-policy.mjs";

export const SHOPEE_EXPECTED_RULE_NAMES=Object.freeze([
  "SHOPEE — Geral","SHOPEE — Mulher","SHOPEE — Casa & Cozinha","SHOPEE — Tecnologia"
]);
const SUPPORTED_KEYS=new Set([
  "marketplace","minDiscount","maxDiscount","minPrice","maxPrice",
  "mavuriCategories","mavuriTagsAny","mavuriTagsAll",
  "deniedMavuriTags","deniedWords"
]);
const add=(o,k)=>{o[k]=(o[k]||0)+1;};

export function validateShopeeRoutingRules(rules,channels) {
  const shopeeRules=(Array.isArray(rules)?rules:[]).filter(x=>
    String(x?.conditions?.marketplace||"").toLowerCase()==="shopee");
  if(shopeeRules.length!==SHOPEE_EXPECTED_RULE_NAMES.length)
    throw Error("routing_rule_count_mismatch");
  const safe=[];
  const allowed=new Set(SHOPEE_EXPECTED_RULE_NAMES);
  for(const name of SHOPEE_EXPECTED_RULE_NAMES) {
    const found=shopeeRules.filter(x=>x?.name===name);
    if(found.length!==1||found[0].enabled!==true)throw Error("routing_rule_changed");
    const r=found[0];
    if(Object.keys(r.conditions||{}).some(k=>!SUPPORTED_KEYS.has(k)))
      throw Error("routing_unsupported_condition");
    if(Number(r.conditions?.minDiscount)!==10)
      throw Error("routing_min_discount_changed");
    const channelIds=channelIdsForRule(r);
    if(channelIds.length!==1)throw Error("routing_channel_assignment_changed");
    const valid=(Array.isArray(channels)?channels:[]).filter(c=>
      String(c?.id)===channelIds[0]&&c.type==="telegram"&&
      ["connected","active"].includes(String(c.status||""))&&Boolean(c.external_ref));
    if(valid.length!==1)throw Error("routing_telegram_channel_unavailable");
    safe.push({rule:r,label:name,channel_id:channelIds[0]});
  }
  if(new Set(safe.map(x=>x.channel_id)).size!==safe.length)
    throw Error("routing_reused_channel");
  if(shopeeRules.some(r=>!allowed.has(r.name)))throw Error("routing_unexpected_rule");
  return safe;
}
export function compareShopeeRoutingShadow(offers,rules,channels) {
  const safe=validateShopeeRoutingRules(rules,channels);
  const report={
    scope:"shopee_four_channels_pre_ingest",
    read_only:true,production_overrides_not_included:true,
    publication_eligibility_not_assessed:true,
    candidates:0,classified_outros:0,
    provisional_outros:0,category_disagreements:0,
    classification_category_counts:{},provisional_category_counts:{},
    disagreements_by_transition:{},matched_candidates_by_rule:{},
    unmatched_candidates:0,matched_multiple_rules:0
  };
  for(const {label} of safe)report.matched_candidates_by_rule[label]=0;
  for(const offer of Array.isArray(offers)?offers:[]) {
    if(!offer?.itemid)continue;
    report.candidates++;
    const classified=classifyShopee(offer);
    const category=classified.categorySlug;
    const provisional=shopeeCategoryBucket(offer);
    add(report.classification_category_counts,category);
    add(report.provisional_category_counts,provisional);
    if(category==="outros")report.classified_outros++;
    if(provisional==="outros")report.provisional_outros++;
    if(category!==provisional){
      report.category_disagreements++;
      // category names only, no products
      add(report.disagreements_by_transition,provisional+" -> "+category);
    }
    const effective={
      title:String(offer.title||""),price:Number(offer.sale_price??offer.price),
      discount:offer.discount_percentage===null?null:Number(offer.discount_percentage),
      mavuriCategory:category,mavuriTags:classified.tags
    };
    let matched=0;
    for(const {rule,label} of safe)if(matchesRule(rule,effective)){
      add(report.matched_candidates_by_rule,label);matched++;
    }
    if(matched===0)report.unmatched_candidates++;
    if(matched>1)report.matched_multiple_rules++;
  }
  return report;
}

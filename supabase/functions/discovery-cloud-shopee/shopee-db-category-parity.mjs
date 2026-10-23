// Read-only comparison of the ingest classifier vs EFFECTIVE categories already persisted.
// Persisted offers are authoritative only for those exact item IDs that are present.
// Manual category decisions must never be replaced by heuristic cloud guesses.
import {classifyShopee,matchesRule} from "./shopee-production-rules.mjs";
import {validateShopeeRoutingRules} from "./shopee-routing-shadow.mjs";

const bump=(o,k)=>{o[k]=(o[k]||0)+1;};
const matched=(rule,offer,category,tags)=>matchesRule(rule,{
  title:String(offer.title||""),
  price:Number(offer.sale_price??offer.price),
  discount:offer.discount_percentage==null?null:Number(offer.discount_percentage),
  mavuriCategory:category,
  mavuriTags:Array.isArray(tags)?tags:[]
});
export function compareShopeeDbCategoryParity(offers,dbRows,rules,channels) {
  const routes=validateShopeeRoutingRules(rules,channels);
  const relevant=(Array.isArray(offers)?offers:[]).filter(o=>o?.itemid);
  const known=new Set(relevant.map(o=>String(o.itemid)));
  const records=new Map();
  const duplicateIds=new Set();
  for(const row of Array.isArray(dbRows)?dbRows:[]) {
    const id=String(row?.source_ref||"");
    if(!known.has(id))continue;
    if(records.has(id))duplicateIds.add(id);
    const prior=records.get(id);
    if(!prior||Date.parse(String(row.captured_at||""))>Date.parse(String(prior.captured_at||"")))
      records.set(id,row);
  }
  const summary={
    scope:"shopee_existing_products_post_db_overrides",
    preview_only:true,publication_eligibility_not_assessed:true,
    candidates_total:relevant.length,
    known_in_database:0,missing_in_database:0,
    recorded_category_missing:0,
    comparable_candidates:0,
    ingest_vs_database_category_mismatches:0,
    manual_approved_or_corrected:0,
    duplicate_db_source_refs:duplicateIds.size,
    database_category_totals:{},ingest_category_totals_for_known:{},
    category_transitions:{},classification_source_totals:{},
    channel_rules:{
      prelim_ingest:{},stored_effective:{},
      newly_matched_by_stored:{},no_longer_matched_by_stored:{}
    },
    limitations:[
      "DB categories are exact only for existing product IDs and their last stored records",
      "No inference for unpersisted new products",
      "Does not invoke trigger code; it reads the already-persisted results",
      "Rules are compared before cooldown, pending jobs, per-channel quotas or message delivery",
      "Data may change while Windows runner remains active"
    ]
  };
  for(const {label} of routes)for(const col of Object.values(summary.channel_rules))col[label]=0;
  for(const offer of relevant) {
    const row=records.get(String(offer.itemid));
    if(!row){summary.missing_in_database++;continue;}
    summary.known_in_database++;
    const dbCategory=String(row?.metadata?.mavuri?.category_slug||"").trim();
    const classificationSource=String(row?.metadata?.mavuri?.classification_source||"unknown");
    if(!dbCategory){summary.recorded_category_missing++;continue;}
    if(!Array.isArray(row.mavuri_tags)){summary.recorded_category_missing++;continue;}
    summary.comparable_candidates++;
    bump(summary.classification_source_totals,classificationSource);
    if(classificationSource==="manual_approved"||classificationSource==="manual_corrected")
      summary.manual_approved_or_corrected++;
    const projection=classifyShopee(offer);
    bump(summary.ingest_category_totals_for_known,projection.categorySlug);
    bump(summary.database_category_totals,dbCategory);
    if(projection.categorySlug!==dbCategory){
      summary.ingest_vs_database_category_mismatches++;
      bump(summary.category_transitions,projection.categorySlug+" -> "+dbCategory);
    }
    for(const {label,rule} of routes) {
      const a=matched(rule,offer,projection.categorySlug,projection.tags);
      const b=matched(rule,offer,dbCategory,row.mavuri_tags);
      if(a)bump(summary.channel_rules.prelim_ingest,label);
      if(b)bump(summary.channel_rules.stored_effective,label);
      if(!a&&b)bump(summary.channel_rules.newly_matched_by_stored,label);
      if(a&&!b)bump(summary.channel_rules.no_longer_matched_by_stored,label);
    }
  }
  return summary;
}

// Category-impact SHADOW calculation for Shopee general channel only.
// Uses effective DB category where the exact source_ref already exists.
// Uses unchanged provisional category for unseen products; NEVER claims those are final.
import {simulateShopeeCloudSelection,shopeeCategoryBucket} from "./shopee-policy.mjs";
import {validateShopeeGeneralRule,normalizeShopeeGeneralHistory} from "./shopee-general-audit.mjs";

export function createShopeeStoredCategoryOverrides(candidates,dbRows) {
  const ids=new Set((candidates||[]).map(o=>String(o?.itemid||"")).filter(Boolean));
  const latest=new Map();
  for(const row of Array.isArray(dbRows)?dbRows:[]) {
    const id=String(row?.source_ref||"");
    if(!ids.has(id))continue;
    const previous=latest.get(id);
    const previousTime=Date.parse(String(previous?.captured_at||""));
    const currentTime=Date.parse(String(row?.captured_at||""));
    if(!previous||((Number.isFinite(currentTime)?currentTime:0)>(Number.isFinite(previousTime)?previousTime:0)))
      latest.set(id,row);
  }
  const overrides=Object.create(null);
  let missingClassification=0,manualProtected=0,changedFromProvisional=0;
  for(const offer of Array.isArray(candidates)?candidates:[]) {
    const id=String(offer?.itemid||"");
    const record=latest.get(id);
    if(!record)continue;
    const slug=String(record?.metadata?.mavuri?.category_slug||"").trim();
    if(!/^[a-z][a-z0-9-]{1,48}$/.test(slug)||!Array.isArray(record?.mavuri_tags)){
      missingClassification++;continue;
    }
    overrides[id]=slug;
    if(slug!==shopeeCategoryBucket(offer))changedFromProvisional++;
    const source=String(record?.metadata?.mavuri?.classification_source||"");
    if(source==="manual_approved"||source==="manual_corrected")manualProtected++;
  }
  return {overrides,known_count:Object.keys(overrides).length,
    unknown_count:ids.size-Object.keys(overrides).length,
    incomplete_known:missingClassification,manual_protected:manualProtected,
    changed_from_provisional:changedFromProvisional};
}

export function compareShopeeGeneralEffectiveCategoryImpact({
  offers,dbRows,rules,channels,sentRows,pendingRows,now_iso
}) {
  const general=validateShopeeGeneralRule(rules,channels);
  const candidates=(Array.isArray(offers)?offers:[]).map(o=>({...o,channel_ids:[general]}));
  const stored=createShopeeStoredCategoryOverrides(candidates,dbRows);
  const history=normalizeShopeeGeneralHistory(sentRows,pendingRows,candidates.map(x=>x.itemid));
  const input={candidates,sent_history:history.sent,pending_history:history.pending,
    connected_telegram_channel_ids:[general],now_iso,target:8};
  const before=simulateShopeeCloudSelection(input);
  const after=simulateShopeeCloudSelection({...input,category_overrides:stored.overrides});
  const initialSet=new Set(before.selected.map(x=>String(x.itemid)));
  const finalSet=new Set(after.selected.map(x=>String(x.itemid)));
  const countBuckets=(obj)=>Object.entries(obj||{})
    .filter(([,v])=>Number(v)>0)
    .reduce((a,[k,v])=>{a[k]=v;return a;},{});
  return {
    scope:"shopee_general_effective_stored_category_shadow",
    read_only:true,no_publications:true,provisional_unknown_categories:true,
    candidates_count:candidates.length,
    effective_categories_available:stored.known_count,
    unknown_final_categories:stored.unknown_count,
    incomplete_known_classifications:stored.incomplete_known,
    manual_reviews_preserved:stored.manual_protected,
    provisional_to_stored_category_differences:stored.changed_from_provisional,
    initial_projected:before.selected_unique_offers,
    effective_stored_projected:after.selected_unique_offers,
    projected_difference:after.selected_unique_offers-before.selected_unique_offers,
    selected_in_both:[...finalSet].filter(x=>initialSet.has(x)).length,
    selected_only_after_db_category:[...finalSet].filter(x=>!initialSet.has(x)).length,
    selected_only_before_db_category:[...initialSet].filter(x=>!finalSet.has(x)).length,
    selected_unknown_category:after.selected.filter(x=>!Object.prototype.hasOwnProperty.call(stored.overrides,String(x.itemid))).length,
    initial_category_blocks:countBuckets(before.category_audit?.blocked_by_diversity),
    effective_category_blocks:countBuckets(after.category_audit?.blocked_by_diversity),
    selected_category_counts:countBuckets(after.category_audit?.selected),
    caveat:"Only previously stored offers use their final database category. New offers still use provisional category. General channel only, no queue or send."
  };
}

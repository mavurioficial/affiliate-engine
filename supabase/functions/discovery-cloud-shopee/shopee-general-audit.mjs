// Pure offline adapter for the Shopee GENERAL channel only.
// Does not infer niche channel routing or make network/database calls.
import {simulateShopeeCloudSelection,SHOPEE_CLOUD_POLICY} from "./shopee-policy.mjs";

export function validateShopeeGeneralRule(rules, channels) {
  const matches=(Array.isArray(rules)?rules:[]).filter(r=>
    r?.enabled===true && String(r?.name||"").trim()==="SHOPEE — Geral" &&
    String(r?.conditions?.marketplace||"").toLowerCase()==="shopee");
  if(matches.length!==1)throw Error("general_rule_missing_or_ambiguous");
  const rule=matches[0],condition=rule.conditions||{};
  if(Object.keys(condition).sort().join(",")!=="marketplace,minDiscount" ||
     Number(condition.minDiscount)!==SHOPEE_CLOUD_POLICY.min_discount_percent)
    throw Error("general_rule_conditions_changed");
  const ids=rule.actions?.channel_ids;
  if(!Array.isArray(ids)||ids.length!==1||typeof ids[0]!=="string")
    throw Error("general_rule_channel_invalid");
  const valid=(Array.isArray(channels)?channels:[]).filter(c=>
    c?.id===ids[0] && c?.type==="telegram" &&
    ["connected","active"].includes(String(c?.status||""))&&Boolean(c?.external_ref));
  if(valid.length!==1)throw Error("general_telegram_channel_not_connected");
  return valid[0].id;
}
export function normalizeShopeeGeneralHistory(sentRows,pendingRows,candidateIds) {
  const validIds=new Set((candidateIds||[]).map(String));
  const sent=[],pending=[];
  const counters={sent_read:0,sent_matched:0,snapshots_valid:0,snapshots_missing:0,
    pending_read:0,pending_matched:0,missing_product_reference:0};
  for(const row of Array.isArray(sentRows)?sentRows:[]) {
    counters.sent_read++;
    const joined=Array.isArray(row?.flow_offers)?row.flow_offers[0]:row?.flow_offers;
    const itemid=String(joined?.source_ref||"");
    if(!itemid){counters.missing_product_reference++;continue;}
    if(!validIds.has(itemid))continue;
    const raw=row?.metadata?.offer_snapshot?.price;
    const price=raw==null||raw===""?null:Number(raw);
    if(price!==null&&Number.isFinite(price)&&price>0)counters.snapshots_valid++;
    else counters.snapshots_missing++;
    counters.sent_matched++;
    sent.push({itemid,channel_id:String(row.channel_id||""),
      sent_at:row.created_at,published_price:price,status:"sent"});
  }
  for(const row of Array.isArray(pendingRows)?pendingRows:[]) {
    counters.pending_read++;
    const joined=Array.isArray(row?.flow_offers)?row.flow_offers[0]:row?.flow_offers;
    const itemid=String(joined?.source_ref||"");
    if(!itemid){counters.missing_product_reference++;continue;}
    if(!validIds.has(itemid))continue;
    counters.pending_matched++;
    pending.push({itemid,channel_id:String(row.channel_id||""),status:row.status});
  }
  return {sent,pending,counters};
}
export function simulateShopeeGeneralAudit({
  offers, rules, channels, sentRows, pendingRows, now_iso, category_overrides={}
}) {
  const generalChannelId=validateShopeeGeneralRule(rules,channels);
  const eligibleSource=(Array.isArray(offers)?offers:[]).map(x=>({...x,channel_ids:[generalChannelId]}));
  const {sent,pending,counters}=normalizeShopeeGeneralHistory(
    sentRows,pendingRows,eligibleSource.map(x=>x.itemid));
  const projected=simulateShopeeCloudSelection({
    candidates:eligibleSource,sent_history:sent,pending_history:pending,
    connected_telegram_channel_ids:[generalChannelId],
    now_iso,target:8,category_overrides
  });
  return {
    scope:"shopee_general_only", read_only:true,
    disclaimer:"Simulation for Shopee — Geral only. Other channels, cross-seller identity, approval triggers and actual publishing are not validated.",
    candidates_considered:eligibleSource.length,
    history:counters,
    projected_unique_offers:projected.selected_unique_offers,
    projected_delivery_jobs:projected.projected_delivery_jobs,
    decisions:projected.counts,
    category_diagnostics:projected.category_audit,
    average_selected_commission_percent:projected.selected.length?
      Math.round(projected.selected.reduce((a,x)=>a+x.commission_percent,0)/projected.selected.length*100)/100:null,
    selected_category_totals:projected.selected.reduce((out,x)=>{
      out[x.category]=(out[x.category]||0)+1;return out;
    },{})
  };
}

import {isAffiliateLink} from "./source.ts";

/** Read-only simulator: no database updates and no publishing.
 * It follows the existing owner-verified refresh-one safety bounds.
 * Never changes title, category, tags, image or metadata.
 * @param {Record<string, any>} arg
 */
export function simulateExistingShopeeRefresh({
  candidates=[],stored=[],pending=[],owner,marketplace,account
}){
 const byRef=new Map();
 for(const row of stored){
   const ref=String(row.source_ref||"");
   if(!byRef.has(ref))byRef.set(ref,[]);
   byRef.get(ref).push(row);
 }
 const freshRows=[],stats={wouldRefresh:0,unchanged:0,
  priceMovementBlocked:0,pendingBlocked:0,categoryOrAccountBlocked:0,unknownProduct:0,
  candidateCount:candidates.length};
 const refreshed=new Map();
 for(const candidate of candidates){
   const ref=String(candidate.id||"");
   const rows=byRef.get(ref)||[];
   if(rows.length!==1){stats.unknownProduct++;continue;}
   const row=rows[0],prev=Number(row.price),next=Number(candidate.price);
   if(row.user_id!==owner||row.marketplace_id!==marketplace||
      row.affiliate_account_id!==account||
      !row.mavuri_category_id||!Array.isArray(row.mavuri_tags)||
      typeof row.metadata?.mavuri?.category_slug!=="string"){
       stats.categoryOrAccountBlocked++;continue;
   }
   if(!Number.isFinite(prev)||prev<=0||!Number.isFinite(next)||next<=0||
      next<prev*0.3||next>prev*3||
      !isAffiliateLink(String(row.affiliate_url||""))||
      !isAffiliateLink(String(candidate.url||""))){
       stats.priceMovementBlocked++;continue;
   }
   if(pending.some(h=>String(h.offer_id)===String(row.id)&&
      ["queued","processing"].includes(h.status))){
       stats.pendingBlocked++;continue;
   }
   if(Math.round(prev*100)===Math.round(next*100)&&
      String(row.affiliate_url||"")===String(candidate.url||"")){
        stats.unchanged++;continue;
   }
   stats.wouldRefresh++;
   refreshed.set(ref,{...row,price:next,affiliate_url:String(candidate.url)});
 }
 for(const row of stored)freshRows.push(refreshed.get(String(row.source_ref||""))||row);
 return {rows:freshRows,stats};
}



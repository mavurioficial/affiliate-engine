// Pure, fail-closed, four-channel Shopee cloud cycle planner.
// NOT a publisher. Every selected offer must have a current signed API match
// and a unique persisted, final-classified DB row. Never serialize jobs to logs.
import {matchesRule,channelIdsForRule,diversityFamily} from "./shopee-production-rules.mjs";
import {isAffiliateLink} from "./source.ts";
const NAMES=new Set(["Mavuri Ofertas","Mavuri Mulher","Mavuri Casa & Cozinha","Mavuri Tecnologia"]);
const cents=x=>Number.isFinite(Number(x))?Math.round(Number(x)*100):NaN;
/** @param {Record<string, any>} input */
export function planFourChannelCycle({
 candidates=[],stored=[],categories=[],channels=[],rules=[],
 history=[],pending=[],owner,marketplace,account,now=Date.now(),maxUnique=8,alreadySelected=[]
}){
 const accepted=channels.filter((c)=>c.user_id===owner&&c.type==="telegram"&&
  c.status==="connected"&&NAMES.has(c.name)&&String(c.external_ref||"").trim());
 const channelsById=new Map(accepted.map((c)=>[String(c.id),c]));
 if(accepted.length!==4||channelsById.size!==4||
   new Set(accepted.map((c)=>c.name)).size!==4)
  return {ready:false,reason:"four_destinations_not_connected",
   selected:[],jobs:[],counts:{selected:0,jobs:0,eligibleCandidates:0}};
 const applicable=rules.filter((r)=>r.enabled===true &&
   String(r.conditions?.marketplace||"").toLowerCase()==="shopee");
 if(applicable.length<4)return {ready:false,reason:"rules_incomplete",
   selected:[],jobs:[],counts:{selected:0,jobs:0,eligibleCandidates:0}};
 const categorySlugs=new Map(categories.filter((c)=>c.active===true)
  .map((c)=>[String(c.id),String(c.slug)]));
 const byRef=new Map();
 for(const r of stored){
  const ref=String(r.source_ref||"");
  if(!byRef.has(ref))byRef.set(ref,[]);
  byRef.get(ref).push(r);
 }
 const nowMs=Number.isFinite(Number(now))?Number(now):Date.now();
 const recent=(h,ms)=> {
  const sent=Date.parse(String(h.sent_at||""));
  return Number.isFinite(sent)&&sent<=nowMs&&sent>=nowMs-ms;
 };
 const sorted=[...candidates].sort((a,b)=>b.discount-a.discount || a.price-b.price);
 const max=Math.min(8,Math.max(0,Math.trunc(Number(maxUnique)||0)));
 const selected=[],jobs=[];
 const counts={selected:0,jobs:0,eligibleCandidates:0,
  missingOrAmbiguous:0,staleCommercial:0,invalidCategory:0,ruleRejected:0,
  recentOrPending:0,diversityBlocked:0};
 const categoryCounts=new Map(),familyCounts=new Set(),seen=new Set();
 for(const previous of alreadySelected){
  const r=stored.find(r=>String(r.id)===String(previous.offer_id));
  if(!r)continue;
  const category=categorySlugs.get(String(r.mavuri_category_id));
  categoryCounts.set(category,(categoryCounts.get(category)||0)+1);
  const family=diversityFamily(String(r.title||''));
  if(family)familyCounts.add(family);
  seen.add(String(r.source_ref||''));
 }
 for(const candidate of sorted){
  if(selected.length>=max)break;
  const ref=String(candidate.id||"");if(!ref||seen.has(ref))continue;seen.add(ref);
  const list=byRef.get(ref)||[];
  if(list.length!==1){counts.missingOrAmbiguous++;continue;}
  const r=list[0];if(r.user_id!==owner||r.marketplace_id!==marketplace||
    r.affiliate_account_id!==account){counts.missingOrAmbiguous++;continue;}
  const category=categorySlugs.get(String(r.mavuri_category_id));
  if(!category||category!==r.metadata?.mavuri?.category_slug||
   !Array.isArray(r.mavuri_tags)){counts.invalidCategory++;continue;}
  const price=Number(r.price),url=String(r.affiliate_url||"");
  if(!Number.isFinite(price)||price<=0||cents(price)!==cents(candidate.price)||
   url!==candidate.url||!isAffiliateLink(url)||
   !String(r.image_url||"").startsWith("https://")||
   Number(candidate.discount)<10){counts.staleCommercial++;continue;}
  const offer={title:String(r.title||""),price,discount:Number(candidate.discount),
   mavuriCategory:category,mavuriTags:r.mavuri_tags};
  const targets=new Set();
  for(const rule of applicable){
   if(!matchesRule(rule,offer))continue;
   for(const channelId of channelIdsForRule(rule)){
    if(channelsById.has(String(channelId)))targets.add(String(channelId));
   }
  }
  if(!targets.size){counts.ruleRejected++;continue;}
  counts.eligibleCandidates++;
  const allowed=[];
  for(const channel of targets){
   const inFlight=pending.some((h)=>String(h.offer_id)===String(r.id)&&
     String(h.channel_id)===channel&&["queued","processing"].includes(h.status));
   const recentlySent=history.some((h)=>String(h.offer_id)===String(r.id)&&
     String(h.channel_id)===channel&&h.status==="sent"&&recent(h,48*3600000));
   if(inFlight||recentlySent){counts.recentOrPending++;continue;}
   allowed.push(channel);
  }
  if(!allowed.length)continue;
  const family=diversityFamily(String(r.title||""));
  if((categoryCounts.get(category)||0)>=2 || (family&&familyCounts.has(family))){
   counts.diversityBlocked++;continue;
  }
  categoryCounts.set(category,(categoryCounts.get(category)||0)+1);
  if(family)familyCounts.add(family);
  selected.push({offer_id:String(r.id),ref,category,channels:allowed});
  for(const channel of allowed)jobs.push({offer_id:String(r.id),channel_id:channel,ref});
 }
 counts.selected=selected.length;counts.jobs=jobs.length;
 return {ready:true,reason:null,selected,jobs,counts};
}


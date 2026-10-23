// Deterministic, credential-free Mercado Livre V86 helpers.
// Ported from private local runner 2026-10-22. No network, browser or side effects.
// Original Windows runner contains secrets and MUST NOT be committed.
const mlId=/^MLB\d+$/i;
export function mlCatalogKey(product){
 const explicit=String(product?.product_id||"").trim();
 if(mlId.test(explicit) && explicit!==String(product?.id||"").trim())
   return explicit.toUpperCase();
 const url=String(product?.url||product?.product_url||"");
 const catalog=url.match(/\/p\/(MLB\d+)(?:[/?#]|$)/i)?.[1];
 return catalog?catalog.toUpperCase():null;
}
export function mlCompactSearchTitle(title){
 const tokens=String(title||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^\p{L}\p{N}]+/gu," ").trim().split(/\s+/)
  .filter(Boolean)
  .filter(word=>!/^(de|da|do|das|dos|com|para|em|e|a|o|as|os|cor|preto|branco|bivolt)$/i.test(word));
 return tokens.slice(0,9).join(" ").slice(0,120);
}
export function rotateMlThemes(queries,slot){
 const values=[...new Set(queries.map(String).filter(Boolean))];
 if(!values.length)return [];
 if(!Number.isSafeInteger(slot))throw Error("invalid_discovery_slot");
 const n=((slot%values.length)+values.length)%values.length;
 return [...values.slice(n),...values.slice(0,n)];
}
export function mlDiscoveryBuckets({search="",queries=[],pages=3,queryPages=1,slot}){
 const themeOrder=search?[]:rotateMlThemes(queries,slot);
 return [{label:search?"search":"general",search,pages},
   ...themeOrder.map(q=>({label:"theme",search:q,pages:queryPages}))];
}
export function collapseMlCatalogToCheapest(products,score=()=>0){
 if(!Array.isArray(products))throw Error("invalid_products");
 const groups=new Map();
 products.forEach((p,index)=>{
  const catalog=mlCatalogKey(p);
  // Unlike the local Math.random fallback, preserve deterministic item identity.
  const groupKey=catalog||"item:"+(p?.id||p?.source_ref||"at-index-"+index);
  const list=groups.get(groupKey)||[];
  list.push(p);groups.set(groupKey,list);
 });
 const selected=[];let alternatives=0,catalogsWithCompetition=0,savingsVsWorst=0;
 for(const [groupKey,list] of groups){
  if(list.length>1)catalogsWithCompetition++;
  alternatives+=Math.max(0,list.length-1);
  const ordered=[...list].sort((a,b)=>{
   const pa=Number(a.price||Number.POSITIVE_INFINITY);
   const pb=Number(b.price||Number.POSITIVE_INFINITY);
   if(pa!==pb)return pa-pb;
   return Number(score(b)||0)-Number(score(a)||0);
  });
  const best=ordered[0];
  const worst=Math.max(0,...ordered.map(x=>Number(x.price||0)).filter(x=>x>0));
  const cheapest=Number(best.price||0);
  if(worst>cheapest&&cheapest>0)savingsVsWorst+=worst-cheapest;
  selected.push({...best,metadata:{...(best.metadata||{}),
   pricing:{...((best.metadata||{}).pricing||{}),
    catalog_key:groupKey.startsWith("item:")?null:groupKey,
    best_base_price_selected:true,
    alternatives_seen:list.length,
    alternative_source_refs:ordered.map(x=>x.id).filter(Boolean).slice(0,20)
   }}});
 }
 return {products:selected,alternatives,catalogsWithCompetition,savingsVsWorst};
}
// V86 reserves up to two links beyond the target if only 8..23 URL-ready
// products are known, because family/category diversity can reject some.
export function mlV86LinkBudget({target=8,alreadyReady=0,needsLinkCount=0,
 eligibleKnown=false,maxLinks=10,attemptFloor=16}){
 if([target,alreadyReady,needsLinkCount,maxLinks,attemptFloor].some(n=>!Number.isSafeInteger(n)||n<0))
  throw Error("invalid_budget_numbers");
 const diversityReserve=eligibleKnown&&alreadyReady>=target&&alreadyReady<target*3
  ?Math.min(2,Math.max(0,target*3-alreadyReady)):0;
 const needed=Math.max(0,target-alreadyReady)+diversityReserve;
 const successTarget=eligibleKnown?needed:Math.min(maxLinks,target);
 return {diversityReserve,linksNeededForTarget:needed,successTarget,
  attemptCap:successTarget>0?Math.max(attemptFloor,successTarget*2):0};
}
export function mlAffiliateHostAllowed(link){
 try{
  const u=new URL(String(link||""));
  return u.protocol==="https:"&&(
   u.hostname==="meli.la" ||u.hostname==="mercadolivre.com.br" ||
   u.hostname.endsWith(".mercadolivre.com.br")
  );
 }catch{return false}
}
export function mlVerifiedAffiliateCandidate(offer,binding){
 // ML link form alone does NOT prove commission. Require evidence that the
 // currently authenticated owner actually generated/stored this exact link.
 return Boolean(mlAffiliateHostAllowed(offer?.affiliate_url)&&
  binding?.source==="owner_authenticated_hub" &&
  binding?.offer_id===offer?.id &&
  binding?.affiliate_url===offer?.affiliate_url);
}

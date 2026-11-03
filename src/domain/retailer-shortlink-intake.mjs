/**
 * Capture retailer shortlinks forwarded to Mavuri for discovery.
 * Does not expand or fetch links and never reuses a third-party affiliate URL.
 */
const SUPPORTED = new Map([
 ["meli.la","mercadolivre"],
 ["merc.li","mercadolivre"],
 ["mercadolivre.com.br","mercadolivre"],
 ["www.mercadolivre.com.br","mercadolivre"],
 ["link.amazon","amazon"],
 ["amzn.to","amazon"],
 ["a.co","amazon"],
 ["amazon.com.br","amazon"],
 ["www.amazon.com.br","amazon"]
]);
export function intakeShortlinks(rawLinks=[], {origin="forwarded_by_user",receivedAt=null}={}){
 if(!Array.isArray(rawLinks)) throw new Error("link_list_required");
 const list=[], seen=new Set();
 for (const value of rawLinks.slice(0,50)){
   const raw=String(value||"").trim();
   if(!raw)continue;
   let u;
   try{u=new URL(raw)}catch{continue}
   if(u.protocol!=="https:" || u.username || u.password || u.port || !SUPPORTED.has(u.hostname.toLowerCase()))continue;
   // Accept only HTTP address to the advertised product; no injected third-party
   // affiliate identity is promoted into Mavuri's monetization fields.
   const link=u.toString();
   if(seen.has(link))continue;
   seen.add(link);
   const marketplace=SUPPORTED.get(u.hostname.toLowerCase());
   const shortCode=u.hostname.toLowerCase()==="meli.la"?u.pathname.replace(/^\/+/,""):null;
   const uniqueId=shortCode && /^[a-zA-Z0-9]{5,32}$/.test(shortCode)?
     "meli.la:"+shortCode : "external-link:"+list.length;
   list.push({
     source_ref:uniqueId,source_kind:origin,marketplace,
     original_link:link,
     seller_product_id:null,product_title:null,price:null,discount_pct:null,
     source_conditions:null,canonical_product_url:null,
     incoming_link_may_belong_to_other_affiliate:true,
     own_affiliate_url:null,our_affiliate_attribution_verified:false,
     price_verified_current:false,
     publication_allowed:false,
     ingestion_status:"needs_product_resolution_and_price_validation",
     received_at:receivedAt
   });
 }
 return {total:list.length,candidates:list,no_requests:true,no_publication:true};
}
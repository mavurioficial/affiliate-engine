// Shopee's signed affiliate GraphQL response: commercial fields only.
// No platform browsing, no cache, no storage, no Telegram or other side effects.
export type Commercial={id:string;price:number;discount:number;url:string};
export const isAffiliateLink=(text:string)=>{
 try{const u=new URL(text);return u.protocol==="https:"&&
 (u.hostname==="s.shopee.com.br"||u.hostname==="shopee.com.br"||
 u.hostname.endsWith(".shopee.com.br"));}catch{return false;}
};
function hex(b:ArrayBuffer){return Array.from(new Uint8Array(b))
 .map(x=>x.toString(16).padStart(2,"0")).join("");}
export async function fetchCommercialCandidates(appId:string,secret:string){
 if(!(/^[0-9]{5,24}$/).test(appId)||!secret)throw Error("affiliate_api_missing");
 const out=new Map<string,Commercial>();
 for(const [list,sort] of [[2,2],[1,5],[0,1]]){
  const body=JSON.stringify({query:"{ productOfferV2(listType: "+list+
   ", sortType: "+sort+", page: 1, limit: 30) { nodes { itemId priceMin priceDiscountRate offerLink } } }"});
  const ts=Math.floor(Date.now()/1000);
  const signature=hex(await crypto.subtle.digest("SHA-256",
   new TextEncoder().encode(appId+ts+body+secret)));
  const res=await fetch("https://open-api.affiliate.shopee.com.br/graphql",{
   method:"POST",headers:{"content-type":"application/json",
    Authorization:"SHA256 Credential="+appId+", Timestamp="+ts+", Signature="+signature},
   body,signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error("affiliate_api_http");
  const payload=await res.json();
  if(payload?.errors||!Array.isArray(payload?.data?.productOfferV2?.nodes))
   throw Error("affiliate_api_data");
  for(const n of payload.data.productOfferV2.nodes){
   const id=String(n.itemId||""),price=Number(n.priceMin),raw=Number(n.priceDiscountRate);
   const discount=raw>0&&raw<=1?raw*100:raw;
   const url=String(n.offerLink||"");
   if(!(/^\d{1,24}$/).test(id)||!Number.isFinite(price)||price<=0||
      !Number.isFinite(discount)||discount<10||!isAffiliateLink(url))continue;
   if(!out.has(id))out.set(id,{id,price,discount:Math.min(99,Math.round(discount*100)/100),url});
  }
 }
 return [...out.values()].slice(0,80);
}

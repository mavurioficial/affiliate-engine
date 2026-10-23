// One-off Shopee cloud milestone: refresh at most ONE existing product with
// fresh signed affiliate API price/link. Zero INSERTs, delivery jobs, sends or Cron.
import {fetchCommercialCandidates,isAffiliateLink} from "./source.ts";
import {authorizeOwner,readRows,verifyAccount} from "./db.ts";
const cors={"content-type":"application/json; charset=utf-8",
 "cache-control":"no-store","access-control-allow-origin":"https://mavurioficial.github.io",
 "access-control-allow-methods":"POST, OPTIONS",
 "access-control-allow-headers":"authorization,apikey,content-type,x-client-info"};
const reply=(x:Record<string,unknown>,status=200)=>
 new Response(JSON.stringify(x),{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({ok:false,reason:"post_only"},405);
 const base={ok:false,mode:"shopee_commercial_refresh_one",updated:0,
  new_offers:0,delivery_jobs:0,publication_enabled:false,scheduled:false};
 try{
  const input=await req.json().catch(()=>({}));
  if(input?.intent!=="refresh_one_existing_offer"||input?.confirm!==true)
   return reply({...base,reason:"explicit_confirmation_required"},400);
  const ctx=await authorizeOwner(req);
  const appid=String(Deno.env.get("SHOPEE_AFFILIATE_APP_ID")||"").trim();
  const secret=String(Deno.env.get("SHOPEE_AFFILIATE_SECRET")||"");
  const ids=await verifyAccount(ctx,appid);
  const candidates=await fetchCommercialCandidates(appid,secret);
  if(!candidates.length)return reply({...base,ok:true,reason:"no_live_offers"});
  const byId=new Map(candidates.map(x=>[x.id,x]));
  const rows=await readRows(ctx,"flow_offers",{
   select:"id,user_id,marketplace_id,affiliate_account_id,source_ref,price,affiliate_url,mavuri_category_id,mavuri_tags,metadata",
   marketplace_id:"eq."+ids.marketplaceId,
   source_ref:"in.("+candidates.map(x=>x.id).join(",")+")",limit:"250"});
  if(rows.length===250)throw Error("result_limit_ambiguous");
  const tally=new Map<string,number>();
  for(const r of rows)tally.set(String(r.source_ref),(tally.get(String(r.source_ref))||0)+1);
  let inspected=0;
  for(const r of rows){
   const item=String(r.source_ref||"");
   const fresh=byId.get(item);
   if(!fresh||tally.get(item)!==1||r.user_id!==ctx.owner||
    r.marketplace_id!==ids.marketplaceId||r.affiliate_account_id!==ids.accountId||
    !r.mavuri_category_id||!Array.isArray(r.mavuri_tags)||
    typeof r.metadata?.mavuri?.category_slug!=="string")
     continue;
   inspected++;
   const oldPrice=Number(r.price),oldLink=String(r.affiliate_url||"");
   if(!Number.isFinite(oldPrice)||oldPrice<=0||
    fresh.price<oldPrice*0.30||fresh.price>oldPrice*3||
    !isAffiliateLink(oldLink)||!isAffiliateLink(fresh.url)||
    (fresh.price===oldPrice&&fresh.url===oldLink))continue;
   const inFlight=await readRows(ctx,"flow_delivery_jobs",{
    select:"id",offer_id:"eq."+String(r.id),
    status:"in.(queued,processing)",limit:"1"});
   if(inFlight.length)continue;
   const patchUrl=new URL(ctx.base+"/rest/v1/flow_offers");
   for(const [k,v] of Object.entries({id:"eq."+String(r.id),
     user_id:"eq."+ctx.owner,marketplace_id:"eq."+ids.marketplaceId,
     affiliate_account_id:"eq."+ids.accountId,
     price:"eq."+String(r.price),affiliate_url:"eq."+oldLink}))
    patchUrl.searchParams.set(k,v);
   const response=await fetch(patchUrl,{
    method:"PATCH",headers:{...ctx.headers,
     "content-type":"application/json",Prefer:"return=representation"},
    // Commercial fields only. Never overwrite reviews, category, tags,
    // offer title, captured manual decisions or original metadata.
    body:JSON.stringify({price:fresh.price,affiliate_url:fresh.url,
     discount_percent:fresh.discount,captured_at:new Date().toISOString()}),
    signal:AbortSignal.timeout(9000)});
   if(!response.ok)throw Error("patch_rejected");
   const updated=await response.json();
   if(!Array.isArray(updated)||updated.length!==1)throw Error("write_conflict");
   return reply({...base,ok:true,candidates:candidates.length,inspected,updated:1});
  }
  return reply({...base,ok:true,candidates:candidates.length,inspected,
   reason:"no_safe_stale_row"});
 }catch(e){
  // Deliberately do not log query data, product details, account IDs or links.
  console.error("[shopee-refresh-one] blocked");
  return reply({...base,reason:"operation_failed"},500);
 }
});

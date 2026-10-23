// Owner-only single Shopee pilot, General Telegram channel only.
// Preview is default. Publishing needs explicit intent and confirm=true.
// No cron, no WhatsApp, no external Mercado Livre connections.
import {authorizeOwner,readRows,verifyAccount} from "./db.ts";
import {fetchCommercialCandidates} from "./source.ts";
import {chooseOne} from "./policy.ts";
const hdr={"content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "access-control-allow-origin":"https://mavurioficial.github.io",
 "access-control-allow-methods":"POST,OPTIONS",
 "access-control-allow-headers":"authorization,apikey,content-type,x-client-info"};
const reply=(v:Record<string,unknown>,status=200)=>
 new Response(JSON.stringify(v),{status,headers:hdr});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:hdr});
 if(req.method!=="POST")return reply({ok:false,reason:"post_only"},405);
 const status={ok:false,ready:false,created:0,sent:0,
  destination:"Mavuri Ofertas",cloud_schedule:false,whatsapp:false};
 try{
  const payload=await req.json().catch(()=>({}));
  const intent=String(payload?.intent||"preview");
  if(!["preview","publish_single_general"].includes(intent))
   return reply({...status,reason:"invalid_intent"},400);
  if(intent==="publish_single_general"&&payload?.confirm!==true)
   return reply({...status,reason:"explicit_confirmation_required"},400);
  const ctx=await authorizeOwner(req);
  const appid=String(Deno.env.get("SHOPEE_AFFILIATE_APP_ID")||"").trim();
  const secret=String(Deno.env.get("SHOPEE_AFFILIATE_SECRET")||"");
  const identity=await verifyAccount(ctx,appid);
  const [channels,rules,categories]=await Promise.all([
   readRows(ctx,"flow_channels",{select:"id,user_id,type,name,status,external_ref",
    user_id:"eq."+ctx.owner,type:"eq.telegram",limit:"20"}),
   readRows(ctx,"flow_rules",{select:"id,name,conditions,actions,enabled",
    user_id:"eq."+ctx.owner,enabled:"eq.true",limit:"100"}),
   readRows(ctx,"mavuri_categories",{select:"id,slug,active",active:"eq.true",limit:"200"})
  ]);
  const matching=channels.filter((c:any)=>c.name==="Mavuri Ofertas"&&
   c.status==="connected"&&String(c.external_ref||"").trim()!=="");
  if(matching.length!==1)throw Error("general_channel_invalid");
  const general=matching[0];
  const offers=await fetchCommercialCandidates(appid,secret);
  if(!offers.length)return reply({...status,ok:true,reason:"api_no_offers"});
  const stored=await readRows(ctx,"flow_offers",{
   select:"id,user_id,marketplace_id,affiliate_account_id,source_ref,title,price,affiliate_url,image_url,mavuri_category_id,mavuri_tags,metadata",
   marketplace_id:"eq."+identity.marketplaceId,
   source_ref:"in.("+offers.map(x=>x.id).join(",")+")",limit:"250"});
  if(stored.length>=250)throw Error("offers_ambiguous");
  const chosen=chooseOne({candidates:offers,stored,categories,rules,general,
   owner:ctx.owner,marketplace:identity.marketplaceId,account:identity.accountId});
  if(!chosen)return reply({...status,ok:true,reason:"no_matching_current_offer"});
  const active=await readRows(ctx,"flow_delivery_jobs",{
   select:"id",user_id:"eq."+ctx.owner,
   status:"in.(queued,processing)",limit:"2"});
  if(active.length)return reply({...status,ok:true,reason:"other_jobs_pending"});
  const since=new Date(Date.now()-48*60*60*1000).toISOString();
  const previous=await readRows(ctx,"flow_delivery_jobs",{
   select:"id",user_id:"eq."+ctx.owner,
   offer_id:"eq."+chosen.offerId,channel_id:"eq."+chosen.channelId,
   status:"eq.sent",sent_at:"gte."+since,limit:"1"});
  if(previous.length)return reply({...status,ok:true,reason:"cooldown_48h"});
  // One-shot route doesn't enable cloud Discovery. It uses existing worker.
  if(intent==="preview")return reply({...status,ok:true,ready:true,
   candidate_count:offers.length,validated_destination:1,mode:"preview"});
  const jobKey="shopee-manual-test:cloud-pilot:20261023:"+
    chosen.itemId+":"+chosen.channelId;
  const u=new URL(ctx.base+"/rest/v1/flow_delivery_jobs");
  const created=await fetch(u,{method:"POST",headers:{...ctx.headers,
    "content-type":"application/json",Prefer:"return=representation"},
   body:JSON.stringify({user_id:ctx.owner,offer_id:chosen.offerId,
    channel_id:chosen.channelId,status:"queued",attempts:0,
    scheduled_for:new Date().toISOString(),delivery_key:jobKey}),
   signal:AbortSignal.timeout(9000)});
  if(!created.ok)throw Error("queue_rejected");
  const jobs=await created.json();
  if(!Array.isArray(jobs)||jobs.length!==1)throw Error("queue_not_confirmed");
  status.created=1;
  const jobId=String(jobs[0].id||"");
  if(!jobId)throw Error("queue_no_id");
  // Verify DB trigger did not fan out into additional destinations.
  const inflight=await readRows(ctx,"flow_delivery_jobs",{
   select:"id",user_id:"eq."+ctx.owner,
   status:"in.(queued,processing)",limit:"3"});
  if(inflight.length!==1||inflight[0].id!==jobId)
   throw Error("fanout_or_concurrency_detected");
  const worker=await fetch(ctx.base+"/functions/v1/flow-worker",{
   method:"POST",headers:{...ctx.headers,
    "content-type":"application/json"},
   body:JSON.stringify({limit:1}),signal:AbortSignal.timeout(55000)});
  if(!worker.ok)throw Error("worker_failed");
  const final=await readRows(ctx,"flow_delivery_jobs",{
   select:"status",id:"eq."+jobId,user_id:"eq."+ctx.owner,limit:"1"});
  const logs=await readRows(ctx,"flow_delivery_logs",{
   select:"id",delivery_job_id:"eq."+jobId,
   status:"eq.sent",limit:"1"});
  status.sent=final.length===1&&final[0].status==="sent"&&logs.length===1?1:0;
  return reply({...status,ok:status.sent===1,ready:true,
    mode:"publish_single_general",reason:status.sent===1?"sent":"not_confirmed"});
 }catch(e){
  // Do not expose account, product, channel IDs, prices, links or tokens.
  console.error("[shopee-single-pilot] blocked");
  return reply({...status,reason:"operation_failed"},500);
 }
});

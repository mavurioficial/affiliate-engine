// Owner-only single Shopee pilot, General Telegram channel only.
// Preview is default. Publishing needs explicit intent and confirm=true.
// No cron, no WhatsApp, no external Mercado Livre connections.
import {authorizeOwner,readRows,verifyAccount} from "./db.ts";
import {fetchCommercialCandidates} from "./source.ts";
import {chooseOne} from "./policy.ts";
import {planFourChannelCycle} from "./cycle-plan.mjs";
const hdr={"content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "access-control-allow-origin":"https://mavurioficial.github.io",
 "access-control-allow-methods":"POST,OPTIONS",
 "access-control-allow-headers":"authorization,apikey,content-type,x-client-info"};
const reply=(v:Record<string,unknown>,status=200)=>
 new Response(JSON.stringify(v),{status,headers:hdr});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:hdr});
 if(req.method!=="POST")return reply({ok:false,reason:"post_only"},405);
 let stage="request";
 const status={ok:false,ready:false,created:0,sent:0,
  destination:"Mavuri Ofertas",cloud_schedule:false,whatsapp:false};
 try{
  const payload=await req.json().catch(()=>({}));
  const intent=String(payload?.intent||"preview");
  if(!["diagnose_preinsert","cycle_preview"].includes(intent))
   return reply({...status,reason:"invalid_intent"},400);
  stage="auth";
  const ctx=await authorizeOwner(req);
  const appid=String(Deno.env.get("SHOPEE_AFFILIATE_APP_ID")||"").trim();
  const secret=String(Deno.env.get("SHOPEE_AFFILIATE_SECRET")||"");
  stage="account";
  const identity=await verifyAccount(ctx,appid);
  stage="configuration";
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
  stage="api";
  const offers=await fetchCommercialCandidates(appid,secret);
  if(!offers.length)return reply({...status,ok:true,reason:"api_no_offers"});
  stage="offer_lookup";
  const stored=await readRows(ctx,"flow_offers",{
   select:"id,user_id,marketplace_id,affiliate_account_id,source_ref,title,price,affiliate_url,image_url,mavuri_category_id,mavuri_tags,metadata",
   marketplace_id:"eq."+identity.marketplaceId,
   source_ref:"in.("+offers.map(x=>x.id).join(",")+")",limit:"250"});
  if(stored.length>=250)throw Error("offers_ambiguous");
  if(intent==="cycle_preview"){
    stage="cycle_four_channels";
    const ids=[...new Set(stored.map((r:any)=>String(r.id||""))
      .filter((id:string)=>/^[0-9a-f-]{36}$/i.test(id)))];
    let recent:Record<string,any>[]=[],inflight:Record<string,any>[]=[];
    if(ids.length){
      const filter="in.("+ids.join(",")+")";
      const cutoff=new Date(Date.now()-48*3600000).toISOString();
      [recent,inflight]=await Promise.all([
        readRows(ctx,"flow_delivery_jobs",{select:"offer_id,channel_id,status,sent_at",
          user_id:"eq."+ctx.owner,offer_id:filter,status:"eq.sent",
          sent_at:"gte."+cutoff,limit:"900"}),
        readRows(ctx,"flow_delivery_jobs",{select:"offer_id,channel_id,status",
          user_id:"eq."+ctx.owner,offer_id:filter,
          status:"in.(queued,processing)",limit:"900"})
      ]);
      if(recent.length>=900||inflight.length>=900)throw Error("cycle_history_incomplete");
    }
    const cycle=planFourChannelCycle({candidates:offers,stored,categories,
      channels,rules,history:recent,pending:inflight,owner:ctx.owner,
      marketplace:identity.marketplaceId,account:identity.accountId,
      now:Date.now(),maxUnique:8});
    const perChannel=Object.fromEntries(channels.filter((c:any)=>
      ["Mavuri Ofertas","Mavuri Mulher","Mavuri Casa & Cozinha","Mavuri Tecnologia"]
        .includes(c.name)).map((c:any)=>[c.name,
          cycle.jobs.filter((j:any)=>j.channel_id===String(c.id)).length]));
    return reply({...status,ok:true,ready:cycle.ready,mode:"cycle_preview",
      dry_run:true,publication_available:false,schedule_enabled:false,
      scanned:offers.length,selected_unique:cycle.counts.selected,
      projected_jobs:cycle.counts.jobs,by_channel:perChannel,
      blocked:cycle.reason,counters:cycle.counts});
  }
  stage="select_offer";
  const chosen=chooseOne({candidates:offers,stored,categories,rules,general,
   owner:ctx.owner,marketplace:identity.marketplaceId,account:identity.accountId});
  if(!chosen)return reply({...status,ok:true,reason:"no_matching_current_offer"});
  // Independent read-only checks run together; don't add an extra serial
  // database round trip after the global pending check.
  stage="pending_and_history";
  const [active,priorRows]=await Promise.all([
   readRows(ctx,"flow_delivery_jobs",{
    select:"id",user_id:"eq."+ctx.owner,
    status:"in.(queued,processing)",limit:"2"}),
   readRows(ctx,"flow_delivery_jobs",{
    select:"id,sent_at",user_id:"eq."+ctx.owner,
    offer_id:"eq."+chosen.offerId,channel_id:"eq."+chosen.channelId,
    status:"eq.sent",order:"sent_at.desc",limit:"10"})
  ]);
  if(active.length)return reply({...status,ok:true,reason:"other_jobs_pending"});
  const cutoff=Date.now()-48*60*60*1000;
  if(priorRows.some(r=>Number.isFinite(Date.parse(String(r.sent_at||""))) &&
     Date.parse(String(r.sent_at))>=cutoff))
    return reply({...status,ok:true,reason:"cooldown_48h"});
  return reply({...status,ok:true,ready:true,mode:"diagnose_preinsert",
    candidate_count:offers.length,publication_available:false});
 }catch(e){
  // Do not expose account, product, channel IDs, prices, links or tokens.
  const reason=e instanceof Error?e.message:"unexpected";
  const allowed=new Set(["read_error","invalid_db_data","ambiguous_marketplace",
    "ambiguous_account","affiliate_unverified","affiliate_api_missing",
    "affiliate_api_http","affiliate_api_data","general_channel_invalid",
    "offers_ambiguous"]);
  const safeReason=allowed.has(reason)?reason:"operation_failed";
  console.error("[shopee-single-pilot] "+safeReason+" stage="+stage);
  return reply({...status,reason:safeReason,stage},500);
 }
});

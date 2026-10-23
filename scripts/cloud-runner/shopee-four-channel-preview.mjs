#!/usr/bin/env node
// Authenticated, read-only Shopee cycle preview across four channels. Never queues.
import {unpackageMavuriAuthState} from "./auth-state.mjs";
const out={mode:"shopee_four_channel_cycle_preview",read_only:true,
 owner_auth:false,ok:false,ready:false,created:0,sent:0,
 scanned:null,selected_unique:null,projected_jobs:null,by_channel:null,counters:null,refresh_projection:null,cloud_schedule:false,whatsapp:false,reason:null};
let browser,ctx;
try{
 if(process.env.MAVURI_CLOUD_LIVE_ENABLED!=="NO"||
   process.env.MAVURI_AUTO_INGEST!=="false")throw Error("disabled");
 const state=unpackageMavuriAuthState(
   process.env.MAVURI_AUTH_BUNDLE||"",process.env.MAVURI_AUTH_KEY||"");
 const root="https://mavurioficial.github.io";
 const owners=state.origins.filter(x=>x.origin===root);
 if(owners.length!==1||owners[0].localStorage.length===0)throw Error("no_session");
 const {chromium}=await import("playwright-core");
 browser=await chromium.launch({channel:"chrome",headless:true,
  args:["--no-sandbox","--disable-dev-shm-usage","--disable-background-networking"]});
 ctx=await browser.newContext({storageState:{origins:owners,cookies:
   state.cookies.filter(x=>/^(?:\.)?mavurioficial\.github\.io$/i.test(x.domain))}});
 const p=await ctx.newPage();
 const response=await p.goto(root+"/affiliate-engine/",
  {waitUntil:"domcontentloaded",timeout:15000});
 if(response?.status()!==200)throw Error("mavuri_site_unavailable");
 const result=await p.evaluate(async()=>{
  try{
   const {supabase}=await import("/affiliate-engine/src/app/auth.js");
   const user=await supabase.auth.getUser();
   if(user.error||!user.data?.user?.id)return {owner_auth:false};
   const {data,error}=await supabase.functions.invoke("discovery-cloud-shopee-diagnostic",
     {body:{intent:"cycle_preview"}});
   if(error)return {owner_auth:true,ok:false,reason:"function_invocation_failed"};
   return {owner_auth:true,ok:data?.ok===true,ready:data?.ready===true,
    scanned:Number.isSafeInteger(data?.scanned)?data.scanned:null,
    selected_unique:Number.isSafeInteger(data?.selected_unique)?data.selected_unique:null,
    projected_jobs:Number.isSafeInteger(data?.projected_jobs)?data.projected_jobs:null,
    by_channel:data?.by_channel||null,
    counters:data?.counters&&typeof data.counters==='object'?Object.fromEntries(
      Object.entries(data.counters).filter(([k,v])=>/^[A-Za-z]+$/.test(k)&&Number.isSafeInteger(v))):null,
    refresh_projection:data?.refresh_projection?{
      simulated_only:data.refresh_projection.simulated_only===true,
      would_refresh:Number(data.refresh_projection.would_refresh||0),
      price_movement_blocked:Number(data.refresh_projection.price_movement_blocked||0),
      unmatched:Number(data.refresh_projection.unmatched||0),
      projected_unique:Number(data.refresh_projection.projected_unique||0),
      projected_jobs:Number(data.refresh_projection.projected_jobs||0)
    }:null,
    created:data?.created,sent:data?.sent,cloud_schedule:data?.cloud_schedule,
    whatsapp:data?.whatsapp,reason:data?.reason||null};
  }catch{return {owner_auth:false,reason:"preview_error"}}
 });
 Object.assign(out,result);
 if(!out.owner_auth||!out.ok||!out.ready||out.created!==0||out.sent!==0||
   out.cloud_schedule!==false||out.whatsapp!==false)
  throw Error("unsafe_preview");
}catch{
 out.ok=false;out.reason=out.reason||"preview_failed";process.exitCode=1;
}finally{
 try{await ctx?.close()}catch{}
 try{await browser?.close()}catch{}
 console.log(JSON.stringify(out,null,2));
}

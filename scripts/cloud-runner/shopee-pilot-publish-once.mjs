#!/usr/bin/env node
// One explicit, owner-authenticated live Shopee publication to Mavuri Ofertas.
// No Cron, no ML browser, no WhatsApp. Output contains only aggregate numbers.
import {unpackageMavuriAuthState} from "./auth-state.mjs";
const result={operation:"shopee_pilot_publish_single_general",owner_authenticated:false,
 ok:false,created:0,sent:0,destination:"Mavuri Ofertas",cloud_schedule:false,
 whatsapp:false,reason:null};
let browser,context;
try{
 if(process.env.MAVURI_PILOT_LIVE!=="AUTHORIZE_EXACTLY_ONE_GENERAL"||
    process.env.MAVURI_AUTO_INGEST!=="false"||
    process.env.MAVURI_CLOUD_LIVE_ENABLED!=="NO")
   throw Error("operator_guard_missing");
 const state=unpackageMavuriAuthState(
   process.env.MAVURI_AUTH_BUNDLE||"",process.env.MAVURI_AUTH_KEY||"");
 const origin="https://mavurioficial.github.io";
 const origins=state.origins.filter(x=>x.origin===origin);
 if(origins.length!==1||origins[0].localStorage.length===0)
  throw Error("mavuri_session_missing");
 const {chromium}=await import("playwright-core");
 browser=await chromium.launch({channel:"chrome",headless:true,
  args:["--no-sandbox","--disable-dev-shm-usage","--disable-background-networking"]});
 context=await browser.newContext({storageState:{origins,
  cookies:state.cookies.filter(x=>/^(?:\.)?mavurioficial\.github\.io$/i.test(x.domain))}});
 const page=await context.newPage();
 const response=await page.goto(origin+"/affiliate-engine/",
   {waitUntil:"domcontentloaded",timeout:15000});
 if(response?.status()!==200)throw Error("mavuri_site_unavailable");
 const payload=await page.evaluate(async()=>{
  try{
   const {supabase}=await import("/affiliate-engine/src/app/auth.js");
   const account=await supabase.auth.getUser();
   if(account.error||!account.data?.user?.id)return {owner_authenticated:false};
   const {data,error}=await supabase.functions.invoke(
    "discovery-cloud-shopee-pilot",
    {body:{intent:"publish_single_general",confirm:true}});
   return {owner_authenticated:true,
    ok:error?false:data?.ok===true,
    created:Number(data?.created),sent:Number(data?.sent),
    cloud_schedule:data?.cloud_schedule===true,
    whatsapp:data?.whatsapp===true,reason:String(data?.reason||"")};
  }catch{return {owner_authenticated:false,reason:"invocation_failed"}}
 });
 Object.assign(result,payload);
 if(!result.owner_authenticated||!result.ok||result.created!==1||
    result.sent!==1||result.cloud_schedule||result.whatsapp)
    throw Error("publication_not_confirmed");
}catch{
 result.ok=false;result.reason=result.reason||"pilot_failed";process.exitCode=1;
}finally{
 try{await context?.close()}catch{}
 try{await browser?.close()}catch{}
 console.log(JSON.stringify(result,null,2));
}

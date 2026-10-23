#!/usr/bin/env node
// Protected one-shot owner operation. Exactly one commercial refresh, zero sends.
import {unpackageMavuriAuthState} from "./auth-state.mjs";
const result={operation:"shopee_existing_one_refresh",owner_authenticated:false,
 ok:false,updated:0,new_offers:0,delivery_jobs:0,
 publication_enabled:false,scheduled:false,reason:null};
let browser,context;
try{
 if(process.env.MAVURI_CLOUD_LIVE_ENABLED!=="NO"||
    process.env.MAVURI_AUTO_INGEST!=="false"||
    process.env.MAVURI_SHOPEE_ONE_REFRESH!=="EXPLICIT_ONE_RECORD")
  throw Error("guard_not_set");
 const bundle=process.env.MAVURI_AUTH_BUNDLE||"";
 const key=process.env.MAVURI_AUTH_KEY||"";
 if(!bundle||!key)throw Error("private_session_unavailable");
 const state=unpackageMavuriAuthState(bundle,key);
 const root="https://mavurioficial.github.io";
 const mavuri=state.origins.filter(o=>o.origin===root);
 if(mavuri.length!==1||!mavuri[0].localStorage.length)
  throw Error("mavuri_session_unavailable");
 const {chromium}=await import("playwright-core");
 browser=await chromium.launch({channel:"chrome",headless:true,
  args:["--no-sandbox","--disable-dev-shm-usage","--disable-background-networking"]});
 context=await browser.newContext({storageState:{origins:mavuri,
  cookies:state.cookies.filter(c=>/^(?:\.)?mavurioficial\.github\.io$/i.test(c.domain))}});
 const page=await context.newPage();
 const response=await page.goto(root+"/affiliate-engine/",
  {waitUntil:"domcontentloaded",timeout:15000});
 if(response?.status()!==200)throw Error("site_unavailable");
 const answer=await page.evaluate(async()=>{
  try{
   const {supabase}=await import("/affiliate-engine/src/app/auth.js");
   const me=await supabase.auth.getUser();
   if(me.error||!me.data?.user?.id)return {authenticated:false};
   const {data,error}=await supabase.functions.invoke(
    "discovery-cloud-shopee-refresh-one",
    {body:{intent:"refresh_one_existing_offer",confirm:true}});
   // Only safe aggregate fields. No product title, price, URL or user ID.
   return {authenticated:true,ok:error?false:data?.ok===true,
    updated:Number(data?.updated),new_offers:Number(data?.new_offers),
    delivery_jobs:Number(data?.delivery_jobs),
    publication_enabled:data?.publication_enabled===true,
    scheduled:data?.scheduled===true,
    reason:typeof data?.reason==="string"?data.reason:null};
  }catch{return {authenticated:false,reason:"browser_function_error"}}
 });
 result.owner_authenticated=answer.authenticated===true;
 result.ok=answer.ok===true;
 result.updated=answer.updated;
 result.new_offers=answer.new_offers;
 result.delivery_jobs=answer.delivery_jobs;
 result.publication_enabled=answer.publication_enabled;
 result.scheduled=answer.scheduled;
 result.reason=answer.reason;
 if(!result.owner_authenticated||!result.ok||
   !Number.isSafeInteger(result.updated)||result.updated<0||result.updated>1||
   result.new_offers!==0||result.delivery_jobs!==0||
   result.publication_enabled||result.scheduled)
  throw Error("one_off_refresh_failed");
}catch{
 result.ok=false;
 result.reason=result.reason||"guard_or_invocation_failed";
 process.exitCode=1;
}finally{
 try{await context?.close()}catch{}
 try{await browser?.close()}catch{}
 console.log(JSON.stringify(result,null,2));
}

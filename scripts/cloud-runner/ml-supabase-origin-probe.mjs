#!/usr/bin/env node
// Authenticated, public read-only ML origin test FROM Supabase Edge. No ML session or links.
import {unpackageMavuriAuthState} from "./auth-state.mjs";
const out={mode:"ml_supabase_public_origin_probe",read_only:true,
 owner_auth:false,ok:false,sites_api:null,currency_api:null,public_home:null,hub_guest:null,affiliate_links_route:null,
 generated_links:0,posts:0,reason:null};
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
   const {data,error}=await supabase.functions.invoke("discovery-cloud-ml-origin-probe",
     {body:{mode:"public_origin_probe"}});
   if(error)return {owner_auth:true,ok:false,reason:"function_invocation_failed"};
   const outcomes=Array.isArray(data?.results)?data.results:[];
   const status=(target)=>{const x=outcomes.find(z=>z.target===target);return x?{
    http_status:x.http_status,denied:x.denied,redirected:x.redirected,
    network_error:x.network_error}:null};
   return {owner_auth:true,ok:data?.ok===true,read_only:data?.read_only===true,
    sites_api:status("public_sites_api"),currency_api:status("public_currency_api"),
    public_home:status("public_home"),hub_guest:status("affiliate_hub_guest"),
    affiliate_links_route:status("affiliate_links_route_get"),
    generated_links:data?.generated_links,posts:data?.posts,
    database_writes:data?.database_writes,reason:data?.reason||null};
  }catch{return {owner_auth:false,reason:"preview_error"}}
 });
 Object.assign(out,result);
 if(!out.owner_auth||!out.ok||!out.read_only||out.generated_links!==0||
   out.posts!==0||out.database_writes!==0)
  throw Error("unsafe_origin_probe");
}catch{
 out.ok=false;out.reason=out.reason||"origin_probe_failed";process.exitCode=1;
}finally{
 try{await ctx?.close()}catch{}
 try{await browser?.close()}catch{}
 console.log(JSON.stringify(out,null,2));
}

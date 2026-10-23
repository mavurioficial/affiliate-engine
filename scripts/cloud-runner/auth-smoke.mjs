#!/usr/bin/env node
// Mavuri authenticated Chrome smoke. STRICTLY READ-ONLY.
// Loads an ephemeral browser state from GitHub secrets, never writes DB,
// never calls ingest, createLink, Telegram, WhatsApp, or coupon flows.
import {chromium} from "playwright-core";
import {unpackageMavuriAuthState} from "./auth-state.mjs";
const bundle=process.env.MAVURI_AUTH_BUNDLE||"";
const key=process.env.MAVURI_AUTH_KEY||"";
if(!bundle||!key){
 console.log(JSON.stringify({ok:false,safe_mode:"read_only",
   reason:"github_actions_auth_secrets_missing"}));
 process.exit(78);
}
let browser,context;
const report={
 ok:false,safe_mode:"read_only",no_publication:true,private_state_not_logged:true,
 meli_hub_status:null,meli_host:null,meli_login_redirection:false,
 mavuri_login_status:null,mavuri_supabase_user_confirmed:false,
 error:null
};
try{
 const state=unpackageMavuriAuthState(bundle,key);
 if(!state.cookies.some(c=>String(c.domain).includes("mercadolivre.com.br")) ||
    !state.origins.some(o=>o.origin==="https://mavurioficial.github.io"))
   throw Error("stored_auth_missing_ml_or_mavuri");
 const path=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable",
   "/usr/bin/chromium"].find(()=>false);
 browser=await chromium.launch({channel:"chrome",headless:true,
   args:["--no-sandbox","--disable-dev-shm-usage",
     "--disable-background-networking","--disable-extensions"]});
 context=await browser.newContext({storageState:state});
 const hub=await context.newPage();
 try{
   const response=await hub.goto(
     "https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user",
     {waitUntil:"domcontentloaded",timeout:18000});
   report.meli_hub_status=response?.status()??null;
   const current=new URL(hub.url());
   report.meli_host=current.hostname==="www.mercadolivre.com.br"?
     "mercadolivre.com.br":"other";
   report.meli_login_redirection=/login|signin|entrar|account/i.test(
     current.pathname);
 }catch(e){report.error="ml_navigation_"+String(e?.name||"failure").slice(0,30)}
 await hub.close();
 const page=await context.newPage();
 try{
   const response=await page.goto(
     "https://mavurioficial.github.io/affiliate-engine/entrar/",
     {waitUntil:"domcontentloaded",timeout:14000});
   report.mavuri_login_status=response?.status()??null;
   if(report.mavuri_login_status===200){
     report.mavuri_supabase_user_confirmed=await page.evaluate(async()=>{
       try{
         const {supabase}=await import("/affiliate-engine/src/app/auth.js");
         const result=await supabase.auth.getUser();
         return Boolean(!result.error&&result.data?.user?.id);
       }catch{return false}
     });
   }
 }catch(e){report.error=report.error||"mavuri_navigation_"+String(e?.name||"failure").slice(0,30)}
 await page.close();
 report.ok=report.meli_hub_status===200&&
   !report.meli_login_redirection&&report.mavuri_supabase_user_confirmed;
 if(!report.ok)process.exitCode=1;
}catch(e){
 report.error=String(e?.message||"auth_smoke_error").slice(0,110);
 process.exitCode=1;
}finally{
 try{await context?.close()}catch{}
 try{await browser?.close()}catch{}
 // No screenshots, HAR, traces, artifacts or page contents are written.
 console.log(JSON.stringify(report,null,2));
}

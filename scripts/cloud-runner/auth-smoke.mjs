#!/usr/bin/env node
// Mavuri authenticated Chrome smoke. STRICTLY READ-ONLY.
// Loads an ephemeral browser state from GitHub secrets, never writes DB,
// never invokes ingest, affiliate-link creation, Telegram, WhatsApp or coupons.
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
 meli_home_status:null,meli_403_scope:"not_checked",
 mavuri_login_status:null,mavuri_supabase_user_confirmed:false,
 shopee_preview_requested:process.env.MAVURI_SHOPEE_PREVIEW==="1",
 shopee_preview:{attempted:false,ok:false,read_only:true,
   candidate_count:null,projected_unique_offers:null,
   category_known:null,category_unknown:null,error_code:null},
 error:null
};
try{
 const state=unpackageMavuriAuthState(bundle,key);
 const {chromium}=await import("playwright-core");
 if(!state.cookies.some(c=>String(c.domain).includes("mercadolivre.com.br")) ||
    !state.origins.some(o=>o.origin==="https://mavurioficial.github.io"))
   throw Error("stored_auth_missing_ml_or_mavuri");
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
 // A 403 at the Hub may mean denied IP, invalid session, missing
 // authorization or an anti-abuse challenge. Never try to bypass it.
 // Compare against the ordinary storefront with the SAME restored context
 // and expose only coarse response status (no body, cookies or redirects).
 if(report.meli_hub_status===403){
   const home=await context.newPage();
   try{
     const res=await home.goto("https://www.mercadolivre.com.br/",{
       waitUntil:"domcontentloaded",timeout:14000});
     report.meli_home_status=res?.status()??null;
   }catch{report.meli_home_status=null}
   finally{await home.close()}
   report.meli_403_scope=report.meli_home_status===403?"both_requests_403":
     report.meli_home_status===200?"hub_only_403":"undetermined";
 }else report.meli_403_scope="no_hub_403";
 await hub.close();
 const page=await context.newPage();
 try{
   const response=await page.goto(
     "https://mavurioficial.github.io/affiliate-engine/",
     {waitUntil:"domcontentloaded",timeout:14000});
   report.mavuri_login_status=response?.status()??null;
   if(report.mavuri_login_status===200){
     const verified=await page.evaluate(async()=>{
       try{
         const {supabase}=await import("/affiliate-engine/src/app/auth.js");
         const result=await supabase.auth.getUser();
         return Boolean(!result.error&&result.data?.user?.id);
       }catch{return false}
     });
     report.mavuri_supabase_user_confirmed=verified;
     // The currently deployed discovery-cloud-shopee v16 general_audit endpoint
     // is a READ-ONLY owner-scoped preview: no DB writes, jobs, or Telegram.
     // No V85 runner is executed here. Only numerical aggregates are exposed.
     if(verified&&report.shopee_preview_requested){
       report.shopee_preview.attempted=true;
       report.shopee_preview=await page.evaluate(async()=>{
         try{
           const {supabase}=await import("/affiliate-engine/src/app/auth.js");
           const {data,error}=await supabase.functions.invoke(
             "discovery-cloud-shopee",{body:{mode:"general_audit"}});
           if(error||!data?.ok||data?.dry_run!==true||
              data?.cloud_publishing!==false||data?.cloud_schedule!==false){
             return {attempted:true,ok:false,read_only:true,
               candidate_count:null,projected_unique_offers:null,
               category_known:null,category_unknown:null,
               error_code:error?"function_invocation_failed":"unexpected_preview_response"};
           }
           const safeInt=(n)=>Number.isSafeInteger(n)&&n>=0?n:null;
           return {attempted:true,ok:true,read_only:true,
             candidate_count:safeInt(data.candidates_considered),
             projected_unique_offers:safeInt(data.projected_unique_offers),
             category_known:safeInt(data.db_category_impact?.effective_categories_available),
             category_unknown:safeInt(data.db_category_impact?.unknown_final_categories),
             error_code:null};
         }catch{
           return {attempted:true,ok:false,read_only:true,
             candidate_count:null,projected_unique_offers:null,
             category_known:null,category_unknown:null,
             error_code:"browser_preview_failed"};
         }
       });
     }
   }
 }catch(e){report.error=report.error||"mavuri_navigation_"+String(e?.name||"failure").slice(0,30)}
 await page.close();
 report.ok=report.meli_hub_status===200&&
   !report.meli_login_redirection&&report.mavuri_supabase_user_confirmed&&
   (!report.shopee_preview_requested||report.shopee_preview.ok);
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

#!/usr/bin/env node
// Owner authorized OAuth health probe through the existing Mavuri user session.
// Does not export cookies, tokens or sensitive headers, and never posts offers.
import { unpackageMavuriAuthState } from './auth-state.mjs';
const APP='https://mavurioficial.github.io/affiliate-engine/';
const FN='https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/meli-auth?action=status';
const report={test:'mercadolivre_oauth_cloud_health',mavuri_owner_auth:false,
 status_endpoint_http:null,oauth_connected:false,oauth_expires_in_future:false,
 affiliate_user_matches:false,oauth_can_refresh:false,no_publication:true,
 reason:null};
let browser,context;
try{
 const state=unpackageMavuriAuthState(process.env.MAVURI_AUTH_BUNDLE||'',
  process.env.MAVURI_AUTH_KEY||'');
 const origin='https://mavurioficial.github.io';
 const valid=state.origins.filter(x=>x.origin===origin);
 if(valid.length!==1 || valid[0].localStorage.length===0)throw Error('owner_session_not_available');
 const {chromium}=await import('playwright-core');
 browser=await chromium.launch({channel:'chrome',headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions']});
 context=await browser.newContext({storageState:{origins:valid,cookies:state.cookies.filter(c=>
  String(c.domain||'').replace(/^\./,'')==='mavurioficial.github.io')},locale:'pt-BR'});
 const page=await context.newPage();
 const resp=await page.goto(APP,{waitUntil:'domcontentloaded',timeout:16000});
 if(resp?.status()!==200)throw Error('mavuri_site_unavailable');
 const result=await page.evaluate(async(fn)=>{
  try{
   const {supabase}=await import('/affiliate-engine/src/app/auth.js');
   const user=await supabase.auth.getUser();
   if(user.error||!user.data?.user)return{owner:false};
   const session=await supabase.auth.getSession();
   const token=session.data?.session?.access_token;
   if(!token)return{owner:true,status:0,reason:'no_access_token'};
   const response=await fetch(fn,{method:'GET',headers:{authorization:'Bearer '+token,'accept':'application/json'}});
   let data={};try{data=await response.json()}catch{}
   return{owner:true,status:response.status,connected:data.connected===true,
    account_ok:String(data.external_account_id||'')==='15717649',
    expiry_ok:Number(new Date(data.expires_at||0))>Date.now()+60000};
  }catch{return{owner:false,reason:'owner_api_call_failed'}}
 },FN);
 report.mavuri_owner_auth=result.owner===true;
 report.status_endpoint_http=result.status??null;
 report.oauth_connected=result.connected===true;
 report.oauth_expires_in_future=result.expiry_ok===true;
 report.affiliate_user_matches=result.account_ok===true;
 report.oauth_can_refresh=report.oauth_connected&&report.oauth_expires_in_future&&report.affiliate_user_matches;
 if(!report.oauth_can_refresh)report.reason=result.reason||'oauth_refresh_or_owner_authorization_failed';
}catch(e){
 const known=['owner_session_not_available','mavuri_site_unavailable'];
 report.reason=known.includes(e?.message)?e.message:'owner_browser_probe_failed';
}finally{
 try{await context?.close()}catch{}
 try{await browser?.close()}catch{}
 console.log(JSON.stringify(report,null,2));
 if(!report.oauth_can_refresh)process.exitCode=1;
}
#!/usr/bin/env node
// Mavuri V86 session comparison - READ ONLY and local-only.
// Unlike ml-session-renew.mjs, this NEVER launches Chrome, never navigates,
// never logs in and never requests affiliate-link creation.
// Attaches only to a Chrome already running via the original V86 CDP port.
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';

const EXPECTED_TAG='lucasbrasildf';
function isMlHost(value){
 try{
  const u=new URL(value);
  return u.protocol==='https:' && (u.hostname==='mercadolivre.com.br' ||
   u.hostname==='www.mercadolivre.com.br');
 }catch{return false}
}
function classifyTab(value){
 if(!isMlHost(value)) return 'other';
 const u=new URL(value);
 if(/\/(login|identification|authentication)(\/|$)/i.test(u.pathname))return 'login_or_challenge';
 if(u.pathname.startsWith('/afiliados/hub'))return 'affiliate_hub';
 if(u.pathname.startsWith('/afiliados/linkbuilder'))return 'affiliate_linkbuilder';
 if(u.pathname.startsWith('/p/')||/\/p\/MLB\d+/i.test(u.pathname))return 'product';
 return 'other_ml';
}
const report={test:'mavuri_v86_attached_chrome_session',read_only:true,
 browser_started_by_probe:false,login_attempts:0,page_navigations:0,
 affiliate_link_requests:0,session_material_exported:false,secret_values_logged:false,
 cdp_ready:false,ml_tabs:0,hub_or_linkbuilder_open:false,
 challenge_tab_present:false,owner_tag_visible:false,
 ml_session_cookies_present:false,ready_for_runner_comparison:false,reason:null};

async function run(){
 let browser;
 try{
  const port=Number(process.env.MAVURI_CHROME_PORT||9222);
  if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('invalid_local_port');
  const timeout=5000;
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout});}
  catch{throw Error('existing_v86_chrome_not_running_or_cdp_unavailable');}
  report.cdp_ready=true;
  const contexts=browser.contexts();
  if(!contexts.length)throw Error('no_existing_chrome_context');
  const pageCandidates=contexts.flatMap(c=>c.pages()).filter(p=>isMlHost(p.url()));
  report.ml_tabs=pageCandidates.length;
  report.challenge_tab_present=pageCandidates.some(p=>classifyTab(p.url())==='login_or_challenge');
  const affiliatePages=pageCandidates.filter(p=>['affiliate_hub','affiliate_linkbuilder'].includes(classifyTab(p.url())));
  report.hub_or_linkbuilder_open=affiliatePages.length>0;
  if(affiliatePages.length){
   for(const p of affiliatePages){
    try{
     const text=(await p.locator('body').innerText({timeout:3000})).toLowerCase();
     report.owner_tag_visible=report.owner_tag_visible||text.includes(EXPECTED_TAG);
    }catch{}
   }
   try{
    const cookies=await affiliatePages[0].context().cookies('https://www.mercadolivre.com.br');
    report.ml_session_cookies_present=cookies.length>0;
   }catch{}
  }
  report.ready_for_runner_comparison=report.hub_or_linkbuilder_open&&
    report.owner_tag_visible&&!report.challenge_tab_present&&
    report.ml_session_cookies_present;
  if(!report.ready_for_runner_comparison)
    report.reason=report.challenge_tab_present?'login_limit_or_challenge_visible':
      !report.hub_or_linkbuilder_open?'open_authenticated_ml_hub_in_existing_v86_chrome':
      !report.owner_tag_visible?'affiliate_tag_not_visible':'no_ml_cookie_confirmed';
 }catch(e){
  report.reason=e?.message==='invalid_local_port'?'invalid_local_port':
    e?.message==='existing_v86_chrome_not_running_or_cdp_unavailable'?
    'existing_v86_chrome_not_running_or_cdp_unavailable':
    e?.message==='no_existing_chrome_context'?'no_existing_chrome_context':
    'inspection_failed';
 }finally{
  try{await browser?.close()}catch{}
  console.log(JSON.stringify(report,null,2));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.includes('--self-test')){
  const checks=['https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true','https://www.mercadolivre.com.br/login/identification','https://www.mercadolivre.com.br/afiliados/linkbuilder'].map(classifyTab);
  const ok=JSON.stringify(checks)===JSON.stringify(['affiliate_hub','login_or_challenge','affiliate_linkbuilder']);
  console.log(JSON.stringify({test:'mavuri_v86_session_classification',ok,offline:true,no_login:true}));
  if(!ok)process.exitCode=1;
 }else{
  run().catch(()=>{console.error('Falha na inspeção local (sem tentativa de login).');process.exitCode=1});
 }
}

#!/usr/bin/env node
// One-shot owner-authorized affiliate linkbuilder POST test from GitHub Actions.
// No Telegram, no database writes, no printed request headers/cookies/links.
// Uses only the pre-existing encrypted GitHub environment auth bundle.
import {unpackageMavuriAuthState} from './auth-state.mjs';
const PRODUCT='https://www.mercadolivre.com.br/maquininha-3-em-1-kemei-km-1910-aparador-pelo-corpo-agua-resistente/p/MLB21835256';
const BASE='https://www.mercadolivre.com.br';
const TARGET=BASE+'/affiliate-program/api/v2/stripe/user/links';
const TAG='lucasbrasildf';
const result={test:'ml_stripe_user_links_authenticated_one_product',read_only_output:true,no_publication:true,
  authenticated_cookie_bundle_present:false,request_completed:false,
  http_status:null,response_json:false,product_match:false,tag_match:false,
  short_link_returned:false,official_long_ref_returned:false,ok:false,reason:null};
let context;
try{
 const encrypted=process.env.MAVURI_AUTH_BUNDLE||'',key=process.env.MAVURI_AUTH_KEY||'';
 if(!encrypted||!key)throw Error('session_not_configured');
 const state=unpackageMavuriAuthState(encrypted,key);
 const cookies=(state?.cookies||[]).filter(c=>String(c.domain||'').replace(/^\./,'').endsWith('mercadolivre.com.br'));
 if(!cookies.length)throw Error('no_stored_ml_cookies');
 result.authenticated_cookie_bundle_present=true;
 const {request}=await import('playwright-core');
 context=await request.newContext({baseURL:BASE,storageState:state,locale:'pt-BR',
  extraHTTPHeaders:{'Accept':'application/json, text/plain, */*','Content-Type':'application/json',
   'Origin':BASE,'Referer':PRODUCT,'Accept-Language':'pt-BR,pt;q=0.9'},
  timeout:20000});
 const response=await context.post(TARGET,{data:{buy_box_winner:'MLB5558570502',tag:TAG,url:PRODUCT},maxRedirects:0});
 result.request_completed=true;
 result.http_status=response.status();
 if(response.status()===200){
  let body=null;try{body=await response.json()}catch{}
  result.response_json=Boolean(body && typeof body==='object');
  const row=Array.isArray(body?.urls)?body.urls[0]:body;
  result.product_match=String(row?.origin_url||'').split('?')[0]===PRODUCT;
  result.tag_match=row?.tag===TAG;
  result.short_link_returned=/^https:\/\/meli\.la\/[A-Za-z0-9]+$/.test(String(row?.short_url||''));
  try{const u=new URL(String(row?.long_url||''));result.official_long_ref_returned=
     u.hostname==='www.mercadolivre.com.br'&&u.pathname==='/social/'+TAG
     &&u.searchParams.get('matt_word')===TAG&&Boolean(u.searchParams.get('ref'))}catch{}
  result.ok=result.product_match&&result.tag_match&&result.short_link_returned&&result.official_long_ref_returned;
  if(!result.ok)result.reason='response_not_official_expected_product';
 } else {
  result.reason='api_http_'+response.status();
 }
}catch(e){
 const expected=new Set(['session_not_configured','no_stored_ml_cookies']);
 result.reason=expected.has(e?.message)?e.message:'auth_bundle_or_request_failed';
}finally{
 try{await context?.dispose()}catch{}
 console.log(JSON.stringify(result,null,2));
 if(!result.ok)process.exitCode=1;
}

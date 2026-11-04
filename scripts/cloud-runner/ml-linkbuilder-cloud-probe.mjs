#!/usr/bin/env node
// Mavuri: one-product, authorized browser UI pilot for Mercado Livre affiliate linkbuilder.
// No automatic publication, no database changes, no secret/header/cookie logging.
import { unpackageMavuriAuthState } from './auth-state.mjs';

const PRODUCT='https://www.mercadolivre.com.br/maquininha-3-em-1-kemei-km-1910-aparador-pelo-corpo-agua-resistente/p/MLB21835256';
const BUILDER='https://www.mercadolivre.com.br/afiliados/linkbuilder#hub';
const TAG='lucasbrasildf';
const API_PATH='/affiliate-program/api/v2/affiliates/linkbuilder/createLink';
const result={test:'ml_cloud_linkbuilder_ui',safe:true,no_publication:true,no_database_writes:true,
  page_http:null,page_loaded:false,form_found:false,tag_visible:false,
  create_request_seen:false,create_http:null,expected_product:false,own_tag:false,
  short_link_generated:false,long_link_with_ref:false,created:null,ok:false,reason:null};
let browser,context;
try {
  const bundle=process.env.MAVURI_AUTH_BUNDLE||'';
  const key=process.env.MAVURI_AUTH_KEY||'';
  if(!bundle||!key) throw Error('stored_session_missing');
  const state=unpackageMavuriAuthState(bundle,key);
  if(!state.cookies?.some(c=>String(c.domain||'').endsWith('mercadolivre.com.br')))
    throw Error('stored_mercadolivre_cookies_missing');
  const {chromium}=await import('playwright-core');
  browser=await chromium.launch({channel:'chrome',headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions']});
  context=await browser.newContext({storageState:state,locale:'pt-BR'});
  const page=await context.newPage();
  const response=await page.goto(BUILDER,{waitUntil:'domcontentloaded',timeout:20000});
  result.page_http=response?.status()??null;
  result.page_loaded=result.page_http===200&&page.url().startsWith('https://www.mercadolivre.com.br/afiliados/linkbuilder');
  if(!result.page_loaded){
    result.reason=result.page_http===403?'cloud_linkbuilder_http_403':'linkbuilder_page_unavailable';
  }else {
    const textbox=page.locator('textarea').first();
    try{await textbox.waitFor({state:'visible',timeout:12000});result.form_found=true;}catch{}
    if(!result.form_found){result.reason='linkbuilder_form_not_found';}
    else{
      result.tag_visible=(await page.getByText(TAG,{exact:true}).count())>0;
      if(!result.tag_visible){result.reason='own_affiliate_tag_not_visible';}
      else{
        await textbox.fill(PRODUCT);
        const pending=page.waitForResponse(r=>r.url().includes(API_PATH)&&r.request().method()==='POST',
          {timeout:28000});
        await page.getByRole('button',{name:'Gerar',exact:true}).click({timeout:13000});
        const apiResponse=await pending;
        result.create_request_seen=true;
        result.create_http=apiResponse.status();
        if(result.create_http!==200){result.reason='linkbuilder_api_http_'+result.create_http;}
        else{
          const json=await apiResponse.json();
          const row=Array.isArray(json?.urls)?json.urls[0]:null;
          result.expected_product=String(row?.origin_url||'').split('?')[0]===PRODUCT;
          result.own_tag=row?.tag===TAG;
          result.short_link_generated=/^https:\/\/meli\.la\/[a-zA-Z0-9]+$/.test(String(row?.short_url||''));
          try{const u=new URL(String(row?.long_url||''));result.long_link_with_ref=
            u.hostname==='www.mercadolivre.com.br'&&u.pathname==='/social/'+TAG&&
            u.searchParams.get('matt_word')===TAG&&Boolean(u.searchParams.get('ref'));}catch{}
          result.created=typeof row?.created==='boolean'?row.created:null;
          result.ok=result.expected_product&&result.own_tag&&result.short_link_generated&&result.long_link_with_ref;
          if(!result.ok)result.reason='official_response_failed_validation';
        }
      }
    }
  }
}catch(e){
  const safe=new Set(['stored_session_missing','stored_mercadolivre_cookies_missing']);
  if(!result.reason)result.reason=safe.has(e?.message)?e.message:'browser_or_linkbuilder_interaction_failed';
}finally{
  try{await context?.close();}catch{}
  try{await browser?.close();}catch{}
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
}

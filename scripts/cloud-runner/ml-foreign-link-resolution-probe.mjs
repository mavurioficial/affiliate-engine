#!/usr/bin/env node
// Mavuri ML: read-only resolver equivalence check for external affiliate links.
// Does not send ML cookies, generate links, enqueue jobs, write DB or publish.
// The only browser session used is a Mavuri owner login on GitHub Pages.
import { unpackageMavuriAuthState } from './auth-state.mjs';

const EXTERNAL='https://meli.la/2LfpuWZ';
const OWNED='https://meli.la/1C5zFze';
const CATALOG='MLB21149154';
const M_URL='https://mavurioficial.github.io/affiliate-engine/';
const ML_HOSTS=['mercadolivre.com.br','mercadolibre.com'];

function officialMLHost(url) {
  try {
    const u=new URL(url);
    return u.protocol==='https:' && ML_HOSTS.some(h=>
      u.hostname===h || u.hostname.endsWith('.'+h));
  } catch { return false; }
}
function itemId(data) {
  const candidates=[data?.item_id,data?.product_url,data?.resolved_url,
    data?.product?.id,data?.product?.permalink];
  for(const candidate of candidates){
    const match=String(candidate||'').match(/MLB[-_]?([0-9]{6,})/i);
    if(match) return 'MLB'+match[1];
  }
  return null;
}
if(process.argv.includes('--self-test')) {
  if(!officialMLHost('https://www.mercadolivre.com.br/p/MLB21149154') ||
     officialMLHost('https://mercadolivre.com.br.evil.invalid/p/MLB21149154') ||
     itemId({product_url:'https://mercadolivre.com.br/p/MLB21149154'})!==CATALOG ||
     itemId({item_id:'MLB12345678'})===CATALOG) {
    throw Error('resolver_classification_self_test_failed');
  }
  console.log(JSON.stringify({ok:true,mode:'self_test',no_network_calls:true}));
  process.exit(0);
}
const report={
  mode:'ml_affiliate_link_resolver_equivalence',
  read_only:true,ml_browser_cookies_used:false,no_db_writes:true,no_publication:true,
  mavuri_owner_auth:false,external:null,owned:null,
  both_resolved:false,same_catalog:false,ok:false,
  reason:null
};
let browser,context;
try{
  if(process.env.MAVURI_AUTO_INGEST!=='false' ||
     process.env.MAVURI_CLOUD_LIVE_ENABLED!=='NO') {
    throw Error('unsafe_environment');
  }
  const state=unpackageMavuriAuthState(
    process.env.MAVURI_AUTH_BUNDLE||'',process.env.MAVURI_AUTH_KEY||'');
  const owner=state.origins.filter(o=>o.origin==='https://mavurioficial.github.io');
  if(owner.length!==1 || owner[0].localStorage.length===0){
    throw Error('missing_mavuri_owner_auth');
  }
  const {chromium}=await import('playwright-core');
  browser=await chromium.launch({channel:'chrome',headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage',
      '--disable-background-networking','--disable-extensions']});
  context=await browser.newContext({
    storageState:{
      origins:owner,
      cookies:state.cookies.filter(c=>
        String(c.domain).replace(/^\./,'').toLowerCase()==='mavurioficial.github.io')
    },
  });
  const page=await context.newPage();
  const response=await page.goto(M_URL,{
    waitUntil:'domcontentloaded',timeout:18000
  });
  if(response?.status()!==200)throw Error('mavuri_site_not_available');
  const result=await page.evaluate(async(inputs)=>{
    try{
      const {supabase}=await import('/affiliate-engine/src/app/auth.js');
      const user=await supabase.auth.getUser();
      if(user.error||!user.data?.user?.id) return {authenticated:false};
      async function resolve(url){
        try{
          const task=supabase.functions.invoke('affiliate-resolver',{
            body:{affiliate_url:url},
          });
          const timeout=new Promise(resolve=>setTimeout(()=>resolve({
            data:null,error:{name:'TimeoutError',context:{status:0}}
          }),35000));
          const {data,error}=await Promise.race([task,timeout]);
          // Whitelist only results, do not return response page, tokens, or affiliate URLs.
          if(error) return {success:false,
            http_status:Number(error?.context?.status)||null,reason:'resolver_function_error'};
          return {success:Boolean(data?.product_url),
            product_url:data?.product_url||null,
            resolved_url:data?.resolved_url||null,
            item_id:data?.item_id||null,
            product:{
              id:data?.product?.id||null,
              permalink:data?.product?.permalink||null,
              has_title:Boolean(data?.product?.title),
              has_price:Number(data?.product?.price)>0
            },
            reason:data?.error?'resolver_returned_error':null
          };
        }catch{return {success:false,reason:'resolver_client_error'}}
      }
      return {authenticated:true,external:await resolve(inputs.external),
        owned:await resolve(inputs.owned)};
    }catch{return {authenticated:false,reason:'mavuri_browser_error'}}
  },{external:EXTERNAL,owned:OWNED});
  report.mavuri_owner_auth=result.authenticated===true;
  if(!report.mavuri_owner_auth)throw Error('owner_auth_invalid');
  function sanitize(row){
    const id=itemId(row);
    return {resolved:row?.success===true && Boolean(id),
      catalog_id:id,http_status:row?.http_status??null,
      title_available:row?.product?.has_title===true,
      price_available:row?.product?.has_price===true,
      reason:['resolver_function_error','resolver_returned_error',
        'resolver_client_error'].includes(row?.reason)?row.reason:null,
    };
  }
  report.external=sanitize(result.external);
  report.owned=sanitize(result.owned);
  report.both_resolved=report.external.resolved&&report.owned.resolved;
  report.same_catalog=report.both_resolved &&
    report.external.catalog_id===report.owned.catalog_id;
  report.ok=report.same_catalog && report.external.catalog_id===CATALOG;
  if(!report.ok) report.reason=report.both_resolved?
    'resolved_product_ids_do_not_match_expected_catalog':'link_resolution_incomplete';
}catch(e){
  const reasons=new Set(['unsafe_environment','missing_mavuri_owner_auth',
    'mavuri_site_not_available','owner_auth_invalid']);
  report.reason=reasons.has(e?.message)?e.message:'resolver_probe_runtime_error';
}finally{
  try{await context?.close()}catch{}
  try{await browser?.close()}catch{}
  console.log(JSON.stringify(report,null,2));
  if(!report.ok)process.exitCode=1;
}

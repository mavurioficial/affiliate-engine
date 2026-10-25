#!/usr/bin/env node
// One-product Mavuri Mercado Livre affiliate-link probe.
// Manual workflow only. No Supabase calls, no queue, no publishing.
// Uses a pre-existing authorized session. Never prints session material.
const PRODUCT_URL='https://www.mercadolivre.com.br/pneu-100100-18-ira-trilha-cross-enduro-ktm-crf-230-xr-200/p/MLB21149154';
const THIRD_PARTY_URL='https://meli.la/2LfpuWZ';
const EXPECTED_TAG='lucasbrasildf';
const ITEM_ID='MLB21149154';

function isOwnShortLink(link,tag) {
  try {
    const u=new URL(link);
    return u.protocol==='https:' && u.hostname==='meli.la' && u.pathname.length>2 &&
      tag===EXPECTED_TAG;
  }catch{return false}
}
if(process.argv.includes('--self-test')){
  if(!isOwnShortLink('https://meli.la/1C5zFze',EXPECTED_TAG) ||
    isOwnShortLink('https://meli.la/2LfpuWZ','otheraffiliate')){
    throw new Error('link_validation_failed');
  }
  console.log(JSON.stringify({mode:'self_test',ok:true}));
  process.exit(0);
}

const report={mode:'single_product_affiliate_link_probe',item_id:ITEM_ID,
  source_checked:false,source_product_found:false,source_error:null,
  product_status:null,affiliate_ui_present:false,own_tag_visible:false,
  own_meli_link_returned:false,ok:false,no_publication:true,no_db_writes:true,
  reason:null};
let browser,context;
try{
  const bundle=process.env.MAVURI_AUTH_BUNDLE||'';
  const key=process.env.MAVURI_AUTH_KEY||'';
  if(!bundle||!key)throw new Error('missing_protected_session');
  const {unpackageMavuriAuthState}=await import('./auth-state.mjs');
  const state=unpackageMavuriAuthState(bundle,key);
  if(!state.cookies?.some(c=>String(c.domain).includes('mercadolivre.com.br'))){
    throw new Error('missing_mercadolivre_session');
  }
  const {chromium}=await import('playwright-core');
  browser=await chromium.launch({channel:'chrome',headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage',
      '--disable-background-networking','--disable-extensions']});
  context=await browser.newContext({storageState:state,locale:'pt-BR'});

  // Verify the externally posted link can identify the original listing.
  const source=await context.newPage();
  try{
    const response=await source.goto(THIRD_PARTY_URL,
      {waitUntil:'domcontentloaded',timeout:16000});
    const href=source.url();
    const host=new URL(href).hostname;
    if(host==='meli.la'||host==='mercadolivre.com.br'||
      host.endsWith('.mercadolivre.com.br')){
      report.source_checked=true;
      report.source_product_found=href.includes(ITEM_ID)||
        (await source.locator('a[href*="'+ITEM_ID+'"]').count())>0;
    }else{
      report.source_error='unexpected_redirect_host';
    }
    if(response?.status()===403)report.source_error='http_403';
  }catch{
    report.source_error='source_navigation_failed';
  }finally{await source.close()}

  // Open the known clean product URL, then use the legitimate site UI.
  const page=await context.newPage();
  try{
    const response=await page.goto(PRODUCT_URL,
      {waitUntil:'domcontentloaded',timeout:20000});
    report.product_status=response?.status()??null;
    if(report.product_status!==200||!page.url().includes('/p/'+ITEM_ID)){
      report.reason=report.product_status===403?
        'cloud_browser_http_403':'product_navigation_failed';
    }else{
      const share=page.getByRole('button',{name:'Compartilhar',exact:true}).first();
      if(await share.count()){
        report.affiliate_ui_present=true;
        await share.click({timeout:12000});
        await page.getByText('Gerar link / ID de produto',
          {exact:false}).first().waitFor({timeout:12000});
        const modal=page.getByText('Gerar link / ID de produto').first();
        const scope=modal.locator('xpath=..');
        const modalText=await scope.innerText().catch(()=>'');
        report.own_tag_visible=modalText.includes(EXPECTED_TAG)||
          await page.getByText(EXPECTED_TAG,{exact:true}).count()>0;
        const ownLink=await page.locator('input').evaluateAll(inputs=>{
          for(const input of inputs){
            const val=String(input.value||'');
            if(/^https:\/\/meli\.la\/[A-Za-z0-9]+$/.test(val))return val;
          }
          return '';
        });
        report.own_meli_link_returned=isOwnShortLink(ownLink,
          report.own_tag_visible?EXPECTED_TAG:'');
        report.ok=report.own_tag_visible&&report.own_meli_link_returned;
        if(!report.ok)report.reason='tag_or_link_not_confirmed';
      }else{
        report.reason='affiliate_share_button_missing';
      }
    }
  }catch{
    report.reason='affiliate_ui_navigation_or_element_failed';
  }finally{await page.close()}
}catch(error){
  report.reason=['missing_protected_session',
    'missing_mercadolivre_session'].includes(error?.message)?
    error.message:'protected_session_or_browser_failed';
}finally{
  try{await context?.close()}catch{}
  try{await browser?.close()}catch{}
  console.log(JSON.stringify(report,null,2));
  if(!report.ok)process.exitCode=1;
}

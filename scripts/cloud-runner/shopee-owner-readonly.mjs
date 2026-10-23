#!/usr/bin/env node
// One-shot owner-authenticated Shopee cloud preflight after account identity binding.
// No Mercado Livre requests; no ingest, publications, RPC writes, scheduled runs,
// affiliate-link generation or secrets printed. Safe for trusted main branch only.
import {unpackageMavuriAuthState} from "./auth-state.mjs";
const report={
  mode:"shopee_owner_preflight",read_only:true,
  no_marketplace_browser_probe:true,no_publication:true,no_schedule:true,
  mavuri_session_confirmed:false,shopee_api_preview_ok:false,
  affiliate_binding_verified:false,api_candidates:null,
  projected_unique_offers:null,
  single_preflight_ok:false,selected_unique_offers:null,
  projected_jobs:null,eligible_checks:null,
  failure_code:null
};
const safeInt=x=>Number.isSafeInteger(x)&&x>=0?x:null;
let browser,ctx;
try{
  if(process.env.MAVURI_AUTO_INGEST!=="false"||
     process.env.MAVURI_CLOUD_LIVE_ENABLED!=="NO"||
     process.env.MAVURI_SHOPEE_PREVIEW!=="1")
    throw Error("readonly_env_required");
  const bundle=process.env.MAVURI_AUTH_BUNDLE||"";
  const key=process.env.MAVURI_AUTH_KEY||"";
  if(!bundle||!key)throw Error("auth_secrets_missing");
  const state=unpackageMavuriAuthState(bundle,key);
  const pageOrigin="https://mavurioficial.github.io";
  const origins=state.origins.filter(x=>x.origin===pageOrigin);
  if(origins.length!==1||!origins[0].localStorage.length)
    throw Error("mavuri_auth_state_missing");
  // Do not restore any Mercado Livre cookies into this test browser.
  const filtered={
    origins,cookies:state.cookies.filter(x=>
      /^(?:\.)?mavurioficial\.github\.io$/i.test(x.domain))
  };
  const {chromium}=await import("playwright-core");
  browser=await chromium.launch({channel:"chrome",headless:true,
    args:["--no-sandbox","--disable-dev-shm-usage",
      "--disable-background-networking","--disable-extensions"]});
  ctx=await browser.newContext({storageState:filtered});
  const page=await ctx.newPage();
  const response=await page.goto(
    pageOrigin+"/affiliate-engine/",
    {waitUntil:"domcontentloaded",timeout:15000});
  if(response?.status()!==200)throw Error("mavuri_page_unavailable");
  const checks=await page.evaluate(async()=>{
    const cleanInt=x=>Number.isSafeInteger(x)&&x>=0?x:null;
    try{
      const {supabase}=await import("/affiliate-engine/src/app/auth.js");
      const auth=await supabase.auth.getUser();
      if(auth.error||!auth.data?.user?.id)
        return {session:false,error:"session_not_authenticated"};
      const [prev,single]=await Promise.all([
        supabase.functions.invoke("discovery-cloud-shopee",
          {body:{mode:"general_audit"}}),
        supabase.functions.invoke("discovery-cloud-shopee-preflight",
          {body:{mode:"single_offer_preflight"}})
      ]);
      const p=prev.data||{},s=single.data||{};
      if(prev.error||single.error)return {session:true,error:"preflight_request_failed"};
      if(p.ok!==true||p.dry_run!==true||p.cloud_publishing!==false||
         p.cloud_schedule!==false||s.ok!==true||s.dry_run!==true||
         s.cloud_publishing!==false||s.cloud_schedule!==false||
         s.safety?.ready_to_publish!==false||
         s.safety?.reads_only!==true||
         s.account_binding?.ready_for_write!==false)
        return {session:true,error:"preflight_safety_contract_changed"};
      const fields=[
        "input_candidates","missing_persisted","ambiguous_persisted",
        "final_category_unavailable","invalid_affiliate_or_price",
        "affiliate_url_changed","price_changed","blocked_recent_48h",
        "blocked_pending","blocked_category_diversity"
      ];
      return {
        session:true,preview_ok:true,single_ok:true,
        binding_verified:s.account_binding?.verified===true,
        api_candidates:cleanInt(p.candidates_considered),
        projected_unique_offers:cleanInt(p.projected_unique_offers),
        selected_unique_offers:cleanInt(s.selected_unique_offers),
        projected_jobs:cleanInt(s.projected_jobs),
        eligibility:Object.fromEntries(fields.map(k=>[k,cleanInt(s.eligibility?.[k])]))
      };
    }catch{return{session:false,error:"owner_preflight_unavailable"}}
  });
  report.mavuri_session_confirmed=checks.session===true;
  report.shopee_api_preview_ok=checks.preview_ok===true;
  report.single_preflight_ok=checks.single_ok===true;
  report.affiliate_binding_verified=checks.binding_verified===true;
  report.api_candidates=safeInt(checks.api_candidates);
  report.projected_unique_offers=safeInt(checks.projected_unique_offers);
  report.selected_unique_offers=safeInt(checks.selected_unique_offers);
  report.projected_jobs=safeInt(checks.projected_jobs);
  report.eligible_checks=checks.eligibility??null;
  if(checks.error)throw Error(String(checks.error));
  if(!report.affiliate_binding_verified)throw Error("affiliate_binding_unverified");
  if(!report.shopee_api_preview_ok||!report.single_preflight_ok)
    throw Error("preflight_not_verified");
}catch(e){
  const allowed=new Set(["readonly_env_required","auth_secrets_missing",
    "mavuri_auth_state_missing","mavuri_page_unavailable",
    "preflight_request_failed","preflight_safety_contract_changed",
    "owner_preflight_unavailable","session_not_authenticated",
    "affiliate_binding_unverified","preflight_not_verified"]);
  report.failure_code=allowed.has(e?.message)?e.message:"runtime_error";
  process.exitCode=1;
}finally{
  try{await ctx?.close()}catch{}
  try{await browser?.close()}catch{}
  console.log(JSON.stringify(report,null,2));
}

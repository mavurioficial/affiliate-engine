// Free-plan feasibility probe: public Mercado Livre pages, no account state.
// No proxy, fingerprint evasion, affiliate link generation or publishing.
import puppeteer from "@cloudflare/puppeteer";
import {TARGETS,summarize,safeReport,planFreeDailyCapacity} from "./policy.mjs";
const respond=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
async function authorized(req,secret){
 const auth=req.headers.get("authorization")||"";
 if(!secret||secret.length<32||!auth.startsWith("Bearer "))return false;
 const enc=new TextEncoder();
 const [a,b]=await Promise.all([auth.slice(7),secret].map(v=>crypto.subtle.digest("SHA-256",enc.encode(v))));
 const x=new Uint8Array(a),y=new Uint8Array(b);
 let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
 return diff===0;
}
const MAX_PER_PAGE_MS=10000;
const MAX_PUBLIC_PROBE_MS=27000;
export default {
 async fetch(request,env){
  const pathname=new URL(request.url).pathname;
  if(pathname==="/health"&&request.method==="GET")
    return respond({ok:true,mode:"ml_cloudflare_free_probe",publishing:false,
      scheduled_runs:false,account_authenticated:false});
  if(pathname!=="/probe"||request.method!=="POST")
    return respond({ok:false,reason:"not_found"},404);
  if(!(await authorized(request,env.PROBE_TOKEN)))
    return respond({ok:false,reason:"unauthorized"},401);
  const startRequest=Date.now(),startBrowser=Date.now();
  let browser,launchMs=null,closeMs=null,browserMs=null,failed=false;
  const results=[];
  try{
   browser=await puppeteer.launch(env.MYBROWSER);
   launchMs=Date.now()-startBrowser;
   const page=await browser.newPage();
   for(const target of TARGETS){
    if(Date.now()-startBrowser>=MAX_PUBLIC_PROBE_MS){
      results.push({target:target.key,http_status:null,reason:"probe_time_budget_reached",
       elapsed_ms:0});
      continue;
    }
    const t0=Date.now();
    try{
     const response=await page.goto(target.url,{
       waitUntil:"domcontentloaded",timeout:MAX_PER_PAGE_MS});
     results.push({...summarize(target.key,response?.status()??null,page.url()),
       elapsed_ms:Date.now()-t0});
    }catch{
     results.push({...summarize(target.key,null,target.url),
       reason:"navigation_failed",elapsed_ms:Date.now()-t0});
    }
   }
  }catch{failed=true;}
  finally{
   const beforeClose=Date.now();
   if(browser)try{await browser.close()}catch{failed=true;}
   closeMs=Date.now()-beforeClose;
   if(browser)browserMs=Date.now()-startBrowser;
  }
  const observedSeconds=browserMs===null?null:Math.ceil(browserMs/1000);
  const capacity=planFreeDailyCapacity(observedSeconds||0);
  const metrics={
   browser_elapsed_ms_estimate:browserMs,
   browser_startup_ms:launchMs,
   browser_shutdown_ms:closeMs,
   total_request_elapsed_ms:Date.now()-startRequest,
   browser_seconds_rounded_up:observedSeconds,
   estimated_guest_probes_per_day:capacity.safe_cycles,
   safety_reserve_seconds:capacity.reserve_seconds,
   measurement_note:"Elapsed-time approximation; Cloudflare dashboard usage is authoritative. "+
    "This estimates guest probes, NOT full V86 authenticated discovery cycles."
  };
  const report={...safeReport(results),mode:"ml_cloudflare_free_probe",
    browser_metric:metrics};
  if(failed)return respond({...report,ok:false,reason:"browser_probe_failed"},503);
  return respond(report);
 }
};

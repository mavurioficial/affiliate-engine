// Cloud Run JOB: unauthenticated, read-only Chromium reachability check.
// No navigation to private product listings, no API tokens or browser cookies.
import {chromium} from "playwright";
export const TARGETS=Object.freeze([
 {name:"home",url:"https://www.mercadolivre.com.br/"},
 {name:"affiliate_hub_guest",url:"https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true"}
]);
export function summarize(name,status,finalUrl,elapsedMs){
 let reason="unknown";
 if(status===403)reason="forbidden";
 else if(status===429)reason="rate_limited";
 else if(status>=200&&status<300)reason="http_ok";
 else if(status>=300&&status<400)reason="redirect";
 return {target:name,http_status:status,reason,redirected_to_login:
 /login|entrar|auth|identification|signin/i.test(new URL(finalUrl).pathname),elapsed_ms:elapsedMs};
}
export async function runPublicProbe({launch=()=>chromium.launch({headless:true,
 args:["--disable-dev-shm-usage","--no-sandbox"]}),targets=TARGETS}={}){
 if(process.env.MAVURI_ML_PROBE_ONLY!=="YES_PUBLIC_READONLY")
  throw new Error("read_only_probe_guard_required");
 const browser=await launch();
 const out=[];
 try{
  for(const target of targets){
   if(!TARGETS.some(x=>x.url===target.url&&x.name===target.name))
    throw new Error("unsupported_target");
   const context=await browser.newContext({acceptDownloads:false,serviceWorkers:"block"});
   const page=await context.newPage();
   const t0=Date.now();
   try{
    const res=await page.goto(target.url,{waitUntil:"domcontentloaded",timeout:15000});
    const status=res?.status()??null;
    out.push(status===null?{target:target.name,reason:"no_http_response",http_status:null,
     elapsed_ms:Date.now()-t0}:summarize(target.name,status,page.url(),Date.now()-t0));
   }catch(e){out.push({target:target.name,http_status:null,reason:"navigation_failed",
      elapsed_ms:Date.now()-t0});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 return {ok:true,mode:"ml_cloudrun_public_browser_preflight",read_only:true,
   account_authenticated:false,affiliate_links_generated:0,db_writes:0,telegram_posts:0,
   results:out};
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 try{console.log(JSON.stringify(await runPublicProbe()));}
 catch{console.error(JSON.stringify({ok:false,mode:"ml_cloudrun_public_browser_preflight",
  error:"public_probe_failed",affiliate_links_generated:0,db_writes:0,telegram_posts:0}));
  process.exitCode=1;}
}

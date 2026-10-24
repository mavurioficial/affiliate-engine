// Read-only Cloudflare Free Browser Run egress check. Not the V86 publisher.
import puppeteer from "@cloudflare/puppeteer";
import {TARGETS,summarize,safeReport} from "./policy.mjs";
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
export default {
 async fetch(request,env){
  const pathname=new URL(request.url).pathname;
  if(pathname==="/health"&&request.method==="GET")return respond({ok:true,mode:"ml_cloudflare_free_probe",publishing:false});
  if(pathname!=="/probe"||request.method!=="POST")return respond({ok:false,reason:"not_found"},404);
  if(!(await authorized(request,env.PROBE_TOKEN)))return respond({ok:false,reason:"unauthorized"},401);
  // No credentials supplied to the browser. Close it immediately so free minutes are preserved.
  let browser;
  const results=[];
  try{
   browser=await puppeteer.launch(env.MYBROWSER);
   const page=await browser.newPage();
   for(const target of TARGETS){
    try{
     const response=await page.goto(target.url,{waitUntil:"domcontentloaded",timeout:12000});
     results.push(summarize(target.key,response?.status()??null,page.url()));
    }catch{results.push(summarize(target.key,null,target.url));}
   }
   return respond(safeReport(results));
  }catch{return respond({ok:false,reason:"browser_probe_failed",read_only:true,
   generated_affiliate_links:0,database_writes:0,telegram_posts:0},503)}
  finally{if(browser)await browser.close().catch(()=>{});}
 }
};

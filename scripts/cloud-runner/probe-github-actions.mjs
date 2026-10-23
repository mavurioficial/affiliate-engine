#!/usr/bin/env node
// Mavuri public-GitHub hosted-runner feasibility probe.
// SAFE: no credentials, no remote sites, no Telegram, no Supabase calls, no publishing.
// Chrome only visits about:blank and listens on loopback.
import {spawn,execFileSync} from "node:child_process";
import {mkdtempSync,readFileSync,existsSync,rmSync} from "node:fs";
import {tmpdir,totalmem,freemem,arch,platform,cpus} from "node:os";
import {join} from "node:path";

const chromiumPaths=[
 process.env.MAVURI_PROBE_CHROME_PATH,
 "/usr/bin/google-chrome","/usr/bin/google-chrome-stable",
 "/usr/bin/chromium","/usr/bin/chromium-browser"
].filter(Boolean);
const chrome=chromiumPaths.find(p=>existsSync(p));
const snapshot=(name)=>({name,time:new Date().toISOString(),
 total_ram_mb:Math.round(totalmem()/1048576),
 free_ram_mb:Math.round(freemem()/1048576)});
const report={
 safe_probe:true,no_credentials:true,no_publication:true,
 operating_system:platform(),architecture:arch(),
 cpu_count:cpus().length,node_major:Number(process.versions.node.split(".")[0]),
 chromepath_found:Boolean(chrome),start:snapshot("before"),
 chrome_startup_ms:null,chrome_child_count:0,chrome_tree_rss_mb:null,
 playwright_cdp_ok:false,playwright_clean_session:true,
 public_site_access:[],
 devtools_http_ok:false,chrome_version_present:false,
 end:null,passed:false,
 error:null
};
function chromeTreeRam(root) {
 let output="";
 try {output=execFileSync("ps",["-e","-o","pid=,ppid=,rss="],{encoding:"utf8",timeout:3000});}
 catch{return {count:0,rssMb:null}}
 const rows=output.trim().split("\n").map(row=>row.trim().split(/\s+/).map(Number))
   .filter(a=>a.length>=3&&a.every(Number.isFinite));
 const byParent=new Map();
 for(const [pid,ppid,rss] of rows){
   const list=byParent.get(ppid)||[];
   list.push({pid,rss});
   byParent.set(ppid,list);
 }
 let count=0,rssKb=0;
 const pending=[root],visited=new Set();
 while(pending.length){
   const pid=pending.pop();
   if(visited.has(pid))continue;
   visited.add(pid);
   const row=rows.find(r=>r[0]===pid);
   if(row){count++;rssKb+=row[2]}
   for(const child of byParent.get(pid)||[])pending.push(child.pid);
 }
 return {count,rssMb:Math.round(rssKb/1024)};
}
const dir=mkdtempSync(join(tmpdir(),"mavuri-cloud-probe-"));
const fixedPort=19222;
let browserStderr="";
let browserStderrFirst="";
let latestFetchError="";
let child;
try {
 if(!chrome)throw Error("chrome_not_preinstalled");
 const args=["--headless=new","--no-sandbox","--disable-gpu",
  "--disable-dev-shm-usage","--disable-background-networking",
  "--disable-extensions","--no-first-run","--no-default-browser-check",
  "--remote-debugging-address=127.0.0.1","--remote-debugging-port="+fixedPort,
  "--user-data-dir="+dir,"about:blank"];
 const started=Date.now();
 child=spawn(chrome,args,{stdio:["ignore","ignore","pipe"],detached:false,env:{...process.env,
  // Avoid Chrome running with debugging flags accidentally inherited from host.
  CHROME_USER_DATA_DIR:dir}});
 child.stderr?.on("data",chunk=>{
  browserStderr=(browserStderr+String(chunk)).slice(-1500);
  browserStderrFirst=(browserStderrFirst+String(chunk)).slice(0,900);
 });
 child.on("error",err=>{
  browserStderr=(browserStderr+" [spawn-error:"+String(err?.code||"unknown")+"]").slice(-1500);
 });
 let port=fixedPort;
 let response=null;
 for(let i=0;i<170;i++){
  if(child.exitCode!==null)throw Error("chrome_exit_"+child.exitCode);
  try{
    const trial=await fetch("http://127.0.0.1:"+port+"/json/version",
      {signal:AbortSignal.timeout(500)});
    if(trial.ok){response=trial;break}
  }catch(e){latestFetchError=String(e?.cause?.code||e?.message||"unknown").slice(0,60)}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!response) {
  // Determine if Chrome bound the local port but Node's fetch had issues.
  try{
   const raw=execFileSync("curl",["--noproxy","*","--max-time","2","-fsS",
     "http://127.0.0.1:"+port+"/json/version"],{encoding:"utf8",timeout:3000});
   const meta=JSON.parse(raw);
   if(meta?.Browser) {
    report.devtools_http_ok=true;
    report.chrome_version_present=true;
    response={ok:true,json:async()=>meta};
   }
  }catch{}
 }
 if(!response)throw Error("chrome_cdp_port_timeout");
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),4000);
 try {
  const responseAgain=await fetch("http://127.0.0.1:"+port+"/json/version",{
    signal:controller.signal
  });
  report.devtools_http_ok=responseAgain.ok;
  const meta=responseAgain.ok?await responseAgain.json():{};
  report.chrome_version_present=Boolean(meta?.Browser);
 } finally {clearTimeout(timer)}
 if(process.env.MAVURI_PROBE_PLAYWRIGHT==="1"){
   const {chromium}=await import("playwright-core");
   const browser=await chromium.connectOverCDP(
     "http://127.0.0.1:"+port,{timeout:15000});
   try{
     const context=browser.contexts()[0];
     if(!context)throw Error("no_chrome_context");
     const page=context.pages()[0]||await context.newPage();
     await page.goto("about:blank",{waitUntil:"domcontentloaded",timeout:8000});
     const state=await context.storageState();
     report.playwright_clean_session=state.cookies.length===0&&
       state.origins.length===0;
     report.playwright_cdp_ok=page.url()==="about:blank"&&
       report.playwright_clean_session;
     if(process.env.MAVURI_PROBE_PUBLIC_SITES==="1"){
       const checks=[
         {key:"mavuri_login",url:"https://mavurioficial.github.io/affiliate-engine/entrar/",host:"mavurioficial.github.io"},
         {key:"mercadolivre_hub",url:"https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true",host:"mercadolivre.com.br"}
       ];
       for(const check of checks){
         const tab=await context.newPage();
         let status=null,landed_host=null,error=null,elapsed_ms=null;
         const begin=Date.now();
         try{
           const response=await tab.goto(check.url,{waitUntil:"domcontentloaded",timeout:17000});
           status=response?.status()||null;
           const host=new URL(tab.url()).hostname.toLowerCase();
           // Never include query strings, cookies, HTML or token values in logs.
           landed_host=host.endsWith("mercadolivre.com.br")?"mercadolivre.com.br":
             host==="mavurioficial.github.io"?"mavurioficial.github.io":"other";
         }catch(err){error=String(err?.name||"navigation_error").slice(0,55)}
         elapsed_ms=Date.now()-begin;
         report.public_site_access.push({site:check.key,status,
           landed_host,error,elapsed_ms});
         await tab.close();
       }
     }
   }finally{await browser.close()}
   if(!report.playwright_cdp_ok)throw Error("playwright_cdp_failed");
 }
 report.chrome_startup_ms=Date.now()-started;
 await new Promise(resolve=>setTimeout(resolve,1000));
 const load=chromeTreeRam(child.pid);
 report.chrome_child_count=load.count;
 report.chrome_tree_rss_mb=load.rssMb;
 report.passed=report.devtools_http_ok&&report.chrome_version_present&&
   (process.env.MAVURI_PROBE_PLAYWRIGHT!=="1"||report.playwright_cdp_ok);
 if(!report.passed)throw Error("browser_cdp_not_available");
} catch(error){
 report.error=String(error?.message||"probe_error").slice(0,90);
 report.chrome_diagnostic_start=browserStderrFirst.slice(0,800).replace(/\s+/g," ");
 report.chrome_diagnostic_end=browserStderr.slice(-450).replace(/\s+/g," ");
 report.chrome_fetch_error=latestFetchError;
 report.chrome_processes=child?.pid?chromeTreeRam(child.pid):null;
 process.exitCode=1;
} finally {
 if(child?.pid) {
  try{child.kill("SIGTERM")}catch{}
  await new Promise(resolve=>setTimeout(resolve,600));
  if(child.exitCode===null){try{child.kill("SIGKILL")}catch{}}
 }
 try{rmSync(dir,{force:true,recursive:true})}catch{}
 report.end=snapshot("after");
 console.log(JSON.stringify(report,null,2));
}

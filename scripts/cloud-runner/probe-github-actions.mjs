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
let child;
try {
 if(!chrome)throw Error("chrome_not_preinstalled");
 const args=["--headless=new","--no-sandbox","--disable-gpu",
  "--disable-dev-shm-usage","--disable-background-networking",
  "--disable-extensions","--no-first-run","--no-default-browser-check",
  "--remote-debugging-address=127.0.0.1","--remote-debugging-port=0",
  "--user-data-dir="+dir,"about:blank"];
 const started=Date.now();
 child=spawn(chrome,args,{stdio:"ignore",detached:false,env:{...process.env,
  // Avoid Chrome running with debugging flags accidentally inherited from host.
  CHROME_USER_DATA_DIR:dir}});
 const devtools=join(dir,"DevToolsActivePort");
 let port=null;
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error("chrome_exited_before_devtools");
  if(existsSync(devtools)){
    const lines=readFileSync(devtools,"utf8").split(/\r?\n/);
    port=Number(lines[0]);
    if(Number.isInteger(port)&&port>=1024&&port<=65535)break;
  }
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!port)throw Error("chrome_devtools_timeout");
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),4000);
 try {
  const response=await fetch("http://127.0.0.1:"+port+"/json/version",{
    signal:controller.signal
  });
  report.devtools_http_ok=response.ok;
  const meta=response.ok?await response.json():{};
  report.chrome_version_present=Boolean(meta?.Browser);
 } finally {clearTimeout(timer)}
 report.chrome_startup_ms=Date.now()-started;
 await new Promise(resolve=>setTimeout(resolve,1000));
 const load=chromeTreeRam(child.pid);
 report.chrome_child_count=load.count;
 report.chrome_tree_rss_mb=load.rssMb;
 report.passed=report.devtools_http_ok&&report.chrome_version_present;
 if(!report.passed)throw Error("browser_cdp_not_available");
} catch(error){
 report.error=String(error?.message||"probe_error").slice(0,90);
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

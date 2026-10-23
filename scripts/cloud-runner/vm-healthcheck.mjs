#!/usr/bin/env node
// Zero-side-effect health check for cloud V85 prerequisites.
// No Telegram sends, ML scrape, Supabase writes, or affiliate API calls.
import {totalmem,freemem,arch,platform} from "node:os";
import {existsSync,statSync} from "node:fs";
const port=Number(process.env.MAVURI_CHROME_PORT||9222);
const result={
  ok:false,mode:"read_only",platform:platform(),arch:arch(),
  node:process.versions.node,
  total_ram_mb:Math.round(totalmem()/1024/1024),
  available_ram_mb:Math.round(freemem()/1024/1024),
  chrome_cdp:false,chrome_http_status:null,
  browser_pages:0,has_mercadolivre_page:false,has_mavuri_page:false,
  telegram_session_file:false,telegram_session_private:false,
  script_installed:false,cloud_live_enabled:false,
  reasons:[]
};
const problems=result.reasons;
if(!Number.isSafeInteger(port)||port<1024||port>65535)
  problems.push("invalid_chrome_port");
else try{
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),3500);
 try{
  const res=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:controller.signal});
  result.chrome_http_status=res.status;
  if(res.ok){
    const payload=await res.json();
    result.chrome_cdp=Boolean(payload?.webSocketDebuggerUrl);
    const pages=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:controller.signal});
    if(pages.ok){
      const tabs=await pages.json();
      if(Array.isArray(tabs)){
        result.browser_pages=tabs.length;
        result.has_mercadolivre_page=tabs.some(x=>
          /^https:\/\/(?:www\.)?mercadolivre\.com\.br\//.test(String(x?.url||"")));
        result.has_mavuri_page=tabs.some(x=>
          /^https:\/\/mavurioficial\.github\.io\/affiliate-engine\//.test(String(x?.url||"")));
      }
    }
  }
 }finally{clearTimeout(timer)}
}catch{problems.push("chrome_cdp_unreachable")}
const session=process.env.MAVURI_TELEGRAM_SESSION_FILE||"";
if(session&&existsSync(session)){
 result.telegram_session_file=true;
 try{result.telegram_session_private=(statSync(session).mode&0o077)===0}catch{}
}
result.script_installed=Boolean(process.env.MAVURI_DISCOVERY_SCRIPT&&
  existsSync(process.env.MAVURI_DISCOVERY_SCRIPT));
result.cloud_live_enabled=process.env.MAVURI_CLOUD_LIVE_ENABLED==="YES_EXCLUSIVE_CLOUD_EXECUTOR";
if(result.total_ram_mb<2048)problems.push("insufficient_memory_for_chrome");
if(!result.chrome_cdp)problems.push("chrome_not_running");
if(!result.telegram_session_file||!result.telegram_session_private)problems.push("telegram_session_missing_or_insecure");
if(!result.script_installed)problems.push("sanitized_v85_not_installed");
result.ok=problems.length===0;
// Hide all raw URLs, credentials, session contents, app IDs and chat IDs.
console.log(JSON.stringify(result,null,2));
if(!result.ok)process.exitCode=2;

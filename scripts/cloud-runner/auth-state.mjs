#!/usr/bin/env node
// Mavuri V85 browser session export: AUTHENTICATION TEST ONLY.
// Never commit outputs; never print cookie values or Supabase JWTs.
// Encrypt state with per-export AES-256-GCM; GitHub secrets hold BOTH parts,
// provided manually by the owner only. No service role or Telegram user session.
import {randomBytes,createCipheriv,createDecipheriv} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {mkdir,writeFile} from "node:fs/promises";
import {homedir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const ROOT="https://mavurioficial.github.io";
const mlCookie=d=>/^(?:\.)?(?:[a-z0-9-]+\.)*mercadolivre\.com\.br$/i.test(String(d||""));
const mavuriCookie=d=>/^(?:\.)?mavurioficial\.github\.io$/i.test(String(d||""));
export function filterMavuriAuthState(input){
  const cookies=(Array.isArray(input?.cookies)?input.cookies:[])
    .filter(c=>mlCookie(c?.domain)||mavuriCookie(c?.domain))
    .map(c=>({name:c.name,value:c.value,domain:c.domain,path:c.path||"/",
      expires:c.expires,httpOnly:Boolean(c.httpOnly),secure:Boolean(c.secure),
      sameSite:["Lax","Strict","None"].includes(c.sameSite)?c.sameSite:"Lax"}));
  const origins=(Array.isArray(input?.origins)?input.origins:[])
    .filter(x=>String(x.origin||"")===ROOT)
    .map(x=>({origin:ROOT,localStorage:
      (Array.isArray(x.localStorage)?x.localStorage:[])
      .filter(y=>typeof y?.name==="string"&&typeof y?.value==="string")
      .map(y=>({name:y.name,value:y.value}))}));
  return {cookies,origins};
}
export function packageMavuriAuthState(state){
  const filtered=filterMavuriAuthState(state);
  const raw=Buffer.from(JSON.stringify({v:1,state:filtered}),"utf8");
  if(raw.length>1024*1024)throw Error("state_too_large");
  const key=randomBytes(32),iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",key,iv);
  const data=Buffer.concat([cipher.update(gzipSync(raw)),cipher.final()]);
  const record={v:1,iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),
    ciphertext:data.toString("base64")};
  const envelope=Buffer.from(JSON.stringify(record)).toString("base64");
  if(Buffer.byteLength(envelope,"utf8")>=48*1024)
    throw Error("encrypted_bundle_exceeds_github_secret_limit");
  return {bundle:envelope,key:key.toString("base64"),
    stats:{ml_cookie_count:filtered.cookies.filter(c=>mlCookie(c.domain)).length,
      mavuri_origin_present:filtered.origins.length===1,
      encrypted_secret_bytes:Buffer.byteLength(envelope,"utf8")}};
}
export function unpackageMavuriAuthState(bundle,key){
  const k=Buffer.from(String(key||""),"base64");
  if(k.length!==32)throw Error("bad_auth_key");
  const raw=Buffer.from(String(bundle||""),"base64");
  if(raw.length>50*1024||raw.length<48)throw Error("bad_auth_bundle");
  const payload=JSON.parse(raw.toString("utf8"));
  if(payload.v!==1)throw Error("unsupported_auth_version");
  const iv=Buffer.from(payload.iv,"base64"),tag=Buffer.from(payload.tag,"base64");
  if(iv.length!==12||tag.length!==16)throw Error("bad_auth_envelope");
  const decipher=createDecipheriv("aes-256-gcm",k,iv);
  decipher.setAuthTag(tag);
  const plaintext=Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext,"base64")),decipher.final()
  ]);
  const doc=JSON.parse(gunzipSync(plaintext,{maxOutputLength:1024*1024}).toString("utf8"));
  if(doc.v!==1)throw Error("unsupported_auth_state");
  const state=filterMavuriAuthState(doc.state);
  if(state.cookies.length!==(doc.state.cookies||[]).length||
    state.origins.length!==(doc.state.origins||[]).length)
    throw Error("auth_state_has_unexpected_domains");
  return state;
}
// Diagnostic contains only booleans and aggregate counts.
// Never reports cookie names/values, localStorage keys, URLs or account IDs.
async function diagnose(){
  const port=Number(process.env.MAVURI_CHROME_PORT||9222);
  if(!Number.isSafeInteger(port)||port<1024||port>65535)
    throw Error("invalid_local_chrome_port");
  const {chromium}=await import("playwright-core");
  const browser=await chromium.connectOverCDP("http://127.0.0.1:"+port,
    {timeout:10000});
  try {
    const contexts=browser.contexts();
    const results=[];
    for(let i=0;i<contexts.length;i++){
      const context=contexts[i];
      const filtered=filterMavuriAuthState(await context.storageState());
      const hosts=context.pages().map(page=>{
        try{return new URL(page.url()).hostname.toLowerCase()}
        catch{return ""}
      });
      results.push({
        context_index:i,
        ml_cookie_count:filtered.cookies.filter(x=>mlCookie(x.domain)).length,
        mavuri_origin_present:filtered.origins.length>0,
        mavuri_storage_entries:filtered.origins.reduce((n,x)=>n+x.localStorage.length,0),
        ml_tab_open:hosts.some(h=>h==="mercadolivre.com.br"||
          h.endsWith(".mercadolivre.com.br")),
        mavuri_tab_open:hosts.includes("mavurioficial.github.io"),
        ready_for_export:filtered.cookies.some(x=>mlCookie(x.domain))&&
          filtered.origins.some(x=>x.localStorage.length>0)
      });
    }
    console.log(JSON.stringify({mode:"diagnose",read_only:true,
      secret_values_not_logged:true,context_count:contexts.length,contexts:results},null,2));
  }finally {await browser.close()}
}
async function capture(){
  const port=Number(process.env.MAVURI_CHROME_PORT||9222);
  if(!Number.isSafeInteger(port)||port<1024||port>65535)
    throw Error("invalid_local_chrome_port");
  // Only accepts loopback; never connects to a remotely exposed CDP port.
  const {chromium}=await import("playwright-core");
  const browser=await chromium.connectOverCDP("http://127.0.0.1:"+port,
    {timeout:10000});
  let state;
  try{
    const context=browser.contexts()[0];
    if(!context)throw Error("browser_context_not_found");
    state=filterMavuriAuthState(await context.storageState());
  }finally{await browser.close()}
  const sealed=packageMavuriAuthState(state);
  if(sealed.stats.ml_cookie_count===0||!sealed.stats.mavuri_origin_present)
    throw Error("ml_cookies_or_mavuri_origin_missing_open_logged_in_tabs");
  const dest=process.env.MAVURI_PRIVATE_EXPORT_DIR||
    join(homedir(),"MavuriCloudAuth");
  await mkdir(dest,{recursive:true,mode:0o700});
  const bundlePath=join(dest,"MAVURI_AUTH_BUNDLE.txt");
  const keyPath=join(dest,"MAVURI_AUTH_KEY.txt");
  // Do not overwrite; a new export requires deliberately removing old files.
  await writeFile(bundlePath,sealed.bundle,{flag:"wx",mode:0o600});
  await writeFile(keyPath,sealed.key,{flag:"wx",mode:0o600});
  console.log(JSON.stringify({ok:true,no_browser_changes:true,
    values_not_logged:true,ml_cookie_count:sealed.stats.ml_cookie_count,
    mavuri_origin_present:sealed.stats.mavuri_origin_present,
    encrypted_secret_bytes:sealed.stats.encrypted_secret_bytes,
    output_files:[bundlePath,keyPath],
    warning:"Both output files are SECRET. Copy contents only to protected GitHub Actions Secrets, never into chat, commit or logs."},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(!["capture","diagnose"].includes(process.argv[2])){
    console.error("Uso: node scripts/cloud-runner/auth-state.mjs diagnose | capture");
    process.exitCode=2;
  }else {
    const task=process.argv[2]==="diagnose"?diagnose:capture;
    task().catch(e=>{
      console.error("Operação bloqueada: "+String(e?.message||"unknown").slice(0,110));
      process.exitCode=1;
    });
  }
}

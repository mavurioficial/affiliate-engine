#!/usr/bin/env node
// LOCAL/OFFLINE ONLY: sanitize user's own V85 before copying to private VM.
// Never commit the produced script; it includes proprietary logic and paths.
// Does not transmit or print secrets.
import {readFileSync,writeFileSync,chmodSync,existsSync} from "node:fs";
import {resolve} from "node:path";
const [input,output]=process.argv.slice(2);
if(!input||!output||resolve(input)===resolve(output)){
 console.error("Uso: node sanitize-v85.mjs V85-original.mjs /local/seguro/browser-discovery-v85.cloud.mjs");
 process.exit(2);
}
if(existsSync(output)){console.error("Destino já existe. Não sobrescrever.");process.exit(2);}
let text=readFileSync(input,"utf8");
const keys=["TELEGRAM_USER_API_HASH","SHOPEE_API_SECRET","AMAZON_COLLECTOR_LOCAL_TOKEN"];
const changes=[];
for(const key of keys){
 const escaped=key.replace(/[.*+?^$\{\}()|[\]\\]/g,"\\$&");
 const regexp=new RegExp("(const\\s+"+escaped+"\\s*=\\s*[^\\n]{0,190}?\\|\\|\\s*)([\\\"'])([^\\n\\\"']+)([\\\"'])");
 const original=regexp.exec(text);
 if(!original) {
  // Already sanitized fallback `|| ""` is fine; otherwise fail closed.
  const line=text.split("\n").find(l=>l.includes("const "+key+" ="))||"";
  if(!line.includes('|| ""')&&!line.includes("|| ''"))throw Error("Credencial não localizável: "+key);
  continue;
 }
 text=text.replace(regexp,(whole,prefix)=>prefix+'""');
 changes.push(key);
}
for(const key of keys) {
 const row=text.split("\n").find(l=>l.includes("const "+key+" ="))||"";
 const match=/\|\|\s*["']([^"']+)["']/.exec(row);
 if(!row||(match&&match[1]))throw Error("Falha na limpeza de "+key);
}
// Amazon is outside the user's 8/8/5 target and on the VM the local
// collector may spawn another process and consume RAM. Disable by default
// without changing Shopee/ML/Magalu discovery or coupon priority.
const originalAmazon="  await ensureAmazonCollectorService()";
if(text.includes(originalAmazon)) {
  text=text.replace(originalAmazon,
    '  if (process.env.MAVURI_CLOUD_AMAZON_COLLECTOR === "enabled") await ensureAmazonCollectorService()');
}
if(!text.includes("async function main()"))throw Error("Não parece ser o V85 auditado");
writeFileSync(output,text,{encoding:"utf8",flag:"wx",mode:0o600});
chmodSync(output,0o600);
console.log("Cópia privada V85 produzida. Fallbacks removidos: "+changes.length+". Revise outras constantes e NUNCA publique o resultado no GitHub.");

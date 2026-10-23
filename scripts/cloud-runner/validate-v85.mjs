#!/usr/bin/env node
// Mavuri V85 portable server preflight. ZERO network / subprocess / publication.
// It must NEVER print credential values, cookies, Telegram sessions, or file contents.
import {readFileSync,statSync,existsSync} from "node:fs";
import {resolve} from "node:path";
const flags=new Set(process.argv.slice(2));
const source=process.env.MAVURI_DISCOVERY_SCRIPT||process.argv.find(x=>x.endsWith(".mjs"));
const problems=[],notices=[];
const fail=x=>problems.push(x),note=x=>notices.push(x);
if(!source)fail("MAVURI_DISCOVERY_SCRIPT não configurado");
else if(!existsSync(source))fail("Arquivo V85 não encontrado");
else {
  let s="";
  try{s=readFileSync(resolve(source),"utf8")}catch{fail("Não foi possível ler o V85")}
  const expected=["async function main()","async function runShopeeTargetCycle(","async function runMagaluTargetCycle(","async function discoverMercadoLivreDiversifiedPool(","async function readTelegramChannelMessages("];
  for(const marker of expected)if(!s.includes(marker))fail("V85 não corresponde à revisão auditada ("+marker+")");
  // These three historic default credentials MUST NOT travel to a hosted VM.
  for(const id of ["TELEGRAM_USER_API_HASH","SHOPEE_API_SECRET","AMAZON_COLLECTOR_LOCAL_TOKEN"]){
    const line=s.split("\n").find(line=>line.includes("const "+id+" ="));
    if(!line) {fail("Campo de credencial ausente: "+id);continue;}
    const fallback=/\|\|\s*["']([^"']+)["']/.exec(line);
    if(fallback&&fallback[1].length)fail("Literal de credencial embutido em "+id+"; substitua o fallback por string vazia");
  }
  if(/MAVURI_CLOUD_DRY_RUN/.test(s))note("V85 tem flag customizada não validada; revisar antes da ativação");
  if(s.includes("await ensureAmazonCollectorService()"))
    note("O V85 ainda inicia o coletor Amazon local: revisar consumo/serviço antes de usar em VM");
}
const env=process.env;
if(process.platform!=="linux")note("Kit foi projetado para Linux; preflight local é somente informativo");
if(Number(process.versions.node.split(".")[0])<24)fail("Node.js 24 ou superior é exigido");
if(!env.MAVURI_CHROME_PROFILE)fail("MAVURI_CHROME_PROFILE é obrigatório");
if(!env.MAVURI_TELEGRAM_SESSION_FILE)fail("MAVURI_TELEGRAM_SESSION_FILE é obrigatório");
if(!env.CHROME_PATH)fail("CHROME_PATH é obrigatório (Linux)");
for(const key of ["MAVURI_TELEGRAM_API_ID","MAVURI_TELEGRAM_API_HASH",
  "SHOPEE_AFFILIATE_APP_ID","SHOPEE_AFFILIATE_SECRET"])
  if(!env[key])fail("Segredo/variável ausente: "+key);
if(env.MAVURI_AUTO_INGEST==="false"||env.MAVURI_AUTO_INGEST==="0")
  note("AUTO_INGEST=false protege Mercado Livre, MAS não impede publicações Shopee/Magalu/cupons");
if(flags.has("--live")){
  if(env.MAVURI_CLOUD_LIVE_ENABLED!=="YES_EXCLUSIVE_CLOUD_EXECUTOR")
    fail("Habilitação cloud live ausente. Não executar V85 até provar exclusividade do Windows e roteamento");
  if(env.MAVURI_CLOUD_WINDOWS_STOPPED!=="CONFIRMED")
    fail("Windows V85 não confirmado como interrompido");
  if(env.MAVURI_AUTO_INGEST!=="true")
    fail("AUTO_INGEST=true é requerido para ML, depois da revisão dos riscos");
  const marker=env.MAVURI_CLOUD_CUTOVER_MARKER||"/var/lib/mavuri/.cloud-cutover-reviewed";
  if(!existsSync(marker))fail("Marcador de revisão/cutover não foi encontrado");
}
let available=0;
try{
 const os=await import("node:os");
 available=Math.round(os.totalmem()/1024/1024);
 if(available<2048)fail("VM com menos de 2 GB RAM: Chrome + MTProto + V85 não são recomendados");
}catch{}
for(const key of ["MAVURI_CHROME_PROFILE","MAVURI_TELEGRAM_SESSION_FILE"]){
  if(!env[key]||!existsSync(env[key]))continue;
  try{const mode=statSync(env[key]).mode&0o777;
    if(key==="MAVURI_TELEGRAM_SESSION_FILE"&&(mode&0o077)!==0)
      fail("Arquivo de sessão Telegram com permissões de grupo/outros abertas (exigir 0600)");
  }catch{fail("Não foi possível verificar permissões de "+key)}
}
const summary={ok:problems.length===0,live_requested:flags.has("--live"),
 node_major:Number(process.versions.node.split(".")[0]),memory_mb:available,
 checks:problems,notices};
console.log(JSON.stringify(summary,null,2));
if(problems.length)process.exitCode=78;

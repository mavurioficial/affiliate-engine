#!/usr/bin/env node
// OFFLINE ONLY: isolate ML in a previously SANITIZED private V86.
import {readFileSync,writeFileSync,chmodSync,existsSync} from "node:fs";
import {resolve} from "node:path";
export function isolateMlV86(s){
 const start="  // V51: MTProto alimenta o ciclo de cupons;";
 const end="  const mlPool = await discoverMercadoLivreDiversifiedPool(page)";
 const couponStart="  // Segunda passagem prioritária: inclui cupons ativáveis ligados a produtos ML.";
 const couponEnd="  for (const p of products) p.mavuri_score = mavuriScore(p)";
 const repub="    if (ingestSucceeded) {";
 for(const a of [start,end,couponStart,couponEnd,repub])
  if(s.split(a).length!==2)throw Error("unknown_V86_layout");
 let from=s.indexOf(start),to=s.indexOf(end);
 if(from<0||to<=from)throw Error("bad_marketplace_section");
 const neutral=[
  "  // ML-ONLY: all other marketplaces, MTProto and coupon publishing disabled.",
  "  const affiliateQueueTotals={claimed:0,completed:0,failed:0,mercadolivre:0,shopee:0,magalu:0};",
  "  const shopeeVoucherTotals={detected:0,parsed:0,linked:0,created:0,updated:0,unchanged:0};",
  "  let couponTotals={discovered:0,created:0,updated:0,active:0,pending:0,jobsCreated:0,sent:0,failed:0};",
  "  const shopeeDiscoveryTotals={selected:0,analyzed:0,jobs:0,cooldown:0,limit:0,diversity:0,status:'disabled_for_ml'};",
  "  const magaluDiscoveryTotals={selected:0,analyzed:0,structured:0,linkOnly:0,jobs:0,cooldown:0,status:'disabled_for_ml'};",
  ""
 ].join("\n");
 s=s.slice(0,from)+neutral+s.slice(to);
 from=s.indexOf(couponStart);to=s.indexOf(couponEnd);
 if(from<0||to<=from)throw Error("bad_second_coupon_section");
 s=s.slice(0,from)+"  // ML-ONLY: coupon side effects disabled.\\n".replace("\\n","\n")+s.slice(to);
 s=s.replace(repub,"    if (ingestSucceeded && process.env.MAVURI_ML_ENABLE_REPUB==='APPROVED_AFTER_POLICY_REVIEW') {");
 const main="async function main() {";
 if(s.split(main).length!==2)throw Error("missing_main");
 s=s.replace(main,main+"\n  if(process.env.MAVURI_CLOUD_ML_ONLY!=='YES_ISOLATED')\n    throw new Error('Explicit ML-only isolation required');");
 for(const check of ["YES_EXCLUSIVE_CLOUD_EXECUTOR","MAVURI_CLOUD_WINDOWS_STOPPED","MAVURI_CLOUD_CUTOVER_MARKER"])
  if(!s.includes(check))throw Error("sanitized_cutover_guard_missing");
 const tail=s.slice(s.indexOf(main));
 for(const forbidden of ["await runShopeeTargetCycle(page)","await runMagaluTargetCycle(page)",
  "await discoverAndIngestShopeeVouchers(page)","await testMlAffiliateTelegramMtproto()",
  "await processCouponCycle(page, [])","await processCouponCycle(page, products)",
  "await processAffiliateLinkQueue(page)"])
  if(tail.includes(forbidden))throw Error("unremoved_side_effect");
 return s;
}
if(process.argv[1]&&import.meta.url===new URL("file://"+resolve(process.argv[1])).href){
 const [input,output]=process.argv.slice(2);
 if(!input||!output||resolve(input)===resolve(output)||existsSync(output)){
  console.error("Usage: node prepare-ml-only-v86.mjs private.sanitized.mjs private.ml-only.mjs");
  process.exitCode=2;
 }else{
  const code=isolateMlV86(readFileSync(input,"utf8"));
  writeFileSync(output,code,{encoding:"utf8",flag:"wx",mode:0o600});
  chmodSync(output,0o600);
  console.log("Private ML-only V86 prepared; do not commit output. Cloud launch remains disabled by default.");
 }
}

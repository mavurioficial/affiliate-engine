import assert from "node:assert/strict";
import {isolateMlV86} from "../scripts/cloud-runner/prepare-ml-only-v86.mjs";
const fixture=[
 "const CHROME='localhost';",
 "async function main() {",
 "  if(process.env.MAVURI_CLOUD_LIVE_ENABLED!=='YES_EXCLUSIVE_CLOUD_EXECUTOR') throw Error('disabled');",
 "  if(process.env.MAVURI_CLOUD_WINDOWS_STOPPED!=='CONFIRMED') throw Error('local_active');",
 "  if(!process.env.MAVURI_CLOUD_CUTOVER_MARKER)throw Error('marker');",
 "  // V51: MTProto alimenta o ciclo de cupons;",
 "  await testMlAffiliateTelegramMtproto();",
 "  await processAffiliateLinkQueue(page);",
 "  await discoverAndIngestShopeeVouchers(page);",
 "  await processCouponCycle(page, []);",
 "  await runShopeeTargetCycle(page);",
 "  await runMagaluTargetCycle(page);",
 "  const mlPool = await discoverMercadoLivreDiversifiedPool(page)",
 "  const mlBestPriceExpansion=await expandMlBestPriceVariants(page,mlPool.products);",
 "  // Segunda passagem prioritária: inclui cupons ativáveis ligados a produtos ML.",
 "  await processCouponCycle(page, products);",
 "  for (const p of products) p.mavuri_score = mavuriScore(p)",
 "    if (ingestSucceeded) {",
 "      await withMavuriSession(page,runRepublish)",
 "    }",
 "}"
].join("\n");
const result=isolateMlV86(fixture);
for(const key of ["MAVURI_CLOUD_ML_ONLY!=='YES_ISOLATED'",
 "const mlPool = await discoverMercadoLivreDiversifiedPool(page)",
 "const mlBestPriceExpansion=await expandMlBestPriceVariants",
 "APPROVED_AFTER_POLICY_REVIEW",
 "status:'disabled_for_ml'"])
 assert.ok(result.includes(key),key);
for(const disabled of ["await testMlAffiliateTelegramMtproto()",
 "await processAffiliateLinkQueue(page)","await discoverAndIngestShopeeVouchers(page)",
 "await runShopeeTargetCycle(page)","await runMagaluTargetCycle(page)",
 "await processCouponCycle(page, [])","await processCouponCycle(page, products)"])
 assert.ok(!result.includes(disabled),"Unremoved side effect: "+disabled);
assert.throws(()=>isolateMlV86(fixture.replace("MAVURI_CLOUD_WINDOWS_STOPPED","NO_CUTOVER")),
 /sanitized_cutover_guard_missing/);
assert.throws(()=>isolateMlV86(fixture.replace("  const mlPool = await discoverMercadoLivreDiversifiedPool(page)","")),
 /unknown_V86_layout/);
console.log("ML-only V86 preflight: isolate all non-ML side effects, no secret output.");

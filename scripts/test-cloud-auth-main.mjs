import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {captureMavuriState,filterMavuriAuthState,packageMavuriAuthState,unpackageMavuriAuthState}
  from "./cloud-runner/auth-state.mjs";

const original={
 cookies:[
  {name:"ML",value:"PRIVATE_MELI_FIXTURE",domain:".mercadolivre.com.br",
   path:"/",expires:2000000000,secure:true,httpOnly:true,sameSite:"Lax"},
  {name:"Evil",value:"PRIVATE_EVIL_FIXTURE",domain:".mercadolivre.com.br.evil.org",
   path:"/",expires:2000000000,secure:true,httpOnly:true,sameSite:"Lax"}],
 origins:[
  {origin:"https://mavurioficial.github.io",
   localStorage:[{name:"sb-test-auth-token",value:"PRIVATE_SESSION_FIXTURE"}]},
  {origin:"https://github.com",
   localStorage:[{name:"unwanted",value:"PRIVATE_GITHUB_FIXTURE"}]}
 ]
};
const filtered=filterMavuriAuthState(original);
assert.equal(filtered.cookies.length,1);
assert.equal(filtered.origins.length,1);
// CDP may omit localStorage origins of Chrome tabs that were open before
// Playwright connected; only recover Mavuri's exact Supabase auth key.
const fakeContext={
  storageState:async()=>({cookies:[original.cookies[0]],origins:[]}),
  pages:()=>[{
    url:()=>"https://mavurioficial.github.io/affiliate-engine/",
    evaluate:async (_script,key)=>{
      assert.equal(key,"sb-otikoxnfotyjgphrdudn-auth-token");
      return {present:true,value:"TEST_ONLY_NONLIVE_SUPABASE_AUTH_TOKEN"};
    }
  },{
    url:()=>"https://mavurioficial.github.io/other-app/",
    evaluate:async()=>{throw Error("Must not read unrelated pages")}
  }]
};
const recovered=await captureMavuriState(fakeContext);
assert.equal(recovered.cookies.length,1);
assert.equal(recovered.origins.length,1);
assert.equal(recovered.origins[0].localStorage.length,1);
assert.equal(recovered.origins[0].localStorage[0].name,
 "sb-otikoxnfotyjgphrdudn-auth-token");
assert.equal(packageMavuriAuthState(recovered).stats.mavuri_origin_present,true);
const noSession=await captureMavuriState({
  storageState:fakeContext.storageState,
  pages:()=>[{url:fakeContext.pages()[0].url,
    evaluate:async()=>({present:false,value:null})}]
});
assert.equal(noSession.origins.length,0);
const packed=packageMavuriAuthState(original);
assert.equal(packed.stats.ml_cookie_count,1);
assert.ok(packed.bundle.length<48*1024);
assert.ok(!packed.bundle.includes("PRIVATE_MELI_FIXTURE"));
assert.deepEqual(unpackageMavuriAuthState(packed.bundle,packed.key),filtered);
assert.throws(()=>unpackageMavuriAuthState(packed.bundle,
  packageMavuriAuthState(original).key));
assert.throws(()=>unpackageMavuriAuthState(packed.bundle,"bad"),/bad_auth_key/);
const authStateSource=readFileSync("scripts/cloud-runner/auth-state.mjs","utf8");
assert.match(authStateSource,/async function diagnose\(\)/);
assert.match(authStateSource,/secret_values_not_logged:true/);
assert.match(authStateSource,/ml_cookie_count:/);
assert.match(authStateSource,/mavuri_origin_present:/);
assert.match(authStateSource,/mavuri_storage_entries:/);
assert.match(authStateSource,/ready_for_export:/);
assert.match(authStateSource,/\["capture","diagnose"\]/);
const diagnostic=spawnSync(process.execPath,
  ["scripts/cloud-runner/auth-state.mjs","bad-mode"],{encoding:"utf8",timeout:5000});
assert.equal(diagnostic.status,2);
const smoke=readFileSync("scripts/cloud-runner/auth-smoke.mjs","utf8");
for(const expected of ["meli_home_status","meli_403_scope",
 "both_requests_403","hub_only_403","undetermined",
 "https://www.mercadolivre.com.br/",
 "safe_mode:\"read_only\"",
 "mavuri_supabase_user_confirmed","meli_hub_status",
 "report.shopee_preview","data?.dry_run!==true",
 "data?.cloud_publishing!==false","data?.cloud_schedule!==false"]){
 assert.ok(smoke.includes(expected),"missing guarantee "+expected);
}
const calls=[...smoke.matchAll(/supabase\.functions\.invoke\(\s*["']([^"']+)["']/g)]
 .map(match=>match[1]);
assert.deepEqual(calls,["discovery-cloud-shopee","discovery-cloud-shopee-preflight"]);
assert.match(smoke,/body:\{mode:"single_offer_preflight"\}/);
assert.match(smoke,/data\?\.safety\?\.reads_only!==true/);
assert.match(smoke,/data\?\.safety\?\.ready_to_publish!==false/);
assert.ok(smoke.includes("data?.commercial_refresh?.ready_for_write!==false"));
assert.ok(smoke.includes("data?.commercial_refresh?.ready_to_publish!==false"));
assert.ok(smoke.includes("affiliate_account_bound:data.account_binding?.verified===true"));
assert.ok(smoke.includes("affiliate_account_bound:false"));
for(const field of ["commercial_refresh","refreshable","affiliate_link_rotated",
  "invalid_or_untrusted","missing_or_ambiguous"]){
 assert.ok(smoke.includes(field),"missing aggregate preview "+field);
}
assert.match(smoke,/shopee_one_offer:/);
for (const diagnostic of ["known_persisted_offers","missing_persisted",
  "final_category_unavailable","invalid_affiliate_or_price",
  "invalid_candidate_price","invalid_stored_price",
  "bad_persisted_affiliate_url","bad_persisted_image_url",
  "affiliate_url_changed","price_changed",
  "blocked_recent_48h","rules_not_matched",
  "blocked_pending","blocked_category_diversity"]) {
  assert.ok(smoke.includes(diagnostic),"missing bounded diagnostic "+diagnostic);
}
assert.match(smoke,/const eligibility=Object\.fromEntries/);
assert.match(smoke,/Number\.isSafeInteger/);
assert.match(smoke,/body:\{mode:"general_audit"\}/);
assert.ok(smoke.includes("report.meli_ok=report.meli_hub_status===200"));
assert.ok(smoke.includes("report.ok=report.mavuri_supabase_user_confirmed"));
assert.ok(!smoke.includes("report.ok=report.meli_hub_status===200"));

for(const banned of [".insert(",".update(",".upsert(",".delete(",
 "flow_delivery_jobs","flow_delivery_logs","sendMessage","sendPhoto",
 "service_role","createLink"]){
 assert.ok(!smoke.includes(banned),"unsafe browser action "+banned);
}
const portalPage=readFileSync("verificar-shopee/index.html","utf8");
const staticBuild=readFileSync("scripts/build.mjs","utf8");
assert.ok(staticBuild.includes("cpSync('verificar-shopee', 'dist/verificar-shopee'"));
assert.ok(portalPage.includes('https://affiliate.shopee.com.br/open_api'));
assert.ok(portalPage.includes('import {supabase} from "../src/app/auth.js"'));
assert.ok(portalPage.includes('mode:"verify_portal_app_id"'));
assert.ok(portalPage.includes('app_id_matches_configured_api'));
assert.ok(portalPage.includes('account_binding_complete!==false'));
assert.ok(portalPage.includes('no_publication!==true'));
assert.ok(portalPage.includes('supabase.auth.getUser()'));
assert.ok(portalPage.includes('inputmode="numeric"'));
for(const banned of ["service_role","SHOPEE_AFFILIATE_SECRET","localStorage.getItem",
 "supabase.from(","fetch(\"https://api.telegram.org","console.log("]){
 assert.ok(!portalPage.includes(banned),"unsafe portal page "+banned);
}
const workflow=readFileSync(".github/workflows/mavuri-auth-smoke.yml","utf8");
assert.match(workflow,/workflow_dispatch/);
assert.match(workflow,/refs\/heads\/main/);
assert.match(workflow,/environment: mavuri-auth-test/);
assert.match(workflow,/MAVURI_SHOPEE_PREVIEW: "1"/);
assert.ok(!workflow.includes("schedule:"));
const secretsIdx=workflow.indexOf("MAVURI_AUTH_BUNDLE: ${{ secrets.MAVURI_AUTH_BUNDLE }}");
const npmIdx=workflow.indexOf("npm install ");
const runIdx=workflow.indexOf("node scripts/cloud-runner/auth-smoke.mjs");
assert.ok(secretsIdx>npmIdx&&runIdx>secretsIdx,
 "credentials must only enter final readonly smoke step");
const proc=spawnSync(process.execPath,["scripts/cloud-runner/auth-smoke.mjs"],{
 env:{...process.env,MAVURI_AUTH_BUNDLE:"",MAVURI_AUTH_KEY:""},
 encoding:"utf8",timeout:5000
});
assert.equal(proc.status,78);
assert.ok(proc.stdout.includes("github_actions_auth_secrets_missing"));
console.log("Mavuri authenticated test: encryption, fail-closed and Shopee read-only boundaries approved.");

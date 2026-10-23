import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {filterMavuriAuthState,packageMavuriAuthState,unpackageMavuriAuthState}
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
const packed=packageMavuriAuthState(original);
assert.equal(packed.stats.ml_cookie_count,1);
assert.ok(packed.bundle.length<48*1024);
assert.ok(!packed.bundle.includes("PRIVATE_MELI_FIXTURE"));
assert.deepEqual(unpackageMavuriAuthState(packed.bundle,packed.key),filtered);
assert.throws(()=>unpackageMavuriAuthState(packed.bundle,
  packageMavuriAuthState(original).key));
assert.throws(()=>unpackageMavuriAuthState(packed.bundle,"bad"),/bad_auth_key/);
const smoke=readFileSync("scripts/cloud-runner/auth-smoke.mjs","utf8");
for(const expected of ["safe_mode:\"read_only\"",
 "mavuri_supabase_user_confirmed","meli_hub_status",
 "report.shopee_preview","data?.dry_run!==true",
 "data?.cloud_publishing!==false","data?.cloud_schedule!==false"]){
 assert.ok(smoke.includes(expected),"missing guarantee "+expected);
}
const calls=[...smoke.matchAll(/supabase\.functions\.invoke\(\s*["']([^"']+)["']/g)]
 .map(match=>match[1]);
assert.deepEqual(calls,["discovery-cloud-shopee"]);
assert.match(smoke,/body:\{mode:"general_audit"\}/);
for(const banned of [".insert(",".update(",".upsert(",".delete(",
 "flow_delivery_jobs","flow_delivery_logs","sendMessage","sendPhoto",
 "service_role","createLink"]){
 assert.ok(!smoke.includes(banned),"unsafe browser action "+banned);
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

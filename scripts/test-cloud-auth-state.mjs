import assert from "node:assert/strict";
import {filterMavuriAuthState,packageMavuriAuthState,unpackageMavuriAuthState}
 from "./cloud-runner/auth-state.mjs";
const fixture={
 cookies:[
   {name:"auth",value:"ML_COOKIE_PRIVATE_FIXTURE",domain:".mercadolivre.com.br",
    path:"/",expires:2000000000,httpOnly:true,secure:true,sameSite:"Lax"},
   {name:"b",value:"OTHER_SITE_TOKEN_FIXTURE",domain:".example.org",
    path:"/",expires:-1,httpOnly:false,secure:true,sameSite:"Lax"},
   {name:"bad",value:"TYPOSQUAT_FIXTURE",domain:".mercadolivre.com.br.evil.org",
    path:"/",expires:-1,httpOnly:false,secure:true,sameSite:"Lax"},
 ],
 origins:[
 {origin:"https://mavurioficial.github.io",
 localStorage:[{name:"sb-demo-auth-token",value:"PRIVATE_TOKEN_FIXTURE"}]},
 {origin:"https://github.com",localStorage:[{name:"testing",value:"PRIVATE_OTHER_ORIGIN"}]}
 ]};
const allowed=filterMavuriAuthState(fixture);
assert.equal(allowed.cookies.length,1);
assert.equal(allowed.origins.length,1);
assert.equal(allowed.origins[0].localStorage[0].name,"sb-demo-auth-token");
const packed=packageMavuriAuthState(fixture);
assert.ok(packed.bundle.length<48*1024);
assert.equal(packed.stats.ml_cookie_count,1);
assert.equal(packed.stats.mavuri_origin_present,true);
assert.equal(packed.bundle.includes("ML_COOKIE_PRIVATE_FIXTURE"),false);
assert.equal(packed.bundle.includes("PRIVATE_TOKEN_FIXTURE"),false);
const decoded=unpackageMavuriAuthState(packed.bundle,packed.key);
assert.deepEqual(decoded,allowed);
assert.ok(!JSON.stringify(decoded).includes("OTHER_SITE_TOKEN_FIXTURE"));
assert.ok(!JSON.stringify(decoded).includes("TYPOSQUAT_FIXTURE"));
assert.ok(!JSON.stringify(decoded).includes("PRIVATE_OTHER_ORIGIN"));
assert.throws(()=>unpackageMavuriAuthState(packed.bundle,"tampered"),/bad_auth_key/);
assert.throws(()=>unpackageMavuriAuthState(packed.bundle,
 packageMavuriAuthState(fixture).key));
assert.throws(()=>packageMavuriAuthState({cookies:[],origins:[
 {origin:"https://mavurioficial.github.io",localStorage:[
 {name:"huge",value:"x".repeat(1024*1024)}]}]}),/state_too_large/);
const fs=await import("node:fs");
const child=await import("node:child_process");
const crypto=await import("node:crypto");
const smoke=fs.readFileSync("scripts/cloud-runner/auth-smoke.mjs","utf8");
for(const t of ["safe_mode:\"read_only\"","supabase.auth.getUser()","meli_hub_status",
 "mavuri_supabase_user_confirmed"]){assert.ok(smoke.includes(t),t)}
for(const danger of ["flow_delivery_jobs","flow_delivery_logs","functions.invoke(",
 "createLink","sendMessage","process.env.SUPABASE_SERVICE_ROLE_KEY"]){
 assert.equal(smoke.includes(danger),false,"read-only smoke must exclude "+danger);
}
const env={...process.env,MAVURI_AUTH_BUNDLE:"",MAVURI_AUTH_KEY:""};
const proc=child.spawnSync(process.execPath,["scripts/cloud-runner/auth-smoke.mjs"],{
 encoding:"utf8",env,timeout:7000
});
assert.equal(proc.status,78);
assert.ok(proc.stdout.includes("github_actions_auth_secrets_missing"));
assert.ok(!proc.stdout.includes("ML_COOKIE_PRIVATE_FIXTURE"));
console.log("Encrypted portable browser auth bundle and fail-closed smoke tests OK.");

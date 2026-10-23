import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const file="scripts/cloud-runner/ml-origin-readonly.mjs";
const source=readFileSync(file,"utf8");
assert.match(source,/connectOverCDP\("http:\/\/127\.0\.0\.1:"\+PORT/);
assert.match(source,/hub_authenticated/);
assert.match(source,/both_403/);
assert.match(source,/no_publication:true/);
assert.match(source,/no_links_generated:true/);
assert.match(source,/no_database_writes:true/);
assert.match(source,/no_cookies_logged:true/);
assert.match(source,/process\.exitCode=2/);
for(const banned of [
 "flow-worker", "flow-discovery-ingest", "generateShortLink",
 "generateGenericAffiliateLink", "supabase.functions.invoke",
 "service_role", "process.env.MAVURI_AUTH_KEY",
 "api.telegram.org", ".insert(", ".upsert(", "writeFileSync",
 "--remote-debugging-address=0.0.0.0"
])assert.ok(!source.includes(banned),"unsafe origin diagnostic: "+banned);
const forbidden=spawnSync(process.execPath,[file],{
 env:{...process.env,MAVURI_CHROME_PORT:"not-a-port"},
 encoding:"utf8",timeout:5000
});
assert.equal(forbidden.status,4);
const response=JSON.parse(forbidden.stdout);
assert.equal(response.status,"invalid_local_port");
assert.equal(response.no_publication,true);
assert.equal(response.hub_http,null);
assert.equal(response.home_http,null);
assert.equal(response.chrome_cdp,false);
assert.equal(forbidden.stderr,"");
console.log("ML VM origin smoke: fail-closed/no-network static checks passed.");

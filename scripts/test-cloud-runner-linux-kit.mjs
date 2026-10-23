import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,existsSync,statSync,rmSync}
 from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
const dir=mkdtempSync(join(tmpdir(),"mavuri-cloud-runner-tests-"));
try{
 const source=join(dir,"v85-private-original.mjs");
 const sanitized=join(dir,"v85-private-clean.mjs");
 const fixture=[
 'const TELEGRAM_USER_API_HASH = String(process.env.MAVURI_TELEGRAM_API_HASH || "TEST_ONLY_NOT_REAL").trim()',
 'const SHOPEE_API_SECRET = process.env.SHOPEE_AFFILIATE_SECRET || "TEST_ONLY_NOT_REAL"',
 'const AMAZON_COLLECTOR_LOCAL_TOKEN = process.env.MAVURI_AMAZON_COLLECTOR_LOCAL_TOKEN || "TEST_ONLY_NOT_REAL"',
 'async function main() {}',
 'async function runShopeeTargetCycle() {}',
 'async function runMagaluTargetCycle() {}',
 'async function discoverMercadoLivreDiversifiedPool() {}',
 'async function readTelegramChannelMessages() {}'
 ].join("\n")+"\n";
 writeFileSync(source,fixture,{mode:0o600});
 const exe=spawnSync(process.execPath,["scripts/cloud-runner/sanitize-v85.mjs",source,sanitized],{
  encoding:"utf8"
 });
 assert.equal(exe.status,0,exe.stderr);
 assert.equal(existsSync(sanitized),true);
 const clean=readFileSync(sanitized,"utf8");
 assert.ok(!clean.includes("TEST_ONLY_NOT_REAL"));
 assert.ok(readFileSync(source,"utf8").includes("TEST_ONLY_NOT_REAL"));
 assert.equal(statSync(sanitized).mode&0o077,0,"sanitized source private only");
 const again=spawnSync(process.execPath,["scripts/cloud-runner/sanitize-v85.mjs",source,sanitized],{encoding:"utf8"});
 assert.notEqual(again.status,0,"will not clobber an existing private script");
 const env={...process.env,MAVURI_DISCOVERY_SCRIPT:sanitized,
  MAVURI_CHROME_PROFILE:dir,MAVURI_TELEGRAM_SESSION_FILE:join(dir,"telegram-user.session"),
  CHROME_PATH:"/usr/bin/chromium",
  MAVURI_TELEGRAM_API_ID:"1234",MAVURI_TELEGRAM_API_HASH:"fixture",
  SHOPEE_AFFILIATE_APP_ID:"111",SHOPEE_AFFILIATE_SECRET:"fixture",
  MAVURI_AUTO_INGEST:"false"
 };
 const pre=spawnSync(process.execPath,["scripts/cloud-runner/validate-v85.mjs"],{env,encoding:"utf8"});
 assert.equal(pre.status,78,"preflight refuses Node <24 or missing RAM; fixture never runs");
 const result=JSON.parse(pre.stdout);
 assert.equal(result.live_requested,false);
 assert.ok(result.notices.some(x=>x.includes("AUTO_INGEST=false")));
 const live=spawnSync(process.execPath,["scripts/cloud-runner/validate-v85.mjs","--live"],{env,encoding:"utf8"});
 assert.equal(live.status,78);
 assert.ok(JSON.parse(live.stdout).checks.some(x=>x.includes("cutover")||x.includes("Habilitação")));
 const shell=readFileSync("scripts/cloud-runner/run-v85.sh","utf8");
 assert.match(shell,/flock -n/);
 assert.match(shell,/MAVURI_CLOUD_LIVE_ENABLED/);
 assert.match(shell,/MAVURI_CLOUD_WINDOWS_STOPPED/);
 assert.match(shell,/validate-v85\.mjs/);
 console.log("V85 VM sanitizer/preflight fail-closed tests passed (no network or publication).");
}finally{rmSync(dir,{recursive:true,force:true});}

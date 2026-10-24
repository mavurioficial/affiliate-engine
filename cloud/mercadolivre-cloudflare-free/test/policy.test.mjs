import {test} from "node:test";
import assert from "node:assert/strict";
import {TARGETS,summarize,safeReport,planFreeDailyCapacity} from "../src/policy.mjs";
test("only Mercado Livre public URLs",()=>{
 assert.equal(TARGETS.length,2);
 for(const t of TARGETS)assert.match(t.url,/^https:\/\/www\.mercadolivre\.com\.br\//);
});
test("never reports private browser state or links",()=>{
 const report=safeReport([summarize("ml_home",200,"https://www.mercadolivre.com.br/")]);
 assert.equal(report.account_authenticated,false);
 assert.equal(report.generated_affiliate_links,0);
 assert.equal(report.telegram_posts,0);
 assert.equal(report.database_writes,0);
 assert.deepEqual(Object.keys(report.results[0]).sort(),["redirected_to_login","status","target"]);
});

test("safely estimate FREE daily guest browser runs, not V86 cycles",()=>{
 assert.equal(planFreeDailyCapacity(0).valid,false);
 assert.equal(planFreeDailyCapacity(-1).safe_cycles,0);
 assert.equal(planFreeDailyCapacity(10).safe_cycles,28); // capped by 08-22 slots
 assert.equal(planFreeDailyCapacity(20).safe_cycles,24);
 assert.equal(planFreeDailyCapacity(30).safe_cycles,16);
 assert.equal(planFreeDailyCapacity(45).safe_cycles,10);
 assert.equal(planFreeDailyCapacity(60).safe_cycles,8);
 assert.equal(planFreeDailyCapacity(120).safe_cycles,4);
 assert.equal(planFreeDailyCapacity(240).safe_cycles,2);
 assert.equal(planFreeDailyCapacity(600).safe_cycles,0);
 assert.equal(planFreeDailyCapacity(30).reserve_seconds,120);
 assert.equal(planFreeDailyCapacity(30).quota_seconds,600);
});

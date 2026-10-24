import {test} from "node:test";
import assert from "node:assert/strict";
import {TARGETS,summarize,safeReport} from "../src/policy.mjs";
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

import {test} from "node:test";
import assert from "node:assert/strict";
import {TARGETS,summarize,runPublicProbe} from "../src/public-origin-probe.mjs";
test("two public Mercado Livre targets only",()=>{
 assert.equal(TARGETS.length,2);
 assert.ok(TARGETS.every(x=>x.url.startsWith("https://www.mercadolivre.com.br/")));
 assert.equal(summarize("home",403,TARGETS[0].url,100).reason,"forbidden");
 assert.equal(summarize("hub",200,"https://www.mercadolivre.com.br/login",10).redirected_to_login,true);
});
test("closed by default with no browser or credentials",async()=>{
 delete process.env.MAVURI_ML_PROBE_ONLY;
 await assert.rejects(runPublicProbe({launch:()=>{throw Error("must_not_launch")}}),
 /read_only_probe_guard_required/);
});
test("stubbed live probe never clicks, stores or publishes",async()=>{
 process.env.MAVURI_ML_PROBE_ONLY="YES_PUBLIC_READONLY";
 let visited=0,closed=0;
 const launch=async()=>({newContext:async()=>({newPage:async()=>({
  goto:async(url)=>{visited++;return{status:()=>url.includes("/afiliados/")?302:200}},
  url:()=>TARGETS[0].url}),close:async()=>{closed++}}),close:async()=>{closed++}});
 const report=await runPublicProbe({launch});
 assert.equal(report.ok,true);assert.equal(report.affiliate_links_generated,0);
 assert.equal(report.db_writes,0);assert.equal(report.telegram_posts,0);
 assert.equal(visited,2);assert.equal(closed,3);
});

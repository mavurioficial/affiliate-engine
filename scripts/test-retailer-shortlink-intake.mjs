import test from "node:test";
import assert from "node:assert/strict";
import {intakeShortlinks} from "../src/domain/retailer-shortlink-intake.mjs";
const links=["https://meli.la/1DhpTm8","https://meli.la/2H56Kz8"];
test("captures two supplied ML shortlinks separately without inventing product IDs",()=>{
 const p=intakeShortlinks(links);
 assert.equal(p.total,2);
 assert.deepEqual(p.candidates.map(x=>x.source_ref),["meli.la:1DhpTm8","meli.la:2H56Kz8"]);
 for(const v of p.candidates){
  assert.equal(v.marketplace,"mercadolivre");
  assert.equal(v.product_title,null);
  assert.equal(v.own_affiliate_url,null);
  assert.equal(v.price_verified_current,false);
  assert.equal(v.publication_allowed,false);
 }
});
test("works with an Amazon product link provided in source messages",()=>{
 const p=intakeShortlinks(["https://link.amazon/B08aKs8yN"]);
 assert.equal(p.candidates[0].marketplace,"amazon");
 assert.equal(p.candidates[0].own_affiliate_url,null);
});
test("deduplicates and rejects spoofed domains, userinfo, and HTTP",()=>{
 const p=intakeShortlinks([...links,links[0],
 "https://meli.la.evil.com/1DhpTm8",
 "https://user@meli.la/1DhpTm8",
 "http://meli.la/1DhpTm8"]);
 assert.equal(p.total,2);
});
test("source URLs never auto-generate commission or publication",()=>{
 const p=intakeShortlinks(links,{origin:"user_forwarded"});
 assert.equal(p.no_requests,true);
 assert.equal(p.no_publication,true);
 assert.ok(p.candidates.every(x=>x.incoming_link_may_belong_to_other_affiliate));
});

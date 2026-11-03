import test from "node:test";
import assert from "node:assert/strict";
import {selectUsableAffiliateAccount} from "../src/domain/affiliate-account-selection.js";

test("accepts connected Mercado Livre account as a usable connection",()=>{
  assert.equal(selectUsableAffiliateAccount([{id:"ml-1",status:"connected"}])?.id,"ml-1");
});
test("prefers active when both valid statuses exist",()=>{
  assert.equal(selectUsableAffiliateAccount([{id:"ml-1",status:"connected"},{id:"ml-2",status:"active"}])?.id,"ml-2");
});
test("rejects disabled, pending, revoked, and invalid inputs",()=>{
  for (const v of [[],null,undefined,{},[{id:"1",status:"disabled"}],[{id:"1",status:"pending"}]]) {
    assert.equal(selectUsableAffiliateAccount(v),null);
  }
});

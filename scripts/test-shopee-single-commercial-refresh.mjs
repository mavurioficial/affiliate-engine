import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prepareCommercialRefresh,summarizeCommercialRefresh} from
 "../supabase/functions/discovery-cloud-shopee/shopee-commercial-refresh-plan.mjs";
const scope={user_id:"u",marketplace_id:"m",affiliate_account_id:"a"};
const row={
 ...scope,source_ref:"123456",price:100,
 affiliate_url:"https://s.shopee.com.br/oldtoken",image_url:"https://img.test/x.jpg",
 title:"Conjunto de panelas inox",mavuri_category_id:"category42",
 mavuri_tags:["casa","cozinha"],metadata:{mavuri:{
  category_slug:"cozinha",classification_source:"manual_corrected"
 }}
};
const candidate={itemid:"123456",sale_price:92.99,
 discount_percentage:15,affiliate_url:"https://s.shopee.com.br/newtoken"};
const plan=prepareCommercialRefresh({candidate,row,scope});
assert.equal(plan.eligible,true);
assert.equal(plan.read_only,true);
assert.equal(plan.ready_to_publish,false);
assert.equal(plan.requires_atomic_write,true);
assert.equal(plan.changed.price,true);
assert.equal(plan.changed.link,true);
assert.deepEqual(plan.preserved_fields,["title","metadata","mavuri_category_id","mavuri_tags"]);
const invalid=[
 [candidate,{...row,user_id:"someone-else"},scope,"row_scope_mismatch"],
 [{...candidate,itemid:"999"},row,scope,"product_identity_mismatch"],
 [{...candidate,affiliate_url:"http://s.shopee.com.br/x"},row,scope,"invalid_affiliate_link"],
 [{...candidate,affiliate_url:"https://s.shopee.com.br.evil.org/x"},row,scope,"invalid_affiliate_link"],
 [{...candidate,affiliate_url:"https://evil.example/x"},row,scope,"invalid_affiliate_link"],
 [{...candidate,sale_price:0},row,scope,"invalid_price"],
 [{...candidate,sale_price:92.999},row,scope,"invalid_price"],
 [{...candidate,discount_percentage:9},row,scope,"invalid_discount"],
 [candidate,{...row,mavuri_category_id:null},scope,"final_category_missing"]
];
for(const [c,r,scopeArg,reason] of invalid){
 assert.equal(prepareCommercialRefresh({candidate:c,row:r,scope:scopeArg}).reason,reason);
}
const aggregate=summarizeCommercialRefresh({
  candidates:[candidate,{...candidate,itemid:"98765"}, {...candidate,itemid:"123456"}],
  stored_offers:[row],scope
});
assert.equal(aggregate.candidates,3);
assert.equal(aggregate.persisted,1);
assert.equal(aggregate.missing_or_ambiguous,1);
assert.equal(aggregate.refreshable,1);
assert.equal(aggregate.affiliate_link_rotated,1);
assert.equal(aggregate.price_changed,1);
assert.equal(aggregate.ready_for_write,false);
assert.equal(aggregate.ready_to_publish,false);
assert.ok(!JSON.stringify(aggregate).includes("newtoken"));
assert.ok(!JSON.stringify(aggregate).includes("123456"));
const edge=readFileSync("supabase/functions/discovery-cloud-shopee/index.ts","utf8");
assert.match(edge,/summarizeCommercialRefresh\(\{candidates,stored_offers:validStored,scope\}\)/);
assert.match(edge,/select:"id,marketplace_id,status,external_account_id,settings"/);
assert.match(edge,/Deno\.env\.get\("SHOPEE_AFFILIATE_APP_ID"\)/);
assert.match(edge,/account\.settings\?\.open_api_status==="active"/);
assert.match(edge,/account\.settings\?\.open_api_app_id_sha256===hashedAppId/);
assert.match(edge,/account\.external_account_id\?\.trim\(\)/);
assert.match(edge,/account_binding:\{verified:accountBindingVerified/);
assert.match(edge,/ready_for_write:false/);

assert.doesNotMatch(edge,/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
const sql=readFileSync("docs/sql/SHOPEE_SINGLE_COMMERCIAL_REFRESH_DRAFT.sql","utf8");
assert.match(sql,/SECURITY INVOKER/);
assert.match(sql,/WHERE o\.id=v_old\.id AND o\.user_id=p_user_id/);
assert.match(sql,/AND o\.price=p_expected_price AND o\.affiliate_url=p_expected_link/);
assert.match(sql,/v_new\.metadata IS DISTINCT FROM v_old\.metadata/);
assert.match(sql,/v_new\.mavuri_category_id IS DISTINCT FROM v_old\.mavuri_category_id/);
assert.match(sql,/v_new\.mavuri_tags IS DISTINCT FROM v_old\.mavuri_tags/);
assert.match(sql,/RAISE EXCEPTION 'category_or_identity_changed_by_trigger'/);
assert.match(sql,/REVOKE ALL ON FUNCTION/);
assert.match(sql,/TO service_role/);
assert.match(sql,/FROM PUBLIC, anon, authenticated/);
assert.match(sql,/service_role_required/);
assert.match(sql,/api_account_binding_unverified/);
assert.match(sql,/open_api_app_id_sha256/);
assert.doesNotMatch(sql,/TO authenticated;/);
assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
assert.equal((sql.match(/GRANT EXECUTE ON FUNCTION/g)||[]).length,1);
assert.equal((sql.match(/COMMIT;/g)||[]).length,1);
assert.ok(sql.length<9000,"SQL draft unexpectedly duplicated or truncated");
assert.match(sql,/jobs_created',0,'messages_sent',0/);
assert.doesNotMatch(sql,/flow_delivery_jobs\s+SET|INSERT INTO public\.flow_delivery_jobs|api\.telegram\.org/);
console.log("Single Shopee commercial refresh: strict offline scope and transactional rollback guard OK");

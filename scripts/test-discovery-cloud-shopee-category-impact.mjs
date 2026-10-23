import assert from "node:assert/strict";
import {createShopeeStoredCategoryOverrides,compareShopeeGeneralEffectiveCategoryImpact}
 from "../supabase/functions/discovery-cloud-shopee/shopee-category-impact.mjs";
const rules=[{name:"SHOPEE — Geral",enabled:true,
 conditions:{marketplace:"shopee",minDiscount:10},actions:{channel_ids:["general"]}}];
const channels=[{id:"general",type:"telegram",status:"connected",external_ref:"private_telegram_destination"}];
const candidate=id=>({itemid:id,title:"Produto diferente "+id,price:100,sale_price:100,
 discount_percentage:30,affiliate_url:"https://s.shopee.com.br/"+id,
 image_link:"https://example.com/"+id,global_category1:"Home & Living"});
const known=(id,category,source="marketplace_category_map",date="2026-10-22T10:00:00Z")=>({
 source_ref:id,mavuri_tags:[category],captured_at:date,
 metadata:{mavuri:{category_slug:category,classification_source:source}}
});
const offers=["1","2","3","4","5"].map(candidate);
const saved=[known("1","casa"),known("2","cozinha","manual_corrected"),
 known("3","beleza"),known("4","casa")];
const data=createShopeeStoredCategoryOverrides(offers,saved);
assert.equal(data.known_count,4);
assert.equal(data.unknown_count,1);
assert.equal(data.manual_protected,1);
assert.equal(data.changed_from_provisional,2);
assert.equal(data.overrides["2"],"cozinha");
const audit=compareShopeeGeneralEffectiveCategoryImpact({offers,dbRows:saved,rules,channels,
 sentRows:[],pendingRows:[],now_iso:"2026-10-22T22:00:00Z"});
assert.equal(audit.initial_projected,2);
assert.equal(audit.effective_stored_projected,4);
assert.equal(audit.projected_difference,2);
assert.equal(audit.selected_only_after_db_category,2);
assert.equal(audit.selected_unknown_category,0);
assert.equal(audit.manual_reviews_preserved,1);
assert.equal(audit.effective_category_blocks.casa,1);
assert.equal(audit.effective_categories_available,4);
assert.equal(audit.unknown_final_categories,1);
assert.equal(JSON.stringify(audit).includes("private_telegram_destination"),false);
assert.equal(JSON.stringify(audit).includes("s.shopee"),false);
const unknownOnly=compareShopeeGeneralEffectiveCategoryImpact({offers,dbRows:[],rules,channels,
 sentRows:[],pendingRows:[],now_iso:"2026-10-22T22:00:00Z"});
assert.equal(unknownOnly.initial_projected,unknownOnly.effective_stored_projected);
assert.equal(unknownOnly.unknown_final_categories,5);
const oldAndNew=[known("1","informatica","old","2026-10-20T10:00:00Z"),known("1","casa","manual_approved")];
assert.equal(createShopeeStoredCategoryOverrides(offers,oldAndNew).overrides["1"],"casa");
console.log("Shopee effective stored category impact tests passed. No queue/send/writes.");

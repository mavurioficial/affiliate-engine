import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {firstShopeeControlledPreflight}
  from "../supabase/functions/discovery-cloud-shopee/shopee-single-preflight.mjs";

const scope={user_id:"user",marketplace_id:"market",affiliate_account_id:"account"};
const channels=["general","woman","home","tech"].map((id)=>({
 id,type:"telegram",status:"connected",external_ref:"test-only"
}));
const names=["SHOPEE — Geral","SHOPEE — Mulher","SHOPEE — Casa & Cozinha","SHOPEE — Tecnologia"];
const rules=names.map((name,i)=>({
 name,enabled:true,
 conditions:{
  marketplace:"shopee",minDiscount:10,
  ...(i===1?{mavuriCategories:["beleza"],mavuriTagsAny:["feminino"]}:
     i===2?{mavuriCategories:["casa"],mavuriTagsAny:["casa"]}:
     i===3?{mavuriCategories:["eletronicos"],mavuriTagsAny:["eletronicos"]}:{})
 },actions:{channel_ids:[channels[i].id]}
}));
function candidate(id,price=50) {
 return {itemid:id,title:"Produto Novo "+id,sale_price:price,discount_percentage:25,
  affiliate_url:"https://s.shopee.com.br/fixture"+id,
  image_link:"https://img.example.com/fixture"+id+".jpg"};
}
function stored(c,category="casa",tags=["casa"]){
 return {...scope,source_ref:c.itemid,title:c.title,price:c.sale_price,
  affiliate_url:c.affiliate_url,image_url:c.image_link,mavuri_tags:tags,
  mavuri_category_id:"verified-category-fk",
  metadata:{mavuri:{category_slug:category,classification_source:"manual_approved"}}};
}
const candidates=[candidate("111"),candidate("222",100)];
const offers=candidates.map(c=>stored(c));
const plan=firstShopeeControlledPreflight({candidates,stored_offers:offers,
 rules,channels,scope,now_iso:"2026-10-23T12:30:00Z"});
assert.equal(plan.mode,"single_offer_preflight");
assert.equal(plan.selected_unique_offers,1);
assert.equal(plan.projected_jobs,2); // one product, General + Casa
assert.equal(plan.cloud_publishing,false);
assert.equal(plan.cloud_schedule,false);
assert.equal(plan.safety.ready_to_publish,false);
assert.equal(plan.safety.atomic_enqueue_checked,false);
assert.equal(plan.safety.snapshot_price_override_disabled,true);
assert.ok(!JSON.stringify(plan).includes("111"));
assert.ok(!JSON.stringify(plan).includes("222"));
assert.ok(!JSON.stringify(plan).includes("s.shopee.com.br"));
const blocked=firstShopeeControlledPreflight({
 candidates:[candidates[0]],stored_offers:[offers[0]],rules,channels,scope,
 sent_history:[{status:"sent",channel_id:"general",itemid:"111",
  sent_at:"2026-10-23T11:00:00Z",published_price:100},
 {status:"sent",channel_id:"home",itemid:"111",
  sent_at:"2026-10-23T11:00:00Z",published_price:100}],
 now_iso:"2026-10-23T12:30:00Z"
});
assert.equal(blocked.selected_unique_offers,0);
assert.equal(blocked.eligibility.blocked_recent_48h,2);
assert.throws(()=>firstShopeeControlledPreflight({
 candidates,stored_offers:offers,rules:rules.slice(1),channels,scope,
 now_iso:"2026-10-23T12:30:00Z"
}),/routing_rule_count_mismatch/);
const edge=readFileSync("supabase/functions/discovery-cloud-shopee/index.ts","utf8");
assert.ok(edge.includes('mode==="single_offer_preflight"'));
assert.ok(edge.includes("liveSingleOfferPreflight(req,userId)"));
assert.ok(edge.includes("categoryMap.get(String(row.mavuri_category_id))"));
assert.ok(edge.includes("row.affiliate_account_id===accountId"));
assert.ok(edge.includes("status:\"in.(queued,processing)\""));
assert.ok(edge.includes('mode:"single_offer_preflight"')===false);
assert.doesNotMatch(edge,/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
console.log("Shopee one-off cloud preflight tests passed: unique=1, 48h protected, never publishes.");

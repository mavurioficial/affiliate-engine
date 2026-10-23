import assert from "node:assert/strict";
import {shopeeSignificantPriceDropStrict,shopeePriceDropPercent,simulateShopeeCloudSelection}
  from "../supabase/functions/discovery-cloud-shopee/shopee-policy.mjs";
import {planShopeeAfterPersistence}
  from "../supabase/functions/discovery-cloud-shopee/shopee-postpersist-plan.mjs";

const no=(old,current)=>assert.equal(shopeeSignificantPriceDropStrict(old,current),false,`${old}->${current} should block`);
const yes=(old,current)=>assert.equal(shopeeSignificantPriceDropStrict(old,current),true,`${old}->${current} should qualify`);
yes(1000,900);
no(1000,900.05); // old helper rounds 9.995% to 10.00%
assert.equal(shopeePriceDropPercent(1000,900.05),10); // UI-only legacy display, NOT for authorization
yes("100.00","90.00");no("100.01","90.01");yes("100.01","90.00");
yes(10,9); no(10,9.01);yes(0.10,0.09);no(0.10,0.091);
no(100,null);no(100,"");no(100,-1);no(0,0);no(100,100);
no(100,99.995);no("100.001",90);no(100,NaN);
const candidate=(price)=>({
 itemid:"111",title:"Produto de cozinha",
 sale_price:price,discount_percentage:35,
 affiliate_url:"https://s.shopee.com.br/affiliate-link",
 image_link:"https://example.com/pic.jpg",global_category1:"Home & Living"
});
function result(price){
 return simulateShopeeCloudSelection({
  candidates:[candidate(price)],
  sent_history:[{itemid:"111",channel_id:"general",status:"sent",
   sent_at:"2026-10-22T13:00:00Z",published_price:1000}],
  connected_telegram_channel_ids:["general"],
  now_iso:"2026-10-22T14:00:00Z"
 });
}
assert.equal(result(900.05).selected_unique_offers,0);
assert.equal(result(900.05).counts.same_product_48h,1);
assert.equal(result(900).selected_unique_offers,1);
assert.equal(result(900).counts.same_product_price_drop_override,1);
// Post-persistence planner must share exact same authorization threshold.
const names=["SHOPEE — Geral","SHOPEE — Mulher","SHOPEE — Casa & Cozinha","SHOPEE — Tecnologia"];
const channels=["general","woman","home","tech"].map(x=>({id:x,type:"telegram",status:"connected",external_ref:"private"}));
const rules=names.map((name,i)=>({
 name,enabled:true,conditions:{
  marketplace:"shopee",minDiscount:10,
  ...(i===1?{mavuriCategories:["moda","beleza"],mavuriTagsAny:["feminino"]}:
    i===2?{mavuriCategories:["casa","cozinha"],mavuriTagsAny:["casa"]}:
    i===3?{mavuriCategories:["eletronicos"],mavuriTagsAny:["eletronicos"]}:{})
 },actions:{channel_ids:[channels[i].id]}
}));
const scope={user_id:"user",marketplace_id:"shopee",affiliate_account_id:"account"};
const getPlan=(price)=>planShopeeAfterPersistence({
 candidates:[candidate(price)],
 stored_offers:[{...scope,source_ref:"111",title:"Produto de cozinha",price,
  affiliate_url:candidate(price).affiliate_url,
  image_url:candidate(price).image_link,
  mavuri_tags:["casa"],
  metadata:{mavuri:{category_slug:"casa",classification_source:"marketplace_category_map"},shopee:{}}}],
 sent_history:[{itemid:"111",channel_id:"general",status:"sent",
   sent_at:"2026-10-22T13:00:00Z",published_price:1000}],
 rules,channels,scope,snapshot_price_verified:true,now_iso:"2026-10-22T14:00:00Z"
});
assert.equal(getPlan(900.05).counters.same_item_48h,1);
assert.equal(getPlan(900).counters.price_drop_override,1);
assert.equal(getPlan(900).safety.ready_to_publish,false);
console.log("Strict-cent price-drop threshold tests passed; no false 9.995% republish.");

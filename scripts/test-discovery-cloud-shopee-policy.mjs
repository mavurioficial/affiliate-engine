import assert from "node:assert/strict";
import {SHOPEE_CLOUD_POLICY,normalizePercent,shopeeFamilySignature,shopeePriceDropPercent,shopeeCommissionRate,compareShopeeCandidates,simulateShopeeCloudSelection} from "../supabase/functions/discovery-cloud-shopee/shopee-policy.mjs";
const mk=(id,discount=30,channel_ids=["g"])=>({
 itemid:id,title:"Fone Headset Modelo "+id,sale_price:90,price:90,discount_percentage:discount,
 affiliate_url:"https://s.shopee.com.br/test"+id,image_link:"https://example.com/img",
 global_category1:"Mobile & Gadgets",channel_ids,
 _mavuri_api:{shop_id:"seller"+id,commission_rate:0.09,sales:10}
});
const base={connected_telegram_channel_ids:["g","m"],now_iso:"2026-10-22T18:00:00Z"};
assert.equal(normalizePercent(0.12),12);
assert.equal(normalizePercent(20),20);
assert.equal(shopeeCommissionRate(mk("1")),9);
assert.equal(shopeePriceDropPercent(100,90),10);
assert.equal(shopeePriceDropPercent(undefined,90),null);
assert.equal(SHOPEE_CLOUD_POLICY.same_item_cooldown_hours,48);
assert.equal(SHOPEE_CLOUD_POLICY.same_product_other_seller_cooldown_hours,24);
assert.equal(compareShopeeCandidates(mk("1",30),mk("2",20))<0,true);
const highCommission={...mk("high",30),_mavuri_api:{shop_id:"test",commission_rate:0.2,sales:10}};
const lowCommission={...mk("low",30),_mavuri_api:{shop_id:"test",commission_rate:0.05,sales:10}};
assert.equal(compareShopeeCandidates(highCommission,lowCommission)<0,true); // Tie-break
assert.equal(compareShopeeCandidates(mk("discount",31),highCommission)<0,true); // Better discount wins
const samePrice=simulateShopeeCloudSelection({
 ...base,candidates:[mk("1")],
 sent_history:[{itemid:"1",channel_id:"g",sent_at:"2026-10-21T18:00:00Z",published_price:90,status:"sent"}]
});
assert.equal(samePrice.selected_unique_offers,0);
assert.equal(samePrice.counts.same_product_48h,1);
const missingPrice=simulateShopeeCloudSelection({
 ...base,candidates:[mk("1")],
 sent_history:[{itemid:"1",channel_id:"g",sent_at:"2026-10-21T18:00:00Z",status:"sent"}]
});
assert.equal(missingPrice.selected_unique_offers,0); // no unsafe price inference
const better=simulateShopeeCloudSelection({
 ...base,candidates:[mk("1")],
 sent_history:[{itemid:"1",channel_id:"g",sent_at:"2026-10-21T18:00:00Z",published_price:100,status:"sent"}]
});
assert.equal(better.selected_unique_offers,1);
assert.equal(better.counts.same_product_price_drop_override,1);
const oneChannel=simulateShopeeCloudSelection({
 ...base,candidates:[mk("1",30,["g","m"])],
 sent_history:[{itemid:"1",channel_id:"g",sent_at:"2026-10-21T18:00:00Z",published_price:90,status:"sent"}]
});
assert.equal(oneChannel.selected_unique_offers,1);
assert.equal(oneChannel.projected_delivery_jobs,1);
const pending=simulateShopeeCloudSelection({
 ...base,candidates:[mk("1")],pending_history:[{itemid:"1",channel_id:"g",status:"queued"}]
});
assert.equal(pending.counts.pending,1);
const familyItem=mk("2");
familyItem.title="Fone Bluetooth TWS Modelo Q";
familyItem._mavuri_api.shop_id="second";
const sentFamily={
 itemid:"1",channel_id:"g",sent_at:"2026-10-22T10:00:00Z",
 family_signature:shopeeFamilySignature(familyItem.title),shop_id:"first",status:"sent"
};
const family=simulateShopeeCloudSelection({...base,candidates:[familyItem],sent_history:[sentFamily]});
assert.equal(family.counts.equivalent_other_seller_24h,1);
const older=simulateShopeeCloudSelection({
 ...base,candidates:[familyItem],sent_history:[{...sentFamily,sent_at:"2026-10-20T10:00:00Z"}]
});
assert.equal(older.selected_unique_offers,1);
const ten=[
 ...Array.from({length:2},(_,i)=>({...mk("tech"+i,35-i),global_category1:"Computers & Accessories",title:"Notebook Gamer "+i})),
 ...Array.from({length:2},(_,i)=>({...mk("home"+i,33-i),global_category1:"Home & Living",title:"Panela Eletrica "+i})),
 ...Array.from({length:2},(_,i)=>({...mk("beauty"+i,31-i),global_category1:"Beauty",title:"Base Facial "+i})),
 ...Array.from({length:2},(_,i)=>({...mk("fashion"+i,29-i),global_category1:"Fashion Accessories",title:"Bolsas "+i})),
 ...Array.from({length:2},(_,i)=>({...mk("sports"+i,27-i),global_category1:"Sports & Outdoors",title:"Bicicleta Modelo "+i}))
];
const diverse=simulateShopeeCloudSelection({...base,candidates:ten,target:8});
assert.equal(diverse.selected_unique_offers,8);
assert.equal(diverse.projected_delivery_jobs,8);
const poor=simulateShopeeCloudSelection({...base,candidates:[mk("bad",5),mk("good",20)],target:8});
assert.equal(poor.selected_unique_offers,1);
assert.equal(poor.counts.discount_below_min,1);
assert.equal(normalizePercent(-1),0);
assert.equal(shopeeFamilySignature("X"),null);
// A blocked high-discount item must NOT consume one of the eight unique slots.
const eightLater=Array.from({length:8},(_,i)=>({
 ...mk("eligible"+i,35-i),
 title:"Oferta Distinta Modelo "+i,
 global_category1:i%4===0?"Beauty":i%4===1?"Home & Living":i%4===2?"Computers & Accessories":"Sports & Outdoors"
}));
const afterBlocked=simulateShopeeCloudSelection({
 ...base,candidates:[mk("blocked",90),...eightLater],
 sent_history:[{itemid:"blocked",channel_id:"g",sent_at:"2026-10-22T17:00:00Z",status:"sent"}]
});
assert.equal(afterBlocked.selected_unique_offers,8);
assert.equal(afterBlocked.counts.same_product_48h,1);
const insufficient=simulateShopeeCloudSelection({
 ...base,candidates:[mk("1")],
 sent_history:[{itemid:"1",channel_id:"g",sent_at:"2026-10-22T17:00:00Z",published_price:99.9,status:"sent"}]
});
assert.equal(insufficient.counts.same_product_48h,1); // 9.91% drop < 10%
const expired48=simulateShopeeCloudSelection({
 ...base,candidates:[mk("1")],
 sent_history:[{itemid:"1",channel_id:"g",sent_at:"2026-10-20T17:59:59Z",published_price:90,status:"sent"}]
});
assert.equal(expired48.selected_unique_offers,1);

console.log("Shopee cloud selection policy tests passed; no DB/API/publication.");

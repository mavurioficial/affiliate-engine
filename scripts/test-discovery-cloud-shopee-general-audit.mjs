import assert from "node:assert/strict";
import {validateShopeeGeneralRule,normalizeShopeeGeneralHistory,simulateShopeeGeneralAudit}
  from "../supabase/functions/discovery-cloud-shopee/shopee-general-audit.mjs";
const rule={name:"SHOPEE — Geral",enabled:true,conditions:{marketplace:"shopee",minDiscount:10},actions:{channel_ids:["general"]}};
const channels=[{id:"general",type:"telegram",status:"connected",external_ref:"nonempty"}];
assert.equal(validateShopeeGeneralRule([rule],channels),"general");
assert.throws(()=>validateShopeeGeneralRule([{...rule,conditions:{marketplace:"shopee",minDiscount:0}}],channels),/conditions_changed/);
assert.throws(()=>validateShopeeGeneralRule([rule],[]),/not_connected/);
assert.throws(()=>validateShopeeGeneralRule([rule,rule],channels),/ambiguous/);
const offer=(id,discount=30,category="Beauty")=>({
 itemid:id,title:"Produto diferente "+id,price:90,sale_price:90,discount_percentage:discount,
 affiliate_url:"https://s.shopee.com.br/"+id,image_link:"https://example.com/image",
 global_category1:category,_mavuri_api:{commission_rate:0.14,shop_id:"seller-"+id}
});
const sent=(id,date,price)=>({flow_offers:{source_ref:id},channel_id:"general",
 status:"sent",created_at:date,metadata:{offer_snapshot:{price}}});
const pending=(id)=>({flow_offers:{source_ref:id},channel_id:"general",status:"queued"});
const data=normalizeShopeeGeneralHistory(
 [sent("old","2026-10-22T17:00:00Z",90),sent("better","2026-10-22T17:00:00Z",100),sent("other","2026-10-22T17:00:00Z",90)],
 [pending("queued"),pending("other")],["old","better","queued"]);
assert.equal(data.counters.sent_read,3);
assert.equal(data.counters.sent_matched,2);
assert.equal(data.counters.pending_matched,1);
assert.equal(data.sent.length,2);
assert.equal(data.sent[0].published_price,90);
const output=simulateShopeeGeneralAudit({
 offers:[offer("old",55),offer("better",50,"Home & Living"),offer("queued",45),
         offer("new1",40,"Computers & Accessories"),offer("new2",35,"Fashion Accessories"),offer("bad",3)],
 rules:[rule],channels,
 sentRows:[sent("old","2026-10-22T17:00:00Z",90),sent("better","2026-10-22T17:00:00Z",100)],
 pendingRows:[pending("queued")],
 now_iso:"2026-10-22T18:00:00Z"
});
assert.equal(output.projected_unique_offers,3); // better 10% real drop + two new
assert.equal(output.projected_delivery_jobs,3);
assert.equal(output.decisions.same_product_48h,1);
assert.equal(output.decisions.same_product_price_drop_override,1);
assert.equal(output.decisions.pending,1);
assert.equal(output.decisions.discount_below_min,1);
assert.equal(output.read_only,true);
assert.equal(output.category_diagnostics.selected.casa,1);
assert.equal(output.category_diagnostics.selected.informatica,1);
assert.equal(output.category_diagnostics.selected.outros,1);
assert.equal(output.category_diagnostics.blocked_by_recent_publication.beleza,1);
assert.equal(Object.values(output.category_diagnostics.selected).reduce((a,b)=>a+b,0),output.projected_unique_offers);
assert.equal(JSON.stringify(output.category_diagnostics).includes("https://"),false);

assert.equal(JSON.stringify(output).includes("https://"),false);
assert.equal(JSON.stringify(output).includes("general"),true); // generalized mode label only
console.log("Shopee general-channel read-only audit regression OK.");

import assert from "node:assert/strict";
import {planShopeeAfterPersistence,summarizePostPersistPlan}
 from "../supabase/functions/discovery-cloud-shopee/shopee-postpersist-plan.mjs";
import {SHOPEE_EXPECTED_RULE_NAMES} from "../supabase/functions/discovery-cloud-shopee/shopee-routing-shadow.mjs";
const names=SHOPEE_EXPECTED_RULE_NAMES,ids=["general","woman","home","tech"];
const routes=names.map((name,i)=>({
 name,enabled:true,conditions:{marketplace:"shopee",minDiscount:10,
   ...(i===1?{mavuriCategories:["moda","beleza"],mavuriTagsAny:["feminino","maquiagem","skincare","cabelo","unhas","acessorios-femininos"]}
     :i===2?{mavuriCategories:["casa","cozinha"],mavuriTagsAny:["casa","cozinha","limpeza","decoracao"]}
     :i===3?{mavuriCategories:["informatica","eletronicos"],mavuriTagsAny:["informatica","eletronicos","celular"]}:{})
 },actions:{channel_ids:[ids[i]]}
}));
const channels=ids.map(id=>({id,type:"telegram",status:"connected",external_ref:"test-private-destination"}));
const scope={user_id:"owner1",marketplace_id:"shopee1",affiliate_account_id:"account1"};
const cand=(id,title="Produto "+id)=>({
 itemid:id,title,sale_price:90,price:90,discount_percentage:30,
 affiliate_url:"https://s.shopee.com.br/"+id,image_link:"https://example.com/"+id,
 _mavuri_api:{commission_rate:0.13}
});
const stored=(id,category,tags=[],classification_source="marketplace_category_map",title="Produto "+id)=>({
 ...scope,source_ref:id,title,price:90,affiliate_url:"https://s.shopee.com.br/"+id,
 image_url:"https://example.com/"+id,mavuri_tags:tags,
 metadata:{mavuri:{category_slug:category,classification_source},shopee:{}}
});
const run=(candidates,rows,opts={})=>planShopeeAfterPersistence({
 candidates,stored_offers:rows,rules:routes,channels,now_iso:"2026-10-22T20:00:00Z",scope,...opts
});
const original=cand("1","Bolsa Feminina");
const corrected=stored("1","casa",["casa"],"manual_corrected","Bolsa Feminina");
const good=run([original],[corrected]);
assert.equal(good.counters.selected_unique,1);
assert.deepEqual(good.selected[0].channels,["general","home"]); // NOT Mulher
assert.equal(good.counters.protected_manual_selection,1);
assert.equal(good.safety.ready_to_publish,false);
assert.equal(run([original],[]).counters.missing_persisted,1);
const noTags=stored("1","beleza",["feminino"]);
delete noTags.mavuri_tags;
assert.equal(run([original],[noTags]).counters.final_category_unavailable,1);
assert.throws(()=>planShopeeAfterPersistence({candidates:[],stored_offers:[],rules:routes,
 channels,scope:{user_id:"owner1"},now_iso:"2026-10-22T20:00:00Z"}),/missing_verified_account_scope/);
const wrongAccount={...corrected,affiliate_account_id:"other"};
assert.equal(run([original],[wrongAccount]).counters.missing_persisted,1);
const wrongLink={...corrected,affiliate_url:"https://other.example/affiliate"};
assert.equal(run([original],[wrongLink]).counters.invalid_affiliate_or_price,1);
const duplicate=run([original],[corrected,{...corrected}]);
assert.equal(duplicate.counters.ambiguous_persisted,1);
const sent={itemid:"1",channel_id:"general",sent_at:"2026-10-22T10:00:00Z",published_price:100,status:"sent"};
const declined=run([original],[corrected],{sent_history:[sent]});
assert.deepEqual(declined.selected[0].channels,["home"]); // general blocked, home still valid
assert.equal(declined.counters.same_item_48h,1);
const override=run([original],[corrected],{sent_history:[sent],snapshot_price_verified:true});
assert.deepEqual(override.selected[0].channels,["general","home"]);
assert.equal(override.counters.price_drop_override,1);
const pending=run([original],[corrected],{pending_history:[{itemid:"1",channel_id:"home",status:"queued"}]});
assert.deepEqual(pending.selected[0].channels,["general"]);
const recent=run([original],[corrected],{sent_history:[{...sent,published_price:null}]});
assert.equal(recent.counters.same_item_48h,1);
const catOffers=["2","3","4"].map(id=>cand(id));
const catRows=catOffers.map(x=>stored(x.itemid,"casa",["casa"]));
const group=run(catOffers,catRows);
assert.equal(group.counters.selected_unique,2);
assert.equal(group.counters.category_diversity,1);
const diversify=[
 cand("10"),cand("11"),cand("12"),cand("13"),cand("14"),
 cand("15"),cand("16"),cand("17"),cand("18")
];
const cats=["casa","casa","beleza","beleza","informatica","informatica","automotivo","automotivo","esporte"];
const many=run(diversify,diversify.map((x,i)=>stored(x.itemid,cats[i],
 cats[i]==="beleza"?["feminino","maquiagem"]:cats[i]==="informatica"?["informatica"]:cats[i]==="casa"?["casa"]:[])));
assert.equal(many.counters.selected_unique,8);
assert.equal(many.counters.cycle_cap,1);
assert.equal(many.counters.projected_jobs,many.jobs.length);
assert.equal(new Set(many.selected.map(x=>x.itemid)).size,8);
const verifiedRow=stored("1","casa",["casa"]);
verifiedRow.metadata.shopee={shop_id:"seller-b",verified_catalog_family:"cat-test"};
const cross=run([original],[verifiedRow],{sent_history:[{
 itemid:"other",channel_id:"general",shop_id:"seller-a",verified_catalog_family:"cat-test",
 identity_verified:true,sent_at:"2026-10-22T10:00:00Z",status:"sent"
}]});
assert.deepEqual(cross.selected[0].channels,["home"]);
assert.equal(cross.counters.different_seller_same_verified_family_24h,1);
const unverified=run([original],[verifiedRow],{sent_history:[{
 itemid:"other",channel_id:"general",shop_id:"seller-a",verified_catalog_family:"cat-test",
 identity_verified:false,sent_at:"2026-10-22T10:00:00Z",status:"sent"
}]});
assert.deepEqual(unverified.selected[0].channels,["general","home"]);
const onlyAggregates=summarizePostPersistPlan(good);
assert.equal(JSON.stringify(onlyAggregates).includes("Bolsa Feminina"),false);
assert.equal(JSON.stringify(onlyAggregates).includes("s.shopee"),false);
assert.equal(JSON.stringify(onlyAggregates).includes("test-private-destination"),false);
assert.equal(onlyAggregates.ready_to_publish,false);
assert.ok(onlyAggregates.missing_guards.includes("cloud_lease_checked"));
console.log("Shopee post-persistence routing offline tests passed; no DB/write/send.");

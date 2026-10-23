import assert from "node:assert/strict";
import {planShopeeAfterPersistence} from "../supabase/functions/discovery-cloud-shopee/shopee-postpersist-plan.mjs";

// Snapshot of the four rule CONDITION sets verified against the live database
// on 2026-10-22. Destination IDs are intentionally fictitious.
const id=["geral","mulher","casa","tecnologia"];
const rules=[
 {name:"SHOPEE — Geral",enabled:true,conditions:{marketplace:"shopee",minDiscount:10},actions:{channel_ids:[id[0]]}},
 {name:"SHOPEE — Mulher",enabled:true,conditions:{
   marketplace:"shopee",minDiscount:10,mavuriCategories:["moda","beleza"],
   mavuriTagsAny:["feminino","maquiagem","skincare","cabelo","unhas","acessorios-femininos"],
   deniedMavuriTags:["masculino","infantil","casa","cozinha","limpeza","decoracao"],
   deniedWords:["masculino","masculina","homem","para homem","para homens","cueca","barba",
   "pós barba","pos barba","after shave","fogão","fogao","forno","geladeira",
   "aspirador","sofá","sofa","poltrona","lençol","lencol","jogo de cama",
   "edredom","cobre leito","cobre-leito","ferro de passar","vaporizador de roupa"]
 },actions:{channel_ids:[id[1]]}},
 {name:"SHOPEE — Casa & Cozinha",enabled:true,conditions:{
   marketplace:"shopee",minDiscount:10,mavuriTagsAny:["casa","cozinha","limpeza","decoracao"],
   mavuriCategories:["casa","cozinha"]
 },actions:{channel_ids:[id[2]]}},
 {name:"SHOPEE — Tecnologia",enabled:true,conditions:{
   marketplace:"shopee",minDiscount:10,mavuriTagsAny:["eletronicos","informatica","celular"],
   mavuriCategories:["eletronicos","informatica"],
   deniedWords:["criado mudo","criado-mudo","mesa de cabeceira","criado max mudo"]
 },actions:{channel_ids:[id[3]]}}
];
const channels=id.map(x=>({id:x,type:"telegram",status:"connected",external_ref:"test"}));
const scope={user_id:"u",marketplace_id:"s",affiliate_account_id:"a"};
const offer=(i,title,category,tags,source="marketplace_category_map")=>({
 candidate:{itemid:i,title,sale_price:90,discount_percentage:25,
   affiliate_url:"https://affiliate.example/"+i},
 stored:{...scope,source_ref:i,title,price:90,image_url:"https://images.example/"+i,
   affiliate_url:"https://affiliate.example/"+i,mavuri_tags:tags,
   mavuri_category_id:"safe-reference",
   metadata:{mavuri:{category_slug:category,classification_source:source}}}
});
const test=(row)=>planShopeeAfterPersistence({
 candidates:[row.candidate],stored_offers:[row.stored],rules,channels,
 scope,now_iso:"2026-10-22T21:00:00Z"
});
const routes=row=>test(row).selected[0]?.channels||[];
const assertRoute=(row,expected)=>assert.deepEqual(routes(row),expected,row.stored.title);
// Case 1: previously mislabeled woman product -> corrected by database to Casa.
assertRoute(offer("1","Bolsa feminina organizadora","casa",["casa"],"manual_corrected"),["geral","casa"]);
// Case 2: female skincare and no denied keywords.
assertRoute(offer("2","Sérum facial","beleza",["skincare","feminino"]),["geral","mulher"]);
// Case 3: female category but denied tag and word prevent Mulher.
assertRoute(offer("3","Shampoo automotivo para homem","beleza",["feminino","masculino"]),["geral"]);
// Case 4: tech product.
assertRoute(offer("4","Notebook SSD 1TB","informatica",["informatica"]),["geral","tecnologia"]);
// Case 5: known false positive in tech should NOT go to Tecnologia.
assertRoute(offer("5","Criado mudo com tomada","eletronicos",["eletronicos"]),["geral"]);
// Case 6: kitchen appliance, not women's channel.
assertRoute(offer("6","Air Fryer Digital","cozinha",["casa","cozinha"]),["geral","casa"]);
// Case 7: manual category override preserved across incompatible title hints.
assertRoute(offer("7","Mouse notebook", "casa",["casa"],"manual_approved"),["geral","casa"]);
// Case 8: discount <10% fails all rules.
const low=offer("8","Fone bluetooth","eletronicos",["eletronicos"]);
low.candidate.discount_percentage=9;
assert.deepEqual(routes(low),[]);
assert.equal(test(low).counters.below_discount,1);
// Case 9: channel disabled: validator must fail CLOSED, not substitute WhatsApp.
assert.throws(()=>planShopeeAfterPersistence({candidates:[low.candidate],stored_offers:[low.stored],
 rules,channels:channels.map(x=>x.id==="casa"?{...x,status:"disabled"}:x),
 scope,now_iso:"2026-10-22T21:00:00Z"}),/routing_telegram_channel_unavailable/);
// Case 10: extra rule, even with matching conditions, must fail rather than leak routes.
assert.throws(()=>planShopeeAfterPersistence({candidates:[low.candidate],stored_offers:[low.stored],
 rules:[...rules,{...rules[0],name:"SHOPEE — Extra"}],channels,scope,now_iso:"2026-10-22T21:00:00Z"}),
 /routing_rule_count_mismatch/);
console.log("Live-rule snapshot Shopee 4-channel regression passed, no publications.");

import assert from "node:assert/strict";
import {classifyShopee,matchesRule} from "../supabase/functions/discovery-cloud-shopee/shopee-production-rules.mjs";
import {compareShopeeRoutingShadow,validateShopeeRoutingRules,SHOPEE_EXPECTED_RULE_NAMES} from "../supabase/functions/discovery-cloud-shopee/shopee-routing-shadow.mjs";
const ids=["general","woman","home","tech"];
const base={marketplace:"shopee",minDiscount:10};
const rules=SHOPEE_EXPECTED_RULE_NAMES.map((name,i)=>({
 name,enabled:true,conditions:{...base,...(i===1?{
   mavuriCategories:["moda","beleza"],
   mavuriTagsAny:["feminino","maquiagem","skincare","cabelo","unhas","acessorios-femininos"],
   deniedMavuriTags:["masculino","infantil","casa","cozinha","limpeza","decoracao"]
 }:i===2?{mavuriCategories:["casa","cozinha"],mavuriTagsAny:["casa","cozinha","limpeza","decoracao"]}
 :i===3?{mavuriCategories:["eletronicos","informatica"],mavuriTagsAny:["eletronicos","informatica","celular"]}
 :{})},actions:{channel_ids:[ids[i]]}
}));
const channels=ids.map(id=>({id,type:"telegram",status:"connected",external_ref:"chat-available"}));
assert.equal(validateShopeeRoutingRules(rules,channels).length,4);
assert.throws(()=>validateShopeeRoutingRules(rules,[...channels.slice(0,3),{...channels[3],type:"whatsapp"}]),/unavailable/);
assert.throws(()=>validateShopeeRoutingRules([...rules,{...rules[0],name:"SHOPEE — Extra"}],channels),/count_mismatch/);
assert.throws(()=>validateShopeeRoutingRules([{...rules[0],conditions:{...rules[0].conditions,strangeNewCondition:1}},...rules.slice(1)],channels),/unsupported/);
const o=(id,title,global_category1,global_category2=null)=>({
 itemid:id,title,price:100,sale_price:100,discount_percentage:20,
 global_category1,global_category2
});
const offers=[
 o("1","Batom Maquiagem Feminina Rosa","Beauty","Makeup"),
 o("2","Panela Eletrica para Cozinha","Home Appliances","Kitchen Appliances"),
 o("3","Fone Bluetooth Headset","Mobile & Gadgets"),
 o("4","Itens de Papelaria Caderno",""),
 o("5","Sapato Feminino Modelo","Women Shoes"),
 o("6","Filtro de Agua para Casa","Home & Living","Home Care Supplies"),
 o("7","Computador Notebook","Computers & Accessories")
];
assert.equal(classifyShopee(offers[0]).categorySlug,"beleza");
assert.equal(classifyShopee(offers[1]).categorySlug,"cozinha");
assert.equal(classifyShopee(offers[2]).categorySlug,"eletronicos");
assert.equal(classifyShopee(offers[3]).categorySlug,"outros");
assert.equal(matchesRule(rules[1],{title:offers[0].title,price:100,discount:20,mavuriCategory:"beleza",mavuriTags:["maquiagem","feminino"]}),true);
const result=compareShopeeRoutingShadow(offers,rules,channels);
assert.equal(result.candidates,7);
assert.equal(result.classified_outros,1);
assert.equal(result.matched_candidates_by_rule["SHOPEE — Geral"],7);
assert.equal(result.matched_candidates_by_rule["SHOPEE — Mulher"],2);
assert.equal(result.matched_candidates_by_rule["SHOPEE — Casa & Cozinha"],2);
assert.equal(result.matched_candidates_by_rule["SHOPEE — Tecnologia"],2);
assert.equal(result.unmatched_candidates,0);
assert.equal(result.matched_multiple_rules,6);
assert.equal(Object.values(result.classification_category_counts).reduce((a,b)=>a+b,0),7);
assert.equal(JSON.stringify(result).includes("Batom"),false);
assert.equal(JSON.stringify(result).includes("chat-available"),false);
console.log("Shopee production-classifier routing shadow tests passed (zero sends/writes).");

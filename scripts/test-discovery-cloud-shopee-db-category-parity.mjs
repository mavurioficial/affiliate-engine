import assert from "node:assert/strict";
import {compareShopeeDbCategoryParity} from "../supabase/functions/discovery-cloud-shopee/shopee-db-category-parity.mjs";
import {SHOPEE_EXPECTED_RULE_NAMES} from "../supabase/functions/discovery-cloud-shopee/shopee-routing-shadow.mjs";
const ids=["all","woman","home","tech"];
const rules=SHOPEE_EXPECTED_RULE_NAMES.map((name,i)=>({
  name,enabled:true,
  conditions:{marketplace:"shopee",minDiscount:10,
    ...(i===1?{mavuriCategories:["moda","beleza"],mavuriTagsAny:["feminino","maquiagem","skincare","cabelo","unhas","acessorios-femininos"]}
      :i===2?{mavuriCategories:["casa","cozinha"],mavuriTagsAny:["casa","cozinha","limpeza","decoracao"]}
      :i===3?{mavuriCategories:["eletronicos","informatica"],mavuriTagsAny:["eletronicos","informatica","celular"]}:{})
  },actions:{channel_ids:[ids[i]]}
}));
const channels=ids.map(id=>({id,type:"telegram",status:"connected",external_ref:"active"}));
const item=(id,title,category=null)=>({itemid:id,title,global_category1:category,global_category2:null,sale_price:80,discount_percentage:22});
const db=(id,slug,tags,source="marketplace_category_map",date="2026-10-22T10:00:00Z")=>({
 source_ref:id,mavuri_tags:tags,metadata:{mavuri:{category_slug:slug,classification_source:source}},captured_at:date
});
const offers=[
 item("1","Notebook gamer","Computers & Accessories"),
 item("2","Brinco Feminino Delicado",""),
 item("3","Panela Elétrica Prática","Home Appliances"),
 item("4","Novidade desconhecida","")
];
const report=compareShopeeDbCategoryParity(offers,[
 db("1","informatica",["informatica"]),
 db("2","moda",["feminino","acessorios-femininos"],"manual_corrected"),
 db("3","cozinha",["casa","cozinha"]),
 db("3","casa",["casa"],"old_row","2026-10-20T10:00:00Z"),
 db("9","eletronicos",["eletronicos"])
],rules,channels);
assert.equal(report.candidates_total,4);
assert.equal(report.known_in_database,3);
assert.equal(report.missing_in_database,1);
assert.equal(report.comparable_candidates,3);
assert.equal(report.duplicate_db_source_refs,1);
assert.equal(report.manual_approved_or_corrected,1);
assert.equal(report.ingest_vs_database_category_mismatches,1);
assert.equal(report.category_transitions["outros -> moda"],1);
assert.equal(report.channel_rules.stored_effective["SHOPEE — Geral"],3);
assert.equal(report.channel_rules.stored_effective["SHOPEE — Mulher"],1);
assert.equal(report.channel_rules.newly_matched_by_stored["SHOPEE — Mulher"],1);
assert.equal(report.channel_rules.stored_effective["SHOPEE — Casa & Cozinha"],1);
assert.equal(report.channel_rules.stored_effective["SHOPEE — Tecnologia"],1);
assert.equal(JSON.stringify(report).includes("Notebook"),false);
assert.equal(JSON.stringify(report).includes("Brinco"),false);
assert.equal(JSON.stringify(report).includes("active"),false);
assert.throws(()=>compareShopeeDbCategoryParity(offers,[],[],channels),/routing_rule_count_mismatch/);
console.log("Shopee DB category parity shadow test passed: no database changes or sends.");

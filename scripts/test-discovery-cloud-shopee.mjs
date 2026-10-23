import assert from "node:assert/strict";
import {normalizeShopeeDiscount,inferShopeeCategoryHints,mapShopeeApiProduct,collectUniqueOffers,previewSummary,SHOPEE_V85_SPECS,SHOPEE_BALANCED_QUOTAS,selectShopeeBalancedCandidates,diagnoseShopeeSources} from "../supabase/functions/discovery-cloud-shopee/shopee-core.mjs";
assert.equal(normalizeShopeeDiscount(0.2),20);
assert.equal(normalizeShopeeDiscount(18.53),18.53);
assert.equal(normalizeShopeeDiscount(null),null);
assert.equal(inferShopeeCategoryHints("Shorts masculino com bolso para celular").global_category1,"Fashion Accessories");
assert.equal(inferShopeeCategoryHints("Criado-mudo com carregador para celular").global_category1,"Home & Living");
assert.equal(inferShopeeCategoryHints("Liquidificador Air Fryer").global_category1,"Home Appliances");
assert.equal(inferShopeeCategoryHints("Vestido feminino").global_category1,"Women Clothes");
const node=(itemId,discount=0.25)=>({itemId,productName:"Notebook SSD",priceMin:"199.90",priceDiscountRate:discount,
  offerLink:"https://s.shopee.com.br/example"+itemId,imageUrl:"https://example.com/img.jpg",productLink:"https://shopee.com.br/example"});
assert.equal(mapShopeeApiProduct({...node("42"),offerLink:""}),null);
assert.equal(mapShopeeApiProduct({...node("42"),priceMin:0}),null);
assert.equal(mapShopeeApiProduct(node("42")).global_category1,"Computers & Accessories");
const offers=collectUniqueOffers([node("42"),node("42"),node("43",0.07),node("44",0.8)],80);
assert.equal(offers.length,3);
assert.equal(previewSummary(offers).discount_at_least_10,2);
assert.equal(previewSummary(offers).affiliate_links_present,3);
assert.equal(SHOPEE_V85_SPECS.length,3);
assert.equal(collectUniqueOffers(Array.from({length:100},(_,i)=>node(String(i))),80).length,80);
// Product samples actually observed in the first read-only cloud preview.
for(const [title,expected] of [
  ["Arvore de Natal Pinheiro 210cm","Home & Living"],
  ["Toalha Banho Gigante E Rosto 100% Algodao","Home & Living"],
  ["Esfregao Eletrico 9 em 1 Sem fio","Home & Living"],
  ["Fatiador KITOP Descasca Legumes Pratico","Home & Living"],
  ["Creatina Monohidratada Pura 300g","Sports & Outdoors"],
  ["Bicicleta Ergometrica Spinning Academia","Sports & Outdoors"]
]) assert.equal(inferShopeeCategoryHints(title).global_category1,expected,title);
// Unknown items must stay unclassified rather than risking a wrong Telegram channel.
assert.equal(inferShopeeCategoryHints("Massageador Portatil para Pescoco").global_category1,null);
assert.equal(SHOPEE_BALANCED_QUOTAS["top-performance"],30);
assert.equal(SHOPEE_BALANCED_QUOTAS["maior-comissao"],25);
assert.equal(SHOPEE_BALANCED_QUOTAS["recomendados"],25);
const list=(prefix,n)=>Array.from({length:n},(_,i)=>node(prefix+i));
const balanced=selectShopeeBalancedCandidates({
  "top-performance":list("top",80),
  "maior-comissao":list("commission",80),
  "recomendados":list("recommended",80)
});
assert.equal(balanced.offers.length,80);
assert.deepEqual(balanced.selected_by_source,{"top-performance":30,"maior-comissao":25,"recomendados":25});
assert.equal(balanced.backfill_added,0);
assert.equal(new Set(balanced.offers.map(x=>x.itemid)).size,80);
const overlap=selectShopeeBalancedCandidates({
  "top-performance":list("top",30),
  "maior-comissao":[...list("top",10),...list("com",30)],
  "recomendados":list("rec",30)
});
assert.equal(overlap.offers.length,80);
assert.deepEqual(overlap.selected_by_source,{"top-performance":30,"maior-comissao":25,"recomendados":25});
const fallback=selectShopeeBalancedCandidates({
  "top-performance":list("top",80),
  "maior-comissao":[],
  "recomendados":[]
});
assert.equal(fallback.offers.length,80);
assert.equal(fallback.backfill_added,50);

// Diagnostics separate actual empty API lists, missing affiliate URLs and overlap.
const emptyDiag=diagnoseShopeeSources({
  "top-performance":list("top",40),
  "maior-comissao":[],
  "recomendados":list("rec",30)
},selectShopeeBalancedCandidates({
  "top-performance":list("top",40),
  "maior-comissao":[],
  "recomendados":list("rec",30)
}));
assert.equal(emptyDiag["maior-comissao"].reason_if_zero_selected,"api_returned_no_products");
assert.equal(emptyDiag["top-performance"].received,40);
assert.equal(emptyDiag["maior-comissao"].selected,0);
const invalidDiag=diagnoseShopeeSources({
  "top-performance":list("top",20),
  "maior-comissao":[{...node("bad"),offerLink:""},{...node("bad2"),imageUrl:""}],
  "recomendados":list("rec",30)
},selectShopeeBalancedCandidates({
  "top-performance":list("top",20),
  "maior-comissao":[{...node("bad"),offerLink:""},{...node("bad2"),imageUrl:""}],
  "recomendados":list("rec",30)
}));
assert.equal(invalidDiag["maior-comissao"].invalid,2);
assert.equal(invalidDiag["maior-comissao"].reason_if_zero_selected,"no_valid_affiliate_offers");
const overlapDiag=diagnoseShopeeSources({
  "top-performance":list("top",30),
  "maior-comissao":list("top",5),
  "recomendados":list("rec",30)
},selectShopeeBalancedCandidates({
  "top-performance":list("top",30),
  "maior-comissao":list("top",5),
  "recomendados":list("rec",30)
}));
assert.equal(overlapDiag["maior-comissao"].duplicates_from_earlier_sources,5);
assert.equal(overlapDiag["maior-comissao"].reason_if_zero_selected,"all_overlap_earlier_sources");

console.log("Shopee V85 cloud pure-function tests passed. No network or publications.");

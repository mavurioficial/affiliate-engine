import assert from "node:assert/strict";
import {
 mlCatalogKey,mlCompactSearchTitle,rotateMlThemes,mlDiscoveryBuckets,
 collapseMlCatalogToCheapest,mlV86LinkBudget,mlAffiliateHostAllowed,
 mlVerifiedAffiliateCandidate
} from "../scripts/cloud-runner/ml-v86-pure.mjs";

assert.equal(mlCatalogKey({id:"MLB111",product_id:"MLB222"}),"MLB222");
assert.equal(mlCatalogKey({id:"MLB111",url:"https://www.mercadolivre.com.br/p/MLB12345?src=x"}),"MLB12345");
assert.equal(mlCatalogKey({id:"MLB111"}),null);
assert.equal(mlCompactSearchTitle("Cadeira de Escritório Preta com Braços e Apoio"),"Cadeira Escritorio Preta Bracos Apoio");
assert.deepEqual(rotateMlThemes(["casa","tecnologia","casa","moda"],1),["tecnologia","moda","casa"]);
assert.equal(mlDiscoveryBuckets({queries:["a","b"],pages:3,queryPages:2,slot:0}).length,3);
const a={id:"a",product_id:"MLB999",price:49,title:"Produto A",url:"https://mercadolivre.com.br/p/MLB999"};
const b={id:"b",product_id:"MLB999",price:39,title:"Produto B",url:"https://mercadolivre.com.br/p/MLB999"};
const c={id:"c",price:22,title:"Outro produto",url:"https://www.mercadolivre.com.br/MLB888"};
const result=collapseMlCatalogToCheapest([a,b,c]);
assert.equal(result.products.length,2);
assert.equal(result.alternatives,1);
assert.equal(result.products[0].id,"b");
assert.equal(result.products[0].metadata.pricing.catalog_key,"MLB999");
assert.equal(result.products[0].metadata.pricing.alternatives_seen,2);
assert.equal(result.savingsVsWorst,10);
assert.equal(a.metadata,undefined,"must not mutate input");
assert.equal(mlV86LinkBudget({target:8,alreadyReady:8,eligibleKnown:true}).diversityReserve,2);
assert.equal(mlV86LinkBudget({target:8,alreadyReady:24,eligibleKnown:true}).successTarget,0);
assert.equal(mlV86LinkBudget({target:8,alreadyReady:7,eligibleKnown:true}).successTarget,1);
assert.equal(mlV86LinkBudget({target:8,alreadyReady:1,eligibleKnown:false}).successTarget,8);
assert.equal(mlAffiliateHostAllowed("https://meli.la/a"),true);
assert.equal(mlAffiliateHostAllowed("https://fake-meli.la/a"),false);
assert.equal(mlAffiliateHostAllowed("http://meli.la/a"),false);
assert.equal(mlAffiliateHostAllowed("https://mercadolivre.com.br.evil.test/a"),false);
const product={id:"b",affiliate_url:"https://meli.la/approved"};
assert.equal(mlVerifiedAffiliateCandidate(product,{}),false);
assert.equal(mlVerifiedAffiliateCandidate(product,{source:"owner_authenticated_hub",offer_id:"b",affiliate_url:"https://meli.la/other"}),false);
assert.equal(mlVerifiedAffiliateCandidate(product,{source:"owner_authenticated_hub",offer_id:"b",affiliate_url:product.affiliate_url}),true);
console.log("Mavuri ML V86 portable primitives: 20 deterministic tests passed; no network or credentials.");

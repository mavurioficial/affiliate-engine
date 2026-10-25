import assert from 'node:assert/strict';
import {candidatesFromRows,commercialCandidate,enrichCandidates} from '../supabase/functions/discovery-cloud-magalu-executor/collector.mjs';
import {newCatalogRow} from '../supabase/functions/discovery-cloud-shopee-executor/catalog.mjs';
import {fetchCommercialCandidates} from '../supabase/functions/discovery-cloud-shopee-executor/source.ts';
const campaign={id:'1',date:new Date().toISOString(),text:'Cupom: PROMO10\nCódigos:\n123456789\nabc1234567\n123456789\nValidade: 25/10'};
const parsed=candidatesFromRows([campaign]);
assert.equal(parsed.offers.length,2);assert.ok(parsed.offers.every(x=>!x.price&&!x.coupon&&x.metadata.campaign_seed));
assert.equal(commercialCandidate(parsed.offers[0],{product_identified:true,title_present:true,title:'Produto realmente confirmado',price:100,image:'https://img.test/p',availability:'InStock'},'https://www.magazinevoce.com.br/magazinemavuri/produto/p/123456789/a/').offer.price,100);
const context={owner:'u',marketplace:'m',account:'a',categories:[{id:'c',slug:'cozinha',active:true}]};
const c={id:'1',title:'Liquidificador com jarra',price:100,discount:15,url:'https://s.shopee.com.br/1',image:'https://img.test/p',productUrl:'https://shopee.com.br/p'};
assert.equal(newCatalogRow(c,context).mavuri_category_id,'c');assert.equal(newCatalogRow({...c,title:'Objeto sem identificação'},context),null);
const original=globalThis.fetch;const pages=[];
globalThis.fetch=async(_,options)=>{const q=JSON.parse(options.body).query;const page=Number(q.match(/page: (\d+)/)[1]);pages.push(page);return new Response(JSON.stringify({data:{productOfferV2:{nodes:[{itemId:String(page),productName:'Liquidificador jarra',productLink:'https://shopee.com.br/p',imageUrl:'https://img.test/p',priceMin:100,priceDiscountRate:20,offerLink:'https://s.shopee.com.br/'+page}],pageInfo:{hasNextPage:true}}}}));};
try{const pool=await fetchCommercialCandidates('123456','test-secret');assert.equal(pages.length,9);assert.equal(new Set(pages).size,3);assert.equal(pool.length,3);assert.ok(pool.every(x=>x.title&&x.image));}finally{globalThis.fetch=original;}
console.log('Expanded discovery: campaign seeds have no inherited prices/coupons; new Shopee catalog classification; paginated signed pool and dedup passed.');

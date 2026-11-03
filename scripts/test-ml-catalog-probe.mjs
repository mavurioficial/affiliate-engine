import assert from 'node:assert/strict';
import { normalizeCatalogOffers } from '../supabase/functions/ml-catalog-probe/normalize.mjs';
const p={id:'MLB63335606',status:'active',name:'Celular Samsung Galaxy A17 5G'};
const a={results:[
 {item_id:'MLB7701826550',seller_id:123,price:1079,original_price:1855,currency_id:'BRL',condition:'new',status:'active'},
 {item_id:'MLB7701826550',seller_id:123,price:1079,original_price:1855,currency_id:'BRL',condition:'new'},
 {item_id:'MLB12345678',seller_id:456,price:950,currency_id:'BRL',condition:'used'},
 {item_id:'MLB23456789',price:100,currency_id:'USD',condition:'new'},
 {item_id:'MLB34567890',price:20,currency_id:'BRL',condition:'new',min_purchase_unit:10},
 {item_id:'MLB45678901',price:25,currency_id:'BRL',condition:'new',status:'closed'},
 {item_id:'MLB56789012',price:30,currency_id:'BRL',condition:'new',available_quantity:0},
 {item_id:'MLB67890123',price:30,currency_id:'BRL',condition:'new'},
]};
const o=normalizeCatalogOffers(p,a);
assert.equal(o.length,2);
assert.equal(o[0].catalog_id,'MLB63335606');
assert.equal(o[0].item_id,'MLB7701826550');
assert.equal(o[0].seller_id,'123');
assert.equal(o[0].price,1079);
assert.equal(o[0].regular_price,1855);
assert.equal(o[0].verified_discount_percent,42);
assert.equal(o[0].product_url,'https://www.mercadolivre.com.br/p/MLB63335606?wid=MLB7701826550');
assert.equal(o[0].affiliate_url,null);
assert.equal(o[0].publish_ready,false);
assert.equal(o[1].regular_price,null);
assert.equal(o[1].verified_discount_percent,null);
assert.equal(normalizeCatalogOffers({...p,status:'inactive'},a).length,0);
assert.equal(normalizeCatalogOffers({...p,id:'URL_INVALID'},a).length,0);
assert.equal(normalizeCatalogOffers(p,{results:[]}).length,0);
assert.equal(normalizeCatalogOffers(p,{results:'invalid'}).length,0);
assert.equal(normalizeCatalogOffers(p,a,{maxOffers:1}).length,1);
assert.equal(normalizeCatalogOffers(p,a,{maxOffers:0}).length,0);
const invalid={results:[{item_id:'MLB99999999',price:10,original_price:0,currency_id:'BRL',condition:'new'}]};
assert.equal(normalizeCatalogOffers(p,invalid)[0].verified_discount_percent,null);
console.log('PASS: 19 assertions; offline only; no affiliate URLs or publication.');

import test from 'node:test';
import assert from 'node:assert/strict';
import { planBulkLookup, evaluateBulkResponse } from './ml-bulk-refresh-evaluator.mjs';
const seeds=[
 {item_id:'MLB4579770708',title:'Café',last_recorded_price:100,affiliate_url:'https://meli.la/2aB34Cd'},
 {item_id:'MLB4579770708',title:'duplicado',last_recorded_price:105,affiliate_url:'https://meli.la/2aB34Cd'},
 {item_id:'MLB4851817702',title:'Pneu',last_recorded_price:150,affiliate_url:'https://meli.la/3tE5kLl'},
 {item_id:'MLB000',title:'Invalido',last_recorded_price:1,affiliate_url:'https://meli.la/1AbC'},
 {item_id:'MLB1111111111',title:'Sem link',last_recorded_price:80,affiliate_url:'https://www.mercadolivre.com.br/p/MLB1234567'}
];
test('planning: exact known listing IDs, dedup, only genuine stored shortlink formats',()=>{
 const p=planBulkLookup(seeds);assert.equal(p.ids.length,2);
 assert.equal(p.request_limit,1);assert.equal(p.no_network_calls,true);
 assert.match(p.route,/^\/items\/bulk\?ids=MLB4579770708,MLB4851817702/);
 assert.equal(p.no_publication,true);
});
const one={id:'MLB4579770708',status_code:200,body:{
 id:'MLB4579770708',title:'Café',price:85,currency_id:'BRL',condition:'new',status:'active',seller_id:99}};
const two={id:'MLB4851817702',status_code:200,body:{
 id:'MLB4851817702',title:'Pneu',price:149,currency_id:'BRL',condition:'new',status:'active',seller_id:42}};
test('only same-listing historical drop, never classified as official promotion',()=>{
 const x=evaluateBulkResponse(seeds,[one,two]);
 assert.equal(x.ok,true);assert.equal(x.valid_prices,2);assert.equal(x.historical_price_drops,1);
 assert.equal(x.results[0].price_drop_vs_historical_pct,15);
 assert.equal(x.results[0].signal,'historical_item_price_drop');
 assert.equal(x.results[0].publish_ready,false);assert.equal(x.telegram_posts,0);
});
test('denied upstream is recorded without a retry or pub',()=>{
 const x=evaluateBulkResponse(seeds,[{...one,status_code:403,body:null},two]);
 assert.equal(x.blocked_by_upstream,true);assert.equal(x.valid_prices,1);
 assert.equal(x.publish_ready,0);
});
test('wrong item identity is rejected',()=>{
 const x=evaluateBulkResponse(seeds,[{...one,body:{...one.body,id:'MLB9999999999'}},two]);
 assert.equal(x.valid_prices,1);assert.equal(x.results[0].current_price,null);
});
test('wrong currency and invalid response reject prices',()=>{
 const x=evaluateBulkResponse(seeds,[{...one,body:{...one.body,currency_id:'USD'}},two]);
 assert.equal(x.valid_prices,1);
 assert.equal(evaluateBulkResponse(seeds,{}).ok,false);
});

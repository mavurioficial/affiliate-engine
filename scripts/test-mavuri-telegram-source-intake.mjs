import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTelegramRetailUpdate} from '../supabase/functions/mavuri-telegram-source-intake/parse.mjs';
const make=(caption,more={})=>({update_id:77,message:{message_id:65,chat:{id:123456,type:'private'},from:{id:123456},caption,...more}});
test('forwarded paper bundle: Amazon and conditional restrictions',()=>{
 const r=parseTelegramRetailUpdate(make('😱 https://link.amazon/B08aKs8yN FRETE GRATIS PARA ASSINANTES PRIME Personal Papel Higiênico VIP Folha Dupla Leve 32 Pague 28 rolos 30Ml R$33,52 NA RECORRENCIA'));
 assert.equal(r.candidates.length,1);
 const x=r.candidates[0];
 assert.equal(x.marketplace,'amazon');
 assert.equal(x.claimed_price_brl,33.52);
 assert.equal(x.price_conditions.recurring_purchase_price,true);
 assert.equal(x.price_conditions.prime_membership_shipping,true);
 assert.deepEqual(x.price_conditions.bundle,{take:32,pay:28});
 assert.equal(x.publication_allowed,false);
});
test('two user-supplied meli shortlinks with prices',()=>{
 const r=parseTelegramRetailUpdate(make('https://meli.la/1DhpTm8 R$90,15 NO PIX\nhttps://meli.la/2H56Kz8'));
 assert.equal(r.candidates.length,2);
 assert.equal(r.candidates[0].claimed_price_brl,90.15);
 assert.equal(r.candidates[0].price_conditions.pix_price,true);
 assert.equal(r.candidates[1].marketplace,'mercadolivre');
});
test('captures hidden entity URL and known forwarded public origin',()=>{
 const r=parseTelegramRetailUpdate(make('Oferta de hoje',{caption_entities:[{type:'text_link',url:'https://meli.la/1DhpTm8'}],
  forward_origin:{type:'channel',chat:{username:'GRUPOTABUGADO'},message_id:541060}}));
 assert.equal(r.candidates[0].source_message_url,'https://t.me/GRUPOTABUGADO/541060');
});
test('rejects spoofed URLs and deduplicates',()=>{
 const r=parseTelegramRetailUpdate(make('https://meli.la.evil.org/AbCdEf https://meli.la/1DhpTm8 https://meli.la/1DhpTm8'));
 assert.equal(r.candidates.length,1);
});
test('only parses private/channel input, never emits directly to jobs',()=>{
 const wrong=parseTelegramRetailUpdate({message:{message_id:5,chat:{id:-123,type:'supergroup'},text:'https://meli.la/1DhpTm8'}});
 assert.equal(wrong.candidates.length,0);
 const right=parseTelegramRetailUpdate(make('https://meli.la/1DhpTm8'));
 assert.equal(right.candidates[0].own_affiliate_verified,false);
 assert.equal(right.candidates[0].publication_allowed,false);
});

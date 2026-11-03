import test from 'node:test';
import assert from 'node:assert/strict';
import {parseForwardedTelegramOffer} from '../src/domain/telegram-offer-intake.js';

const message='😱🔝🔝 https://link.amazon/B08aKs8yN FRETE GRATIS PARA ASSINANTES PRIME  Personal Papel Higiênico VIP Folha Dupla Leve 32 Pague 28 rolos 30Ml R$33,52 NA RECORRENCIA';
test('real supplied Amazon message: correct conditions and no affiliate reuse',()=>{
  const got=parseForwardedTelegramOffer({sourceUrl:'https://t.me/GRUPOTABUGADO/541060',text:message});
  assert.equal(got.offers.length,1);
  const o=got.offers[0];
  assert.equal(o.marketplace,'amazon');
  assert.equal(o.source_ref,'telegram:GRUPOTABUGADO:541060');
  assert.equal(o.source_link,'https://link.amazon/B08aKs8yN');
  assert.equal(o.claimed_price,33.52);
  assert.equal(o.claimed_conditions.recurring_purchase_price,true);
  assert.equal(o.claimed_conditions.prime_membership_shipping,true);
  assert.deepEqual(o.claimed_conditions.bundle,{take:32,pay:28});
  assert.equal(o.affiliate_url,null);
  assert.equal(o.price_verified_current,false);
  assert.equal(o.publication_allowed,false);
  assert.match(o.title,/Personal Papel Higiênico/);
});
test('missing text for a linked Telegram message does not hallucinate a product',()=>{
  const got=parseForwardedTelegramOffer({sourceUrl:'https://t.me/GRUPOTABUGADO/541058',text:''});
  assert.equal(got.offers.length,0);
  assert.equal(got.status,'needs_message_text_or_retail_link');
});
test('Mercado Livre seller link is held as unverified discovery input',()=>{
  const got=parseForwardedTelegramOffer({
    sourceUrl:'https://t.me/GRUPOTABUGADO/541041',
    text:'Oferta kit R$149,99 https://meli.la/Ab12xyz'
  });
  assert.equal(got.offers[0].marketplace,'mercadolivre');
  assert.equal(got.offers[0].claimed_price,149.99);
  assert.equal(got.offers[0].affiliate_url,null);
  assert.equal(got.offers[0].own_affiliate_attribution_verified,false);
});
test('a Telegram-only reference is never treated as a retailer URL',()=>{
  const got=parseForwardedTelegramOffer({sourceUrl:'https://t.me/GRUPOTABUGADO/541041',text:'https://t.me/GRUPOTABUGADO/541041'});
  assert.equal(got.offers.length,0);
});
test('avoid url injection and other stores pretending to be trusted domains',()=>{
  const got=parseForwardedTelegramOffer({sourceUrl:'https://t.me/GRUPOTABUGADO/541041',text:
    'R$ 99,00 https://link.amazon.evil.example/p/1 https://mercadolivre.com.br.evil.example/p/2'});
  assert.equal(got.offers.length,0);
});
test('reject invalid source posts',()=>{
  assert.throws(()=>parseForwardedTelegramOffer({sourceUrl:'https://evil.example/GRUPOTABUGADO/541041',text:message}));
});
test('multiple source links do not create duplicate identical candidates',()=>{
  const got=parseForwardedTelegramOffer({sourceUrl:'https://t.me/GRUPOTABUGADO/541060',
    text:'R$ 34,20 https://link.amazon/B08aKs8yN https://link.amazon/B08aKs8yN'});
  assert.equal(got.offers.length,1);
});

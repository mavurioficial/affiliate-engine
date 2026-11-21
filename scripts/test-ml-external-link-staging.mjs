import assert from 'node:assert/strict';
import { stageExternalMercadoLivreOffer } from '../src/application/mercadolivre-external-link-staging.js';

const thirdParty='https://meli.la/2LfpuWZ';
const own='https://meli.la/1C5zFze';
const base={
  affiliate_url:thirdParty,
  product_url:'https://www.mercadolivre.com.br/pneu-100100-18-ira-trilha-cross-enduro-ktm-crf-230-xr-200/p/MLB21149154?matt_word=somebody_else',
  item_id:'MLB21149154',
  product:{
    title:'Pneu IRA Trilha Cross 100/100-18',
    price:264,
    thumbnail:'https://http2.mlstatic.com/example.jpg',
  },
};
const staged=stageExternalMercadoLivreOffer(thirdParty,base);
assert.equal(staged.externalProductId,'MLB21149154');
assert.equal(staged.affiliateUrl,null);
assert.equal(staged.readyToPublish,false);
assert.equal(staged.affiliateLinkStatus,'awaiting_own_link');
assert.ok(staged.productUrl.endsWith('/p/MLB21149154'));
assert.ok(!staged.productUrl.includes('matt_word'));
assert.ok(!JSON.stringify(staged).includes(thirdParty));
assert.ok(!JSON.stringify(staged).includes(base.affiliate_url));
assert.ok(!JSON.stringify(staged).includes(own));

assert.throws(()=>stageExternalMercadoLivreOffer(
  'https://meli.la.evil.invalid/anything',base),/invalid_mercadolivre_source_link/);
assert.throws(()=>stageExternalMercadoLivreOffer(thirdParty,{
  ...base,item_id:'MLB99999999'
}),/unconfirmed_or_mismatched_product/);
assert.throws(()=>stageExternalMercadoLivreOffer(thirdParty,{
  ...base,product_url:'https://www.mercadolivre.com.br.evil.invalid/p/MLB21149154'
}),/unconfirmed_or_mismatched_product/);
assert.throws(()=>stageExternalMercadoLivreOffer(thirdParty,{
  ...base,product:{...base.product,price:0}
}),/product_data_incomplete/);

console.log(JSON.stringify({
  ok:true,mode:'safe_external_link_staging_test',
  rejects_foreign_attribution:true,no_publication:true,no_database_writes:true
}));

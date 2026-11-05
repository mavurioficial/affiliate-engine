import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMlDirectCandidate as build} from './ml-direct-tag-candidate.mjs';
const tag='lucasbrasildf', tool='69434586';
test('Kemei: resolved product URL -> own-tag long candidate',()=>{
 const x=build('https://www.mercadolivre.com.br/maquininha-3-em-1-kemei-km-1910-aparador-pelo-corpo-agua-resistente/p/MLB21835256',tag,tool);
 assert.equal(x.candidate_url,'https://www.mercadolivre.com.br/maquininha-3-em-1-kemei-km-1910-aparador-pelo-corpo-agua-resistente/p/MLB21835256?matt_word=lucasbrasildf&matt_tool=69434586');
 assert.equal(x.officially_generated,false);assert.equal(x.attribution_verified,false);assert.equal(x.publication_allowed,false);
});
test('Calvin Klein: remove third-party tracking, keep own affiliate tag',()=>{
 const x=build('https://www.mercadolivre.com.br/calvin-klein-eternity-for-woman-aromatic-essence-edp-50ml-volume-da-unidade-50-ml/p/MLB35609122?matt_word=other&ref=not-ours&matt_tool=111111',tag,tool);
 assert.equal(new URL(x.candidate_url).searchParams.get('matt_word'),tag);
 assert.equal(new URL(x.candidate_url).searchParams.get('matt_tool'),tool);
 assert.equal(new URL(x.candidate_url).searchParams.has('ref'),false);
});
test('Lacoste: preserve product identity',()=>{
 const x=build('https://www.mercadolivre.com.br/eau-de-toilette-lacoste-l1212-blanc-para-homem-100-ml/p/MLB41851395',tag,tool);
 assert.match(x.candidate_url,/\/p\/MLB41851395\?matt_word=lucasbrasildf/);
});
test('Specific offer ID: preserve allowed item_id variant',()=>{
 const x=build('https://www.mercadolivre.com.br/perfume-arabe-armaf-club-de-nuit-sillage-edp-105ml-masculino/up/MLBU4268048981?pdp_filters=item_id%3AMLB4877627517&tracking_id=other',tag,tool);
 assert.equal(new URL(x.candidate_url).searchParams.get('pdp_filters'),'item_id:MLB4877627517');
 assert.equal(new URL(x.candidate_url).searchParams.has('tracking_id'),false);
});
test('Source affiliate page is not a product and cannot be converted directly',()=>{
 assert.throws(()=>build('https://www.mercadolivre.com.br/social/other?matt_word=other&ref=secret',tag,tool),/not_resolved_product_url/);
 assert.throws(()=>build('https://meli.la/1Test',tag,tool),/unsupported_host_or_scheme/);
});
test('Reject external domains and unrelated Mercado Livre pages',()=>{
 for(const url of ['https://mercadolivre.com.br.example.com/p/MLB123456','https://example.com/p/MLB123456','https://www.mercadolivre.com.br/','http://www.mercadolivre.com.br/p/MLB123456']){
  assert.throws(()=>build(url,tag,tool));
 }
});
test('Idempotent conversion and no unverified automatic publication',()=>{
 const original='https://www.mercadolivre.com.br/p/MLB123456?utm_source=other&matt_word=someone&matt_tool=222222';
 const first=build(original,tag,tool);
 const twice=build(first.candidate_url,tag,tool);
 assert.equal(first.candidate_url,twice.candidate_url);
 assert.equal(first.publication_allowed,false);
 assert.equal(twice.publication_allowed,false);
});

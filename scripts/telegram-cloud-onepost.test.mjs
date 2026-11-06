import test from 'node:test';
import assert from 'node:assert/strict';
import {safeUrl,findAmazonLinks,getAsin,resolveAmazonAsin,collectCandidates,extractProductTitle,collectMercadoLivreCandidates} from './telegram-cloud-onepost.mjs';
const msg=(id,message,entities=[])=>({id,message,entities});
test('Only HTTPS approved Amazon hosts',()=>{
 assert.ok(safeUrl('https://link.amazon/abc'));
 assert.equal(safeUrl('http://link.amazon/abc'),null);
 assert.equal(safeUrl('https://link.amazon.evil.invalid/a'),null);
 assert.equal(safeUrl('https://link.amazon:9999/x'),null);
});
test('Finds text links and Telegram hidden URLs',()=>{
 assert.deepEqual(findAmazonLinks(msg(541062,'https://link.amazon/ab! https://link.amazon/ab',
 [{url:'https://amzn.to/xyz'}])),['https://link.amazon/ab','https://amzn.to/xyz']);
});
test('Identifies ASIN only on Amazon product URLs',()=>{
 assert.equal(getAsin('https://www.amazon.com.br/dp/B0HD2T6BZZ/ref=nosim'),'B0HD2T6BZZ');
 assert.equal(getAsin('https://amazon.com.br/gp/product/B09MLBPL1K'),'B09MLBPL1K');
 assert.equal(getAsin('https://amazon.com.br/not-product/B09MLBPL1K'),null);
});
test('Resolves exactly validated two-hop redirect and blocks foreign host',async()=>{
 const paths=new Map([['https://link.amazon/q','https://amzlinks.in/q'],
 ['https://amzlinks.in/q','https://www.amazon.com.br/dp/B0HD2T6BZZ']]);
 const stub=async u=>({status:302,headers:new Headers({location:paths.get(u)||'https://evil.invalid/a'}),body:null});
 assert.equal(await resolveAmazonAsin('https://link.amazon/q',stub),'B0HD2T6BZZ');
 assert.equal(await resolveAmazonAsin('https://link.amazon/other',stub),null);
});
test('Preserve distinct source posts even for same ASIN',async()=>{
 const stub=async()=>({status:301,headers:new Headers({location:'https://www.amazon.com.br/dp/B09MLBPL1K'}),body:null});
 const found=await collectCandidates([
 msg(541065,'https://link.amazon/a'),msg(541064,'https://link.amazon/b'),msg(541059,'https://link.amazon/old')
 ],stub);
 assert.deepEqual(found.map(x=>({message_id:x.message_id,asin:x.asin,title:x.title})),[{message_id:541064,asin:'B09MLBPL1K',title:null},{message_id:541065,asin:'B09MLBPL1K',title:null}]);
});

test('Extracts a factual product name from Telegram page metadata',()=>{
 assert.equal(extractProductTitle({message:'https://link.amazon/x',
  media:{webpage:{title:'Mixer Power Inox 3 em 1 600W Elgin Lunar 110V'}}}),
  'Mixer Power Inox 3 em 1 600W Elgin Lunar 110V');
});
test('Avoids attributing a non-product price line as a product name',()=>{
 assert.equal(extractProductTitle({message:'FRETE GRATIS PARA ASSINANTES PRIME\nhttps://link.amazon/x'}),null);
});

test('Ignores old messages when a freshness cutoff is set',async()=>{
 const t=1762260000;
 const stub=async()=>({status:301,headers:new Headers({location:'https://www.amazon.com.br/dp/B09MLBPL1K'}),body:null});
 const found=await collectCandidates([
 {...msg(541070,'https://link.amazon/current'),date:t+15},
 {...msg(541069,'https://link.amazon/old'),date:t-3600}
 ],stub,t);
 assert.deepEqual(found.map(x=>({message_id:x.message_id,asin:x.asin,title:x.title})),[{message_id:541070,asin:'B09MLBPL1K',title:null}]);
});
test('With multiple links in one message does not assign a possibly wrong title',async()=>{
 const destinations=new Map([
  ['https://link.amazon/a','https://www.amazon.com.br/dp/B09MLBPL1K'],
  ['https://link.amazon/b','https://www.amazon.com.br/dp/B0HD2T6BZZ']
 ]);
 const stub=async u=>({status:302,headers:new Headers({location:destinations.get(u)}),body:null});
 const found=await collectCandidates([msg(541080,'Mixer Elgin 600 W 110 V https://link.amazon/a https://link.amazon/b')],stub);
 assert.equal(found.length,1);
 assert.equal(found[0].products.length,2);
 assert.equal(found[0].title,null);
});

test('Collects Mercado Livre shortened links without rewriting tracking',()=>{
 const recent=collectMercadoLivreCandidates([
  msg(541140,'Marinex conjunto de assadeiras 6 peças https://meli.la/1DhpTm8'),
  msg(541139,'Pré treino Ronnie Coleman https://meli.la/2H56Kz8')
 ]);
 assert.equal(recent.length,2);
 assert.equal(recent[0].original_url,'https://meli.la/1DhpTm8');
 assert.equal(recent[0].ml_product_id,null);
 assert.match(recent[0].claimed_title,/Marinex/);
 assert.equal(recent[1].original_url,'https://meli.la/2H56Kz8');
});
test('Only approved Mercado Livre hosts, not lookalike domains',()=>{
 const result=collectMercadoLivreCandidates([
  msg(541143,'https://meli.la.evil.invalid/abc https://mercadolivre.com.br/p/MLB12345678'),
  msg(541142,'https://meli.la/valid https://meli.la/valid')
 ]);
 assert.equal(result.length,2);
 assert.equal(result[0].ml_product_id,'MLB12345678');
 assert.equal(result[1].original_url,'https://meli.la/valid');
});
test('Mercado Livre capture respects date cutoff and uses no other platform',()=>{
 const date=1762250000,cutoff=date+60;
 const records=collectMercadoLivreCandidates([
  {...msg(541146,'https://meli.la/new'),date:date+120},
  {...msg(541145,'https://meli.la/old'),date:date-100},
  {...msg(541144,'https://link.amazon/x'),date:date+120}
 ],cutoff);
 assert.equal(records.length,1);
 assert.equal(records[0].original_url,'https://meli.la/new');
});


test('Light same-family filter skips only consecutive diaper variants',async()=>{
 const {amazonFamilyKey,filterAmazonSimilar,isAmazonResumeAfterPause}=await import('./telegram-cloud-onepost.mjs');
 assert.equal(amazonFamilyKey('Fralda Pampers Premium Care Pants XG 96 unidades'),
              amazonFamilyKey('Fralda Pampers Premium Care Pants XXG 90 unidades'));
 assert.equal(amazonFamilyKey('Apple iPhone 17 Pro 256GB'),null);
 const found=filterAmazonSimilar([
  {message_id:11,title:'Fralda Pampers Premium Care Pants XG 96 unidades'},
  {message_id:12,title:'Fralda Pampers Premium Care Pants XXG 90 unidades'},
  {message_id:13,title:'Smart TV Samsung 55 4K'}]);
 assert.deepEqual(found.accepted.map(x=>x.message_id),[11,13]);
 assert.equal(found.blocked.length,1);
 assert.deepEqual(filterAmazonSimilar([{message_id:14,title:'Fralda Pampers Premium Care Pants XG'}],
  ['diaper:pampers-premium-care-pants']).accepted,[]);
 assert.equal(isAmazonResumeAfterPause(new Date(Date.now()-95*60000).toISOString()),true);
 assert.equal(isAmazonResumeAfterPause(new Date(Date.now()-25*60000).toISOString()),false);
 assert.equal(isAmazonResumeAfterPause(null),false);
});
test('Bulk Mercado Livre candidates can be collected without an eight-link loss',()=>{
 const messages=Array.from({length:12},(_,i)=>msg(541200+i,
  'Achado https://meli.la/'+String(10000+i)));
 assert.equal(collectMercadoLivreCandidates(messages).length,8);
 assert.equal(collectMercadoLivreCandidates(messages,0,32).length,12);
});

test('Ketchup and mayonnaise variants share one 30-minute Amazon family',async()=>{
 const {amazonFamilyKey,filterAmazonSimilar}=await import('./telegram-cloud-onepost.mjs');
 const captions=[
  'Heinz Ketchup Tradicional 1,033KG',
  'Heinz Ketchup Zero Açúcar 373g',
  'Heinz Ketchup 397G + Maionese 390G',
  'Heinz Maionese Churrasco 215g'
 ];
 assert.deepEqual(captions.map(amazonFamilyKey),Array(4).fill('pantry:ketchup-mayonnaise'));
 const batch=filterAmazonSimilar(captions.map((title,i)=>({message_id:542014+i,title,source_text:'CUPOM HEINZ20'})));
 assert.deepEqual(batch.accepted.map(x=>x.message_id),[542014]);
 assert.deepEqual(batch.blocked.map(x=>x.message_id),[542015,542016,542017]);
 assert.equal(batch.accepted[0].family_key,'pantry:ketchup-mayonnaise');
 assert.deepEqual(filterAmazonSimilar([{message_id:542020,title:'Ketchup Picante 500g'}],
  ['pantry:ketchup-mayonnaise']).accepted,[]);
});
test('Toilet-paper pack variants are throttled but unrelated products still pass',async()=>{
 const {amazonFamilyKey,filterAmazonSimilar}=await import('./telegram-cloud-onepost.mjs');
 const titles=['Papel Higiênico Neve 12 Rolos','Papel Higienico Personal 32 Rolos',
  'Detergente Neutro 500ml','Fralda Pampers Premium Care Pants XG'];
 assert.equal(amazonFamilyKey(titles[0]),'household:toilet-paper');
 assert.equal(amazonFamilyKey(titles[1]),'household:toilet-paper');
 assert.equal(amazonFamilyKey('Papel Toalha 6 Rolos'),null);
 const result=filterAmazonSimilar(titles.map((title,i)=>({message_id:1+i,title})));
 assert.deepEqual(result.accepted.map(x=>x.message_id),[1,3,4]);
});
test('Generic recipes and promotions do not get blocked just for a common term',async()=>{
 const {amazonFamilyKey}=await import('./telegram-cloud-onepost.mjs');
 assert.equal(amazonFamilyKey('Kit temperos secos 12 potes'),null);
 assert.equal(amazonFamilyKey('Heinz molho barbecue 397g'),null);
 assert.equal(amazonFamilyKey('Molho de tomate Heinz 340g'),null);
 assert.equal(amazonFamilyKey('Fralda Huggies Supreme Care M 66 unidades'),'diaper:huggies-supreme-care');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {safeUrl,findAmazonLinks,getAsin,resolveAmazonAsin,collectCandidates,extractProductTitle} from './telegram-cloud-onepost.mjs';
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
test('Only fresh messages; no duplicate ASIN',async()=>{
 const stub=async()=>({status:301,headers:new Headers({location:'https://www.amazon.com.br/dp/B09MLBPL1K'}),body:null});
 const found=await collectCandidates([
 msg(541065,'https://link.amazon/a'),msg(541064,'https://link.amazon/b'),msg(541059,'https://link.amazon/old')
 ],stub);
 assert.deepEqual(found,[{message_id:541065,asin:'B09MLBPL1K',title:null}]);
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
 assert.deepEqual(found,[{message_id:541070,asin:'B09MLBPL1K',title:null}]);
});
test('With multiple links in one message does not assign a possibly wrong title',async()=>{
 const destinations=new Map([
  ['https://link.amazon/a','https://www.amazon.com.br/dp/B09MLBPL1K'],
  ['https://link.amazon/b','https://www.amazon.com.br/dp/B0HD2T6BZZ']
 ]);
 const stub=async u=>({status:302,headers:new Headers({location:destinations.get(u)}),body:null});
 const found=await collectCandidates([msg(541080,'Mixer Elgin 600 W 110 V https://link.amazon/a https://link.amazon/b')],stub);
 assert.equal(found.length,2);
 assert.ok(found.every(x=>x.title===null));
});

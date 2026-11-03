import test from 'node:test';
import assert from 'node:assert/strict';
import {createAmazonAssociatePreview,parseAmazonAsin,previewAmazonFromProductUrl} from '../src/domain/amazon-associate-link.mjs';
test('builds documented Amazon Brasil Associate text link',()=>{
 const result=createAmazonAssociatePreview({asin:'B09B8VGCR8',trackingId:'mavuri0a-20'});
 assert.equal(result.candidate_affiliate_url,'https://www.amazon.com.br/dp/B09B8VGCR8/ref=nosim?tag=mavuri0a-20');
 assert.equal(result.publication_allowed,false);
 assert.equal(result.link_checker_verified,false);
});
test('extracts ASIN only from Amazon Brasil canonical product URL',()=>{
 assert.equal(parseAmazonAsin('https://www.amazon.com.br/dp/B09B8VGCR8'), 'B09B8VGCR8');
 assert.equal(parseAmazonAsin('https://www.amazon.com.br/my-title/dp/b09b8vgcr8/?a=1'),'B09B8VGCR8');
 assert.equal(parseAmazonAsin('https://www.amazon.com.br/gp/product/B09B8VGCR8'),'B09B8VGCR8');
});
test('never mistakes Amazon shortened code for confirmed ASIN',()=>{
 for(const u of ['https://link.amazon/B08aKs8yN','https://amzn.to/abc','https://amazon.com.br.evil.com/dp/B09B8VGCR8']){
  assert.equal(parseAmazonAsin(u),null);
 }
});
test('rejects other Amazon regions, http and credentials',()=>{
 for(const u of ['https://www.amazon.com/dp/B09B8VGCR8','http://www.amazon.com.br/dp/B09B8VGCR8','https://foo@amazon.com.br/dp/B09B8VGCR8']){
  assert.equal(parseAmazonAsin(u),null);
 }
});
test('rejects unvalidated ASIN or invalid tracking ID',()=>{
 assert.throws(()=>createAmazonAssociatePreview({asin:'B08aKs8yN',trackingId:'mavuri0a-20'}));
 assert.throws(()=>createAmazonAssociatePreview({asin:'B09B8VGCR8',trackingId:'someone-21'}));
});
test('no publication or price authorization is inferred from link format',()=>{
 const result=previewAmazonFromProductUrl({productUrl:'https://www.amazon.com.br/dp/B09B8VGCR8',trackingId:'mavuri0a-20'});
 assert.equal(result.product_identification_verified,false);
 assert.equal(result.current_price_verified,false);
 assert.equal(result.publication_allowed,false);
});

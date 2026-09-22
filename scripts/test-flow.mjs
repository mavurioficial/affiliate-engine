import assert from 'node:assert/strict'
import {
  calculateDiscount,
  createOfferFingerprint,
  detectMarketplace,
  matchesRule,
  normalizeOffer
} from '../src/domain/offer-engine.js'
import { extractMercadoLivreItemId, isMercadoLivreUrl } from '../src/integrations/mercadolivre-client.js'

const offer = normalizeOffer({
  product_url: 'https://www.mercadolivre.com.br/produto/MLB123',
  title: 'Notebook Gamer RTX',
  price: 3999.9,
  previous_price: 4999.9,
  coupon: 'MAVURI10',
  category: 'Eletrônicos',
  seller: 'Loja Oficial',
  external_product_id: 'MLB123',
  source_type: 'api'
})

assert.equal(detectMarketplace(offer.productUrl), 'mercadolivre')
assert.equal(extractMercadoLivreItemId('https://www.mercadolivre.com.br/notebook-xyz/p/MLB12345678'), 'MLB12345678')
assert.equal(extractMercadoLivreItemId('https://produto.mercadolivre.com.br/MLB-987654321'), 'MLB987654321')
assert.equal(extractMercadoLivreItemId('https://example.com/produto/12345678'), null)
assert.equal(isMercadoLivreUrl('https://www.mercadolivre.com.br/produto/MLB12345678'), true)
assert.equal(isMercadoLivreUrl('https://example.com/produto/12345678'), false)
assert.equal(offer.discountPercent, calculateDiscount(3999.9, 4999.9))
assert.equal(offer.sourceType, 'api')
assert.equal(offer.coupon, 'MAVURI10')

assert.equal(matchesRule(offer, {
  marketplace: 'mercadolivre',
  minDiscount: 10,
  maxPrice: 4500,
  keywords: ['notebook', 'tv']
}), true)

assert.equal(matchesRule(offer, {
  marketplace: 'mercadolivre',
  minDiscount: 25
}), false)

assert.equal(matchesRule(offer, {
  deniedKeywords: ['usado', 'quebrado']
}), true)

assert.equal(matchesRule(offer, {
  deniedKeywords: ['gamer']
}), false)

assert.equal(matchesRule(offer, {
  category: 'eletrônicos',
  seller: 'LOJA OFICIAL',
  couponRequired: true
}), true)

const identifiedOffer = normalizeOffer({
  ...offer,
  metadata: { categoryId: 'MLB1234', sellerId: '998877' }
})

assert.equal(matchesRule(identifiedOffer, { categoryId: 'MLB1234' }), true)
assert.equal(matchesRule(identifiedOffer, { sellerId: '998877' }), true)
assert.equal(matchesRule(identifiedOffer, { categoryId: 'MLB9999' }), false)

const sameOffer = normalizeOffer({
  marketplace: 'mercadolivre',
  title: 'Outro título',
  price: 3999.9,
  product_url: 'https://www.mercadolivre.com.br/produto/MLB123',
  external_product_id: 'MLB123'
})

assert.equal(createOfferFingerprint(offer), createOfferFingerprint(sameOffer))

const persistedOffer = normalizeOffer({
  marketplace: 'mercadolivre',
  title: 'Notebook Gamer RTX',
  price: 3999.9,
  previous_price: 4999.9,
  product_url: offer.productUrl,
  affiliate_url: offer.affiliateUrl,
  source_type: 'api'
})

assert.equal(matchesRule(persistedOffer, { marketplace: 'mercadolivre', minDiscount: 10 }), true)
assert.equal(matchesRule(persistedOffer, { maxPrice: 3500 }), false)

assert.equal(calculateDiscount(100, 100), 0)
assert.equal(calculateDiscount(100, 0), 0)
assert.equal(calculateDiscount('invalid', 200), 0)

console.log('Flow domain QA: OK')

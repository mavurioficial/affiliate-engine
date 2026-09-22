import assert from 'node:assert/strict'
import {
  calculateDiscount,
  createOfferFingerprint,
  detectMarketplace,
  matchesRule,
  normalizeOffer
} from '../src/domain/offer-engine.js'

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

const sameOffer = normalizeOffer({
  marketplace: 'mercadolivre',
  title: 'Outro título',
  price: 3999.9,
  product_url: 'https://www.mercadolivre.com.br/produto/MLB123',
  external_product_id: 'MLB123'
})

assert.equal(createOfferFingerprint(offer), createOfferFingerprint(sameOffer))

assert.equal(calculateDiscount(100, 100), 0)
assert.equal(calculateDiscount(100, 0), 0)
assert.equal(calculateDiscount('invalid', 200), 0)

console.log('Flow domain QA: OK')

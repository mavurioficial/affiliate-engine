import { resolveMercadoLivreProduct } from '../integrations/mercadolivre-client.js'
import { saveOfferDetailed } from './offer-service.js'
import { resolveAffiliateUrl } from './affiliate-link-service.js'
import { enqueueOfferDeliveries } from './delivery-service.js'
import { calculateDiscount } from '../domain/offer-engine.js'
import { resolveMercadoLivreAffiliateUrl } from '../integrations/affiliate-resolver-client.js'

function hasUsableLandingProduct(product) {
  return Boolean(
    product &&
    product.title &&
    Number(product.price) > 0 &&
    product.permalink
  )
}

function normalizeLandingProduct(product, itemId) {
  return {
    ...product,
    resolvedItemId: itemId || product.id,
    resolution: product.resolution || 'affiliate_landing_html',
    raw_source: 'affiliate-resolver'
  }
}

export async function captureMercadoLivreOffer(productUrl, {
  accessToken,
  affiliateUrl = null,
  sourceType = 'api'
} = {}) {
  let resolvedProductUrl = productUrl
  let resolvedAffiliateUrl = affiliateUrl
  let resolvedAffiliatePayload = null

  if (resolvedAffiliateUrl) {
    resolvedAffiliatePayload = await resolveMercadoLivreAffiliateUrl(resolvedAffiliateUrl, { accessToken })
    if (!resolvedProductUrl) {
      resolvedProductUrl = resolvedAffiliatePayload.product_url
    }
  }

  if (!resolvedProductUrl) throw new Error('Informe um link de afiliado do Mercado Livre.')

  // The affiliate landing page already contains the product identity and
  // commercial data needed to capture an offer. Prefer it when available:
  // Mercado Livre may reject item API reads for seller-scoped OAuth tokens.
  let product
  if (hasUsableLandingProduct(resolvedAffiliatePayload?.product)) {
    product = normalizeLandingProduct(
      resolvedAffiliatePayload.product,
      resolvedAffiliatePayload.item_id
    )
  } else {
    product = await resolveMercadoLivreProduct(resolvedProductUrl, { accessToken })
  }

  resolvedAffiliateUrl = await resolveAffiliateUrl(product.permalink || resolvedProductUrl, {
    marketplace: 'mercadolivre',
    affiliateUrl: resolvedAffiliateUrl
  })

  const price = Number(product.price || 0)
  const previousPrice = Number(product.original_price || 0) || null
  const discountPercent = calculateDiscount(price, previousPrice)

  const result = await saveOfferDetailed({
    marketplace: 'mercadolivre',
    title: product.title,
    price,
    previousPrice,
    discountPercent,
    productUrl: product.permalink || resolvedProductUrl,
    affiliateUrl: resolvedAffiliateUrl,
    imageUrl: product.thumbnail,
    sourceType,
    metadata: {
      marketplace: 'mercadolivre',
      externalProductId: product.resolvedItemId || product.id,
      resolution: product.resolution,
      currency: product.currency_id || 'BRL',
      sellerId: product.seller_id || null,
      categoryId: product.category_id || null,
      shipping: product.shipping || null,
      rawSource: product.raw_source || null,
      sourceTypeDetail: sourceType === 'api' ? 'mercadolivre_url' : sourceType
    }
  })
  if (resolvedAffiliateUrl) await enqueueOfferDeliveries(result.offer)
  return result.offer
}

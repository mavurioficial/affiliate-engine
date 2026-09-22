import { resolveMercadoLivreProduct } from '../integrations/mercadolivre-client.js'
import { saveOfferDetailed } from './offer-service.js'
import { resolveAffiliateUrl } from './affiliate-link-service.js'
import { enqueueOfferDeliveries } from './delivery-service.js'
import { calculateDiscount } from '../domain/offer-engine.js'
import { resolveMercadoLivreAffiliateUrl } from '../integrations/affiliate-resolver-client.js'

export async function captureMercadoLivreOffer(productUrl, {
  accessToken,
  affiliateUrl = null,
  sourceType = 'api'
} = {}) {
  let resolvedProductUrl = productUrl
  let resolvedAffiliateUrl = affiliateUrl

  if (!resolvedProductUrl && resolvedAffiliateUrl) {
    const resolved = await resolveMercadoLivreAffiliateUrl(resolvedAffiliateUrl, { accessToken })
    resolvedProductUrl = resolved.product_url
  }

  if (!resolvedProductUrl) throw new Error('Informe um link de afiliado do Mercado Livre.')

  const product = await resolveMercadoLivreProduct(resolvedProductUrl, { accessToken })

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

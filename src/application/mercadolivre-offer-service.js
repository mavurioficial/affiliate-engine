import { resolveMercadoLivreProduct } from '../integrations/mercadolivre-client.js'
import { saveOffer } from './offer-service.js'
import { resolveAffiliateUrl } from './affiliate-link-service.js'
import { calculateDiscount } from '../domain/offer-engine.js'

export async function captureMercadoLivreOffer(productUrl, {
  accessToken,
  affiliateUrl = null,
  sourceType = 'mercadolivre_url'
} = {}) {
  const product = await resolveMercadoLivreProduct(productUrl, { accessToken })

  const resolvedAffiliateUrl = await resolveAffiliateUrl(product.permalink || productUrl, {
    marketplace: 'mercadolivre',
    affiliateUrl
  })

  const price = Number(product.price || 0)
  const previousPrice = Number(product.original_price || 0) || null
  const discountPercent = calculateDiscount(price, previousPrice)

  return saveOffer({
    marketplace: 'mercadolivre',
    title: product.title,
    price,
    previousPrice,
    discountPercent,
    productUrl: product.permalink || productUrl,
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
      rawSource: product.raw_source || null
    }
  })
}

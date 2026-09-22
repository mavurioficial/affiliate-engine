export function detectMarketplace(url) {
  const value = String(url || '').toLowerCase()
  if (value.includes('mercadolivre.com') || value.includes('mercadolibre.com')) return 'mercadolivre'
  if (value.includes('shopee.com')) return 'shopee'
  if (value.includes('amazon.com')) return 'amazon'
  return null
}

export function calculateDiscount(price, previousPrice) {
  const current = Number(price)
  const previous = Number(previousPrice)
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0 || current <= 0 || current >= previous) return 0
  return Math.round((1 - current / previous) * 100)
}

export function normalizeOffer(input = {}) {
  const price = Number(input.price || 0)
  const previousPrice = Number(input.previousPrice ?? input.previous_price ?? input.original_price ?? 0) || null
  const discountPercent = Number(input.discountPercent ?? input.discount_percent ?? calculateDiscount(price, previousPrice))
  const productUrl = String(input.productUrl ?? input.product_url ?? input.permalink ?? '').trim()
  const marketplace = input.marketplace || detectMarketplace(productUrl)

  return {
    marketplace,
    title: String(input.title ?? input.name ?? '').trim(),
    price: Number.isFinite(price) ? price : 0,
    previousPrice,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
    coupon: String(input.coupon ?? '').trim() || null,
    productUrl,
    affiliateUrl: String(input.affiliateUrl ?? input.affiliate_url ?? '').trim() || null,
    imageUrl: String(input.imageUrl ?? input.image_url ?? input.thumbnail ?? '').trim() || null,
    category: String(input.category ?? '').trim() || null,
    seller: String(input.seller ?? '').trim() || null,
    sourceType: input.sourceType || input.source_type || 'manual',
    metadata: input.metadata || {}
  }
}

export function createOfferFingerprint(offer) {
  const marketplace = offer.marketplace || 'unknown'
  const product = offer.externalProductId || offer.productId || offer.productUrl || offer.title
  const price = Number(offer.price || 0).toFixed(2)
  return [marketplace, String(product).trim().toLowerCase(), price].join('|')
}

export function matchesRule(offer, conditions = {}) {
  if (conditions.marketplace && conditions.marketplace !== offer.marketplace) return false
  if (conditions.minDiscount != null && Number(offer.discountPercent) < Number(conditions.minDiscount)) return false
  if (conditions.maxPrice != null && Number(offer.price) > Number(conditions.maxPrice)) return false
  if (conditions.category && String(offer.category || '').toLowerCase() !== String(conditions.category).toLowerCase()) return false
  return true
}

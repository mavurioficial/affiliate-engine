import { resolveMercadoLivreProduct, searchMercadoLivre } from '../integrations/mercadolivre-client.js'
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

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function titleSimilarity(left, right) {
  const a = new Set(normalizeTitle(left).split(/\\s+/).filter(Boolean))
  const b = new Set(normalizeTitle(right).split(/\\s+/).filter(Boolean))
  if (!a.size || !b.size) return 0
  let common = 0
  for (const token of a) if (b.has(token)) common += 1
  return common / Math.max(a.size, b.size)
}

function enrichLandingProductFromSearch(product, results) {
  if (!product?.title || !Array.isArray(results)) return product

  const productId = String(product.resolvedItemId || product.id || '').toUpperCase()
  const exact = productId
    ? results.find((item) => String(item?.id || '').toUpperCase() === productId)
    : null

  const best = exact || results
    .map((item) => ({ item, score: titleSimilarity(product.title, item?.title) }))
    .filter(({ item, score }) => item?.price != null && Number(item.price) > 0 && score >= 0.72)
    .sort((a, b) => b.score - a.score)[0]?.item

  if (!best) return product

  return {
    ...product,
    price: Number(best.price) > 0 ? Number(best.price) : product.price,
    original_price: Number(best.original_price) > 0 ? Number(best.original_price) : product.original_price,
    thumbnail: best.thumbnail || product.thumbnail,
    permalink: best.permalink || product.permalink,
    category_id: best.category || product.category_id,
    seller_id: best.seller || product.seller_id,
    resolvedItemId: best.id || product.resolvedItemId || product.id,
    resolution: 'affiliate-resolver-search-enrichment'
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
  if (resolvedAffiliatePayload?.product?.title) {
    product = normalizeLandingProduct(
      resolvedAffiliatePayload.product,
      resolvedAffiliatePayload.item_id
    )

    // A promoted seller's /items/{id} endpoint can legitimately return 403
    // for the affiliate user's token. Before falling back to that endpoint,
    // enrich a title-only landing result through the public listing search.
    if (!hasUsableLandingProduct(product)) {
      try {
        const searchResult = await searchMercadoLivre(product.title, {
          accessToken,
          limit: 20
        })
        product = enrichLandingProductFromSearch(product, searchResult?.results)
      } catch {
        // Keep the existing item-id resolver as the final fallback.
      }
    }

    if (!hasUsableLandingProduct(product)) {
      product = await resolveMercadoLivreProduct(resolvedProductUrl, { accessToken })
    }
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

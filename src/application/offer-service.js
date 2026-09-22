import { supabase } from '../app/auth.js'
import { createOfferFingerprint, normalizeOffer } from '../domain/offer-engine.js'

async function resolveMarketplaceId(slug) {
  if (!slug) return null
  const { data, error } = await supabase
    .from('flow_marketplaces')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  return data?.id || null
}

export async function saveOffer(input) {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('Usuário não autenticado.')

  const offer = normalizeOffer(input)
  const fingerprint = createOfferFingerprint(offer)
  const marketplaceId = await resolveMarketplaceId(offer.marketplace)

  const { data: existing } = await supabase
    .from('flow_offers')
    .select('*')
    .eq('user_id', user.id)
    .eq('fingerprint', fingerprint)
    .limit(1)
    .maybeSingle()

  if (existing) return existing

  const { data, error } = await supabase
    .from('flow_offers')
    .insert({
      user_id: user.id,
      marketplace_id: marketplaceId,
      title: offer.title || 'Oferta sem título',
      price: offer.price,
      previous_price: offer.previousPrice,
      discount_percent: offer.discountPercent,
      coupon: offer.coupon,
      product_url: offer.productUrl,
      affiliate_url: offer.affiliateUrl,
      image_url: offer.imageUrl,
      source_type: offer.sourceType,
      fingerprint,
      metadata: offer.metadata
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function listOffers({ limit = 50, status } = {}) {
  let query = supabase
    .from('flow_offers')
    .select('*')
    .order('captured_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

import { getActiveAffiliateAccount } from './affiliate-account-service.js'

function appendQuery(url, params) {
  const value = new URL(url)
  for (const [key, entry] of Object.entries(params || {})) {
    if (entry != null && entry !== '') value.searchParams.set(key, String(entry))
  }
  return value.toString()
}

export async function resolveAffiliateUrl(productUrl, {
  marketplace = 'mercadolivre',
  affiliateUrl = null,
  campaign = null
} = {}) {
  if (affiliateUrl) return affiliateUrl

  const account = await getActiveAffiliateAccount(marketplace)
  if (!account) return null

  const settings = account.settings || {}
  const template = settings.link_template || settings.url_template || null

  if (template) {
    return template
      .replaceAll('{url}', encodeURIComponent(productUrl))
      .replaceAll('{product_url}', encodeURIComponent(productUrl))
      .replaceAll('{campaign}', encodeURIComponent(campaign || ''))
  }

  if (settings.query_params && productUrl) return appendQuery(productUrl, settings.query_params)
  return null
}

const DEFAULT_PROXY = '/api/offers'

function authHeaders(accessToken) {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
}

async function requestJson(url, accessToken) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...authHeaders(accessToken) },
    cache: 'no-store'
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { data = { message: text || `HTTP ${response.status}` } }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Mercado Livre HTTP ${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

export function extractMercadoLivreItemId(url) {
  const value = String(url || '')
  const match = value.match(/MLB[-_]?([0-9]{6,})/i)
  return match ? `MLB${match[1]}`.toUpperCase() : null
}

export function isMercadoLivreUrl(url) {
  return /(?:mercadolivre|mercadolibre)\.com/i.test(String(url || ''))
}

export async function searchMercadoLivre(query, { accessToken, limit = 20, proxy = DEFAULT_PROXY } = {}) {
  const params = new URLSearchParams({ action: 'search', q: query, limit: String(limit) })
  return requestJson(`${proxy}?${params}`, accessToken)
}

export async function getMercadoLivreItem(itemId, { accessToken, proxy = DEFAULT_PROXY } = {}) {
  if (!itemId) throw new Error('itemId é obrigatório.')
  const params = new URLSearchParams({ action: 'item', id: itemId })
  return requestJson(`${proxy}?${params}`, accessToken)
}

export async function resolveMercadoLivreProduct(productUrl, options = {}) {
  const itemId = extractMercadoLivreItemId(productUrl)
  if (itemId) {
    try {
      const item = await getMercadoLivreItem(itemId, options)
      return { ...item, resolvedItemId: itemId, resolution: 'item_id' }
    } catch (error) {
      if (error.status !== 404) throw error
    }
  }

  if (!isMercadoLivreUrl(productUrl)) throw new Error('URL não reconhecida como Mercado Livre.')
  const result = await searchMercadoLivre(productUrl, options)
  const first = Array.isArray(result?.results) ? result.results[0] : null
  if (!first) throw new Error('Não foi possível identificar o produto no Mercado Livre.')
  return { ...first, resolvedItemId: first.id, resolution: 'search_fallback' }
}

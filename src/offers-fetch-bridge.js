// Ponte entre o fluxo legado do Affiliate Engine e a API do Mavuri.
// A busca não exige token para funcionar: o proxy tenta a consulta pública do
// Mercado Livre e usa o token apenas quando ele já existe na sessão.
const OFFERS_ENDPOINT = 'https://mavuri-api-test.vercel.app/api/meli'
const MELI_TOKEN_KEY = 'mavuri.meli.access-token'
const nativeFetch = window.fetch.bind(window)

function isOffersRequest(input) {
  const raw = typeof input === 'string'
    ? input
    : input instanceof Request ? input.url : String(input)
  try {
    const url = new URL(raw, window.location.origin)
    return url.pathname === '/api/offers' || url.pathname.endsWith('/affiliate-engine/api/offers')
  } catch {
    return false
  }
}

function getSavedMeliToken() {
  try {
    return String(window.sessionStorage.getItem(MELI_TOKEN_KEY) || '').trim()
  } catch {
    return ''
  }
}

function numberOrZero(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const text = typeof value === 'string' ? value.trim() : value
    const normalized = typeof text === 'string' && text.includes(',')
      ? text.replace(/\./g, '').replace(',', '.')
      : text
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function normalizeOffer(item) {
  const installments = item?.installments && typeof item.installments === 'object'
    ? item.installments : {}
  const title = firstText(item?.title, item?.name, item?.titulo, item?.id)
  const price = numberOrZero(item?.price, item?.current_price, item?.preco)
  const originalPrice = numberOrZero(item?.original_price, item?.previous_price, item?.preco_original)
  const quantity = numberOrZero(installments?.quantity, item?.installmentQuantity, item?.parcelas)
  const amount = numberOrZero(installments?.amount, item?.installmentAmount)
  const rate = numberOrZero(installments?.rate, item?.installmentRate)
  const image = firstText(item?.thumbnail, item?.image, item?.imagem, item?.pictures?.[0]?.secure_url, item?.pictures?.[0]?.url)
  const permalink = firstText(item?.permalink, item?.productUrl, item?.link, item?.id ? `https://produto.mercadolivre.com.br/${item.id}` : '')
  const description = firstText(item?.description, item?.descricao, item?.subtitle, item?.short_description)

  return {
    ...item,
    title, titulo: title, name: title,
    description, descricao: description,
    price, preco: price, currentPrice: price, current_price: price,
    original_price: originalPrice, originalPrice, previousPrice: originalPrice, previous_price: originalPrice,
    installments: quantity, parcelas: quantity, installmentQuantity: quantity,
    installmentAmount: amount, installmentRate: rate,
    installmentInterest: rate === 0 ? 'no-interest' : 'with-interest',
    thumbnail: image, image, imagem: image,
    permalink, productUrl: permalink, product_url: permalink, link: permalink
  }
}

async function normalizeOffersResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return response

  try {
    const payload = await response.clone().json()
    const source = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.results) ? payload.results :
         Array.isArray(payload?.items) ? payload.items :
         Array.isArray(payload?.products) ? payload.products : [])

    if (!Array.isArray(source)) return response
    const normalized = source.map(normalizeOffer)
    const body = Array.isArray(payload)
      ? normalized
      : { ...payload, results: normalized, items: normalized, products: normalized, produtos: normalized }

    return new Response(JSON.stringify(body), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    })
  } catch {
    return response
  }
}

window.fetch = async function (input, init = {}) {
  if (!isOffersRequest(input)) return nativeFetch(input, init)

  const requestUrl = new URL(
    typeof input === 'string' ? input : input.url,
    window.location.origin
  )
  const target = new URL(OFFERS_ENDPOINT)
  target.search = requestUrl.search
  target.searchParams.set('action', 'search')
  target.searchParams.set('_v', '20260827-4')

  const headers = { accept: 'application/json' }
  const token = getSavedMeliToken()
  if (token) headers.authorization = `Bearer ${token}`

  const response = await nativeFetch(target.toString(), {
    method: 'GET',
    headers,
    cache: 'no-store',
    signal: init?.signal
  })

  return normalizeOffersResponse(response)
}

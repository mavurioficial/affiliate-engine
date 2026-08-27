// Ponte entre o fluxo legado do Affiliate Engine e a API validada
// no projeto mavuri-api-test. O GitHub Pages não pode falar diretamente
// com o Mercado Livre com segurança, por isso a chamada passa pelo proxy.
const OFFERS_ENDPOINT = 'https://mavuri-api-test.vercel.app/api/meli'
const MELI_TOKEN_KEY = 'mavuri.meli.access-token'
const nativeFetch = window.fetch.bind(window)

function isOffersRequest(input) {
  const raw = typeof input === 'string'
    ? input
    : input instanceof Request
      ? input.url
      : String(input)

  try {
    const url = new URL(raw, window.location.origin)
    return url.pathname === '/api/offers' ||
      url.pathname.endsWith('/affiliate-engine/api/offers')
  } catch {
    return false
  }
}

function getMeliToken() {
  try {
    const saved = window.sessionStorage.getItem(MELI_TOKEN_KEY)
    if (saved) return saved
  } catch {
    // Se sessionStorage estiver indisponível, seguimos com a sessão atual.
  }

  const token = window.prompt(
    'Cole o Access Token do Mercado Livre para esta sessão. Ele não será salvo permanentemente.'
  )

  const normalized = String(token || '').trim()

  if (!normalized) return ''

  try {
    window.sessionStorage.setItem(MELI_TOKEN_KEY, normalized)
  } catch {
    // O token continua disponível somente para esta chamada.
  }

  return normalized
}

function numberOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function normalizeInstallments(item) {
  const source = item?.installments
  const nested = source && typeof source === 'object' ? source : {}

  const quantity = numberOrNull(
    nested.quantity,
    item?.installmentQuantity,
    item?.installments_count,
    typeof source === 'number' ? source : null
  ) || 0

  const amount = numberOrNull(
    nested.amount,
    item?.installment_amount,
    item?.installmentAmount
  ) || 0

  const rate = numberOrNull(
    nested.rate,
    item?.installment_rate,
    item?.installmentRate
  ) || 0

  return { quantity, amount, rate }
}

function normalizeOfferPayload(item) {
  const installments = normalizeInstallments(item)
  const price = numberOrNull(
    item?.price,
    item?.currentPrice,
    item?.sale_price,
    item?.salePrice,
    item?.buy_box_winner?.price
  ) || 0

  const originalPrice = numberOrNull(
    item?.original_price,
    item?.originalPrice,
    item?.previousPrice,
    item?.listPrice,
    item?.buy_box_winner?.original_price
  )

  const title = firstText(
    item?.title,
    item?.name,
    item?.productName,
    item?.id
  )

  const description = firstText(
    item?.description,
    item?.subtitle,
    item?.short_description,
    item?.attributes?.find?.((attribute) => attribute?.id === 'MODEL')?.value_name
  )

  return {
    ...item,
    title,
    name: title,
    description,
    price,
    original_price: originalPrice,
    previousPrice: originalPrice,
    installments: installments.quantity,
    installmentQuantity: installments.quantity,
    installmentAmount: installments.amount,
    installmentRate: installments.rate,
    installmentInterest: installments.rate === 0 ? 'no-interest' : 'with-interest',
    thumbnail: firstText(
      item?.thumbnail,
      item?.image,
      item?.pictures?.[0]?.url
    ),
    permalink: firstText(
      item?.permalink,
      item?.productUrl,
      item?.url,
      item?.id ? `https://produto.mercadolivre.com.br/${item.id}` : ''
    )
  }
}

async function normalizeOffersResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return response

  try {
    const payload = await response.clone().json()
    const source = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.items)
          ? payload.items
          : null

    if (!source) return response

    const normalized = source.map(normalizeOfferPayload)
    const body = Array.isArray(payload)
      ? normalized
      : {
          ...payload,
          results: Array.isArray(payload?.results) ? normalized : payload.results,
          items: Array.isArray(payload?.items) ? normalized : payload.items
        }

    return new Response(JSON.stringify(body), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
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

  const token = getMeliToken()

  if (!token) {
    throw new Error('É necessário informar um Access Token do Mercado Livre para buscar ofertas.')
  }

  const response = await nativeFetch(target.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`
    },
    cache: 'no-store',
    signal: init?.signal
  })

  return normalizeOffersResponse(response)
}

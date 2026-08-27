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

  if (!normalized) {
    return ''
  }

  try {
    window.sessionStorage.setItem(MELI_TOKEN_KEY, normalized)
  } catch {
    // O token continua disponível somente para esta chamada.
  }

  return normalized
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

  return nativeFetch(target.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`
    },
    cache: 'no-store',
    signal: init?.signal
  })
}

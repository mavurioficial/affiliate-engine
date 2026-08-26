// Ponte para o fluxo legado do main.js.
// A busca precisa passar por um backend porque o browser/GitHub Pages
// não consegue consultar diretamente a API do Mercado Livre com segurança.
const OFFERS_ENDPOINT = 'https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/offers'
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

window.fetch = async function (input, init) {
  if (!isOffersRequest(input)) return nativeFetch(input, init)

  const requestUrl = new URL(
    typeof input === 'string' ? input : input.url,
    window.location.origin
  )

  const target = new URL(OFFERS_ENDPOINT)
  target.search = requestUrl.search

  return nativeFetch(target.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json'
    },
    cache: 'no-store',
    signal: init?.signal
  })
}

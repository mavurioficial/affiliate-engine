// Ponte de compatibilidade para o fluxo existente do main.js.
// No GitHub Pages não existe /api/offers. Para a busca pública de produtos,
// consultamos diretamente a API pública de busca do Mercado Livre, evitando
// depender de proxy, Edge Function ou credenciais apenas para pesquisar ofertas.
const MERCADO_LIVRE_SEARCH = 'https://api.mercadolibre.com/sites/MLB/search'
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

  const target = new URL(MERCADO_LIVRE_SEARCH)
  const query = requestUrl.searchParams.get('q') || ''
  const limit = requestUrl.searchParams.get('limit') || '10'

  target.searchParams.set('q', query)
  target.searchParams.set('limit', limit)

  return nativeFetch(target.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json'
    },
    cache: 'no-store',
    signal: init?.signal
  })
}

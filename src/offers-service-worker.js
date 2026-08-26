const API_PREFIX = '/api/offers'
const MERCADO_LIVRE_SEARCH = 'https://api.mercadolibre.com/sites/MLB/search'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  })
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)

  if (requestUrl.pathname.endsWith(API_PREFIX)) {
    event.respondWith(searchMercadoLivre(requestUrl))
  }
})

async function searchMercadoLivre(requestUrl) {
  const query = (requestUrl.searchParams.get('q') || '').trim()
  const limit = Math.min(
    50,
    Math.max(1, Number(requestUrl.searchParams.get('limit')) || 10)
  )

  if (!query) {
    return json({ results: [] })
  }

  const url = new URL(MERCADO_LIVRE_SEARCH)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))

  try {
    const response = await fetch(url.toString(), {
      headers: { accept: 'application/json' }
    })

    if (!response.ok) {
      return json(
        { error: 'Não foi possível consultar o Mercado Livre.' },
        response.status
      )
    }

    const payload = await response.json()
    const results = (payload.results || []).map((item) => ({
      id: item.id,
      title: item.title,
      price: item.price,
      original_price: item.original_price,
      thumbnail: item.thumbnail,
      permalink: item.permalink,
      category_id: item.category_id,
      seller: item.seller?.nickname || '',
      installments: item.installments?.quantity || 0,
      installmentInterest: item.installments?.rate === 0
        ? 'no-interest'
        : 'with-interest',
      platform: 'mercadolivre'
    }))

    return json({ results })
  } catch (error) {
    return json(
      {
        error: 'Falha de conexão ao consultar o Mercado Livre.',
        details: error?.message || ''
      },
      502
    )
  }
}

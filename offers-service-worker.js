const API_PREFIX = '/api/offers'
const OFFERS_API = 'https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/offers'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)

  if (requestUrl.pathname.endsWith(API_PREFIX)) {
    event.respondWith(proxyOffers(requestUrl))
  }
})

async function proxyOffers(requestUrl) {
  const url = new URL(OFFERS_API)
  url.search = requestUrl.search

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store'
    })

    const body = await response.text()

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Falha ao consultar o serviço de ofertas.',
      details: error?.message || ''
    }), {
      status: 502,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    })
  }
}

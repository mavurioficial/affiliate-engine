// Fallback local route for legacy /api/offers requests.
// The primary bridge in offers-fetch-bridge.js forwards requests to Supabase.
// Keep this worker only as a compatibility layer; it does not call Mercado Livre
// directly, because browser-side access is subject to CORS/restrictions.
const SUPABASE_OFFERS = 'https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/offers'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    }
  })
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)
  if (!requestUrl.pathname.endsWith('/api/offers')) return

  event.respondWith((async () => {
    try {
      const target = new URL(SUPABASE_OFFERS)
      target.search = requestUrl.search
      const response = await fetch(target.toString(), {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store'
      })
      const body = await response.text()
      return new Response(body, {
        status: response.status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      })
    } catch (error) {
      return json({
        error: 'Falha ao consultar o serviço de ofertas.',
        details: error?.message || String(error)
      }, 502)
    }
  })())
})

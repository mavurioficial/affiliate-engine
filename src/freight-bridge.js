const RESOLVER_PATH = '/api/resolve3'
const FREIGHT_ENDPOINT = 'https://mavuri-api-test.vercel.app/api/freight'

const originalFetch = window.fetch.bind(window)

window.fetch = async (...args) => {
  const response = await originalFetch(...args)

  try {
    const requestUrl = typeof args[0] === 'string'
      ? args[0]
      : args[0]?.url || ''

    if (!String(requestUrl).includes(RESOLVER_PATH)) {
      return response
    }

    const payload = await response.clone().json()
    const productUrl = payload?.productUrl || payload?.product?.url

    if (!payload?.ok || !productUrl || payload?.product?.freight) {
      return response
    }

    try {
      const freightUrl = new URL(FREIGHT_ENDPOINT)
      freightUrl.searchParams.set('url', productUrl)
      const freightResponse = await originalFetch(freightUrl.toString(), { cache: 'no-store' })
      const freightPayload = await freightResponse.json().catch(() => ({}))
      const freight = String(freightPayload?.freight || '').trim()

      if (freight) {
        const enriched = {
          ...payload,
          product: {
            ...payload.product,
            freight
          }
        }

        return new Response(JSON.stringify(enriched), {
          status: response.status,
          statusText: response.statusText,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    } catch (error) {
      console.warn('Leitura de frete indisponível:', error)
    }
  } catch (error) {
    console.warn('Não foi possível enriquecer o anúncio com frete:', error)
  }

  return response
}

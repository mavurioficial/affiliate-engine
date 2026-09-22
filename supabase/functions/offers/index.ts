Deno.serve(async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Cache-Control': 'no-store'
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405,
      headers
    })
  }

  const url = new URL(req.url)
  const action = (url.searchParams.get('action') || 'search').trim()
  const query = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10))
  const itemId = (url.searchParams.get('id') || '').trim().toUpperCase()
  const authHeader = req.headers.get('authorization') || ''
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (action === 'search' && !query) {
    return new Response(JSON.stringify({ results: [] }), { headers })
  }

  if (action === 'item' && !itemId) {
    return new Response(JSON.stringify({ error: 'id é obrigatório para action=item.' }), { status: 400, headers })
  }

  if (!['search', 'item'].includes(action)) {
    return new Response(JSON.stringify({ error: 'Ação inválida.' }), { status: 400, headers })
  }

  const ml = action === 'item'
    ? new URL(`https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}`)
    : new URL('https://api.mercadolibre.com/sites/MLB/search')

  if (action === 'search') {
    ml.searchParams.set('q', query)
    ml.searchParams.set('limit', String(limit))
  }

  try {
    const response = await fetch(ml.toString(), {
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      }
    })

    const bodyText = await response.text()
    let payload

    try {
      payload = JSON.parse(bodyText)
    } catch {
      payload = { raw: bodyText.slice(0, 500) }
    }

    if (!response.ok) {
      console.error(JSON.stringify({ source: 'mercadolibre', status: response.status, payload }))
      return new Response(JSON.stringify({
        error: 'Mercado Livre recusou a consulta.',
        sourceStatus: response.status,
        details: payload
      }), { status: 502, headers })
    }

    if (action === 'item') {
      return new Response(JSON.stringify({
        ...payload,
        platform: 'mercadolivre',
        resolvedItemId: payload.id || itemId
      }), {
        status: 200,
        headers
      })
    }

    const results = (payload.results || []).map((item) => ({
      id: item.id,
      title: item.title,
      price: item.price,
      original_price: item.original_price,
      thumbnail: item.thumbnail,
      permalink: item.permalink,
      category: item.category_id || '',
      seller: item.seller?.nickname || '',
      installments: item.installments?.quantity || 0,
      installmentInterest: item.installments?.rate === 0 ? 'no-interest' : 'with-interest',
      platform: 'mercadolivre'
    }))

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers
    })
  } catch (error) {
    const details = error?.message || String(error)
    console.error(details)
    return new Response(JSON.stringify({
      error: 'Falha de conexão ao consultar o Mercado Livre.',
      details
    }), { status: 502, headers })
  }
})
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")
const publishableKey = publishableKeys.default || ""
const secretKey = secretKeys.default || ""
const admin = createClient(supabaseUrl, secretKey)

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
  let accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!accessToken.startsWith('APP_USR-')) {
    const userClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData } = await userClient.auth.getUser()
    const userId = userData.user?.id || null
    if (userId) {
      const { data: marketplace } = await admin.from('flow_marketplaces').select('id').eq('slug', 'mercadolivre').maybeSingle()
      if (marketplace) {
        const { data: stored } = await admin.rpc('mavuri_get_meli_token', { p_user_id: userId, p_marketplace_id: marketplace.id })
        const token = Array.isArray(stored) ? stored[0] : stored
        if (token?.access_token) {
          const expiresAt = token.expires_at ? new Date(token.expires_at).getTime() : 0
          accessToken = token.access_token
          if (expiresAt <= Date.now() + 60_000 && token.refresh_token) {
            const clientId = Deno.env.get('MELI_CLIENT_ID')
            const clientSecret = Deno.env.get('MELI_CLIENT_SECRET')
            if (clientId && clientSecret) {
              const refreshBody = new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: token.refresh_token
              })
              const refreshResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: refreshBody.toString()
              })
              const refreshed = await refreshResponse.json()
              if (refreshResponse.ok && refreshed.access_token) {
                accessToken = refreshed.access_token
                await admin.rpc('mavuri_store_meli_token', {
                  p_user_id: userId,
                  p_marketplace_id: marketplace.id,
                  p_external_account_id: refreshed.user_id ? String(refreshed.user_id) : token.external_account_id,
                  p_access_token: refreshed.access_token,
                  p_refresh_token: refreshed.refresh_token || token.refresh_token,
                  p_expires_in: Number(refreshed.expires_in || 0),
                  p_scopes: String(refreshed.scope || (token.scopes || []).join(' ')).split(/\s+/).filter(Boolean)
                })
              }
            }
          }
        }
      }
    }
  }

  if (!accessToken || !accessToken.startsWith('APP_USR-')) {
    return new Response(JSON.stringify({ error: 'Mercado Livre não conectado ao Mavuri.' }), { status: 401, headers })
  }

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

    if (!response.ok && action === 'item' && [400, 401, 403, 429, 500, 502, 503].includes(response.status)) {
      try {
        const fallback = new URL('https://api.mercadolibre.com/sites/MLB/search')
        fallback.searchParams.set('q', itemId)
        fallback.searchParams.set('limit', '10')
        const fallbackResponse = await fetch(fallback.toString(), {
          headers: { Accept: 'application/json' }
        })
        if (fallbackResponse.ok) {
          const fallbackPayload = await fallbackResponse.json()
          const exact = (fallbackPayload.results || []).find((item) => String(item.id || '').toUpperCase() === itemId)
          if (exact) {
            return new Response(JSON.stringify({
              ...exact,
              platform: 'mercadolivre',
              resolvedItemId: exact.id,
              source: 'public-search-fallback'
            }), { status: 200, headers })
          }
        }
      } catch (fallbackError) {
        console.error(String(fallbackError?.message || fallbackError))
      }
    }

    if (!response.ok && action === 'search' && [400, 401, 403, 429, 500, 502, 503].includes(response.status)) {
      // Some Mercado Livre OAuth accounts can be authenticated but still be
      // denied access to the authenticated search endpoint. The public catalog
      // search remains available and is enough to identify a product; the
      // affiliate URL is kept separately by the Flow for monetization.
      try {
        const fallback = new URL('https://api.mercadolibre.com/sites/MLB/search')
        fallback.searchParams.set('q', query)
        fallback.searchParams.set('limit', String(limit))
        const fallbackResponse = await fetch(fallback.toString(), {
          headers: { Accept: 'application/json' }
        })
        if (fallbackResponse.ok) {
          const fallbackPayload = await fallbackResponse.json()
          const results = (fallbackPayload.results || []).map((item) => ({
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
          return new Response(JSON.stringify({ results, source: 'public-search-fallback' }), {
            status: 200,
            headers
          })
        }
      } catch (fallbackError) {
        console.error(String(fallbackError?.message || fallbackError))
      }
    }

    if (!response.ok) {
      console.error(JSON.stringify({ source: 'mercadolivre', status: response.status, payload }))
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
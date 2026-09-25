import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")
const publishableKey = publishableKeys.default || ""
const secretKey = secretKeys.default || ""
const userClient = (authorization: string) => createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authorization } } })
const admin = createClient(supabaseUrl, secretKey)

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store"
}

function html(message: string, ok = true) {
  const safe = String(message).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Mavuri Mercado Livre</title></head><body><p>${safe}</p><script>window.opener?.postMessage({type:"mavuri-meli-auth",ok:${ok}}, "https://mavurioficial.github.io"); setTimeout(()=>window.close(), 700);</script></body></html>`, {
    status: ok ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  })
}

async function getAuthenticatedUser(authorization: string) {
  if (!authorization) return null
  const { data, error } = await userClient(authorization).auth.getUser()
  if (error) return null
  return data.user || null
}

async function getMarketplaceId() {
  const { data } = await admin.from("flow_marketplaces").select("id").eq("slug", "mercadolivre").maybeSingle()
  return data?.id || null
}

async function getStoredConnection(userId: string, marketplaceId: string, affiliateAccountId: string | null = null) {
  const { data, error } = await admin.rpc("mavuri_get_meli_token", {
    p_user_id: userId,
    p_marketplace_id: marketplaceId,
    ...(affiliateAccountId ? { p_affiliate_account_id: affiliateAccountId } : {})
  })
  if (error) throw new Error("Falha ao verificar a conexão do Mercado Livre.")

  const row = Array.isArray(data) ? data[0] || null : data || null
  if (!row?.access_token) return null

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0
  if (expiresAt > Date.now() + 60_000) return row
  if (!row.refresh_token) return null

  const clientId = Deno.env.get("MELI_CLIENT_ID")
  const clientSecret = Deno.env.get("MELI_CLIENT_SECRET")
  if (!clientId || !clientSecret) return null

  const refreshBody = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: row.refresh_token
  })

  const refreshResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: refreshBody.toString()
  })
  const refreshed = await refreshResponse.json().catch(() => ({}))

  if (!refreshResponse.ok || !refreshed.access_token) {
    console.error(JSON.stringify({ source: "meli-auth", event: "refresh_failed", status: refreshResponse.status }))
    return null
  }

  const { error: storeError } = await admin.rpc("mavuri_store_meli_token", {
    p_user_id: userId,
    p_marketplace_id: marketplaceId,
    p_external_account_id: refreshed.user_id ? String(refreshed.user_id) : row.external_account_id,
    p_access_token: refreshed.access_token,
    p_refresh_token: refreshed.refresh_token || row.refresh_token,
    p_expires_in: Number(refreshed.expires_in || 0),
    p_scopes: String(refreshed.scope || (row.scopes || []).join(" ")).split(/\s+/).filter(Boolean),
    ...(affiliateAccountId ? { p_affiliate_account_id: affiliateAccountId } : {})
  })

  if (storeError) {
    console.error(JSON.stringify({ source: "meli-auth", event: "refresh_store_failed", message: storeError.message }))
    return null
  }

  return {
    ...row,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || row.refresh_token,
    external_account_id: refreshed.user_id ? String(refreshed.user_id) : row.external_account_id,
    expires_at: new Date(Date.now() + Number(refreshed.expires_in || 0) * 1000).toISOString(),
    scopes: String(refreshed.scope || (row.scopes || []).join(" ")).split(/\s+/).filter(Boolean)
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405, headers })

  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const oauthError = url.searchParams.get("error")
  const action = (url.searchParams.get("action") || "").trim()
  const requestedAccountId = (url.searchParams.get("account_id") || "").trim() || null

  try {
    const clientId = Deno.env.get("MELI_CLIENT_ID")
    const clientSecret = Deno.env.get("MELI_CLIENT_SECRET")
    const redirectUri = Deno.env.get("MELI_REDIRECT_URI")
    if (!clientId || !clientSecret || !redirectUri) return new Response(JSON.stringify({ error: "Configuração do Mercado Livre incompleta." }), { status: 500, headers })

    if (action === "status" && !code) {
      const authorization = req.headers.get("authorization") || ""
      const user = await getAuthenticatedUser(authorization)
      if (!user) return new Response(JSON.stringify({ error: "Usuário não autenticado." }), { status: 401, headers })

      const marketplaceId = await getMarketplaceId()
      if (!marketplaceId) return new Response(JSON.stringify({ error: "Marketplace Mercado Livre não configurado no Flow." }), { status: 500, headers })

      const stored = await getStoredConnection(user.id, marketplaceId, requestedAccountId)
      return new Response(JSON.stringify({
        connected: Boolean(stored?.access_token),
        external_account_id: stored?.external_account_id || null,
        expires_at: stored?.expires_at || null,
        scopes: stored?.scopes || []
      }), { status: 200, headers })
    }

    if (!code) {
      const authorization = req.headers.get("authorization") || ""
      const user = await getAuthenticatedUser(authorization)
      if (!user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers })

      const marketplaceId = await getMarketplaceId()
      if (!marketplaceId) return new Response(JSON.stringify({ error: "Marketplace Mercado Livre não configurado no Flow." }), { status: 500, headers })

      if (requestedAccountId) {
        const { data: account, error: accountError } = await admin
          .from("flow_affiliate_accounts")
          .select("id")
          .eq("id", requestedAccountId)
          .eq("user_id", user.id)
          .eq("marketplace_id", marketplaceId)
          .maybeSingle()
        if (accountError || !account) {
          return new Response(JSON.stringify({ error: "Conta de afiliado inválida." }), { status: 400, headers })
        }
      }

      const stateValue = crypto.randomUUID()
      const { error: stateError } = await admin.from("flow_oauth_states").insert({
        state: stateValue,
        user_id: user.id,
        provider: "mercadolivre",
        affiliate_account_id: requestedAccountId,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      })
      if (stateError) return new Response(JSON.stringify({ error: "Não foi possível iniciar a autorização.", details: stateError.message }), { status: 500, headers })

      const authUrl = new URL("https://auth.mercadolivre.com.br/authorization")
      authUrl.searchParams.set("response_type", "code")
      authUrl.searchParams.set("client_id", clientId)
      authUrl.searchParams.set("redirect_uri", redirectUri)
      authUrl.searchParams.set("state", stateValue)
      return new Response(JSON.stringify({ auth_url: authUrl.toString() }), { status: 200, headers })
    }

    if (oauthError) return html(`Autorização cancelada: ${oauthError}`, false)
    if (!state) return html("Resposta OAuth sem state.", false)

    const { data: stateRow, error: stateError } = await admin
      .from("flow_oauth_states")
      .select("state,user_id,provider,affiliate_account_id,expires_at")
      .eq("state", state)
      .eq("provider", "mercadolivre")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle()

    if (stateError || !stateRow) return html("Sessão OAuth inválida ou expirada.", false)

    const body = new URLSearchParams()
    body.set("grant_type", "authorization_code")
    body.set("client_id", clientId)
    body.set("client_secret", clientSecret)
    body.set("code", code)
    body.set("redirect_uri", redirectUri)

    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    })
    const tokenPayload = await response.json()
    if (!response.ok || !tokenPayload.access_token) {
      await admin.from("flow_oauth_states").delete().eq("state", state)
      return html("O Mercado Livre não autorizou a conexão.", false)
    }

    const marketplaceId = await getMarketplaceId()
    if (!marketplaceId) return html("Marketplace Mercado Livre não configurado no Flow.", false)

    const { error: storeError } = await admin.rpc("mavuri_store_meli_token", {
      p_user_id: stateRow.user_id,
      p_marketplace_id: marketplaceId,
      p_external_account_id: tokenPayload.user_id ? String(tokenPayload.user_id) : null,
      p_access_token: tokenPayload.access_token,
      p_refresh_token: tokenPayload.refresh_token || null,
      p_expires_in: Number(tokenPayload.expires_in || 0),
      p_scopes: String(tokenPayload.scope || "").split(/\s+/).filter(Boolean),
      ...(stateRow.affiliate_account_id ? { p_affiliate_account_id: stateRow.affiliate_account_id } : {})
    })
    await admin.from("flow_oauth_states").delete().eq("state", state)
    if (storeError) return html("Autorização concluída, mas não foi possível salvar a conexão com segurança.", false)

    return html("Mercado Livre conectado ao Mavuri. Esta janela será fechada automaticamente.")
  } catch (error) {
    console.error(error)
    return code ? html("Erro interno ao concluir a autorização.", false) : new Response(JSON.stringify({ error: error?.message || "Erro interno." }), { status: 500, headers })
  }
})
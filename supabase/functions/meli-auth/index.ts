import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")
const publishableKey = publishableKeys.default || ""
const secretKey = secretKeys.default || ""
const admin = createClient(supabaseUrl, secretKey)
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store"
}

function html(message: string, ok = true) {
  const safe = String(message).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Mavuri Mercado Livre</title></head><body><p>${safe}</p><script>window.opener?.postMessage({type:"mavuri-meli-auth",ok:${ok}},"*");setTimeout(()=>window.close(),700)</script></body></html>`, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405, headers })

  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const oauthError = url.searchParams.get("error")

  try {
    const clientId = Deno.env.get("MELI_CLIENT_ID")
    const clientSecret = Deno.env.get("MELI_CLIENT_SECRET")
    const redirectUri = Deno.env.get("MELI_REDIRECT_URI")
    if (!clientId || !clientSecret || !redirectUri) return new Response(JSON.stringify({ error: "Configuração do Mercado Livre incompleta." }), { status: 500, headers })

    if (!code) {
      const authorization = req.headers.get("authorization") || ""
      if (!authorization) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers })
      const { data: userData } = await createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authorization } } }).auth.getUser()
      if (!userData.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers })
      const stateValue = crypto.randomUUID()
      const { error } = await admin.from("flow_oauth_states").insert({ state: stateValue, user_id: userData.user.id, provider: "mercadolivre", expires_at: new Date(Date.now()+600000).toISOString() })
      if (error) return new Response(JSON.stringify({ error: "Não foi possível iniciar a autorização." }), { status: 500, headers })
      const authUrl = new URL("https://auth.mercadolivre.com.br/authorization")
      authUrl.searchParams.set("response_type","code")
      authUrl.searchParams.set("client_id",clientId)
      authUrl.searchParams.set("redirect_uri",redirectUri)
      authUrl.searchParams.set("state",stateValue)
      return new Response(JSON.stringify({ auth_url: authUrl.toString() }), { headers })
    }

    if (oauthError) return html(`Autorização cancelada: ${oauthError}`, false)
    if (!state) return html("Resposta OAuth sem state.", false)

    const { data: stateRow } = await admin.from("flow_oauth_states").select("state,user_id,provider,expires_at").eq("state",state).eq("provider","mercadolivre").gt("expires_at",new Date().toISOString()).maybeSingle()
    if (!stateRow) return html("Sessão OAuth inválida ou expirada.", false)

    const body = new URLSearchParams({ grant_type:"authorization_code", client_id:clientId, client_secret:clientSecret, code, redirect_uri:redirectUri })
    const response = await fetch("https://api.mercadolibre.com/oauth/token", { method:"POST", headers:{Accept:"application/json","Content-Type":"application/x-www-form-urlencoded"}, body:body.toString() })
    const token = await response.json()
    if (!response.ok || !token.access_token) {
      await admin.from("flow_oauth_states").delete().eq("state",state)
      return html("O Mercado Livre não autorizou a conexão.", false)
    }

    const { data: marketplace } = await admin.from("flow_marketplaces").select("id").eq("slug","mercadolivre").maybeSingle()
    if (!marketplace) return html("Marketplace Mercado Livre não configurado no Flow.", false)

    const { error: storeError } = await admin.rpc("mavuri_store_meli_token", {
      p_user_id: stateRow.user_id, p_marketplace_id: marketplace.id,
      p_external_account_id: token.user_id ? String(token.user_id) : null,
      p_access_token: token.access_token, p_refresh_token: token.refresh_token || null,
      p_expires_in: Number(token.expires_in || 0),
      p_scopes: String(token.scope || "").split(/\s+/).filter(Boolean)
    })
    await admin.from("flow_oauth_states").delete().eq("state",state)
    if (storeError) return html("Autorização concluída, mas não foi possível salvar a conexão com segurança.", false)
    return html("Mercado Livre conectado ao Mavuri.")
  } catch (error) {
    console.error(error)
    return code ? html("Erro interno ao concluir a autorização.", false) : new Response(JSON.stringify({ error:"Erro interno." }), { status:500, headers })
  }
})
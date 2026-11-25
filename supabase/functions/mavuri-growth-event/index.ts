import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.95.0"

// Endpoint público: somente contagens de interação, sem cookies, IP, UA ou PII.
// Origem é uma barreira para navegadores, NÃO autenticação contra bots.
const allowedOrigins = new Set(["https://mavurioficial.github.io"])
const allowedSources = new Set([
  "direto", "instagram", "facebook", "whatsapp", "telegram",
  "seo", "parceiro", "compartilhamento", "outros"
])
const allowedEvents = new Set(["page_view", "join_click", "share_click"])
const tokenPattern = /^[a-z0-9_-]{0,48}$/

function allowedOrigin(origin: string) {
  return allowedOrigins.has(origin) || /^http:\/\/localhost:(3000|4173|5173)$/.test(origin)
}

function responseHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""
  if (!allowedOrigin(origin)) return new Response(null, { status: 403 })
  const headers = responseHeaders(origin)

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (req.method !== "POST") return new Response(null, { status: 405, headers })

  const contentType = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
  if (contentType !== "text/plain") return new Response(null, { status: 415, headers })
  if (Number(req.headers.get("content-length") || 0) > 1024) {
    return new Response(null, { status: 413, headers })
  }

  let payload: Record<string, unknown>
  try {
    const body = await req.text()
    if (body.length > 1024) return new Response(null, { status: 413, headers })
    const parsed: unknown = JSON.parse(body)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Response(null, { status: 400, headers })
    }
    payload = parsed as Record<string, unknown>
  } catch {
    return new Response(null, { status: 400, headers })
  }

  const event = payload.event
  const source = payload.source
  const campaign = payload.campaign
  const content = payload.content
  const channel = payload.channel
  const page = payload.page

  if (typeof event !== "string" || !allowedEvents.has(event) ||
      typeof source !== "string" || !allowedSources.has(source) ||
      typeof campaign !== "string" || !tokenPattern.test(campaign) ||
      typeof content !== "string" || !tokenPattern.test(content) ||
      page !== "entrar" ||
      !((event === "join_click" && (channel === "whatsapp" || channel === "telegram")) ||
        (event !== "join_click" && channel === "site"))) {
    return new Response(null, { status: 400, headers })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  let secretKeys: Record<string, string> = {}
  try {
    secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")
  } catch {
    // Credenciais inválidas não devem ser incluídas em logs.
  }
  const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !secretKey) return new Response(null, { status: 503, headers })

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { error } = await admin.from("mavuri_growth_events").insert({
    event_type: event, source, campaign, content, channel, page
  })

  if (error) {
    console.error("mavuri-growth-event insert failed:", error.code || "unknown")
    return new Response(null, { status: 503, headers })
  }
  return new Response(null, { status: 204, headers })
})

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")
const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY") || ""

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  })
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405)

  const authorization = req.headers.get("authorization")
  if (!authorization) return json({ error: "Authentication required" }, 401)

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } }
  })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401)

  let body: { limit?: number } = {}
  try { body = await req.json() } catch {}

  const limit = Math.min(Math.max(Number(body.limit || 10), 1), 25)
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || ""

  const { data: jobs, error: jobsError } = await supabase
    .from("flow_delivery_jobs")
    .select("*, offer:flow_offers(*), channel:flow_channels(*)")
    .eq("user_id", userData.user.id)
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit)

  if (jobsError) return json({ error: jobsError.message }, 500)

  let processed = 0
  let sent = 0
  let failed = 0
  const results: unknown[] = []

  for (const job of jobs || []) {
    const { data: claimed, error: claimError } = await supabase
      .from("flow_delivery_jobs")
      .update({ status: "processing", attempts: Number(job.attempts || 0) + 1 })
      .eq("id", job.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle()

    if (claimError || !claimed) continue
    processed += 1

    try {
      const channel = job.channel
      const offer = job.offer
      if (!channel || channel.type !== "telegram") throw new Error("Canal Telegram inválido ou não encontrado.")
      if (!channel.external_ref) throw new Error("O canal não possui Chat ID.")
      if (!botToken) throw new Error("Segredo TELEGRAM_BOT_TOKEN não configurado no Edge Function.")

      const price = Number(offer?.price || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      const old = Number(offer?.previous_price || 0)
      const oldText = old > Number(offer?.price || 0) ? `\nDe: ~${old.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}~` : ""
      const discount = Number(offer?.discount_percent || 0)
      const discountText = discount > 0 ? `\n🔥 ${discount}% OFF` : ""
      const escapeHtml = (value: unknown) => String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")
      const destination = String(offer?.affiliate_url || offer?.product_url || "")
      const destinationUrl = new URL(destination)
      if (!["http:", "https:"].includes(destinationUrl.protocol)) throw new Error("A oferta não possui um link de destino válido.")

      const trackingId = crypto.randomUUID()
      const { error: clickError } = await supabase.from("flow_clicks").insert({
        user_id: userData.user.id,
        offer_id: job.offer_id,
        channel_id: job.channel_id,
        tracking_id: trackingId
      })
      if (clickError) throw new Error(`Falha ao criar tracking: ${clickError.message}`)

      const trackedUrl = `${supabaseUrl}/functions/v1/track-click?t=${encodeURIComponent(trackingId)}`
      const text = `🛍️ <b>${escapeHtml(offer?.title)}</b>${oldText}\n💰 <b>${price}</b>${discountText}${offer?.coupon ? `\n🎟️ Cupom: <b>${escapeHtml(offer.coupon)}</b>` : ""}\n\n👉 <a href="${trackedUrl}">Comprar</a>`

      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: channel.external_ref, text, parse_mode: "HTML", disable_web_page_preview: false })
      })
      const telegram = await response.json()
      if (!response.ok || !telegram.ok) throw new Error(telegram?.description || `Telegram HTTP ${response.status}`)

      await supabase.from("flow_delivery_jobs").update({ status: "sent", sent_at: new Date().toISOString(), error_message: null }).eq("id", job.id).eq("status", "processing")
      await supabase.from("flow_delivery_logs").insert({
        user_id: userData.user.id,
        delivery_job_id: job.id,
        offer_id: job.offer_id,
        channel_id: job.channel_id,
        status: "sent",
        external_message_id: String(telegram.result?.message_id || ""),
        metadata: { provider: "telegram" }
      })

      sent += 1
      results.push({ id: job.id, status: "sent" })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await supabase.from("flow_delivery_jobs").update({ status: "failed", error_message: message }).eq("id", job.id).eq("status", "processing")
      await supabase.from("flow_delivery_logs").insert({
        user_id: userData.user.id,
        delivery_job_id: job.id,
        offer_id: job.offer_id,
        channel_id: job.channel_id,
        status: "failed",
        metadata: { provider: "telegram", error: message }
      })
      failed += 1
      results.push({ id: job.id, status: "failed", error: message })
    }
  }

  return json({ ok: true, processed, sent, failed, results })
})

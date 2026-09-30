import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")
const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || ""
const couponImageUrl = Deno.env.get("MAVURI_COUPON_IMAGE_URL") || "https://raw.githubusercontent.com/mavurioficial/affiliate-engine/main/assets/mavuri-cupom-mercadolivre.jpg"

const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "cache-control": "no-store"
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers })
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function money(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : ""
}

function couponText(coupon: any, activationUrl: string) {
  const lines = [
    "🎟️ <b>CUPOM MERCADO LIVRE</b>",
    "",
    coupon?.code ? "🏷️ Código: <code>" + escapeHtml(coupon.code) + "</code>" : "",
    coupon?.discount_type === "percent" && coupon?.discount_value != null
      ? "🔥 <b>" + Number(coupon.discount_value).toLocaleString("pt-BR") + "% OFF</b>"
      : "",
    coupon?.discount_type === "fixed" && coupon?.discount_value != null
      ? "🔥 <b>" + money(coupon.discount_value) + " OFF</b>"
      : "",
    coupon?.min_purchase != null
      ? "🛒 Em compras a partir de <b>" + money(coupon.min_purchase) + "</b>"
      : "",
    coupon?.max_discount != null
      ? "💸 Desconto máximo de <b>" + money(coupon.max_discount) + "</b>"
      : "",
    coupon?.eligibility && typeof coupon.eligibility === "object" && typeof coupon.eligibility.label === "string"
      ? "✅ " + escapeHtml(coupon.eligibility.label)
      : "",
    coupon?.usage_limit != null
      ? "🎫 Limite divulgado: " + Number(coupon.usage_limit).toLocaleString("pt-BR") + " usos"
      : "",
    coupon?.per_user_limit != null
      ? "👤 Limite: " + Number(coupon.per_user_limit) + " uso(s) por pessoa"
      : "",
    coupon?.valid_until
      ? "⏰ Validade informada: " + new Date(coupon.valid_until).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : "",
    "",
    coupon?.code ? "👉 Digite o código na etapa de pagamento." : "👉 Confira as condições na etapa de pagamento.",
    activationUrl ? `<a href="${escapeHtml(activationUrl)}"><b>ABRIR MERCADO LIVRE</b></a>` : "",
    activationUrl ? "🔗 " + escapeHtml(activationUrl) : "",
    "",
    "⚠️ Confira se o cupom ainda está válido antes de finalizar a compra. A disponibilidade e duração são definidas pelo Mercado Livre."
  ].filter(Boolean)

  return lines.join("\n")
}

async function sendTelegramPhoto(chatId: string, caption: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: couponImageUrl,
      caption,
      parse_mode: "HTML"
    })
  })

  const telegram = await response.json()
  return { response, telegram }
}

async function sendTelegramText(chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  })

  const telegram = await response.json()
  return { response, telegram }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (req.method !== "POST") return json({ error: "POST required" }, 405)
  if (!secretKey) return json({ error: "Supabase secret unavailable" }, 500)
  if (!botToken) return json({ error: "TELEGRAM_BOT_TOKEN não configurado." }, 500)

  const admin = createClient(supabaseUrl, secretKey)
  const { data: jobs, error: jobsError } = await admin
    .from("flow_coupon_delivery_jobs")
    .select(`id,user_id,coupon_id,channel_id,activation_offer_id,status,attempts,scheduled_for,
      coupon:flow_coupons(*),
      channel:flow_channels(id,type,name,external_ref,status),
      activation_offer:flow_offers(id,affiliate_url,product_url)`)
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(10)

  if (jobsError) return json({ error: jobsError.message }, 500)

  let sent = 0
  let failed = 0
  const results: any[] = []

  for (const job of jobs || []) {
    const nextAttempt = Number(job.attempts || 0) + 1

    try {
      const { data: locked, error: lockError } = await admin
        .from("flow_coupon_delivery_jobs")
        .update({ status: "processing", attempts: nextAttempt })
        .eq("id", job.id)
        .eq("status", "queued")
        .select("id")
        .maybeSingle()

      if (lockError) throw new Error(lockError.message)
      if (!locked) continue

      const coupon: any = Array.isArray(job.coupon) ? job.coupon[0] : job.coupon
      const channel: any = Array.isArray(job.channel) ? job.channel[0] : job.channel
      const activationOffer: any = Array.isArray(job.activation_offer) ? job.activation_offer[0] : job.activation_offer

      if (!coupon || coupon.status !== "active") throw new Error("Cupom não está ativo.")
      if (coupon.coupon_type === "activation" && coupon.publication_ready !== true) {
        throw new Error("Cupom de ativação ainda não teve as condições verificadas.")
      }
      if (coupon.valid_until && new Date(coupon.valid_until).getTime() < Date.now()) {
        throw new Error("Cupom expirado.")
      }
      if (!channel || channel.type !== "telegram" || !channel.external_ref || !["active", "connected"].includes(channel.status)) {
        throw new Error("Canal Telegram inválido.")
      }

      const activationUrl = String(
        coupon.activation_affiliate_url ||
        coupon.landing_url ||
        activationOffer?.affiliate_url ||
        activationOffer?.product_url ||
        ""
      ).trim()

      if (!activationUrl) throw new Error("Cupom sem link de afiliado/ativação válido.")
      const parsed = new URL(activationUrl)
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Link de ativação inválido.")

      const text = couponText(coupon, activationUrl)

      let sendMode = "photo"
      let { response, telegram } = await sendTelegramPhoto(channel.external_ref, text)

      if (!response.ok || !telegram.ok) {
        const photoError = telegram?.description || `Telegram HTTP ${response.status}`
        console.error("[coupon-worker] sendPhoto falhou; usando fallback de texto:", photoError)
        sendMode = "text_fallback"
        ;({ response, telegram } = await sendTelegramText(channel.external_ref, text))
      }

      if (!response.ok || !telegram.ok) {
        throw new Error(telegram?.description || `Telegram HTTP ${response.status}`)
      }

      await admin.from("flow_coupon_delivery_logs").insert({
        user_id: job.user_id,
        delivery_job_id: job.id,
        coupon_id: job.coupon_id,
        channel_id: job.channel_id,
        status: "sent",
        external_message_id: String(telegram.result?.message_id || ""),
        metadata: {
          provider: "telegram",
          attempt: nextAttempt,
          worker_version: 3,
          send_mode: sendMode,
          image_url: sendMode === "photo" ? couponImageUrl : null
        }
      })

      await admin
        .from("flow_coupon_delivery_jobs")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
        .eq("id", job.id)

      sent += 1
      results.push({ id: job.id, status: "sent", send_mode: sendMode })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      await admin
        .from("flow_coupon_delivery_jobs")
        .update({
          status: nextAttempt >= 5 ? "failed" : "queued",
          error_message: message
        })
        .eq("id", job.id)

      failed += 1
      results.push({ id: job.id, status: "failed", error: message })
    }
  }

  return json({
    ok: true,
    worker_version: 3,
    processed: (jobs || []).length,
    sent,
    failed,
    results
  })
})
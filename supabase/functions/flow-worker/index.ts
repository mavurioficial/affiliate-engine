import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")
const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY") || ""
const MAX_ATTEMPTS = 5
const BACKOFF_MINUTES = [1, 2, 5, 10, 20]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  })
}

function isSecretKey(value: string) {
  return Object.values(secretKeys).some((key) => key && key === value)
}

function retryDelayMinutes(attempts: number) {
  return BACKOFF_MINUTES[Math.min(Math.max(attempts - 1, 0), BACKOFF_MINUTES.length - 1)]
}

function retryableError(message: string) {
  return ![
    "Canal Telegram inválido ou não encontrado.",
    "O canal não possui Chat ID.",
    "Segredo TELEGRAM_BOT_TOKEN não configurado no Edge Function.",
    "A oferta não possui um link de destino válido.",
  ].includes(message)
}

function makeClient(authorization: string | null, serviceToService: boolean) {
  if (serviceToService) {
    const secretKey = Object.values(secretKeys).find((key) => key)
    if (!secretKey) throw new Error("Nenhuma secret key do Supabase está disponível no worker.")
    return createClient(supabaseUrl, secretKey)
  }

  if (!authorization) throw new Error("Authentication required")
  return createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } }
  })
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405)

  const authorization = req.headers.get("authorization")
  const apiKey = req.headers.get("apikey") || ""
  const serviceToService = isSecretKey(apiKey)

  if (!serviceToService && !authorization) return json({ error: "Authentication required" }, 401)

  const supabase = makeClient(authorization, serviceToService)
  let userId: string | null = null

  if (!serviceToService) {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401)
    userId = userData.user.id
  }

  let body: { limit?: number } = {}
  try { body = await req.json() } catch {}

  const limit = Math.min(Math.max(Number(body.limit || 10), 1), 25)
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || ""
  const now = new Date()
  const staleBefore = new Date(now.getTime() - 15 * 60 * 1000).toISOString()

  let staleQuery = supabase
    .from("flow_delivery_jobs")
    .update({ status: "queued", error_message: "Job recuperado após ficar preso em processamento.", scheduled_for: now.toISOString() })
    .eq("status", "processing")
    .lt("scheduled_for", staleBefore)
  if (userId) staleQuery = staleQuery.eq("user_id", userId)
  await staleQuery

  let jobsQuery = supabase
    .from("flow_delivery_jobs")
    .select("*, offer:flow_offers(*), channel:flow_channels(*)")
    .eq("status", "queued")
    .lte("scheduled_for", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(limit)
  if (userId) jobsQuery = jobsQuery.eq("user_id", userId)

  const { data: jobs, error: jobsError } = await jobsQuery
  if (jobsError) return json({ error: jobsError.message }, 500)

  let processed = 0
  let sent = 0
  let retried = 0
  let failed = 0
  const results: unknown[] = []

  for (const job of jobs || []) {
    const nextAttempt = Number(job.attempts || 0) + 1
    const { data: claimed, error: claimError } = await supabase
      .from("flow_delivery_jobs")
      .update({ status: "processing", attempts: nextAttempt, error_message: null })
      .eq("id", job.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle()

    if (claimError || !claimed) continue
    processed += 1

    let trackingId: string | null = null

    try {
      const { data: priorSuccess, error: priorSuccessError } = await supabase
        .from("flow_delivery_logs")
        .select("id, external_message_id")
        .eq("delivery_job_id", job.id)
        .eq("status", "sent")
        .limit(1)
        .maybeSingle()
      if (priorSuccessError) throw new Error("Falha ao verificar entrega anterior: " + priorSuccessError.message)
      if (priorSuccess) {
        const { error: reconcileError } = await supabase.from("flow_delivery_jobs")
          .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
          .eq("id", job.id)
          .eq("status", "processing")
        if (reconcileError) throw new Error("Falha ao reconciliar entrega anterior: " + reconcileError.message)
        sent += 1
        results.push({ id: job.id, status: "reconciled", attempts: Number(job.attempts || 0), external_message_id: priorSuccess.external_message_id })
        continue
      }

      const channel = job.channel
      const offer = job.offer
      if (!channel || channel.type !== "telegram") throw new Error("Canal Telegram inválido ou não encontrado.")
      if (!channel.external_ref) throw new Error("O canal não possui Chat ID.")
      if (!botToken) throw new Error("Segredo TELEGRAM_BOT_TOKEN não configurado no Edge Function.")

      const price = Number(offer?.price || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      const old = Number(offer?.previous_price || 0)
      const oldText = old > Number(offer?.price || 0) ? `\\nDe: ~${old.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}~` : ""
      const discount = Number(offer?.discount_percent || 0)
      const discountText = discount > 0 ? `\\n🔥 ${discount}% OFF` : ""
      const escapeHtml = (value: unknown) => String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")
      const destination = String(offer?.affiliate_url || offer?.product_url || "")
      let destinationUrl: URL
      try {
        destinationUrl = new URL(destination)
      } catch {
        throw new Error("A oferta não possui um link de destino válido.")
      }
      if (!["http:", "https:"].includes(destinationUrl.protocol)) throw new Error("A oferta não possui um link de destino válido.")

      trackingId = crypto.randomUUID()
      const { error: clickError } = await supabase.from("flow_clicks").insert({
        user_id: job.user_id,
        offer_id: job.offer_id,
        channel_id: job.channel_id,
        tracking_id: trackingId
      })
      if (clickError) throw new Error(`Falha ao criar tracking: ${clickError.message}`)

      const trackedUrl = `${supabaseUrl}/functions/v1/track-click?t=${encodeURIComponent(trackingId)}`
      const text = `🛍️ <b>${escapeHtml(offer?.title)}</b>${oldText}\\n💰 <b>${price}</b>${discountText}${offer?.coupon ? `\\n🎟️ Cupom: <b>${escapeHtml(offer.coupon)}</b>` : ""}\\n\\n👉 <a href="${trackedUrl}">Comprar</a>`

      let response: Response
      try {
        response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: channel.external_ref, text, parse_mode: "HTML", disable_web_page_preview: false })
        })
      } catch (error) {
        throw new Error(`Falha de rede ao chamar Telegram: ${error instanceof Error ? error.message : String(error)}`)
      }

      const telegram = await response.json()
      if (!response.ok || !telegram.ok) {
        const description = telegram?.description || `Telegram HTTP ${response.status}`
        const error = new Error(description)
        ;(error as Error & { retryable?: boolean }).retryable = response.status === 429 || response.status >= 500
        throw error
      }

      const { error: deliveryLogError } = await supabase.from("flow_delivery_logs").insert({
        user_id: job.user_id,
        delivery_job_id: job.id,
        offer_id: job.offer_id,
        channel_id: job.channel_id,
        status: "sent",
        external_message_id: String(telegram.result?.message_id || ""),
        metadata: { provider: "telegram", attempt: nextAttempt }
      })
      if (deliveryLogError) throw new Error("Falha ao registrar entrega confirmada: " + deliveryLogError.message)

      const { error: sentUpdateError } = await supabase.from("flow_delivery_jobs")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
        .eq("id", job.id)
        .eq("status", "processing")
      if (sentUpdateError) throw new Error("Falha ao finalizar job entregue: " + sentUpdateError.message)

      sent += 1
      results.push({ id: job.id, status: "sent", attempts: nextAttempt })
    } catch (error) {
      if (trackingId) {
        const { error: cleanupError } = await supabase.from("flow_clicks").delete().eq("tracking_id", trackingId)
        if (cleanupError) console.error("Falha ao limpar tracking após erro de entrega:", cleanupError.message)
      }

      const message = error instanceof Error ? error.message : String(error)
      const canRetry = ((error as Error & { retryable?: boolean })?.retryable ?? retryableError(message)) && nextAttempt < MAX_ATTEMPTS

      if (canRetry) {
        const scheduledFor = new Date(Date.now() + retryDelayMinutes(nextAttempt) * 60 * 1000).toISOString()
        const { error: retryUpdateError } = await supabase.from("flow_delivery_jobs")
          .update({ status: "queued", scheduled_for: scheduledFor, error_message: message })
          .eq("id", job.id)
          .eq("status", "processing")

        if (retryUpdateError) {
          console.error("Falha ao reencaminhar job para retry:", retryUpdateError.message)
          results.push({ id: job.id, status: "deferred", attempts: nextAttempt, error: message, state_error: retryUpdateError.message })
          continue
        }

        const { error: retryLogError } = await supabase.from("flow_delivery_logs").insert({
          user_id: job.user_id,
          delivery_job_id: job.id,
          offer_id: job.offer_id,
          channel_id: job.channel_id,
          status: "retry",
          metadata: { provider: "telegram", attempt: nextAttempt, next_attempt_at: scheduledFor, error: message }
        })
        if (retryLogError) console.error("Falha ao registrar tentativa de retry:", retryLogError.message)

        retried += 1
        results.push({ id: job.id, status: "retry", attempts: nextAttempt, next_attempt_at: scheduledFor, error: message })
      } else {
        const { error: failedUpdateError } = await supabase.from("flow_delivery_jobs")
          .update({ status: "failed", error_message: message })
          .eq("id", job.id)
          .eq("status", "processing")

        if (failedUpdateError) {
          console.error("Falha ao marcar job como failed:", failedUpdateError.message)
          results.push({ id: job.id, status: "deferred", attempts: nextAttempt, error: message, state_error: failedUpdateError.message })
          continue
        }

        const { error: failedLogError } = await supabase.from("flow_delivery_logs").insert({
          user_id: job.user_id,
          delivery_job_id: job.id,
          offer_id: job.offer_id,
          channel_id: job.channel_id,
          status: "failed",
          metadata: { provider: "telegram", attempt: nextAttempt, error: message }
        })
        if (failedLogError) console.error("Falha ao registrar falha de entrega:", failedLogError.message)

        failed += 1
        results.push({ id: job.id, status: "failed", attempts: nextAttempt, error: message })
      }
    }
  }

  return json({ ok: true, mode: serviceToService ? "scheduled" : "user", processed, sent, retried, failed, results })
})

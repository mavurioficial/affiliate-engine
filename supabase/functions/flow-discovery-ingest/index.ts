import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")
const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY") || ""
const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "cache-control": "no-store"
}

type DiscoveryOffer = {
  id?: string
  product_id?: string
  type?: string
  title?: string
  price?: number
  previous_price?: number | null
  discount?: number | null
  coupon?: string | null
  shipping_text?: string | null
  url?: string | null
  product_url?: string | null
  affiliate_url?: string | null
  image_url?: string | null
  extra_commission?: boolean
  category?: string | null
  seller?: string | null
  list_url?: string | null
  metadata?: Record<string, unknown>
}

type Rule = {
  id: string
  name: string
  priority: number
  conditions: Record<string, unknown>
  actions: Record<string, unknown>
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers })
}

function normalizeUrl(value: unknown) {
  const raw = String(value || "").trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (!["http:", "https:"].includes(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
}

function numberOrNull(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function textOrNull(value: unknown) {
  const text = String(value || "").trim()
  return text || null
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean)
  return []
}

function matchesWords(title: string, words: string[]) {
  const haystack = title.toLocaleLowerCase("pt-BR")
  return words.every((word) => haystack.includes(word.toLocaleLowerCase("pt-BR")))
}

function matchesRule(rule: Rule, offer: {
  title: string
  price: number
  discount: number | null
  coupon: string | null
  category: string | null
  seller: string | null
}) {
  const c = rule.conditions || {}
  const marketplace = String(c.marketplace || "").trim().toLowerCase()
  if (marketplace && marketplace !== "mercadolivre") return false

  const minDiscount = numberOrNull(c.minDiscount ?? c.min_discount)
  const maxDiscount = numberOrNull(c.maxDiscount ?? c.max_discount)
  if (minDiscount !== null && (offer.discount === null || offer.discount < minDiscount)) return false
  if (maxDiscount !== null && (offer.discount === null || offer.discount > maxDiscount)) return false

  const minPrice = numberOrNull(c.minPrice ?? c.min_price)
  const maxPrice = numberOrNull(c.maxPrice ?? c.max_price)
  if (minPrice !== null && offer.price < minPrice) return false
  if (maxPrice !== null && offer.price > maxPrice) return false

  const category = String(offer.category || "").toLocaleLowerCase("pt-BR")
  const requiredCategory = String(c.category || "").trim().toLocaleLowerCase("pt-BR")
  if (requiredCategory && category !== requiredCategory && !category.includes(requiredCategory)) return false

  const seller = String(offer.seller || "").toLocaleLowerCase("pt-BR")
  const requiredSeller = String(c.seller || "").trim().toLocaleLowerCase("pt-BR")
  if (requiredSeller && seller !== requiredSeller && !seller.includes(requiredSeller)) return false

  const allowedWords = asStringArray(c.allowedWords ?? c.allowed_words)
  if (allowedWords.length && !matchesWords(offer.title, allowedWords)) return false

  const deniedWords = asStringArray(c.deniedWords ?? c.denied_words)
  if (deniedWords.some((word) => offer.title.toLocaleLowerCase("pt-BR").includes(word.toLocaleLowerCase("pt-BR")))) return false

  const requireCoupon = Boolean(c.requireCoupon ?? c.require_coupon)
  if (requireCoupon && !offer.coupon) return false

  return true
}

function channelIdsForRule(rule: Rule) {
  const actions = rule.actions || {}
  return asStringArray(actions.channel_ids ?? actions.channelIds)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405)
  if (!secretKey) return json({ error: "Configuração interna do Supabase incompleta." }, 500)

  const authorization = req.headers.get("authorization") || ""
  if (!authorization) return json({ error: "Usuário não autenticado." }, 401)

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } }
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: "Usuário não autenticado." }, 401)

  const admin = createClient(supabaseUrl, secretKey)
  const userId = userData.user.id

  let payload: { offers?: DiscoveryOffer[]; dry_run?: boolean } = {}
  try {
    payload = await req.json()
  } catch {
    return json({ error: "JSON inválido." }, 400)
  }

  const offers = Array.isArray(payload.offers) ? payload.offers.slice(0, 100) : []
  const affiliateAccountId = textOrNull((payload as { affiliate_account_id?: string }).affiliate_account_id)
  if (!offers.length) return json({ error: "offers deve conter pelo menos uma oferta." }, 400)

  const dryRun = payload.dry_run === true

  const { data: marketplace, error: marketplaceError } = await admin
    .from("flow_marketplaces")
    .select("id, slug, name")
    .eq("slug", "mercadolivre")
    .maybeSingle()

  if (marketplaceError) return json({ error: marketplaceError.message }, 500)
  if (!marketplace) return json({ error: "Marketplace mercadolivre não configurado." }, 500)

  let affiliateAccount: { id: string; name: string; external_account_id: string | null } | null = null
  if (affiliateAccountId) {
    const { data, error } = await admin
      .from("flow_affiliate_accounts")
      .select("id,name,external_account_id")
      .eq("id", affiliateAccountId)
      .eq("user_id", userId)
      .eq("marketplace_id", marketplace.id)
      .maybeSingle()
    if (error) return json({ error: error.message }, 500)
    if (!data) return json({ error: "Conta de afiliado não encontrada para este usuário/marketplace." }, 404)
    affiliateAccount = data
  } else {
    const { data } = await admin
      .from("flow_affiliate_accounts")
      .select("id,name,external_account_id")
      .eq("user_id", userId)
      .eq("marketplace_id", marketplace.id)
      .eq("status", "connected")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    affiliateAccount = data || null
  }

  const { data: rules, error: rulesError } = await admin
    .from("flow_rules")
    .select("id,name,priority,conditions,actions")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("priority", { ascending: true })

  if (rulesError) return json({ error: rulesError.message }, 500)

  const normalizedRules = (rules || []) as Rule[]
  const channelIds = [...new Set(normalizedRules.flatMap(channelIdsForRule))]

  let channels: Array<{ id: string; type: string; status: string; external_ref: string | null }> = []
  if (channelIds.length) {
    const { data, error } = await admin
      .from("flow_channels")
      .select("id,type,status,external_ref")
      .eq("user_id", userId)
      .in("id", channelIds)
    if (error) return json({ error: error.message }, 500)
    channels = data || []
  }

  const activeChannelIds = new Set(
    channels
      .filter((channel) => ["active", "connected"].includes(channel.status) && channel.type === "telegram" && channel.external_ref)
      .map((channel) => channel.id)
  )

  const result = {
    ok: true,
    dry_run: dryRun,
    received: offers.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    jobs_created: 0,
    jobs_existing: 0,
    skipped: 0,
    errors: [] as Array<{ index: number; error: string }>
  }

  for (let index = 0; index < offers.length; index += 1) {
    const input = offers[index]
    try {
      const sourceRef = textOrNull(input.id || input.product_id)
      const title = textOrNull(input.title)
      const price = numberOrNull(input.price)
      const productUrl = normalizeUrl(input.product_url || input.url)
      const affiliateUrl = normalizeUrl(input.affiliate_url)
      const imageUrl = normalizeUrl(input.image_url)
      if (!sourceRef || !title || price === null || price < 0) {
        result.skipped += 1
        continue
      }

      const previousPrice = numberOrNull(input.previous_price)
      const discount = numberOrNull(input.discount)
      const coupon = textOrNull(input.coupon)
      const category = textOrNull(input.category)
      const seller = textOrNull(input.seller)
      const shippingText = textOrNull(input.shipping_text)

      const fingerprintSource = JSON.stringify({
        sourceRef,
        title,
        price,
        previousPrice,
        discount,
        coupon,
        category,
        seller,
        productUrl
      })
      const fingerprint = await sha256(fingerprintSource)

      const metadata = {
        ...(input.metadata || {}),
        discovery: {
          provider: "mercadolivre",
          method: "affiliate_hub_browser",
          affiliate_account_id: affiliateAccount?.id || null,
          affiliate_account_name: affiliateAccount?.name || null,
          source_ref: sourceRef,
          list_url: input.list_url || null,
          extra_commission: input.extra_commission === true,
          category,
          seller
        }
      }

      const { data: existing, error: existingError } = await admin
        .from("flow_offers")
        .select("id,fingerprint,affiliate_url,status")
        .eq("user_id", userId)
        .eq("marketplace_id", marketplace.id)
        .eq("source_ref", sourceRef)
        .eq("affiliate_account_id", affiliateAccount?.id || "")
        .maybeSingle()

      if (existingError) throw new Error(existingError.message)

      const unchanged = existing?.fingerprint === fingerprint
      let offerId = existing?.id || null

      if (!dryRun) {
        const row = {
          user_id: userId,
          marketplace_id: marketplace.id,
          affiliate_account_id: affiliateAccount?.id || null,
          source_type: "api",
          source_ref: sourceRef,
          title,
          price,
          previous_price: previousPrice,
          discount_percent: discount,
          coupon,
          shipping_text: shippingText,
          affiliate_url: affiliateUrl || existing?.affiliate_url || null,
          product_url: productUrl,
          image_url: imageUrl,
          fingerprint,
          status: "captured",
          metadata,
          captured_at: new Date().toISOString()
        }

        if (existing) {
          const { error } = await admin.from("flow_offers").update(row).eq("id", existing.id)
          if (error) throw new Error(error.message)
          result.updated += unchanged ? (affiliateUrlChanged ? 1 : 0) : 1
          result.unchanged += unchanged && !affiliateUrlChanged ? 1 : 0
        } else {
          const { data: created, error } = await admin
            .from("flow_offers")
            .insert(row)
            .select("id")
            .single()
          if (error) throw new Error(error.message)
          offerId = created.id
          result.created += 1
        }
      } else {
        result.unchanged += unchanged ? 1 : 0
        if (!unchanged) result.created += existing ? 0 : 1
        if (existing) offerId = existing.id
      }

      const affiliateUrlChanged = Boolean(affiliateUrl && affiliateUrl !== existing?.affiliate_url)
      if (unchanged && !affiliateUrlChanged) continue

      const effectiveOffer = {
        title,
        price,
        discount,
        coupon,
        category,
        seller
      }

      const matchedChannels = new Set<string>()
      for (const rule of normalizedRules) {
        if (!matchesRule(rule, effectiveOffer)) continue
        for (const id of channelIdsForRule(rule)) {
          if (activeChannelIds.has(id)) matchedChannels.add(id)
        }
      }

      const effectiveAffiliateUrl = affiliateUrl || existing?.affiliate_url || null
      if (!matchedChannels.size || !offerId || dryRun || !effectiveAffiliateUrl) {
        result.skipped += matchedChannels.size ? 0 : 1
        continue
      }

      for (const channelId of matchedChannels) {
        const deliveryKey = `discovery:${offerId}:${fingerprint}:${channelId}`
        const { data: prior } = await admin
          .from("flow_delivery_jobs")
          .select("id")
          .eq("user_id", userId)
          .eq("delivery_key", deliveryKey)
          .maybeSingle()

        if (prior) {
          result.jobs_existing += 1
          continue
        }

        const { error: jobError } = await admin.from("flow_delivery_jobs").insert({
          user_id: userId,
          offer_id: offerId,
          channel_id: channelId,
          status: "queued",
          attempts: 0,
          scheduled_for: new Date().toISOString(),
          delivery_key: deliveryKey
        })

        if (jobError) {
          if (String(jobError.message).toLowerCase().includes("duplicate")) {
            result.jobs_existing += 1
          } else {
            throw new Error(jobError.message)
          }
        } else {
          result.jobs_created += 1
        }
      }
    } catch (error) {
      result.errors.push({ index, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return json(result)
})

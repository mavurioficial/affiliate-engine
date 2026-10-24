

import { createClient } from "npm:@supabase/supabase-js@2.49.8"

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

type MagaluOffer = {
  code?: string
  title?: string
  price?: number | string
  previous_price?: number | string | null
  discount?: number | string | null
  coupon?: string | null
  shipping_text?: string | null
  image_url?: string | null
  product_url?: string | null
  affiliate_url?: string | null
  installments?: string | null
  source_message_id?: string | null
  source_message_date?: string | null
  source_text?: string | null
  score?: number | null
  metadata?: Record<string, unknown>
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers })
}
function textOrNull(v: unknown) {
  const s = String(v || "").trim()
  return s || null
}
function numberOrNull(v: unknown) {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function normalizeText(v: unknown) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
}
function normalizeUrl(v: unknown) {
  const s = String(v || "").trim()
  if (!s) return null
  try {
    const u = new URL(s)
    if (!["http:", "https:"].includes(u.protocol)) return null
    return u.toString()
  } catch {
    return null
  }
}
function calcDiscount(price: number, previous: number | null) {
  if (!previous || previous <= price || previous <= 0) return null
  return Math.round((1 - price / previous) * 100)
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function classify(title: string) {
  const text = normalizeText(title)
  const tags = new Set<string>()
  let category = "outros"

  if (/(cadeira gamer|gaming chair)/.test(text)) {
    category = "casa"; tags.add("casa"); tags.add("moveis"); tags.add("gamer-setup"); tags.add("tecnologia")
  } else if (/(cadeira de escritorio|cadeira escritorio|cadeira ergonomica|cadeira executiva|cadeira presidente|office chair)/.test(text)) {
    category = "casa"; tags.add("casa"); tags.add("moveis"); tags.add("escritorio")
  } else if (/(colchao|colchonete|topper de colchao|topper colchao)/.test(text)) {
    category = "casa"; tags.add("casa"); tags.add("quarto"); tags.add("colchao")
  } else if (/(hdmi|displayport|display port|(^|[^a-z])vga([^a-z]|$)|(^|[^a-z])dvi([^a-z]|$)|dock station|hub usb|ethernet|cabo de rede|rj45)/.test(text)) {
    category = "eletronicos"; tags.add("eletronicos"); tags.add("conectividade")
  } else if (/(kindle|e-reader|ereader|leitor digital|leitor de livros)/.test(text)) {
    category = "eletronicos"; tags.add("eletronicos"); tags.add("leitor-digital")
  } else if (/(playstation|ps[345]|xbox|nintendo switch|videogame|video game|console|steam deck)/.test(text)) {
    category = "eletronicos"; tags.add("eletronicos"); tags.add("games")
  } else if (/(notebook|computador|monitor|mouse|teclado|ssd|hd externo|roteador|impressora|webcam)/.test(text)) {
    category = "informatica"; tags.add("informatica")
  } else if (/(smart tv|televisao|(^|[^a-z])tv([^a-z]|$)|smartphone|celular|iphone|galaxy|fone|headset|earbuds|smartwatch|caixa de som|soundbar|projetor|tablet|camera|alexa|echo dot)/.test(text)) {
    category = "eletronicos"; tags.add("eletronicos")
    if (/(smartphone|celular|iphone|galaxy)/.test(text)) tags.add("celular")
  } else if (/(hidratante corporal|locao hidratante|creme hidratante|antirrugas|anti rugas|anti-idade|anti idade|contorno dos olhos|creme para olhos|liftactiv|lipikar|la roche-posay|vichy|cerave|eucerin|bioderma|neutrogena|maquiagem|batom|rimel|delineador|blush|gloss|skincare|serum facial|hidratante facial|protetor solar|bloqueador solar|perfume)/.test(text)) {
    category = "beleza"; tags.add("feminino")
    if (/(skincare|serum|hidratante|antirrugas|anti idade|contorno dos olhos|protetor solar|bloqueador solar|liftactiv|lipikar)/.test(text)) tags.add("skincare")
    if (/(maquiagem|batom|rimel|delineador|blush|gloss)/.test(text)) tags.add("maquiagem")
  } else if (/(^|[^a-z])secador(es)?([^a-z]|$)|shampoo|condicionador|mascara capilar|reparador capilar|oleo capilar|reparador de pontas|leave-in|chapinha|escova secadora|creme para pentear/.test(text)) {
    category = "beleza"; tags.add("feminino"); tags.add("cabelo")
  } else if (/(psyllium|quitosana|quitossana|spirulina|termogen|controle de peso|saciedade)/.test(text)) {
    category = "saude-bem-estar"; tags.add("feminino"); tags.add("controle-peso"); tags.add("bem-estar")
  } else if (/(air fryer|fritadeira|panela|frigideira|cafeteira|liquidificador|sanduicheira|chaleira|mixer|talher|garrafa termica|copo|caneca|cozinha|jogo de panelas|coador de cafe|filtro de cafe|pote|travessa|assadeira|micro-ondas|microondas)/.test(text)) {
    category = "cozinha"; tags.add("casa"); tags.add("cozinha")
  } else if (/(sofa|armario|organizador|estante|prateleira|lixeira|varal|tapete|cortina|luminaria|abajur|decoracao|aspirador|ventilador|umidificador|mop|rodo|esfregao|banheiro|quarto|sala)/.test(text)) {
    category = "casa"; tags.add("casa")
    if (/(aspirador|mop|rodo|esfregao|limpeza)/.test(text)) tags.add("limpeza")
    if (/(decoracao|tapete|cortina|luminaria|abajur)/.test(text)) tags.add("decoracao")
  } else if (/(vestido|saia|legging|blusa feminina|camiseta feminina|bolsa feminina|tenis feminino|feminino|feminina|calcinha|lingerie|sutia)/.test(text)) {
    category = "moda"; tags.add("feminino"); tags.add("moda")
  } else if (/(cueca|masculino|homem|men )/.test(text)) {
    category = "moda"; tags.add("masculino"); tags.add("moda")
  } else if (/(bebe|infantil|crianca|brinquedo|boneca|boneco|fralda|mamadeira)/.test(text)) {
    category = "infantil"; tags.add("infantil")
  } else if (/(pet |cachorro|gato|racao)/.test(text)) {
    category = "pet"; tags.add("pet")
  } else if (/(ferramenta|furadeira|parafusadeira|soquete|catraca|alicate|torquimetro|martelete|serra circular)/.test(text)) {
    category = "ferramentas"; tags.add("ferramenta")
  } else if (/(academia|fitness|corrida|ciclismo|esporte|bola de futebol|basquete)/.test(text)) {
    category = "esporte"; tags.add("esporte")
  } else if (/(pneu|automotivo|carro|veicular|limpador de para-brisa)/.test(text)) {
    category = "automotivo"; tags.add("automotivo")
  }

  return { category, tags: [...tags] }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (req.method !== "POST") return json({ error: "POST required" }, 405)
  if (!secretKey) return json({ error: "Supabase secret unavailable" }, 500)

  const authorization = req.headers.get("authorization") || ""
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(authorization.replace(/^Bearer /,""))))).map(v=>v.toString(16).padStart(2,"0")).join("");
  if(digest!=="3efb0f37ba962d865839b2beeffd672787e652b4059e4de53940403421cfd423")return json({error:"scheduler_unauthorized"},401);
  const admin=createClient(supabaseUrl,secretKey);
  let payload:any={};try{payload=await req.json()}catch{return json({error:"invalid_json"},400)}
  const {data:cfg,error:cfgError}=await admin.rpc("mavuri_magalu_cloud_state");
  if(cfgError||!cfg)return json({error:"cloud_state_failed"},503);
  const runId=String(req.headers.get("x-mavuri-run")||"");
  if(payload.dry_run!==true&&(!cfg.enabled||cfg.active_run!==runId||!(Date.parse(cfg.lease_until)>Date.now())))return json({error:"cloud_run_not_authorized"},403);
  const userId=cfg.owner_id;
  const offers = Array.isArray(payload.offers) ? payload.offers.slice(0, 30) : []
  if (!offers.length) return json({ error: "offers deve conter pelo menos uma oferta." }, 400)

  const { data: marketplace, error: mpError } = await admin.from("flow_marketplaces")
    .select("id").eq("slug", "magalu").eq("active", true).maybeSingle()
  if (mpError || !marketplace) return json({ error: mpError?.message || "Marketplace Magalu não encontrado." }, 500)

  const { data: account, error: acctError } = await admin.from("flow_affiliate_accounts")
    .select("id,name,external_account_id,settings")
    .eq("user_id", userId).eq("marketplace_id", marketplace.id).eq("status", "connected")
    .order("created_at", { ascending: true }).limit(1).maybeSingle()
  if (acctError || !account) return json({ error: acctError?.message || "Conta Magalu não conectada." }, 404)

  const storeSlug = String(account.settings?.store_slug || account.external_account_id || "").trim()
  if (!storeSlug) return json({ error: "Slug da loja Magalu não configurado." }, 500)

  const { data: cats, error: catError } = await admin.from("mavuri_categories").select("id,slug").eq("active", true)
  if (catError) return json({ error: catError.message }, 500)
  const categoryIdBySlug = new Map((cats || []).map((c) => [String(c.slug), String(c.id)]))

  const { data: channelRows, error: channelError } = await admin.from("flow_channels")
    .select("id,name").eq("user_id", userId).eq("type", "telegram")
    .in("status", ["active","connected"])
    .in("name", ["Mavuri Ofertas","Mavuri Mulher","Mavuri Casa & Cozinha","Mavuri Tecnologia"])
  if (channelError) return json({ error: channelError.message }, 500)

  const channelByName = new Map((channelRows || []).map((c) => [String(c.name), String(c.id)]))
  const generalChannelId = channelByName.get("Mavuri Ofertas") || null
  const mulherChannelId = channelByName.get("Mavuri Mulher") || null
  const casaChannelId = channelByName.get("Mavuri Casa & Cozinha") || null
  const tecnologiaChannelId = channelByName.get("Mavuri Tecnologia") || null

  const result = {
    ok: true, received: offers.length, created: 0, updated: 0, unchanged: 0,
    jobs_created: 0, skipped: 0,
    errors: [] as Array<{ index:number,error:string }>,
    saved: [] as Array<Record<string,unknown>>
  }

  for (let i = 0; i < offers.length; i++) {
    const input = offers[i]
    try {
      const code = String(textOrNull(input.code) || "").trim()
      if (!/^[A-Za-z0-9]{8,14}$/.test(code)) throw new Error("Código Magalu ausente ou inválido.")

      const title = textOrNull(input.title)
      const price = numberOrNull(input.price)
      const previous = numberOrNull(input.previous_price)
      if (!title || price === null || price <= 0) throw new Error("Título e preço atual são obrigatórios.")

      if(input.metadata?.cloud_verified!==true||!Number.isFinite(Date.parse(String(input.metadata?.price_checked_at||"")))||Date.now()-Date.parse(String(input.metadata?.price_checked_at))>300000)throw Error("fresh_commercial_verification_required");
      const discount = numberOrNull(input.discount) ?? calcDiscount(price, previous)
      const coupon = textOrNull(input.coupon)
      const shippingText = textOrNull(input.shipping_text)
      const imageUrl = normalizeUrl(input.image_url)
      const searchUrl = `https://www.magazinevoce.com.br/${encodeURIComponent(storeSlug)}/busca/${encodeURIComponent(code)}/`
      const candidateProductUrl = normalizeUrl(input.product_url)
      const candidateAffiliateUrl = normalizeUrl(input.affiliate_url)
      const allowedStorePrefix = "/" + storeSlug.toLowerCase() + "/"
      const validStoreUrl = (value: string | null) => {
        if (!value) return null
        try {
          const u = new URL(value)
          const hostOk = u.hostname === "www.magazinevoce.com.br" || u.hostname === "magazinevoce.com.br"
          const pathOk = u.pathname.toLowerCase().startsWith(allowedStorePrefix)
          return hostOk && pathOk ? u.toString() : null
        } catch { return null }
      }
      const productUrl = validStoreUrl(candidateProductUrl) || searchUrl
      const affiliateUrl = validStoreUrl(candidateAffiliateUrl) || productUrl
      let classification = classify(title)

      const fingerprint = await sha256(JSON.stringify({
        code: code.toLowerCase(), title, price, previous, discount, coupon, shippingText, affiliateUrl, imageUrl
      }))

      const { data: existing, error: existingError } = await admin.from("flow_offers")
        .select("id,fingerprint,price,previous_price,discount_percent,coupon")
        .eq("user_id", userId)
        .eq("marketplace_id", marketplace.id)
        .eq("affiliate_account_id", account.id)
        .eq("source_ref", code)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      if (existingError) throw new Error(existingError.message)

      const now = new Date().toISOString()
      const metadata = {
        ...(input.metadata || {}),
        shipping: {
          free_shipping: /frete\s+gr[aá]tis/i.test(shippingText || ""),
          text: shippingText
        },
        magalu: {
          code,
          store_slug: storeSlug,
          mode: "telegram_official_auto",
          source_channel: "@parceiromagaludivulgador",
          source_message_id: textOrNull(input.source_message_id),
          source_message_date: textOrNull(input.source_message_date),
          source_text: String(input.source_text || "").slice(0, 4000) || null,
          discovery_score: numberOrNull(input.score),
          installments: textOrNull(input.installments),
          direct_product_url: productUrl !== searchUrl ? productUrl : null,
          image_enriched: Boolean(imageUrl),
          official_curated: true,
          price_checked_at: String(input.metadata?.price_checked_at||""),
          cloud_run_id:runId
        },
        mavuri: {
          category_slug: classification.category,
          tags: classification.tags,
          classification_source: "magalu_official_telegram",
          classification_confidence: 0.96,
          classification_needs_review: false
        }
      }

      const row = {
        user_id: userId,
        marketplace_id: marketplace.id,
        affiliate_account_id: account.id,
        source_type: "telegram",
        source_ref: code,
        title,
        price,
        previous_price: previous && previous > price ? previous : null,
        discount_percent: discount,
        coupon,
        shipping_text: shippingText,
        affiliate_url: affiliateUrl,
        product_url: productUrl,
        image_url: imageUrl,
        fingerprint,
        mavuri_category_id: categoryIdBySlug.get(classification.category) || categoryIdBySlug.get("outros") || null,
        mavuri_tags: classification.tags,
        status: "captured",
        metadata,
        captured_at: now
      }

      let offerId = existing?.id || null
      const unchanged = existing?.fingerprint === fingerprint
      const previousPublishedPrice = Number(existing?.price || 0)
      const currentPrice = Number(price || 0)
      const previousDiscount = Number(existing?.discount_percent || 0)
      const currentDiscount = Number(discount || 0)
      const priceDropPct =
        previousPublishedPrice > 0 && currentPrice > 0 && currentPrice < previousPublishedPrice
          ? ((previousPublishedPrice - currentPrice) / previousPublishedPrice) * 100
          : 0
      const discountGain = currentDiscount - previousDiscount
      const previousCoupon = String(existing?.coupon || "").trim().toUpperCase()
      const currentCoupon = String(coupon || "").trim().toUpperCase()
      const couponChanged = Boolean(currentCoupon) && currentCoupon !== previousCoupon

      // Evita republicação causada apenas por enriquecimento tardio do parser
      // (ex.: desconto antes null/0 e depois 47%, mas preço/cupom idênticos).
      // Ganho de desconto só conta quando já existia uma baseline válida.
      const meaningfulDiscountGain = previousDiscount > 0 && discountGain >= 10
      const meaningfulCouponChange =
        couponChanged &&
        (
          priceDropPct >= 5 ||
          (previousDiscount > 0 && discountGain >= 5)
        )

      const meaningfulRepublish =
        !existing ||
        priceDropPct >= 5 ||
        meaningfulDiscountGain ||
        meaningfulCouponChange

      if (!payload.dry_run) {
        if (existing) {
          const { error } = await admin.from("flow_offers").update(row).eq("id", existing.id)
          if (error) throw new Error(error.message)
          if (unchanged) result.unchanged += 1
          else result.updated += 1
        } else {
          const { data: inserted, error } = await admin.from("flow_offers").insert(row).select("id").single()
          if (error) throw new Error(error.message)
          offerId = inserted.id
          result.created += 1
        }

        if (payload.create_jobs !== false && offerId) {
          const effective=await admin.from("flow_offers").select("mavuri_category_id,mavuri_tags").eq("id",offerId).single();
          if(effective.error)throw Error("effective_category_read_failed");
          const effectiveSlug=(cats||[]).find(c=>c.id===effective.data.mavuri_category_id)?.slug;
          if(!effectiveSlug)throw Error("effective_category_missing");
          classification={category:effectiveSlug,tags:effective.data.mavuri_tags||[]};
          const destinations = new Set<string>()
          if (generalChannelId) destinations.add(generalChannelId)

          const tagSet = new Set(classification.tags || [])
          const isWoman =
            ["beleza","moda","saude-bem-estar"].includes(classification.category) &&
            (
              tagSet.has("feminino") ||
              tagSet.has("maquiagem") ||
              tagSet.has("skincare") ||
              tagSet.has("cabelo") ||
              tagSet.has("unhas") ||
              tagSet.has("acessorios-femininos") ||
              tagSet.has("controle-peso")
            ) &&
            !tagSet.has("masculino") &&
            !tagSet.has("infantil")

          const isHome =
            ["casa","cozinha"].includes(classification.category) ||
            tagSet.has("casa") ||
            tagSet.has("cozinha") ||
            tagSet.has("limpeza") ||
            tagSet.has("decoracao")

          const isTech =
            ["eletronicos","informatica"].includes(classification.category) ||
            tagSet.has("eletronicos") ||
            tagSet.has("informatica") ||
            tagSet.has("celular") ||
            tagSet.has("tecnologia") ||
            tagSet.has("gamer-setup")

          if (isWoman && mulherChannelId) destinations.add(mulherChannelId)
          if (isHome && casaChannelId) destinations.add(casaChannelId)
          if (isTech && tecnologiaChannelId) destinations.add(tecnologiaChannelId)

          const changedExisting = Boolean(existing)
          const prefix = "magalu:cloud:"+runId

          for (const channelId of destinations) {
            const deliveryKey = `${prefix}:${offerId}:${channelId}`
            const { data:queuedJob,error: jobError } = await admin.from("flow_delivery_jobs").insert({
              user_id: userId,
              offer_id: offerId,
              channel_id: channelId,
              status: "queued",
              attempts: 0,
              scheduled_for: now,
              delivery_key: deliveryKey,
              error_message: null
            }).select("id").maybeSingle()
            if (jobError) {
              if (!String(jobError.message || "").toLowerCase().includes("duplicate")) throw new Error(jobError.message)
            } else if(queuedJob?.id) {
              result.jobs_created += 1
            }
          }
        }
      }

      result.saved.push({
        code, category: classification.category, tags: classification.tags,
        discount, coupon, affiliate_url: affiliateUrl, changed: !unchanged,
        meaningful_republish: meaningfulRepublish,
        price_drop_pct: Number(priceDropPct.toFixed(2)),
        discount_gain: Number(discountGain.toFixed(2)),
        dry_run: payload.dry_run === true
      })
    } catch (error) {
      result.errors.push({ index: i, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return json(result)
})


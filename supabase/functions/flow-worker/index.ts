import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")
const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY") || ""
const SCHEDULER_SECRET_SHA256 = "3efb0f37ba962d865839b2beeffd672787e652b4059e4de53940403421cfd423"
const MAX_ATTEMPTS = 5
const BACKOFF_MINUTES = [1, 2, 5, 10, 20]

function whatsappFromTelegramHtml(html: string) {
  const tick = String.fromCharCode(96)
  return String(html || "")
    .replace(/<a\b[^>]*>/gi, "")
    .replace(/<\/a>/gi, "")
    .replace(/<b>/gi, "*").replace(/<\/b>/gi, "*")
    .replace(/<s>/gi, "~").replace(/<\/s>/gi, "~")
    .replace(/<code>/gi, tick).replace(/<\/code>/gi, tick)
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}


const WHAPI_MAX_IMAGE_CAPTION_LENGTH = 1000

// Only shorten presentation text: affiliate URLs, prices and coupon codes remain exact.
function compactWhapiOfferCaption(input: {
  title: string; affiliateUrl: string; isMagalu: boolean; price: string; currentPrice: number;
  previousPrice: number; discount: number; coupon: string;
  matchedCoupon: boolean; matchedBasePriceText: string; freeShipping: boolean
}) {
  const header = input.isMagalu ? "💙 *OFERTA MAGALU*" : "🔥 *OFERTA MAVURI*"
  const lines = [
    input.discount > 0 ? "🔥 " + input.discount.toLocaleString("pt-BR", {maximumFractionDigits: 2}) + "% OFF" : "",
    input.previousPrice > input.currentPrice
      ? "De: ~" + input.previousPrice.toLocaleString("pt-BR", {style:"currency",currency:"BRL"}) + "~" : "",
    input.matchedCoupon ? "💵 Preço da oferta: " + input.matchedBasePriceText : "",
    input.matchedCoupon ? "💰 *COM CUPOM: " + input.price + "*": "💰 *" + input.price + "*",
    input.coupon ? "🎟️ Cupom: " + input.coupon : "",
    input.freeShipping ? "🚚 Frete grátis" : "",
    "🔗 " + input.affiliateUrl
  ].filter(Boolean)
  const render = (title: string) => [header, "📦 *" + title + "*", ...lines].join("\n")
  const first = render(input.title)
  if(first.length <= WHAPI_MAX_IMAGE_CAPTION_LENGTH) return first
  const titleBudget = WHAPI_MAX_IMAGE_CAPTION_LENGTH - render("").length
  if(titleBudget < 18) return ""
  const shortened = input.title.slice(0,titleBudget - 1).trimEnd() + "…"
  const result = render(shortened)
  return result.length <= WHAPI_MAX_IMAGE_CAPTION_LENGTH ? result : ""
}

// Whapi sometimes cannot download a public Magalu CDN URL. Relay only images from
// the trusted Magalu CDN as a bounded Base64 data URI, never arbitrary offer URLs.
async function whapiMagaluImageAsBase64(rawUrl: string): Promise<{dataUri: string; failure: string | null}> {
  let url: URL
  try { url = new URL(rawUrl) } catch { return {dataUri:"",failure:"invalid_image_url"} }
  if (url.protocol !== "https:" || url.hostname !== "a-static.mlcdn.com.br")
    return {dataUri:"",failure:"image_host_not_allowlisted"}
  const MAX_IMAGE_BYTES = 3 * 1024 * 1024
  try {
    const response = await fetch(url.toString(), {
      redirect:"error",
      headers:{"accept":"image/jpeg,image/png,image/webp"},
      signal: AbortSignal.timeout(10000)
    })
    if(!response.ok) return {dataUri:"",failure:"image_fetch_http_" + response.status}
    const mime = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase().trim()
    if(!["image/jpeg","image/png","image/webp"].includes(mime))
      return {dataUri:"",failure:"image_content_type_unsupported"}
    const expectedBytes = Number(response.headers.get("content-length") || 0)
    if(expectedBytes > MAX_IMAGE_BYTES) return {dataUri:"",failure:"image_too_large"}
    if(!response.body) return {dataUri:"",failure:"image_has_no_body"}
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while(true) {
      const {done,value} = await reader.read()
      if(done) break
      if(!value) continue
      total += value.length
      if(total > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => {})
        return {dataUri:"",failure:"image_too_large"}
      }
      chunks.push(value)
    }
    if(!total) return {dataUri:"",failure:"empty_image"}
    const bytes = new Uint8Array(total)
    let offset = 0
    for(const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length }
    const binaryParts: string[] = []
    for(let i=0; i<bytes.length; i+=8192)
      binaryParts.push(String.fromCharCode(...bytes.subarray(i,i+8192)))
    return {dataUri:"data:" + mime + ";base64," + btoa(binaryParts.join("")),failure:null}
  } catch(cause) {
    return {dataUri:"",failure:cause instanceof Error && cause.name==="TimeoutError" ? "image_fetch_timeout" : "image_fetch_failed"}
  }
}

async function whapiPost(route: "text" | "image", payload: Record<string, unknown>, token: string) {
  let response: Response
  try {
    response = await fetch("https://gate.whapi.cloud/messages/" + route, {
      method: "POST",
      headers: { "authorization": "Bearer " + token, "accept": "application/json", "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    })
  } catch (cause) {
    // A timeout may have happened after WhatsApp accepted the message.
    // Avoid automatic retries that could duplicate posts.
    const error = new Error("Whapi sem confirmação de envio: " + (cause instanceof Error ? cause.message : String(cause)))
    ;(error as Error & { retryable?: boolean }).retryable = false
    throw error
  }
  const data = await response.json().catch(() => ({})) as Record<string, any>
  const success = response.ok && data.sent === true
  return {
    success, status: response.status, data,
    error: String(data?.error?.message || data?.message || data?.error || "Envio não confirmado pela Whapi").slice(0, 200)
  }
}


const WHAPI_PAUSE_CHECK_INTERVAL_MS = 60 * 60 * 1000
const WHAPI_OFFER_MAX_AGE_MS = 12 * 60 * 60 * 1000

async function whapiChannelSnapshot(db: any, channelId: string, userId: string) {
  const { data, error } = await db.from("flow_channels")
    .select("id,user_id,settings,status")
    .eq("id",channelId).eq("user_id",userId).maybeSingle()
  if(error) throw new Error("Whapi pause state unavailable: " + error.message)
  if(!data) throw new Error("Whapi channel ownership mismatch")
  return data
}

async function setWhapiQuotaPause(db: any, channelId: string, userId: string, reason: string) {
  const channel = await whapiChannelSnapshot(db,channelId,userId)
  const old = channel.settings || {}
  const existing = old.whapi_pause || {}
  const now = new Date()
  const pause = {
    active: true, reason: "trial_limit_402",
    paused_at: existing.paused_at || now.toISOString(),
    last_error: reason.slice(0,200),
    next_check_at: new Date(now.getTime()+WHAPI_PAUSE_CHECK_INTERVAL_MS).toISOString()
  }
  const {error} = await db.from("flow_channels")
    .update({settings:{...old,whapi_pause:pause}})
    .eq("id",channelId).eq("user_id",userId)
  if(error) throw new Error("Failed to persist Whapi pause: "+error.message)
  console.warn("Mavuri Whapi circuit paused, channel="+channelId)
}

// Returns true while quota is unavailable. Never probes by POSTing a message.
async function whapiQuotaIsPaused(db: any, channelId: string, userId: string, token: string) {
  const channel = await whapiChannelSnapshot(db,channelId,userId)
  const settings = channel.settings || {}
  const pause = settings.whapi_pause || {}
  if(pause.active !== true) return false
  const nextCheck = Date.parse(String(pause.next_check_at || ""))
  if(!Number.isNaN(nextCheck) && Date.now()<nextCheck) return true
  const retryAt = new Date(Date.now()+WHAPI_PAUSE_CHECK_INTERVAL_MS).toISOString()
  const {error: markError} = await db.from("flow_channels")
    .update({settings:{...settings,whapi_pause:{...pause,active:true,next_check_at:retryAt}}})
    .eq("id",channelId).eq("user_id",userId)
  if(markError) {
    console.error("Whapi quota probe state not saved: "+markError.message)
    return true
  }
  try {
    const res = await fetch("https://gate.whapi.cloud/limits",{
      method:"GET",
      headers:{authorization:"Bearer "+token,accept:"application/json"},
      signal:AbortSignal.timeout(10000)
    })
    const payload = res.status===204 ? null : await res.json().catch(()=>null)
    const remaining = payload && typeof payload.messages === "number" ? payload.messages : null
    const available = res.status===204 || (res.ok && remaining!==null && remaining>0)
    if(!available) {
      console.log("Mavuri Whapi still paused; HTTP "+res.status+"; remaining="+String(remaining))
      return true
    }
    const fresh = await whapiChannelSnapshot(db,channelId,userId)
    const freshSettings = fresh.settings || {}
    // A newer 402 pause may have been written concurrently; do not undo it.
    if(freshSettings.whapi_pause?.paused_at !== pause.paused_at) return true
    const {whapi_pause:_removed,...rest} = freshSettings
    const {error: clearError}= await db.from("flow_channels")
      .update({settings:rest})
      .eq("id",channelId).eq("user_id",userId)
    if(clearError) throw new Error(clearError.message)
    console.log("Mavuri Whapi quota available: circuit resumed by GET /limits")
    return false
  } catch(err) {
    console.warn("Mavuri Whapi quota check inconclusive; keep paused: "+(err instanceof Error ? err.message : String(err)))
    return true
  }
}

async function processWhapiCouponJobs(db: any, token: string) {
  const counters={sent:0,failed:0,retried:0,skipped:0}
  if(!token)return counters
  const now=new Date().toISOString()
  const q=await db.from("flow_whapi_coupon_jobs")
    .select("*, channel:flow_channels(id,type,status,external_ref)")
    .eq("status","queued").lte("scheduled_for",now)
    .order("created_at",{ascending:true}).order("part_index",{ascending:true})
    .limit(6)
  if(q.error){console.error("Whapi coupon queue select:",q.error.message);return counters}
  for(const job of q.data||[]){
    try{
      const prior=await db.from("flow_whapi_coupon_jobs").select("id")
        .eq("bundle_key",job.bundle_key).eq("channel_id",job.channel_id)
        .lt("part_index",job.part_index).neq("status","sent").limit(1)
      if(prior.error)throw new Error(prior.error.message)
      // Always deliver earlier parts before a continuation.
      if(prior.data?.length){counters.skipped++;continue}
      const claimed=await db.from("flow_whapi_coupon_jobs")
        .update({status:"processing",attempts:Number(job.attempts||0)+1,error_message:null})
        .eq("id",job.id).eq("status","queued").select("id").maybeSingle()
      if(claimed.error)throw new Error(claimed.error.message)
      if(!claimed.data)continue
      const channel=Array.isArray(job.channel)?job.channel[0]:job.channel
      if(channel?.type!=="whatsapp"||channel.status!=="connected"||!/^[0-9]+@g\.us$/.test(String(channel.external_ref||"")))
        throw new Error("Grupo WhatsApp não está conectado ou é inválido.")
      if(await whapiQuotaIsPaused(db,channel.id,job.user_id,token)) {
        await db.from("flow_whapi_coupon_jobs")
          .update({status:"queued",scheduled_for:new Date(Date.now()+WHAPI_PAUSE_CHECK_INTERVAL_MS).toISOString(),error_message:"Whapi quota paused"})
          .eq("id",job.id).eq("status","processing")
        counters.skipped++
        continue
      }
      const text=whatsappFromTelegramHtml(job.body)
      const kind=job.kind==="image"&&job.media?"image":"text"
      const payload=kind==="image"
        ? {to:channel.external_ref,media:job.media,caption:text}
        : {to:channel.external_ref,body:text}
      const response=await whapiPost(kind,payload,token)
      if(!response.success){
        if(response.status===402){
          await setWhapiQuotaPause(db,channel.id,job.user_id,"HTTP 402: "+response.error)
          await db.from("flow_whapi_coupon_jobs")
            .update({status:"queued",scheduled_for:new Date(Date.now()+WHAPI_PAUSE_CHECK_INTERVAL_MS).toISOString(),error_message:"Whapi quota paused: "+response.error})
            .eq("id",job.id).eq("status","processing")
          counters.skipped++
          continue
        }
        const retryable=response.status===429 && Number(job.attempts||0)<3
        const retryAt=new Date(Date.now()+60*60*1000).toISOString()
        await db.from("flow_whapi_coupon_jobs").update({
          status:retryable?"queued":"failed",scheduled_for:retryable?retryAt:now,
          error_message:"Whapi HTTP "+response.status+": "+response.error
        }).eq("id",job.id).eq("status","processing")
        if(retryable)counters.retried++;else counters.failed++
        continue
      }
      const messageId=String(response.data?.message?.id||response.data?.sent_message?.id||response.data?.id||"")
      const updated=await db.from("flow_whapi_coupon_jobs").update({
        status:"sent",external_message_id:messageId,sent_at:new Date().toISOString(),error_message:null
      }).eq("id",job.id).eq("status","processing")
      if(updated.error)console.error("Whapi coupon receipt:",updated.error.message)
      counters.sent++
    }catch(cause){
      const reason=cause instanceof Error?cause.message:String(cause)
      console.error("Whapi coupon delivery:",reason)
      // Ambiguous network failures must NOT retry automatically: the message may have arrived.
      await db.from("flow_whapi_coupon_jobs")
        .update({status:"failed",error_message:reason}).eq("id",job.id).eq("status","processing")
      counters.failed++
    }
  }
  return counters
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  })
}

function isSecretKey(value: string) {
  return Object.values(secretKeys).some((key) => key && key === value)
}

async function isSchedulerRequest(authorization: string | null) {
  if (!authorization) return false
  const prefix = "Bearer "
  if (!authorization.startsWith(prefix)) return false
  const secret = authorization.slice(prefix.length)
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))
  const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
  return hash === SCHEDULER_SECRET_SHA256
}

function retryDelayMinutes(attempts: number) {
  return BACKOFF_MINUTES[Math.min(Math.max(attempts - 1, 0), BACKOFF_MINUTES.length - 1)]
}

const TITLE_PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcasaco\s+de?\s*couro\s+masculina\s+forrada\b/gi, "Casaco de Couro Masculino Forrado"],
  [/\bcasaco\s+couro\s+masculina\s+forrada\b/gi, "Casaco de Couro Masculino Forrado"],
  [/\bcadeira\s+de\s+escritorio\b/gi, "Cadeira de Escritório"],
  [/\bmasculina\b/gi, "Masculino"],
  [/\bescritorio\b/gi, "escritório"],
  [/\bergonomica\b/gi, "ergonômica"],
  [/\bergonomico\b/gi, "ergonômico"],
  [/\beletrica\b/gi, "elétrica"],
  [/\beletrico\b/gi, "elétrico"],
  [/\bprotetor\s+solar\b/gi, "Protetor Solar"]
];

const TITLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bsmart\s+tv\b/gi, "Smart TV"], [/\btv\b/gi, "TV"], [/\bled\b/gi, "LED"],
  [/\bfull\s+hd\b/gi, "Full HD"], [/\bhdmi\b/gi, "HDMI"], [/\busb\b/gi, "USB"],
  [/\bwi[\s-]*fi\b/gi, "Wi-Fi"], [/\bbluetooth\b/gi, "Bluetooth"], [/\b4k\b/gi, "4K"],
  [/\b8k\b/gi, "8K"], [/\bqled\b/gi, "QLED"], [/\bamoled\b/gi, "AMOLED"],
  [/\b60hz\b/gi, "60Hz"], [/\b120hz\b/gi, "120Hz"], [/\b180hz\b/gi, "180Hz"],
  [/\bml\b/gi, "ml"], [/\bl\b/gi, "L"], [/\bkg\b/gi, "kg"], [/\bgb\b/gi, "GB"],
  [/\bmb\b/gi, "MB"], [/\bmah\b/gi, "mAh"], [/\baoc\b/gi, "AOC"],
  [/\bbuba\b/gi, "Buba"], [/\bsamsung\b/gi, "Samsung"], [/\biphone\b/gi, "iPhone"],
  [/\bgalaxy\b/gi, "Galaxy"], [/\bleao\b/gi, "Leão"], [/\beletrica\b/gi, "elétrica"],
  [/\beletrico\b/gi, "elétrico"], [/\bhermetico\b/gi, "hermético"], [/\bhermetica\b/gi, "hermética"],
  [/\brefeicoes\b/gi, "refeições"], [/\bsodio\b/gi, "sódio"], [/\bpre\s*[- ]?treino\b/gi, "PRÉ-TREINO"]
];

function normalizeTitle(value: unknown) {
  let title = String(value || "").replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of TITLE_PHRASE_REPLACEMENTS) title = title.replace(pattern, replacement);
  for (const [pattern, replacement] of TITLE_REPLACEMENTS) title = title.replace(pattern, replacement);
  title = title.replace(/\b(De|Do|Da|Dos|Das|E|Para|Com|Sem|Em|No|Na|Nos|Nas|Por|Ao|Aos)\b/g, (match) => match.toLowerCase());
  title = title.replace(/\s+/g, " ").trim();
  return title;
}

const CATEGORY_RULES: Array<{ emoji: string; name: string; patterns: RegExp[] }> = [
  { emoji: "👶", name: "infantil", patterns: [/\binfantil\b/i, /\bbeb[eê]\b/i, /\bcrian[cç]a/i, /\bbrinquedo/i, /\bboneca/i, /\bboneco/i, /\bbuba\b/i, /\bmamadeira/i, /\bfralda/i, /\bchupeta/i] },
  { emoji: "💪", name: "suplementos", patterns: [/\bsuplement/i, /\bwhey\b/i, /\bcreatina\b/i, /\bpr[eé][ -]?treino\b/i, /\bhipercal[oó]rico/i, /\bvitamina/i, /\bprote[ií]na/i, /\btermog[eê]nico/i] },
  { emoji: "🔧", name: "ferramentas", patterns: [/\bferrament/i, /\bsoquete/i, /\bcatraca/i, /\bchave(s)?\b/i, /\balicate/i, /\bfuradeira/i, /\bparafusadeira/i, /\bserra\b/i, /\bmartelete/i, /\btorqu[ií]metro/i, /\bmult[ií]metro/i] },
  { emoji: "💄", name: "beleza", patterns: [/\bmaquiagem/i, /\bpincel(es)?\s+de\s+maquiagem/i, /\bbatom/i, /\bgloss/i, /\br[ií]mel/i, /\bbase\s+facial/i, /\bcorretivo/i, /\bsombra/i, /\bblush/i, /\bperfume/i, /\bcosm[eé]tico/i, /\bskincare/i, /\bprotetor\s+solar/i] },
  { emoji: "👕", name: "roupas", patterns: [/\bjaqueta/i, /\bcamiseta/i, /\bcamisa\b/i, /\bcal[cç]a/i, /\bvestido/i, /\bblusa/i, /\bshort/i, /\bbermuda/i, /\bmoletom/i, /\bt[eê]nis/i, /\bsapato/i, /\bsand[aá]lia/i, /\bchinelo/i, /\bmeia(s)?\b/i, /\broupa/i] },
  { emoji: "📺", name: "eletrônicos", patterns: [/\bsmart\s*tv\b/i, /\btelevis[aã]o/i, /\btv\b/i, /\bcelular/i, /\bsmartphone/i, /\btablet/i, /\bnotebook/i, /\blaptop/i, /\bmonitor/i, /\bteclado/i, /\bmouse\b/i, /\bfone(s)?\b/i, /\bheadphone/i, /\bc[aâ]mera/i, /\bimpressora/i, /\broteador/i, /\bvideogame/i, /\bconsole/i, /\bsmartwatch/i, /\bcaixa de som/i, /\bsoundbar/i, /\bdrone/i] },
  { emoji: "🍳", name: "cozinha", patterns: [/\bchaleira/i, /\bpanela/i, /\bfrigideira/i, /\bair\s*fryer/i, /\bliquidificador/i, /\bmixer\b/i, /\bcafeteira/i, /\bforno/i, /\bmarmita/i, /\bpote(s)?\b/i, /\bgarrafa/i, /\bgarrafinha/i, /\bcaneca/i, /\bcopo/i, /\btalher/i, /\bprato/i, /\btravessa/i, /\bassadeira/i] },
  { emoji: "🏠", name: "casa", patterns: [/\bcasa\b/i, /\blimpeza/i, /\balvejante/i, /\btira\s+manchas/i, /\bpercarbonato/i, /\borganizador/i, /\bbanheiro/i, /\bquarto/i, /\bcama\b/i, /\bsof[aá]/i, /\bcortina/i, /\btapete/i, /\bdecora[cç][aã]o/i, /\bjardim/i, /\bpapel\s+de\s+parede/i, /\brevestimento/i, /\bm[aá]rmore/i, /\bmadeira/i, /\bripa/i] },
];

function classifyProduct(title: unknown) {
  const normalized = normalizeTitle(title);
  return CATEGORY_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(normalized))) || { emoji: "🛍️", name: "ofertas" };
}

function retryableError(message: string) {
  return ![
    "Canal Telegram inválido ou não encontrado.",
    "O canal não possui Chat ID.",
    "Segredo TELEGRAM_BOT_TOKEN não configurado no Edge Function.",
    "A oferta não possui um link de destino válido.",
    "Segredo WHAPI_TOKEN não configurado no Edge Function.",
    "Identificador do grupo WhatsApp inválido.",
  ].includes(message)
}

function makeClient(authorization: string | null, serviceToService: boolean) {
  if (serviceToService) {
    const secretKey = Object.values(secretKeys).find((key): key is string => typeof key === "string" && key.length > 0)
    if (!secretKey) throw new Error("Nenhuma secret key do Supabase está disponível no worker.")
    return createClient(supabaseUrl, secretKey)
  }

  if (!authorization) throw new Error("Authentication required")
  return createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } }
  })
}

// Cloud-only fail-closed delivery-hour gate. Calls a service-only DB RPC.
// Existing local/ML/Magalu/WhatsApp/manual jobs do not use this path.
async function shopeeCloudWindowOpen(db: any): Promise<boolean> {
  try {
    const {data,error}=await db.rpc("mavuri_shopee_cloud_delivery_allowed");
    return !error && data===true;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405)

  const authorization = req.headers.get("authorization")
  const apiKey = req.headers.get("apikey") || ""
  const schedulerRequest = await isSchedulerRequest(authorization)
  const serviceToService = schedulerRequest || isSecretKey(apiKey)

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
  const whapiToken = Deno.env.get("WHAPI_TOKEN") || ""

  if (botToken) {
    try {
      const webhookResponse = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
      const webhookPayload = await webhookResponse.json()
      console.log("Mavuri Telegram webhook:", JSON.stringify(webhookPayload?.result || {}))
    } catch (error) {
      console.error("Mavuri Telegram getWebhookInfo falhou:", error instanceof Error ? error.message : String(error))
    }

    try {
      const updatesResponse = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=20&timeout=0`)
      const updatesPayload = await updatesResponse.json()
      const channelCandidates = Array.isArray(updatesPayload?.result)
        ? updatesPayload.result.map((u: any) => {
            const forwardChat = u?.message?.forward_origin?.chat ?? u?.message?.forward_from_chat ?? null
            const chat = u?.channel_post?.chat ?? forwardChat ?? u?.message?.chat ?? null
            return {
              update_id: u?.update_id || null,
              chat_id: chat?.id ?? null,
              chat_title: chat?.title ?? null,
              chat_type: chat?.type ?? null
            }
          }).filter((x: any) => x.chat_id)
        : []

      const feminineChannel = [...channelCandidates].reverse().find((x: any) =>
        x.chat_type === "channel" &&
        String(x.chat_title || "").trim().toLocaleLowerCase("pt-BR") === "mavuri feminino"
      )

      if (feminineChannel) {
        const secretKey = Object.values(secretKeys).find((key): key is string => typeof key === "string" && key.length > 0)
        if (secretKey) {
          const adminClient = createClient(supabaseUrl, secretKey)
          const { error: linkError } = await adminClient
            .from("flow_channels")
            .update({
              external_ref: String(feminineChannel.chat_id),
              status: "connected",
              settings: { purpose: "niche_validation", taxonomy: "feminino", linked_via: "telegram_forward" }
            })
            .eq("name", "Mavuri Feminino")
            .eq("status", "pending")
          if (linkError) console.error("Mavuri Telegram: falha ao vincular canal feminino:", linkError.message)
          else console.log("Mavuri Telegram: canal feminino vinculado.")
        }
      }
    } catch (error) {
      console.error("Mavuri Telegram getUpdates falhou:", error instanceof Error ? error.message : String(error))
    }
  }

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
    .limit(Math.max(limit * 5, 50))
  if (userId) jobsQuery = jobsQuery.eq("user_id", userId)

  const { data: jobs, error: jobsError } = await jobsQuery
  if (jobsError) return json({ error: jobsError.message }, 500)

  let processed = 0
  let sent = 0
  let retried = 0
  let failed = 0
  const results: unknown[] = []

  for (const job of jobs || []) {
    if(processed>=limit) break
    const queuedChannel = Array.isArray(job.channel) ? job.channel[0] : job.channel
    if(queuedChannel?.type==="whatsapp" && whapiToken) {
      if(Date.now()-Date.parse(String(job.created_at))>WHAPI_OFFER_MAX_AGE_MS &&
         !Number.isNaN(Date.parse(String(job.created_at)))) {
        await supabase.from("flow_delivery_jobs")
          .update({status:"failed",error_message:"Whapi offer expired in quota pause (>12h); not resent"})
          .eq("id",job.id).eq("status","queued")
        continue
      }
      if(await whapiQuotaIsPaused(supabase,queuedChannel.id,job.user_id,whapiToken)) {
        await supabase.from("flow_delivery_jobs")
          .update({scheduled_for:new Date(Date.now()+WHAPI_PAUSE_CHECK_INTERVAL_MS).toISOString(),error_message:"Whapi quota paused; queued without sending"})
          .eq("id",job.id).eq("status","queued")
        continue
      }
    }
    if (String(job.delivery_key || "").startsWith("shopee-cloud:") &&
        !(await shopeeCloudWindowOpen(supabase))) continue;
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
    const providerName = job.channel?.type === "whatsapp" ? "whapi" : "telegram"

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
      if (!channel || !["telegram", "whatsapp"].includes(channel.type)) throw new Error("Canal de distribuição inválido ou não encontrado.")
      if (!channel.external_ref) throw new Error("Canal sem identificador de destino.")
      if (channel.type === "telegram" && !botToken) throw new Error("Segredo TELEGRAM_BOT_TOKEN não configurado no Edge Function.")
      if (channel.type === "whatsapp" && !whapiToken) throw new Error("Segredo WHAPI_TOKEN não configurado no Edge Function.")
      if (channel.type === "whatsapp" && !/^[0-9]+@g\.us$/.test(String(channel.external_ref))) throw new Error("Identificador do grupo WhatsApp inválido.")

      const price = Number(offer?.price || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      const old = Number(offer?.previous_price || 0)
      const discount = Number(offer?.discount_percent || 0)
      const pricing = (offer?.metadata?.pricing || {}) as Record<string, unknown>
      const matchedCouponCode = String(pricing.coupon_code || "").trim()
      const matchedBasePrice = Number(pricing.base_price || 0)
      const matchedFinalPrice = Number(pricing.final_price || 0)
      const matchedCouponSavings = Number(pricing.coupon_savings || 0)
      const hasMatchedCoupon =
        Boolean(matchedCouponCode) &&
        matchedBasePrice > 0 &&
        matchedFinalPrice > 0 &&
        matchedFinalPrice <= matchedBasePrice
      const matchedBasePriceText = matchedBasePrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      const matchedSavingsText = matchedCouponSavings > 0
        ? matchedCouponSavings.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : ""
      const escapeHtml = (value: unknown) => String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")
      const destination = String(offer?.affiliate_url || offer?.product_url || "")
      let destinationUrl: URL
      try {
        destinationUrl = new URL(destination)
      } catch {
        throw new Error("A oferta não possui um link de destino válido.")
      }
      if (!["http:", "https:"].includes(destinationUrl.protocol)) throw new Error("A oferta não possui um link de destino válido.")

      // Telegram usa diretamente o link de afiliado.
      // Métricas de clique/conversão poderão ser obtidas pelo Mercado Livre.
      const shipping = offer?.metadata?.shipping
      const freeShipping = shipping?.free_shipping === true || shipping?.freeShipping === true
      const displayTitle = normalizeTitle(offer?.title)
      const category = classifyProduct(displayTitle)

      // Marketing de republicação por queda real de preço:
      // compara com o último preço efetivamente enviado deste produto neste canal.
      let priceDropCallout = ""
      let priceDropDetail = ""
      let priceDropMeta: Record<string, unknown> | null = null
      try {
        const { data: lastSent } = await supabase
          .from("flow_delivery_logs")
          .select("metadata,created_at")
          .eq("offer_id", job.offer_id)
          .eq("channel_id", job.channel_id)
          .eq("status", "sent")
          .neq("delivery_job_id", job.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        const previousPublishedPrice = Number(lastSent?.metadata?.offer_snapshot?.price || 0)
        const currentPublishedPrice = Number(offer?.price || 0)
        const priceDropPct =
          previousPublishedPrice > 0 && currentPublishedPrice > 0 && currentPublishedPrice < previousPublishedPrice
            ? ((previousPublishedPrice - currentPublishedPrice) / previousPublishedPrice) * 100
            : 0

        if (priceDropPct >= 5) {
          if (priceDropPct >= 20) priceDropCallout = "🤯 <b>DESPENCOU! OLHA ESSE PREÇO AGORA</b>"
          else if (priceDropPct >= 10) priceDropCallout = "🚨 <b>CAIU MAIS AINDA!</b>"
          else priceDropCallout = "🔥 <b>O PREÇO CAIU DE NOVO!</b>"

          priceDropDetail =
            `Antes: <s>${previousPublishedPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</s> → Agora: <b>${currentPublishedPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b>`

          priceDropMeta = {
            previous_published_price: previousPublishedPrice,
            current_price: currentPublishedPrice,
            drop_pct: Number(priceDropPct.toFixed(2)),
            tier: priceDropPct >= 20 ? "despencou" : priceDropPct >= 10 ? "caiu_mais" : "caiu_de_novo"
          }
        }
      } catch (priceDropError) {
        console.warn("Mavuri: falha não crítica ao calcular destaque de queda de preço:", priceDropError instanceof Error ? priceDropError.message : String(priceDropError))
      }

      const isMagalu = Boolean(offer?.metadata?.magalu)
      const isAmazon = Boolean(offer?.metadata?.amazon) ||
        destinationUrl.hostname === "amazon.com.br" ||
        destinationUrl.hostname.endsWith(".amazon.com.br")
      const installments = String(offer?.metadata?.magalu?.installments || "").trim()

      // Amazon direct publications bypass the Telegram worker, but their
      // independently queued WhatsApp mirror must retain affiliate disclosure.
      // Link and tracking tag are always preserved from the saved offer.
      if (isAmazon && !destinationUrl.searchParams.get("tag")) {
        throw new Error("Oferta Amazon sem tag de afiliado verificada; envio bloqueado.")
      }
      const amazonDisclosure = String(offer?.metadata?.disclosure ||
        "#pub | Como associado da Amazon, ganho com compras qualificadas.")

      const messageLines = isAmazon
        ? [
            priceDropCallout,
            priceDropDetail,
            "🛍️ <b>OFERTA AMAZON</b>",
            `📦 <b>${escapeHtml(displayTitle)}</b>`,
            discount > 0 ? `🔥 <b>${discount.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% OFF</b>` : "",
            old > Number(offer?.price || 0) * 1.05
              ? `De: <s>${old.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</s>` : "",
            `💰 <b>${price}</b>`,
            `👉 <a href="${escapeHtml(destinationUrl.toString())}"><b>VER NA AMAZON</b></a>`,
            `🔗 ${escapeHtml(destinationUrl.toString())}`,
            escapeHtml(amazonDisclosure),
            "⚠️ Preço e disponibilidade podem mudar a qualquer momento."
          ].filter(Boolean)
        : isMagalu
        ? [
            priceDropCallout,
            priceDropDetail,
            "💙 <b>OFERTA MAGALU</b>",
            "",
            `📦 <b>${escapeHtml(displayTitle)}</b>`,
            discount > 0 ? `🔥 <b>${discount.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% OFF</b>` : "",
            old > Number(offer?.price || 0) ? `De: <s>${old.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</s>` : "",
            `💰 <b>${price}</b>`,
            installments ? `💳 ${escapeHtml(installments)}` : "",
            offer?.coupon ? `🎟️ Cupom: <code>${escapeHtml(offer.coupon)}</code>` : "",
            freeShipping ? "🚚 <b>Frete grátis</b>" : "",
            "",
            `👉 <a href="${escapeHtml(destinationUrl.toString())}"><b>VER NO MAGALU</b></a>`,
            `🔗 ${escapeHtml(destinationUrl.toString())}`,
            "",
            "⚠️ Preço e disponibilidade podem mudar a qualquer momento."
          ].filter(Boolean)
        : [
            priceDropCallout,
            priceDropDetail,
            priceDropCallout ? "" : "",
            `${category.emoji} <b>${escapeHtml(displayTitle)}</b>`,
            discount > 0 ? `🔥 <b>${discount.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% OFF</b>` : "",
            old > Number(offer?.price || 0) ? `De: <s>${old.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</s>` : "",
            hasMatchedCoupon ? `💵 Preço da oferta: <b>${matchedBasePriceText}</b>` : `💰 <b>${price}</b>`,
            hasMatchedCoupon
              ? `🎟️ Cupom: <code>${escapeHtml(matchedCouponCode)}</code>${matchedSavingsText ? ` (economiza ${matchedSavingsText})` : ""}`
              : (offer?.coupon ? `🎟️ Cupom: <b>${escapeHtml(offer.coupon)}</b>` : ""),
            hasMatchedCoupon ? `💰 <b>COM CUPOM: ${price}</b>` : "",
            hasMatchedCoupon ? "ℹ️ Cupom sujeito à elegibilidade e disponibilidade no Mercado Livre." : "",
            freeShipping ? "🚚 <b>Frete grátis</b>" : "",
            "",
            `👉 <a href="${escapeHtml(destinationUrl.toString())}"><b>COMPRAR AGORA</b></a>`,
            `🔗 ${escapeHtml(destinationUrl.toString())}`
          ].filter(Boolean)
      const text = messageLines.join("\n")

      const imageUrl = /^https?:\/\//i.test(String(offer?.image_url || "").trim())
        ? String(offer.image_url).trim()
        : ""
      let externalMessageId = ""
      let sendMode = "text"
      let mediaDiagnostics: Record<string, unknown> | null = null
      if (channel.type === "telegram") {
        const telegramMethod = imageUrl ? "sendPhoto" : "sendMessage"
        const telegramCaption = text.length > 1024 ? text.slice(0, 1000) + "…" : text
        const telegramBody = imageUrl
          ? { chat_id: channel.external_ref, photo: imageUrl, caption: telegramCaption, parse_mode: "HTML" }
          : { chat_id: channel.external_ref, text, parse_mode: "HTML", disable_web_page_preview: true }
        let response: Response
        try {
          if (String(job.delivery_key || "").startsWith("shopee-cloud:") &&
              !(await shopeeCloudWindowOpen(supabase))) {
            const postponed=await supabase.from("flow_delivery_jobs")
              .update({status:"queued",
                scheduled_for:new Date(Date.now()+15*60*1000).toISOString(),
                error_message:"Aguardando janela Shopee Cloud 08:00-22:00 BRT"})
              .eq("id",job.id).eq("status","processing").select("id").maybeSingle()
            if(postponed.error || !postponed.data)
              throw new Error("Falha ao adiar publicação Shopee Cloud fora da janela.")
            continue
          }
          response = await fetch("https://api.telegram.org/bot" + botToken + "/" + telegramMethod, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(telegramBody)
          })
        } catch (cause) {
          throw new Error("Falha de rede ao chamar Telegram: " + (cause instanceof Error ? cause.message : String(cause)))
        }
        const telegram = await response.json()
        if (!response.ok || !telegram.ok) {
          const error = new Error(telegram?.description || "Telegram HTTP " + response.status)
          ;(error as Error & { retryable?: boolean }).retryable = response.status === 429 || response.status >= 500
          throw error
        }
        externalMessageId = String(telegram.result?.message_id || "")
        sendMode = imageUrl ? "photo" : "text"
      } else {
        const isManualTest = String(job.delivery_key || "").startsWith("whapi-manual-test:")
        const prefix = isManualTest
          ? "🧪 *TESTE DE PUBLICAÇÃO MAVURI*\nPreço registrado anteriormente; confirme os valores no site.\n\n"
          : ""
        let whatsappText = prefix + whatsappFromTelegramHtml(text)
        const originalCaptionLength = whatsappText.length
        let captionCompacted = false
        let fallbackReason: string | null = imageUrl ? null : "missing_image"
        let firstImageHttpStatus: number | null = null
        let base64ImageHttpStatus: number | null = null
        let imageRelayFailure: string | null = null
        let imageSource = imageUrl ? "url" : "none"

        if(imageUrl && whatsappText.length > WHAPI_MAX_IMAGE_CAPTION_LENGTH) {
          const condensed = compactWhapiOfferCaption({
            title:displayTitle,
            affiliateUrl:destinationUrl.toString(),
            isMagalu,
            price,
            currentPrice:Number(offer?.price || 0),
            previousPrice:old,
            discount,
            coupon:hasMatchedCoupon ? matchedCouponCode : String(offer?.coupon || ""),
            matchedCoupon:hasMatchedCoupon,
            matchedBasePriceText,
            freeShipping
          })
          if(condensed && (prefix + condensed).length <= WHAPI_MAX_IMAGE_CAPTION_LENGTH) {
            whatsappText = prefix + condensed
            captionCompacted = true
          } else {
            fallbackReason = "caption_exceeds_limit_with_full_affiliate_link"
          }
        }

        let route: "image" | "text" =
          imageUrl && whatsappText.length <= WHAPI_MAX_IMAGE_CAPTION_LENGTH ? "image" : "text"
        let result = await whapiPost(
          route,
          route === "image"
            ? { to: channel.external_ref, media: imageUrl, caption: whatsappText }
            : { to: channel.external_ref, body: whatsappText },
          whapiToken
        )

        // Retry with Base64 only after Whapi explicitly refuses the original image URL.
        // Do not retry an ambiguous network timeout or a rate-limit response: a
        // second send could cause duplicates or consume unnecessary trial quota.
        if(!result.success && route === "image" && [400,415,422].includes(result.status)) {
          firstImageHttpStatus = result.status
          const replacement = await whapiMagaluImageAsBase64(imageUrl)
          imageRelayFailure = replacement.failure
          if(replacement.dataUri) {
            console.warn("Mavuri Whapi: tentando imagem Magalu via Base64 após HTTP " + firstImageHttpStatus)
            imageSource = "base64_retry"
            result = await whapiPost("image",
              {to:channel.external_ref, media:replacement.dataUri, caption:whatsappText},
              whapiToken
            )
            base64ImageHttpStatus = result.status
          }

          // Only a definite second image refusal (or no safe Base64 option)
          // permits a single fallback-to-text message.
          if(!result.success && [400,415,422].includes(result.status)) {
            fallbackReason = "image_rejected_after_safe_retry"
            console.warn("Mavuri Whapi: envio de imagem recusado, usando texto; HTTP " + result.status +
              (imageRelayFailure ? "; relay=" + imageRelayFailure : ""))
            route = "text"
            result = await whapiPost("text", {to:channel.external_ref,body:whatsappText},whapiToken)
          }
        }
        if(!result.success) {
          const error = new Error("Whapi HTTP " + result.status + ": " + result.error)
          // Only a definite rate-limit response is safe to retry automatically.
          ;(error as Error & {retryable?: boolean}).retryable = result.status === 429
          throw error
        }
        externalMessageId = String(result.data?.message?.id || result.data?.sent_message?.id || result.data?.id || "")
        sendMode = route
        mediaDiagnostics = {
          image_present: Boolean(imageUrl),
          image_source: imageSource,
          fallback_reason: route === "text" ? (fallbackReason || "text_without_image") : null,
          caption_compacted: captionCompacted,
          caption_length: whatsappText.length,
          original_caption_length: originalCaptionLength,
          initial_image_http_status: firstImageHttpStatus,
          base64_image_http_status: base64ImageHttpStatus,
          image_relay_failure: imageRelayFailure
        }
      }

      const { error: deliveryLogError } = await supabase.from("flow_delivery_logs").insert({
        user_id: job.user_id,
        delivery_job_id: job.id,
        offer_id: job.offer_id,
        channel_id: job.channel_id,
        status: "sent",
        external_message_id: externalMessageId,
        metadata: { provider: providerName, attempt: nextAttempt, send_mode: sendMode, price_drop_callout: priceDropMeta, ...(mediaDiagnostics ? { media_diagnostics: mediaDiagnostics } : {}) }
      })
      if (deliveryLogError) throw new Error("Falha ao registrar entrega confirmada: " + deliveryLogError.message)

      const { error: sentUpdateError } = await supabase.from("flow_delivery_jobs")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
        .eq("id", job.id)
        .eq("status", "processing")
      if (sentUpdateError) throw new Error("Falha ao finalizar job entregue: " + sentUpdateError.message)


      // Fan-out: the WhatsApp group receives its own independent delivery job.
      // This is idempotent and cannot change the status of a successful Telegram post.
      if (channel.type === "telegram" && whapiToken) {
        const { data: mirrors, error: lookupError } = await supabase
          .from("flow_channels")
          .select("id")
          .eq("user_id", job.user_id)
          .eq("type", "whatsapp")
          .eq("status", "connected")
          .contains("settings", { mirror_telegram_channel_id: channel.id })
        if (lookupError) {
          console.error("Mavuri WhatsApp: falha ao localizar espelhos:", lookupError.message)
        } else {
          for (const mirror of mirrors || []) {
            // A manual publication can already include this WhatsApp group directly.
            // Never mirror the same offer to a destination that already has a job,
            // regardless of the original delivery_key or delivery status.
            const { data: existing, error: existingError } = await supabase
              .from("flow_delivery_jobs")
              .select("id")
              .eq("user_id", job.user_id)
              .eq("offer_id", job.offer_id)
              .eq("channel_id", mirror.id)
              .limit(1)
            if (existingError) {
              console.error("Mavuri WhatsApp: falha ao verificar envio existente:", existingError.message)
              continue
            }
            if (existing?.length) continue
            const { error: enqueueError } = await supabase.from("flow_delivery_jobs").upsert({
              user_id: job.user_id,
              offer_id: job.offer_id,
              channel_id: mirror.id,
              status: "queued",
              attempts: 0,
              scheduled_for: new Date().toISOString(),
              delivery_key: "whapi-mirror:" + job.id + ":" + mirror.id
            }, { onConflict: "user_id,delivery_key", ignoreDuplicates: true })
            if (enqueueError) console.error("Mavuri WhatsApp: falha ao enfileirar oferta:", enqueueError.message)
          }
        }
      }

      sent += 1
      results.push({ id: job.id, status: "sent", attempts: nextAttempt })
    } catch (error) {
      if (trackingId) {
        const { error: cleanupError } = await supabase.from("flow_clicks").delete().eq("tracking_id", trackingId)
        if (cleanupError) console.error("Falha ao limpar tracking após erro de entrega:", cleanupError.message)
      }

      const message = error instanceof Error ? error.message : String(error)
      if(providerName==="whapi" && /^Whapi HTTP 402:/.test(message)) {
        try {
          await setWhapiQuotaPause(supabase,job.channel_id,job.user_id,message)
          const nextCheck=new Date(Date.now()+WHAPI_PAUSE_CHECK_INTERVAL_MS).toISOString()
          const {error: queuedError}=await supabase.from("flow_delivery_jobs")
            .update({status:"queued",scheduled_for:nextCheck,error_message:"Whapi quota paused: "+message})
            .eq("id",job.id).eq("status","processing")
          if(queuedError) throw new Error(queuedError.message)
          await supabase.from("flow_delivery_logs").insert({
            user_id:job.user_id,delivery_job_id:job.id,offer_id:job.offer_id,
            channel_id:job.channel_id,status:"retry",
            metadata:{provider:"whapi",attempt:nextAttempt,reason:"quota_paused_402",next_attempt_at:nextCheck,error:message}
          })
          retried++
          results.push({id:job.id,status:"quota_paused",attempts:nextAttempt,next_attempt_at:nextCheck})
        } catch(quotaError) {
          console.error("Whapi quota pause persistence failed; job remains processing for recovery: "+
            (quotaError instanceof Error ? quotaError.message : String(quotaError)))
          results.push({id:job.id,status:"pause_state_error",error:message})
        }
        continue
      }
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
          metadata: { provider: providerName, attempt: nextAttempt, next_attempt_at: scheduledFor, error: message }
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
          metadata: { provider: providerName, attempt: nextAttempt, error: message }
        })
        if (failedLogError) console.error("Falha ao registrar falha de entrega:", failedLogError.message)

        failed += 1
        results.push({ id: job.id, status: "failed", attempts: nextAttempt, error: message })
      }
    }
  }

  // Coupon mirrors are independent of the Telegram offer worker and run only on the authorized scheduler.
  const coupon_mirror = serviceToService ? await processWhapiCouponJobs(supabase,whapiToken) : null
  return json({ ok: true, mode: serviceToService ? "scheduled" : "user", processed, sent, retried, failed, coupon_mirror, results })
})

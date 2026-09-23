import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")
const publishableKey = publishableKeys.default || ""

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store"
}

function absoluteUrl(value: string, base: string) {
  try { return new URL(value, base).toString() } catch { return null }
}

function cleanProductUrl(value: string) {
  try {
    const url = new URL(value)
    if (!/(mercadolivre|mercadolibre)\.com/i.test(url.hostname)) return null
    url.hash = ""
    for (const key of [
      "matt_event_ts","matt_d2id","matt_tracing_id","matt_tool_id",
      "reco_backend","reco_client","reco_item_pos","source","tracking_id",
      "c_id","c_uid","reco_id","sid","wid"
    ]) url.searchParams.delete(key)
    return url.toString()
  } catch { return null }
}

function extractItemId(value: string) {
  const match = String(value || "").match(/MLB[-_]?([0-9]{6,})/i)
  return match ? `MLB${match[1]}`.toUpperCase() : null
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
}

function stripTags(value: string) {
  return decodeHtml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function findProductLinks(html: string, baseUrl: string) {
  const links: string[] = []
  const hrefPattern = /(?:href|data-href|data-url)\s*=\s*["']([^"']+)["']/gi
  let match: RegExpExecArray | null
  while ((match = hrefPattern.exec(html)) !== null) {
    const url = absoluteUrl(match[1].replaceAll("&amp;", "&"), baseUrl)
    if (!url) continue
    const cleaned = cleanProductUrl(url)
    if (!cleaned) continue
    if (extractItemId(cleaned) || /\/(?:p|up)\//i.test(cleaned)) links.push(cleaned)
  }
  return [...new Set(links)]
}

function extractMoneyAfter(html: string, start: number) {
  const slice = html.slice(start, start + 7000)
  const aria = slice.match(/aria-label=["'](?:[^"']*?)([0-9][0-9.]*)(?: reais)(?: com ([0-9]{2}) centavos)?/i)
  if (aria) {
    const integer = Number(aria[1].replaceAll(".", ""))
    const cents = Number(aria[2] || "0")
    if (Number.isFinite(integer)) return integer + cents / 100
  }

  const fraction = slice.match(/data-andes-money-amount-fraction=["']([^"']+)["']/i)
  if (!fraction) return null
  const cents = slice.match(/data-andes-money-amount-cents=["']([^"']+)["']/i)
  const integer = Number(String(fraction[1]).replaceAll(".", ""))
  const decimal = Number(cents?.[1] || "0")
  return Number.isFinite(integer) ? integer + decimal / 100 : null
}

function extractLandingProduct(html: string, itemId: string, baseUrl: string) {
  const marker = html.toUpperCase().indexOf(itemId.toUpperCase())
  if (marker < 0) return null

  const start = Math.max(0, marker - 5000)
  const end = Math.min(html.length, marker + 8000)
  const window = html.slice(start, end)

  const anchorMatches = [...window.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  const anchor = anchorMatches.find((entry) => extractItemId(entry[1]) === itemId || entry[1].toUpperCase().includes(itemId))
  if (!anchor) return null

  const productUrl = cleanProductUrl(absoluteUrl(decodeHtml(anchor[1]), baseUrl) || "")
  if (!productUrl) return null

  const title = stripTags(anchor[2])
  const anchorPos = window.indexOf(anchor[0])
  const before = window.slice(Math.max(0, anchorPos - 3500), anchorPos)
  const after = window.slice(anchorPos, Math.min(window.length, anchorPos + 6000))

  const imageMatches = [...before.matchAll(/<img\b[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*alt=["']([^"']*)["']/gi)]
  const image = imageMatches.length ? imageMatches[imageMatches.length - 1] : null

  const price = extractMoneyAfter(window, anchorPos)
  const previousMatch = after.match(/(?:Antes:|previous|anterior)[^0-9]{0,80}([0-9][0-9.]*) reais(?: com ([0-9]{2}) centavos)?/i)
  const previousPrice = previousMatch
    ? Number(previousMatch[1].replaceAll(".", "")) + Number(previousMatch[2] || "0") / 100
    : null

  const shipping = /frete\s+gr[aá]tis/i.test(after) ? "free" : null

  return {
    id: itemId,
    title: title || null,
    price: Number.isFinite(price) ? price : null,
    original_price: Number.isFinite(previousPrice) ? previousPrice : null,
    thumbnail: image?.[1] || null,
    permalink: productUrl,
    currency_id: "BRL",
    shipping,
    resolution: "affiliate_landing_html"
  }
}


function extractMeta(html: string, names: string[]) {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)]
  for (const tagMatch of tags) {
    const tag = tagMatch[0]
    const name = tag.match(/(?:name|property)=["']([^"']+)["']/i)?.[1]?.toLowerCase()
    if (!name || !names.some((candidate) => candidate.toLowerCase() === name)) continue
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1]
    if (content) return decodeHtml(content)
  }
  return null
}

function extractJsonLdProduct(html: string, itemId: string | null, fallbackUrl: string) {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1]).trim())
      const roots = Array.isArray(parsed) ? parsed : [parsed]
      for (const root of roots) {
        const candidates = Array.isArray(root?.["@graph"]) ? root["@graph"] : [root]
        for (const product of candidates) {
          if (!product || !/(product|item)/i.test(String(product["@type"] || ""))) continue
          const name = String(product.name || "").trim()
          const image = Array.isArray(product.image) ? product.image[0] : product.image
          const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers
          const price = Number(offer?.price)
          if (!name && !Number.isFinite(price) && !image) continue
          return {
            id: itemId,
            title: name || null,
            price: Number.isFinite(price) ? price : null,
            original_price: null,
            thumbnail: typeof image === "string" ? image : null,
            permalink: cleanProductUrl(String(product.url || fallbackUrl)) || fallbackUrl,
            currency_id: String(offer?.priceCurrency || "BRL"),
            shipping: null,
            resolution: "product_page_jsonld"
          }
        }
      }
    } catch {}
  }
  return null
}

function extractProductPage(html: string, itemId: string | null, productUrl: string) {
  const jsonLd = extractJsonLdProduct(html, itemId, productUrl)
  const title = extractMeta(html, ["og:title", "twitter:title"]) ||
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    null
  const image = extractMeta(html, ["og:image", "twitter:image"])
  const priceMeta = extractMeta(html, ["product:price:amount", "og:price:amount"])
  const currency = extractMeta(html, ["product:price:currency", "og:price:currency"]) || "BRL"

  let price = priceMeta ? Number(priceMeta.replace(",", ".")) : null
  if (!Number.isFinite(price)) price = jsonLd?.price ?? extractMoneyAfter(html, 0)

  const previousMatch = html.match(/(?:Antes:|pre[cç]o\s+anterior|previous_price|old_price)[^0-9]{0,120}([0-9][0-9.]*)[,\.]([0-9]{2})/i)
  const previousPrice = previousMatch
    ? Number(previousMatch[1].replaceAll(".", "")) + Number(previousMatch[2]) / 100
    : jsonLd?.original_price ?? null

  const cleanTitle = title ? stripTags(title) : jsonLd?.title || null
  const cleanImage = image || jsonLd?.thumbnail || null

  if (!cleanTitle && !Number.isFinite(price) && !cleanImage) return null

  return {
    id: itemId,
    title: cleanTitle,
    price: Number.isFinite(price) ? price : null,
    original_price: Number.isFinite(previousPrice) ? previousPrice : null,
    thumbnail: cleanImage,
    permalink: productUrl,
    currency_id: currency,
    shipping: /frete\s+gr[aá]tis/i.test(html) ? "free" : null,
    resolution: "product_page_html"
  }
}

function findProductUrlsInBody(html: string) {
  const urls: string[] = []
  const normalized = html
    .replaceAll("\\/", "/")
    .replaceAll("\\u002F", "/")
    .replaceAll("&amp;", "&")

  const absolutePattern = /https?:\/\/[^"'\s<>]+(?:MLB[-_]?\d{6,})[^"'\s<>]*/gi
  for (const match of normalized.matchAll(absolutePattern)) {
    const cleaned = cleanProductUrl(match[0])
    if (cleaned) urls.push(cleaned)
  }

  for (const match of normalized.matchAll(/MLB[-_]?([0-9]{6,})/gi)) {
    urls.push(`https://www.mercadolivre.com.br/p/MLB${match[1]}`)
  }

  return [...new Set(urls)]
}

async function fetchAffiliate(url: string) {") +
      '["\\\\'][^>]*content=["\\\\']([^"\\\\']+)["\\\\']',
      "i"
    )
    const match = html.match(pattern)
    if (match?.[1]) return decodeHtml(match[1])
  }
  return null
}

function extractJsonLdProduct(html: string, itemId: string | null, fallbackUrl: string) {
  const scripts = [...html.matchAll(/<script\\\\b[^>]*type=["\\\\']application\\\\/ld\\\\+json["\\\\'][^>]*>([\\\\s\\\\S]*?)<\\\\/script>/gi)]
  for (const match of scripts) {
    try {
      const raw = decodeHtml(match[1]).trim()
      const parsed = JSON.parse(raw)
      const nodes = Array.isArray(parsed) ? parsed : [parsed]
      for (const node of nodes) {
        const candidates = Array.isArray(node?.["@graph"]) ? node["@graph"] : [node]
        for (const product of candidates) {
          if (!product || !/(product|item)/i.test(String(product["@type"] || ""))) continue
          const name = String(product.name || "").trim()
          const image = Array.isArray(product.image) ? product.image[0] : product.image
          const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers
          const price = Number(offer?.price)
          if (!name && !Number.isFinite(price) && !image) continue
          return {
            id: itemId,
            title: name || null,
            price: Number.isFinite(price) ? price : null,
            original_price: null,
            thumbnail: typeof image === "string" ? image : null,
            permalink: cleanProductUrl(String(product.url || fallbackUrl)) || fallbackUrl,
            currency_id: String(offer?.priceCurrency || "BRL"),
            shipping: null,
            resolution: "product_page_jsonld"
          }
        }
      }
    } catch {}
  }
  return null
}

function extractProductPage(html: string, itemId: string | null, productUrl: string) {
  const jsonLd = extractJsonLdProduct(html, itemId, productUrl)
  const title = extractMeta(html, ["og:title", "twitter:title"]) ||
    html.match(/<h1\\\\b[^>]*>([\\\\s\\\\S]*?)<\\\\/h1>/i)?.[1] ||
    null
  const image = extractMeta(html, ["og:image", "twitter:image"])
  const priceMeta = extractMeta(html, ["product:price:amount", "og:price:amount"])
  const currency = extractMeta(html, ["product:price:currency", "og:price:currency"]) || "BRL"

  let price = priceMeta ? Number(priceMeta.replace(",", ".")) : null
  if (!Number.isFinite(price)) price = jsonLd?.price ?? extractMoneyAfter(html, 0)

  const previousMatch = html.match(/(?:Antes:|pre[cç]o\\\\s+anterior|previous_price|old_price)[^0-9]{0,120}([0-9][0-9.]*)[,\\\\.]([0-9]{2})/i)
  const previousPrice = previousMatch
    ? Number(previousMatch[1].replaceAll(".", "")) + Number(previousMatch[2]) / 100
    : jsonLd?.original_price ?? null

  const cleanTitle = title ? stripTags(title) : jsonLd?.title || null
  const cleanImage = image || jsonLd?.thumbnail || null

  if (!cleanTitle && !Number.isFinite(price) && !cleanImage) return null

  return {
    id: itemId,
    title: cleanTitle,
    price: Number.isFinite(price) ? price : null,
    original_price: Number.isFinite(previousPrice) ? previousPrice : null,
    thumbnail: cleanImage,
    permalink: productUrl,
    currency_id: currency,
    shipping: /frete\\\\s+gr[aá]tis/i.test(html) ? "free" : null,
    resolution: "product_page_html"
  }
}

function findProductUrlsInBody(html: string, baseUrl: string) {
  const urls: string[] = []
  const normalized = html
    .replaceAll("\\\\/","/")
    .replaceAll("\\\\u002F","/")
    .replaceAll("&amp;","&")
  const absolutePattern = /https?:\\\\/\\\\/[^"'\\\\s<>]+(?:MLB[-_]?\\\\d{6,})[^"'\\\\s<>]*/gi
  for (const match of normalized.matchAll(absolutePattern)) {
    const cleaned = cleanProductUrl(match[0])
    if (cleaned) urls.push(cleaned)
  }

  const idMatches = normalized.matchAll(/MLB[-_]?([0-9]{6,})/gi)
  for (const match of idMatches) {
    urls.push(`https://www.mercadolivre.com.br/p/MLB${match[1]}`)
  }

  return [...new Set(urls)]
}
\nasync function fetchAffiliate(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/json",
      "User-Agent": "Mozilla/5.0 (compatible; MavuriAffiliateResolver/1.0)"
    }
  })
  const finalUrl = response.url || url
  const body = await response.text()
  return { response, finalUrl, body }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405, headers })

  const authorization = req.headers.get("authorization") || ""
  const userClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authorization } } })
  const { data: userData } = await userClient.auth.getUser()
  if (!userData.user) return new Response(JSON.stringify({ error: "Usuário não autenticado." }), { status: 401, headers })

  let payload
  try { payload = await req.json() } catch { return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400, headers }) }
  const affiliateUrl = String(payload?.affiliate_url || "").trim()
  if (!affiliateUrl) return new Response(JSON.stringify({ error: "affiliate_url é obrigatório." }), { status: 400, headers })

  let parsed
  try { parsed = new URL(affiliateUrl) } catch { return new Response(JSON.stringify({ error: "Link de afiliado inválido." }), { status: 400, headers }) }
  if (!/(?:^|\.)meli\.la$/i.test(parsed.hostname) && !/(mercadolivre|mercadolibre)\.com/i.test(parsed.hostname)) {
    return new Response(JSON.stringify({ error: "O link precisa ser do Mercado Livre ou meli.la." }), { status: 400, headers })
  }

  try {
    const first = await fetchAffiliate(affiliateUrl)
    const candidates: string[] = []
    const direct = cleanProductUrl(first.finalUrl)
    if (direct && (extractItemId(direct) || /\/(?:p|up)\//i.test(direct))) candidates.push(direct)
    candidates.push(...findProductLinks(first.body, first.finalUrl))
    candidates.push(...findProductUrlsInBody(first.body))

    const productUrl = candidates.find((url) => extractItemId(url)) || candidates[0] || null
    const itemId = extractItemId(productUrl || "")
    let landingProduct = itemId ? extractLandingProduct(first.body, itemId, first.finalUrl) : null

    if (!landingProduct && productUrl) {
      try {
        const productPage = await fetchAffiliate(productUrl)
        landingProduct = extractProductPage(productPage.body, itemId, productPage.finalUrl)
      } catch {}
    }

    if (!productUrl) {
      return new Response(JSON.stringify({
        error: "O link de afiliado foi aberto, mas o Mavuri não encontrou o produto na página de destino.",
        resolved_url: first.finalUrl
      }), { status: 422, headers })
    }

    return new Response(JSON.stringify({
      affiliate_url: affiliateUrl,
      resolved_url: first.finalUrl,
      product_url: productUrl,
      item_id: itemId,
      product: landingProduct,
      source: landingProduct?.resolution || "affiliate_redirect"
    }), { headers })
  } catch (error) {
    return new Response(JSON.stringify({
      error: "Não foi possível resolver o link de afiliado.",
      details: error?.message || String(error)
    }), { status: 502, headers })
  }
})

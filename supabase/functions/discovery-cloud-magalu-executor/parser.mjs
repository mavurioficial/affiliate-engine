const MAGALU_SOURCE_HANDLE = "@parceiromagaludivulgador";
export const normalizeTelegramTitle = v => String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
export const magaluMoney = raw => raw == null ? null : Number(String(raw).replace(/R\$/gi,"").replace(/\s/g,"").replace(/\./g,"").replace(",", "."));
const magaluExtractUrls = text => [...String(text||"").matchAll(/https?:\/\/[^\s<>)]+/gi)].map(m=>m[0]);
function magaluTitleFromText(text) {
  const lines = String(text || "").split(/\r?\n/).map(x => x.replace(/^\s*[🔥🚨⚡💥🛍️📦👉✅⭐🎁💙]+\s*/u, "").trim()).filter(Boolean)
  for (const line of lines) {
    if (line.length < 8) continue
    if (/^https?:\/\//i.test(line)) continue
    if (/^(achado do dia|confira essa oferta imperd[ií]vel|oferta imperd[ií]vel|oferta magalu|cupom|cupons|c[oó]digo|frete|comiss[aã]o|por\s+r\$|de\s+r\$)/i.test(line)) continue
    if (/^(r\$|\d+%\s*off)/i.test(line)) continue
    if (/\b(?:c[oó]digo|cupom|frete|comiss[aã]o)\b/i.test(line) && line.length < 90) continue
    const clean = line
      .replace(/\s+por\s*:?[\s*]*R\$[\s\S]*$/i, "")
      .replace(/\s+c[oó]d(?:igo)?\s*[:#-]?[\s]*[0-9]{8,14}[\s\S]*$/i, "")
      .trim()
    if (clean.length >= 8) return clean.slice(0, 260)
  }
  return null
}

function isMagaluPromoHeading(line) {
  const s = String(line || "").trim()
  if (!s) return true
  const normalized = normalizeTelegramTitle(s)
  if (/^(aproveit|oferta|ofertas|corre|bora vender|payday|faz um|com frete gratis|melhor preco|ainda da tempo|e tem|comecou|atencao|mega oferta|black app|oferta do dia do influ)/i.test(normalized)) return true
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, "")
  if (letters.length >= 8 && s === s.toUpperCase() && s.length <= 120) return true
  return false
}

export function parseMagaluOfferMessage(row) {
  const raw = String(row?.text || "").replace(/\r/g, "").trim()
  if (!raw) return null
  const lines = raw.split("\n").map(v => v.replace(/\s+/g, " ").trim()).filter(Boolean)
  if (!lines.length) return null

  // Listas/campanhas com vários códigos não representam um único produto.
  if (/\bC[oó]digos\s*:/i.test(raw)) return null

  const codeMatch = raw.match(/\bC[oó]digo\s*:\s*`?\s*([A-Za-z0-9]{8,14})\s*`?/i)
  const code = codeMatch?.[1]?.trim() || null
  const urls = magaluExtractUrls(raw)

  const amountFromLine = (line) => {
    const m = String(line || "").match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i)
    return magaluMoney(m?.[1] || null)
  }

  let priceLine = null
  let priceLineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!/R\$/i.test(line)) continue
    if (/cupom|off\s+(?:para|acima)|compras?\s+acima|desconto\s+de/i.test(line)) continue
    if (/(?:no\s+pix|a\s+vista|à\s+vista)/i.test(line) && !/\b\d+\s*x\s+de\s+R\$/i.test(line)) {
      priceLine = line; priceLineIndex = i; break
    }
  }
  if (!priceLine) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!/R\$/i.test(line)) continue
      if (/cupom|off\s+(?:para|acima)|compras?\s+acima|desconto\s+de/i.test(line)) continue
      if (/^(?:por(?:\s+apenas)?|a\s+partir\s+de)\s+R\$/i.test(line) && !/\b\d+\s*x\s+de\s+R\$/i.test(line)) {
        priceLine = line; priceLineIndex = i; break
      }
    }
  }
  const price = amountFromLine(priceLine)

  // "Achado do dia" pode vir somente com link; será resolvido no navegador.
  if (!(price > 0) && urls.length) {
    return {
      code: null,
      title: null,
      price: null,
      previous_price: null,
      discount: null,
      coupon: null,
      shipping_text: null,
      installments: null,
      product_url: urls[0],
      affiliate_url: null,
      image_url: null,
      source_message_id: row.id || null,
      source_message_date: row.date || null,
      source_text: raw,
      score: 55,
      metadata: { source_channel: MAGALU_SOURCE_HANDLE, parser_version: 80, link_only: true }
    }
  }

  if (!code || !(price > 0)) return null

  let previousPrice = null
  for (const line of lines) {
    const m = line.replace(/~~/g, "").match(/^\s*(?:de|antes:?)\s+R\$\s*([\d.]+(?:,\d{1,2})?)/i)
    if (m) { previousPrice = magaluMoney(m[1]); break }
  }
  if (!(previousPrice > price)) previousPrice = null

  const couponMatch = raw.match(/(?:Cupom|Use\s+o\s+cupom)\s*:\s*`?\s*([A-Z0-9_-]{3,32})\s*`?/i)
  const coupon = couponMatch?.[1]?.toUpperCase() || null
  const freeShipping = /frete\s+gr[aá]tis/i.test(raw)

  let title = null
  const end = priceLineIndex >= 0 ? priceLineIndex : lines.length
  for (let i = end - 1; i >= 0; i--) {
    const line = lines[i].replace(/~~/g, "").trim()
    const plain = line.replace(/^[^\p{L}\p{N}]+/u, "").trim()
    if (!plain || plain.length < 8) continue
    if (isMagaluPromoHeading(plain)) continue
    if (/^(?:cupom|use o cupom|c[oó]digo|c[oó]digos|frete gr[aá]tis|consulte|v[aá]lid|comiss[aã]o)/i.test(plain)) continue
    if (/^(?:de|antes:?)\s+R\$/i.test(plain)) continue
    if (/^(?:em\s+at[eé]|ou)\s+\d+\s*x\b/i.test(plain)) continue
    if (/R\$\s*[\d.]+(?:,\d{1,2})?/i.test(plain) && /(pix|vista|sem juros|x de)/i.test(plain)) continue
    title = plain
    break
  }
  if (!title) title = magaluTitleFromText(raw)
  if (!title) return null

  let installments = null
  for (const line of lines) {
    const im = line.match(/(?:ou\s+)?(\d{1,2})\s*x\s+de\s+R\$\s*([\d.]+(?:,\d{1,2})?)\s*(sem\s+juros)?/i)
    if (im) {
      installments = `${Number(im[1])}x de R$ ${im[2]}${im[3] ? " sem juros" : ""}`
      break
    }
  }

  const discount = previousPrice ? Math.round((1 - price / previousPrice) * 100) : null
  let score = 20
  if (discount) score += Math.min(60, discount * 1.5)
  if (coupon) score += 14
  if (freeShipping) score += 8
  if (/oferta\s+relampago|oferta\s+rel[aâ]mpago|melhor\s+pre[cç]o|aproveit|payday|descont/i.test(normalizeTelegramTitle(raw))) score += 6

  return {
    code,
    title: title.slice(0, 260),
    price,
    previous_price: previousPrice,
    discount,
    coupon,
    shipping_text: freeShipping ? "Frete grátis para regiões elegíveis; consulte o CEP." : null,
    installments,
    product_url: null,
    affiliate_url: null,
    image_url: null,
    source_message_id: row.id || null,
    source_message_date: row.date || null,
    source_text: raw,
    score: Math.round(score),
    metadata: { source_channel: MAGALU_SOURCE_HANDLE, parser_version: 80 }
  }
}



import {magaluMoney,normalizeTelegramTitle} from './parser.mjs';
function magaluTagsFromText(raw){const t=normalizeTelegramTitle(raw);const tags=[];if(/tecnologia|eletron|informat|celular|games/.test(t))tags.push('tecnologia');if(/casa|cozinha|panela|eletro|decor|limpeza|movel|moveis/.test(t))tags.push('casa');if(/beleza|maquiagem|skincare|cabelo|feminin|mulher|perfume|moda/.test(t))tags.push('feminino');return tags;}
function magaluDateIso(raw){const m=String(raw||'').match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);if(!m)return null;const y=m[3]?(m[3].length===2?2000+Number(m[3]):Number(m[3])):Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(new Date()));return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T23:59:59-03:00`;}
export function parseMagaluCouponsFromMessage(row) {
  const text = String(row?.text || "")
  if (!text) return []

  const results = []
  const seen = new Set()
  const blocked = new Set([
    "MAGALU","CUPOM","CUPONS","OFERTA","OFERTAS","HOJE","PAYDAY","FRETE","OFF",
    "TEM","COM","PARA","MAIS","ISSO","ESPECIAL","PRODUTOS","VOLTOUUUU","VOLTOUUUUU",
    "APROVEITEEEE","BORAAAA","LIBEROUUUUUUUU"
  ])

  // V85: um cupom só existe quando há marcador explícito "Cupom:"/"Use o cupom:".
  // Isso evita transformar palavras promocionais (VOLTOUUUU, TEM, PARA...) em código.
  // "Use o cupom X" é aceito; "Cupom X" só vale com separador (: # -).
  // Assim frases como "cupom exclusivo" não viram código EXCLUSIVO.
  const markerRe = /(?:🏷️?\s*)?(?:(?:use\s+o\s+cupom)\s*[:#-]?\s*|(?:cupom)\s*[:#-]\s*)([A-Z0-9][A-Z0-9_-]{2,31})/giu
  const markers = [...text.matchAll(markerRe)]

  const allMatches = (seg, re, type) => {
    const arr = []
    for (const m of seg.matchAll(re)) arr.push({ type, value: m[1], index: Number(m.index || 0) })
    return arr
  }

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i]
    const code = String(m[1] || "").toUpperCase()
    if (!code || blocked.has(code) || seen.has(code)) continue

    const markerPos = Number(m.index || 0)
    const markerEnd = markerPos + String(m[0] || "").length
    const prevEnd = i > 0
      ? Number(markers[i - 1].index || 0) + String(markers[i - 1][0] || "").length
      : Math.max(0, markerPos - 420)
    const nextStart = i + 1 < markers.length
      ? Number(markers[i + 1].index || text.length)
      : Math.min(text.length, markerEnd + 520)

    // O benefício quase sempre vem ANTES de "Cupom: CODIGO".
    // Priorizar o último benefício anterior evita que o cupom atual herde
    // o valor do cupom seguinte (ex.: RESSACA200 virar R$100).
    const rawBefore = text.slice(Math.max(prevEnd, markerPos - 420), markerPos)
    const rawAfter = text.slice(markerEnd, Math.min(nextStart, markerEnd + 240))
    const beforeBenefits = [
      ...allMatches(rawBefore, /(\d+(?:[.,]\d+)?)\s*%\s*OFF/giu, "percent"),
      ...allMatches(rawBefore, /R\$\s*([\d.]+(?:,\d{1,2})?)\s*OFF/giu, "fixed")
    ].sort((a,b) => a.index - b.index)
    const afterBenefits = [
      ...allMatches(rawAfter, /(\d+(?:[.,]\d+)?)\s*%\s*OFF/giu, "percent"),
      ...allMatches(rawAfter, /R\$\s*([\d.]+(?:,\d{1,2})?)\s*OFF/giu, "fixed")
    ].sort((a,b) => a.index - b.index)

    const benefit = beforeBenefits.length
      ? { ...beforeBenefits[beforeBenefits.length - 1], side: "before" }
      : (afterBenefits.length ? { ...afterBenefits[0], side: "after" } : null)
    if (!benefit) continue

    const dval = benefit.type === "percent"
      ? Number(String(benefit.value).replace(",","."))
      : magaluMoney(benefit.value)
    if (!(Number(dval) > 0)) continue

    const rawSeg = (rawBefore + " " + String(m[0] || "") + " " + rawAfter).trim()
    const seg = rawSeg.replace(/\s+/g, " ").trim()
    const benefitContext = benefit.side === "before"
      ? rawBefore.slice(Math.max(0, benefit.index - 40))
      : rawAfter.slice(Math.max(0, benefit.index - 20))
    const termsContext = (benefitContext + " " + String(m[0] || "") + " " + rawAfter.slice(0, 160)).replace(/\s+/g, " ").trim()

    const minRaw = termsContext.match(/(?:compras?|produtos?)?\s*(?:acima\s+de|a\s+partir\s+de|compra\s+m[ií]n(?:ima)?|m[ií]nimo)\s*:?\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i)?.[1] || null
    const maxRaw = termsContext.match(/(?:desconto\s+m[aá]x(?:imo)?|m[aá]ximo|limitad[oa]\s+a)\s*:?\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i)?.[1] || null
    const untilRaw = seg.match(/(?:v[aá]lid[oa]s?\s+(?:at[eé]|em)|at[eé])\s*(\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?)/i)?.[1] || null
    const scope = seg.match(/(?:em|para)\s+(?:produtos?\s+)?(?:da\s+categoria\s+)?(tecnologia|casa(?:\s+e\s+cozinha)?|beleza|moda|brinquedos?|esporte|eletro(?:dom[eé]sticos)?)/i)?.[1] || null

    seen.add(code)
    results.push({
      code,
      discount_type: benefit.type,
      discount_value: Number(dval),
      min_purchase: magaluMoney(minRaw),
      max_discount: magaluMoney(maxRaw),
      valid_until: untilRaw ? magaluDateIso(untilRaw, true) : null,
      terms: seg,
      scope_label: scope ? scope.replace(/\b\w/g, c => c.toUpperCase()) : null,
      mavuri_tags: magaluTagsFromText(scope || seg),
      eligibility: scope ? { scope_label: scope } : {},
      metadata: { source_message_id: row.id || null, source_message_date: row.date || null, parser_version: 85 }
    })
  }
  return results
}



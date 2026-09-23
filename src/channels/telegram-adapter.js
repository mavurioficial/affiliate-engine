function telegramUrl(botToken, method) {
  return `https://api.telegram.org/bot${botToken}/${method}`
}

export function formatTelegramOffer(offer) {
  const price = Number(offer.price || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
  const old = Number(offer.previous_price || 0)
  const oldText = old > Number(offer.price || 0) ? `\nDe: ~${old.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}~` : ''
  const discount = Number(offer.discount_percent || 0)
  const discountText = discount > 0 ? `\n🔥 ${discount}% OFF` : ''
  return `🛍️ <b>${escapeHtml(offer.title)}</b>${oldText}\n💰 <b>${price}</b>${discountText}${offer.coupon ? `\n🎟️ Cupom: <b>${escapeHtml(offer.coupon)}</b>` : ''}\n\n👉 <a href="${escapeHtml(offer.affiliate_url || offer.product_url || '#')}">Comprar</a>`
}

function escapeHtml(value) {
  return String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
}

export async function sendTelegramOffer({ botToken, chatId, offer }) {
  if (!botToken || !chatId) throw new Error('botToken e chatId são obrigatórios.')
  const text = formatTelegramOffer(offer)
  const imageUrl = String(offer.image_url || offer.imageUrl || '').trim()
  const method = imageUrl ? 'sendPhoto' : 'sendMessage'
  const body = imageUrl
    ? { chat_id: chatId, photo: imageUrl, caption: text, parse_mode: 'HTML' }
    : { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: false }

  const response = await fetch(telegramUrl(botToken, method),{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  })
  const data=await response.json()
  if(!response.ok || !data.ok) throw new Error(data?.description || `Telegram HTTP ${response.status}`)
  return data.result
}

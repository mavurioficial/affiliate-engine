/**
 * Mavuri - intake of user-forwarded or expressly authorized Telegram offers.
 * This module NEVER fetches Telegram, expands shortlinks, copies affiliate links,
 * creates flow_offers, or publishes. Third-party links are discovery evidence only.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"'()\[\]]+/giu;
const COST_PATTERN = /R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*|[0-9]+)(?:,([0-9]{2}))?/giu;

function shopOf(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if(url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if(url.username || url.password) return null;
  const h = url.hostname.toLowerCase();
  if(['link.amazon','amzn.to','a.co','amzn.eu','amazon.com.br','www.amazon.com.br'].includes(h))return 'amazon';
  if(['meli.la','merc.li','mercadolivre.com.br','www.mercadolivre.com.br','mercadolibre.com','www.mercadolibre.com'].includes(h))return 'mercadolivre';
  return null;
}

function textClean(value) {
  return String(value || '').normalize('NFC')
    .replace(/https?:\/\/[^\s<>"'()\[\]]+/giu,' ')
    .replace(/R\$\s*[0-9][0-9.,]*/giu,' ')
    .replace(/(?:frete\s+gr[aá]tis?(?:\s+para\s+assinantes?\s+prime)?|na\s+recorr[eê]ncia)/giu,' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,' ')
    .replace(/\s+/g,' ').trim();
}

function extractPost(url) {
  try {
    const u=new URL(url);
    if(u.protocol!=='https:' || !['t.me','www.t.me'].includes(u.hostname.toLowerCase()))return null;
    const m=u.pathname.match(/^\/([A-Za-z][A-Za-z0-9_]{3,})\/(\d+)\/?$/);
    if(!m)return null;
    return {channel:m[1],message_id:m[2],message_url:'https://t.me/'+m[1]+'/'+m[2]};
  }catch{return null}
}

function priceFromText(value){
  const matches=[...String(value || '').matchAll(COST_PATTERN)];
  if(!matches.length)return null;
  // The first advertised price is only a CLAIM by the source, not current pricing.
  const m=matches[0];
  const amount=Number(m[1].replace(/\./g,'')+'.'+(m[2]||'00'));
  return Number.isFinite(amount) && amount>0 ? Math.round(amount*100)/100 : null;
}

function conditionsFromText(value){
  const t=String(value || '').toLocaleLowerCase('pt-BR');
  const recurrence=/\brecorr[eê]ncia\b|\bassinatura\s+recorrente\b/iu.test(t);
  const primeShipping=/frete\s+gr[aá]tis[\s\S]{0,45}prime/iu.test(t);
  const levePague=t.match(/\bleve\s*(\d{1,3})\s*pague\s*(\d{1,3})\b/iu);
  return {
    recurring_purchase_price:recurrence,
    prime_membership_shipping:primeShipping,
    bundle:levePague?{take:Number(levePague[1]),pay:Number(levePague[2])}:null
  };
}

export function parseForwardedTelegramOffer({sourceUrl,text,receivedAt}={}) {
  const source=extractPost(sourceUrl);
  if(!source)throw new Error('valid_public_telegram_message_url_required');
  const input=String(text||'');
  const links=[...input.matchAll(URL_PATTERN)].map(x=>x[0].replace(/[.,;!?]+$/g,''));
  const offers=[];
  const seen=new Set();
  const claimedPrice=priceFromText(input);
  const conditions=conditionsFromText(input);
  const title=textClean(input);
  for (const link of links) {
    const marketplace=shopOf(link);
    if(!marketplace || seen.has(link))continue;
    seen.add(link);
    offers.push({
      source_ref:'telegram:'+source.channel+':'+source.message_id,
      source_message_url:source.message_url,
      marketplace,
      title: title || null,
      claimed_price: claimedPrice,
      claimed_currency: claimedPrice === null ? null : 'BRL',
      claimed_conditions:conditions,
      source_link:link,
      // Shortlink could be another affiliate's; never copy it to affiliate_url.
      affiliate_url:null,
      canonical_product_url:null,
      original_post_verified:false,
      price_verified_current:false,
      availability_verified:false,
      own_affiliate_attribution_verified:false,
      publication_allowed:false,
      candidate_status:'needs_product_and_price_validation',
      received_at:receivedAt||null
    });
  }
  return {
    source, offers,
    status:offers.length?'candidate_extracted':'needs_message_text_or_retail_link',
    no_network_requests:true, no_publishing:true
  };
}

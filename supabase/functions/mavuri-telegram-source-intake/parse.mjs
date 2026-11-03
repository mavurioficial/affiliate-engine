// Pure Telegram Bot API -> untrusted offer candidate extraction.
// No network calls, no publishing, no affiliate-link conversion.
const RETAIL_HOSTS=new Map([
 ['meli.la','mercadolivre'],['merc.li','mercadolivre'],
 ['mercadolivre.com.br','mercadolivre'],['www.mercadolivre.com.br','mercadolivre'],
 ['link.amazon','amazon'],['amzn.to','amazon'],['a.co','amazon'],
 ['amazon.com.br','amazon'],['www.amazon.com.br','amazon']
]);
const URL_PATTERN=/https?:\/\/[^\s<>"'()[\]]+/gu;
const MONEY_PATTERN=/R\$\s*(\d[\d.,]*)/giu;

function retailerUrl(raw) {
 try {
  const u=new URL(String(raw).replace(/[.,;!?]+$/g,''));
  if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  const marketplace=RETAIL_HOSTS.get(u.hostname.toLowerCase());
  if(!marketplace)return null;
  return {marketplace,original_link:u.toString()};
 } catch { return null; }
}
function priceOf(text) {
 for(const match of text.matchAll(MONEY_PATTERN)){
  const s=match[1].replace(/[.,]+$/g,'');
  const numeric=s.includes(',')?s.replace(/\./g,'').replace(',','.'):
    /^\d+\.\d{2}$/.test(s)?s:s.replace(/\./g,'');
  const amount=Number(numeric);
  if(Number.isFinite(amount)&&amount>0&&amount<1000000)return Math.round(amount*100)/100;
 }
 return null;
}
function conditionsOf(text) {
 const normalized=text.toLowerCase();
 const pair=normalized.match(/\bleve\s*(\d{1,3})\s*pague\s*(\d{1,3})/iu);
 return {
  recurring_purchase_price:/recorr[eê]ncia|compra\s+recorrente/iu.test(normalized),
  prime_membership_shipping:/frete\s+gr[aá]tis[\s\S]{0,55}prime/iu.test(normalized),
  pix_price:/\bno\s+pix\b|\bvia\s+pix\b/iu.test(normalized),
  bundle:pair?{take:Number(pair[1]),pay:Number(pair[2])}:null
 };
}
function sourceMessageUrl(message) {
 const origin=message?.forward_origin;
 if(origin?.type==='channel'&&origin.chat?.username&&Number.isSafeInteger(origin.message_id)){
  return 'https://t.me/'+String(origin.chat.username).replace(/^@/,'')+'/'+origin.message_id;
 }
 return null;
}
function displayTitle(text) {
 return text.replace(URL_PATTERN,' ').replace(MONEY_PATTERN,' ')
  .replace(/(?:frete\s+gr[aá]tis(?:\s+para\s+assinantes?\s+prime)?|na\s+recorr[eê]ncia)/giu,' ')
  .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,' ')
  .replace(/\s+/g,' ').trim().slice(0,200)||null;
}
export function parseTelegramRetailUpdate(update) {
 if(!update||typeof update!=='object')throw new Error('telegram_update_required');
 const message=update.message??update.channel_post;
 if(!message || !Number.isSafeInteger(message.message_id) ||
    !['private','channel'].includes(message.chat?.type) ||
    !Number.isSafeInteger(message.chat?.id))
  return {candidates:[],reason:'not_supported_message'};
 const text=String(message.text||message.caption||'').slice(0,10000);
 const urls=[...text.matchAll(URL_PATTERN)].map(x=>x[0]);
 // Hidden URLs are delivered in text_link entities; a plain-text regex misses them.
 const entities=(message.text ? message.entities : message.caption_entities)||[];
 for(const e of entities){
  if(e?.type==='text_link'&&typeof e.url==='string')urls.push(e.url);
 }
 const conditions=conditionsOf(text),claimedPrice=priceOf(text),title=displayTitle(text);
 const candidateRefs=new Set(),candidates=[];
 for(const raw of urls){
  const item=retailerUrl(raw);
  if(!item || candidateRefs.has(item.original_link) || candidates.length>=10)continue;
  candidateRefs.add(item.original_link);
  const suffix=candidates.length;
  candidates.push({
   source_ref:'telegram:'+message.chat.id+':'+message.message_id+':'+suffix,
   source_message_url:sourceMessageUrl(message),
   marketplace:item.marketplace,original_link:item.original_link,
   claimed_title:title,claimed_price_brl:claimedPrice,
   price_conditions:conditions,
   media_present:Boolean(message.photo?.length||message.video),
   original_post_verified:false,
   price_verified_current:false,
   own_affiliate_verified:false,
   publication_allowed:false
  });
 }
 return {candidates,reason:candidates.length?'candidate_extracted':'no_retail_links',no_publication:true};
}

// Shopee Cloud V85 next stage: pure eligibility/score policy, no DB or network.
// Historical prices MUST be the exact sent-price snapshot, never a mutable current offer price.
export const SHOPEE_CLOUD_POLICY = Object.freeze({
  target_unique_offers: 8,
  min_discount_percent: 10,
  same_item_cooldown_hours: 48,
  same_product_other_seller_cooldown_hours: 24,
  significant_price_drop_percent: 10,
  max_category_per_cycle: 2,
  max_broad_family_per_cycle: 1
});
export function normalizePercent(value) {
  const n=Number(value);
  if (!Number.isFinite(n) || n<=0) return 0;
  return n<=1 ? Math.round(n*10000)/100 : Math.round(n*100)/100;
}
export function shopeeCommissionRate(offer) {
  const meta=offer?._mavuri_api||{};
  const rates=[meta.commission_rate,meta.seller_commission_rate,meta.shopee_commission_rate]
    .map(normalizePercent);
  // Use headline rate if reported; otherwise maximum component for sorting only.
  return rates[0]>0?rates[0]:Math.max(0,...rates.slice(1));
}
export function shopeeFamilySignature(title) {
  const tokens=String(title||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/)
    .filter(Boolean)
    .filter(x=>!["de","da","do","das","dos","com","para","por","kit","oferta","original","promo","novo","nova","frete","gratis"].includes(x));
  // Exact normalized signature only; do not conflate vaguely similar items.
  return tokens.length>=3?tokens.join(" "):null;
}
export function shopeeCategoryBucket(offer) {
  const c1=String(offer?.global_category1||"").toLowerCase();
  const c2=String(offer?.global_category2||"").toLowerCase();
  if(c1==="home appliances"||c1==="home & living")return c2==="kitchenware"||c2==="kitchen appliances"?"cozinha":"casa";
  if(c1==="computers & accessories")return "informatica";
  if(["mobile & gadgets","audio","gaming & consoles","cameras & drones"].includes(c1))return "eletronicos";
  if(c1==="beauty")return "beleza";
  if(["women clothes","women shoes","women bags","fashion accessories"].includes(c1))return "moda";
  if(c1.includes("sport")||c1.includes("outdoor"))return "esporte";
  if(c1.includes("toy")||c1.includes("baby"))return "infantil";
  return "outros";
}
export function shopeeBroadFamily(title) {
  const t=shopeeFamilySignature(title)||"";
  const families=[
    ["fone",/\b(fone|headset|earbuds)\b/],
    ["carregador",/\b(carregador|power bank|powerbank)\b/],
    ["smartphone",/\b(smartphone|celular|iphone|galaxy)\b/],
    ["cozinha-panelas",/\b(panela|frigideira)\b/],
    ["moda-roupas",/\b(camiseta|camisas|vestidos|vestido|legging)\b/]
  ];
  return families.find(([,re])=>re.test(t))?.[0]||null;
}
export function compareShopeeCandidates(a,b) {
  const da=Number(a?.discount_percentage||0),db=Number(b?.discount_percentage||0);
  if(db!==da)return db-da;
  const ca=shopeeCommissionRate(a),cb=shopeeCommissionRate(b);
  if(cb!==ca)return cb-ca;
  const sa=Number(a?._mavuri_api?.sales||0),sb=Number(b?._mavuri_api?.sales||0);
  if(sb!==sa)return sb-sa;
  return String(a?.itemid||"").localeCompare(String(b?.itemid||""));
}
export function shopeePriceDropPercent(previousPublishedPrice,currentPrice) {
  const old=Number(previousPublishedPrice),now=Number(currentPrice);
  if(!Number.isFinite(old)||!Number.isFinite(now)||old<=0||now<=0||now>=old)return null;
  return Math.round((old-now)/old*10000)/100;
}
function candidateActiveChannels(candidate,channels) {
  const requested=Array.isArray(candidate?.channel_ids)?candidate.channel_ids:[];
  const active=new Set(channels||[]);
  return [...new Set(requested.map(String))].filter(x=>active.has(x));
}
function dateAgeHours(date,now) {
  const timestamp=Date.parse(String(date||""));
  return Number.isFinite(timestamp)?(now-timestamp)/(60*60*1000):Number.POSITIVE_INFINITY;
}
/**
 * @typedef {Object} ShopeePolicyInput
 * @property {Array<Record<string, any>>} [candidates]
 * @property {Array<Record<string, any>>} [sent_history]
 * @property {Array<Record<string, any>>} [pending_history]
 * @property {string[]} [connected_telegram_channel_ids]
 * @property {string} [now_iso]
 * @property {number} [target]
 */
/** @param {ShopeePolicyInput} param0 */
export function simulateShopeeCloudSelection({
  candidates=[], sent_history=[], pending_history=[], connected_telegram_channel_ids=[],
  now_iso="2026-10-22T18:00:00Z", target=SHOPEE_CLOUD_POLICY.target_unique_offers
}={}) {
  const now=Date.parse(now_iso);
  if(!Number.isFinite(now))throw Error("invalid_now");
  const limit=Math.min(8,Math.max(0,Number(target)||0));
  const results={selected_unique_offers:0,projected_delivery_jobs:0,selected:[],counts:{
    invalid:0,discount_below_min:0,no_active_channel:0,pending:0,
    same_product_48h:0,same_product_price_drop_override:0,
    equivalent_other_seller_24h:0,category_diversity:0,broad_family_diversity:0,
    target_reached:0
  },assumptions:{
    preview_only:true,history_price_snapshot_required_for_price_override:true,
    connected_channels_user_supplied:true,no_queue_writes:true
  }};
  const byCategory=new Map(),byBroadFamily=new Map(),seenIds=new Set();
  const history=(sent_history||[]).filter(x=>x?.status==="sent"||!x?.status);
  const waiting=(pending_history||[]).filter(x=>!x?.status||["queued","processing"].includes(x.status));
  for(const offer of [...candidates].sort(compareShopeeCandidates)) {
    const item=String(offer?.itemid||"").trim();
    const price=Number(offer?.sale_price??offer?.price);
    if(!item||seenIds.has(item)||!Number.isFinite(price)||price<=0||!offer?.affiliate_url||!offer?.image_link) {results.counts.invalid++;continue;}
    seenIds.add(item);
    if(Number(offer?.discount_percentage||0)<SHOPEE_CLOUD_POLICY.min_discount_percent){results.counts.discount_below_min++;continue;}
    const channels=candidateActiveChannels(offer,connected_telegram_channel_ids);
    if(!channels.length){results.counts.no_active_channel++;continue;}
    const family=shopeeFamilySignature(offer.title),shop=String(offer?._mavuri_api?.shop_id||"");
    const eligible=[];
    let overrideCount=0;
    for(const channel of channels) {
      if(waiting.some(h=>String(h.channel_id)===channel&&String(h.itemid)===item)){results.counts.pending++;continue;}
      const matching=history.filter(h=>String(h.channel_id)===channel&&String(h.itemid)===item&&dateAgeHours(h.sent_at,now)>=0&&dateAgeHours(h.sent_at,now)<48)
        .sort((a,b)=>Date.parse(b.sent_at)-Date.parse(a.sent_at));
      if(matching.length) {
        // With no immutable last SENT price snapshot, fail closed; comparing to mutable offer price is unsafe.
        const drop=shopeePriceDropPercent(matching[0].published_price,price);
        if(drop===null||drop<SHOPEE_CLOUD_POLICY.significant_price_drop_percent){results.counts.same_product_48h++;continue;}
        overrideCount++;
      }
      if(family && shop && history.some(h=>
        String(h.channel_id)===channel&&String(h.itemid)!==item&&
        String(h.shop_id||"")!==""&&String(h.shop_id)!==shop&&
        String(h.family_signature||"")===family&&
        dateAgeHours(h.sent_at,now)>=0&&dateAgeHours(h.sent_at,now)<24
      )){results.counts.equivalent_other_seller_24h++;continue;}
      eligible.push(channel);
    }
    if(!eligible.length)continue;
    if(results.selected_unique_offers>=limit){results.counts.target_reached++;continue;}
    const category=shopeeCategoryBucket(offer);
    const broad=shopeeBroadFamily(offer.title);
    if((byCategory.get(category)||0)>=SHOPEE_CLOUD_POLICY.max_category_per_cycle){results.counts.category_diversity++;continue;}
    if(broad&&(byBroadFamily.get(broad)||0)>=SHOPEE_CLOUD_POLICY.max_broad_family_per_cycle){results.counts.broad_family_diversity++;continue;}
    byCategory.set(category,(byCategory.get(category)||0)+1);
    if(broad)byBroadFamily.set(broad,(byBroadFamily.get(broad)||0)+1);
    results.selected_unique_offers++;
    results.projected_delivery_jobs+=eligible.length;
    results.counts.same_product_price_drop_override+=overrideCount;
    results.selected.push({
      itemid:item,category,commission_percent:shopeeCommissionRate(offer),
      discount_percent:Number(offer.discount_percentage),channel_count:eligible.length
    });
  }
  return results;
}

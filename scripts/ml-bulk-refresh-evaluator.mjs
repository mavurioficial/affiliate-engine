/**
 * Offline interpretation of Mercado Livre's documented /items/bulk response.
 * No fetch, cookies, access tokens, Telegram, Supabase writes, or affiliate conversion.
 * Never treats stored meli.la URLs as proof that attribution or price remains valid.
 */
const ITEM = /^MLB[0-9]{9,}$/;
const AFFILIATE = /^https:\/\/meli\.la\/[A-Za-z0-9]+$/;
const money = v => v == null || v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0
  ? null : Math.round(Number(v) * 100) / 100;

export function planBulkLookup(seeds) {
  if (!Array.isArray(seeds)) throw new Error('seed_array_required');
  const picked = new Map();
  for (const s of seeds) {
    const id = String(s?.item_id || '').toUpperCase();
    if (!ITEM.test(id) || !AFFILIATE.test(String(s?.affiliate_url || ''))) continue;
    if (!picked.has(id)) picked.set(id, {
      item_id:id, title:String(s.title || '').trim(),
      last_recorded_price:money(s.last_recorded_price),
      affiliate_url:s.affiliate_url, catalog_id:s.catalog_id || null,
      seller_id:s.seller_id || null
    });
    if (picked.size === 20) break;
  }
  return { ids:[...picked.keys()], candidates:[...picked.values()],
    route:'/items/bulk?ids='+[...picked.keys()].join(',')+
      '&attributes=body.id,body.title,body.price,body.currency_id,body.condition,body.status,body.seller_id',
    request_limit:1, no_network_calls:true, no_publication:true };
}

export function evaluateBulkResponse(seeds, response, observedAt='2026-11-03T00:00:00Z') {
  const plan=planBulkLookup(seeds);
  if (!Array.isArray(response)) return {ok:false,reason:'invalid_bulk_response',results:[],publish_ready:0};
  const received=new Map();
  for(const entry of response){
    const id=String(entry?.id || entry?.body?.id || '').toUpperCase();
    if(ITEM.test(id) && !received.has(id))received.set(id,entry);
  }
  const results=[];
  let blocked=false;
  for (const s of plan.candidates) {
    const entry=received.get(s.item_id);
    const status=Number(entry?.status_code ?? entry?.code ?? 0);
    if([401,403,429].includes(status))blocked=true;
    const body=entry?.body;
    const seller=body?.seller_id == null ? null : String(body.seller_id);
    const price=money(body?.price);
    const valid=status===200 && body?.id===s.item_id && body?.status==='active' &&
      body?.condition==='new' && body?.currency_id==='BRL' && price!==null &&
      seller!==null && (!s.seller_id || seller===s.seller_id);
    const previous=s.last_recorded_price;
    const historicalDrop=valid && previous!=null && previous>price
      ?Math.round((1-price/previous)*10000)/100:null;
    results.push({
      item_id:s.item_id,catalog_id:s.catalog_id,title:valid?String(body.title||s.title):s.title,
      last_recorded_price:previous,current_price:valid?price:null,
      last_recorded_at:observedAt, seller_id:valid?seller:null,
      http_status:status, price_drop_vs_historical_pct:historicalDrop,
      signal:valid && historicalDrop!=null && historicalDrop>=10 ? 'historical_item_price_drop'
        : valid?'current_price_observed':'not_usable',
      historical_price_only:true,affiliate_link_stored:Boolean(s.affiliate_url),
      affiliate_link_destination_reverified:false,
      affiliate_attribution_verified:false,publish_ready:false
    });
  }
  return {ok:!blocked,blocked_by_upstream:blocked,
    evaluated:results.length,valid_prices:results.filter(x=>x.current_price!=null).length,
    historical_price_drops:results.filter(x=>x.signal==='historical_item_price_drop').length,
    results,publish_ready:0,offer_writes:0,telegram_posts:0};
}

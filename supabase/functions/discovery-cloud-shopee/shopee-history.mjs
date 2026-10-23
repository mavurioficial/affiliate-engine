// Read-only analysis of existing Supabase delivery-log price snapshots.
// Source record IDs/titles/affiliate URLs are never included in the report.
export function summarizeShopeeSentHistory(rows, options={}) {
  const now=Date.parse(String(options.now_iso||""));
  const since=Date.parse(String(options.since_iso||""));
  if(!Number.isFinite(now)||!Number.isFinite(since)||since>=now)throw Error("invalid_history_window");
  const sorted=[...(Array.isArray(rows)?rows:[])].sort((a,b)=>
    Date.parse(String(a?.created_at||""))-Date.parse(String(b?.created_at||"")));
  const previous=new Map(),products=new Set(),channels=new Set();
  const summary={
    period_start: new Date(since).toISOString(),
    period_end: new Date(now).toISOString(),
    sent_deliveries:0,
    snapshot_price_valid:0,
    snapshot_price_missing:0,
    distinct_products:0,
    distinct_channels:0,
    same_item_channel_repeat_within_48h:0,
    repeat_with_price_drop_at_least_10:0,
    repeat_without_proven_10pct_drop:0,
    missing_identity:0,
    past_data_limit_note:"Only retained sent logs in requested period are evaluated."
  };
  for(const row of sorted) {
    if(String(row?.status)!=="sent")continue;
    const timestamp=Date.parse(String(row?.created_at||""));
    if(!Number.isFinite(timestamp)||timestamp<since||timestamp>now)continue;
    summary.sent_deliveries++;
    const offer=Array.isArray(row.flow_offers)?row.flow_offers[0]:row.flow_offers;
    const item=String(offer?.source_ref||"").trim();
    const channel=String(row?.channel_id||"").trim();
    const raw=row?.metadata?.offer_snapshot?.price;
    const price=raw===null||raw===undefined||raw===""?null:Number(raw);
    if(price!==null&&Number.isFinite(price)&&price>0)summary.snapshot_price_valid++;
    else summary.snapshot_price_missing++;
    if(!item||!channel){summary.missing_identity++;continue;}
    products.add(item);channels.add(channel);
    const key=channel+"|"+item;
    const prior=previous.get(key);
    if(prior&&(timestamp-prior.timestamp)<48*3600000) {
      summary.same_item_channel_repeat_within_48h++;
      const drop=prior.price!==null&&price!==null&&prior.price>0
        ?(prior.price-price)/prior.price*100:null;
      if(drop!==null&&drop>=10-1e-9)summary.repeat_with_price_drop_at_least_10++;
      else summary.repeat_without_proven_10pct_drop++;
    }
    previous.set(key,{timestamp,price:Number.isFinite(price)&&price>0?price:null});
  }
  summary.distinct_products=products.size;
  summary.distinct_channels=channels.size;
  return summary;
}

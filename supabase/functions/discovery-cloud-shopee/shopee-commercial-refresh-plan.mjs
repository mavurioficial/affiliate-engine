// Offline validation for one Shopee commercial refresh.
// It never mutates database rows or publishes messages.
/**
 * @param {{candidate?: Record<string,any>,row?: Record<string,any>,scope?: Record<string,string>}} [input]
 */
export function prepareCommercialRefresh({candidate,row,scope}={}) {
  const reject=reason=>({eligible:false,reason});
  if(!scope || !scope.user_id || !scope.marketplace_id || !scope.affiliate_account_id)
    return reject("scope_missing");
  if(!row || row.user_id!==scope.user_id || row.marketplace_id!==scope.marketplace_id ||
     row.affiliate_account_id!==scope.affiliate_account_id)
    return reject("row_scope_mismatch");
  const id=String(candidate?.itemid||"");
  if(!/^[0-9]{1,24}$/.test(id)||id!==String(row.source_ref||""))
    return reject("product_identity_mismatch");
  const price=Number(candidate?.sale_price??candidate?.price);
  const discount=Number(candidate?.discount_percentage);
  if(!Number.isFinite(price)||price<=0||Math.abs(price*100-Math.round(price*100))>1e-7)
    return reject("invalid_price");
  if(!Number.isFinite(discount)||discount<10||discount>99)
    return reject("invalid_discount");
  const isShopeeLink=v=>{
    try{const u=new URL(String(v||""));
      return u.protocol==="https:"&&u.hostname==="s.shopee.com.br"&&
        !u.username&&!u.password&&u.pathname.length>1;
    }catch{return false}
  };
  if(!isShopeeLink(candidate?.affiliate_url)||!isShopeeLink(row.affiliate_url))
    return reject("invalid_affiliate_link");
  if(!/^https:\/\//.test(String(row.image_url||"")))
    return reject("invalid_image");
  if(!row.mavuri_category_id||
     !/^[a-z][a-z0-9-]{1,48}$/.test(String(row.metadata?.mavuri?.category_slug||""))||
     !Array.isArray(row.mavuri_tags))
    return reject("final_category_missing");
  return {
    eligible:true,
    read_only:true,
    ready_to_publish:false,
    itemid:id,
    expected:{old_price:Number(row.price),old_link:String(row.affiliate_url)},
    values:{price,affiliate_url:String(candidate.affiliate_url),discount_percent:discount},
    changed:{link:row.affiliate_url!==candidate.affiliate_url,price:Number(row.price)!==price},
    preserved_fields:["title","metadata","mavuri_category_id","mavuri_tags"],
    requires_atomic_write:true
  };
}

/**
 * Read-only aggregate over API candidates and already stored rows.
 * Never return IDs, links, prices or metadata in diagnostic output.
 */
/**
 * @param {{candidates?: Array<Record<string,any>>,stored_offers?: Array<Record<string,any>>,scope?: Record<string,string>}} [input]
 */
export function summarizeCommercialRefresh({candidates=[],stored_offers=[],scope}={}) {
  const storedById=new Map();
  const duplicated=new Set();
  for(const row of stored_offers){
    const id=String(row?.source_ref||"");
    if(!id)continue;
    if(storedById.has(id))duplicated.add(id);
    else storedById.set(id,row);
  }
  const summary={
    candidates:0,persisted:0,refreshable:0,
    affiliate_link_rotated:0,price_changed:0,
    invalid_or_untrusted:0,missing_or_ambiguous:0,
    ready_for_write:false,ready_to_publish:false
  };
  const seen=new Set();
  for(const candidate of candidates){
    summary.candidates++;
    const id=String(candidate?.itemid||"");
    if(!id||seen.has(id))continue;
    seen.add(id);
    const row=storedById.get(id);
    if(!row||duplicated.has(id)){summary.missing_or_ambiguous++;continue}
    summary.persisted++;
    const plan=prepareCommercialRefresh({candidate,row,scope});
    if(!plan.eligible){summary.invalid_or_untrusted++;continue}
    summary.refreshable++;
    if(plan.changed.link)summary.affiliate_link_rotated++;
    if(plan.changed.price)summary.price_changed++;
  }
  return summary;
}

// Pure adapter: preserve seller and commission fields from Shopee GraphQL.
// The production flow-shopee-ingest currently drops shopId. Cloud must persist
// this metadata before any verified cross-seller equivalence can be evaluated.
// No database access, secret handling, enqueues, or network calls.
import {shopeeCommissionRate} from "./shopee-policy.mjs";

function safeShopId(id) {
  if(typeof id==="number")
    return Number.isSafeInteger(id)&&id>0?String(id):null;
  const value=String(id??"").trim();
  return /^\d{1,20}$/.test(value)&&!/^[0]+$/.test(value)?value:null;
}
function safeRate(value) {
  const n=Number(value);
  return value!==null&&value!==undefined&&value!==""&&Number.isFinite(n)&&n>=0? n:null;
}
export function projectShopeeSellerIdentity(offer) {
  const api=offer?._mavuri_api||{};
  const shop_id=safeShopId(api.shop_id);
  return {
    shop_id,
    shop_name:String(offer?.shop_name||"").trim().slice(0,255)||null,
    commission_rate:safeRate(api.commission_rate),
    seller_commission_rate:safeRate(api.seller_commission_rate),
    shopee_commission_rate:safeRate(api.shopee_commission_rate),
    estimated_commission_percent:shopeeCommissionRate(offer),
    source:api.source==="shopee_productOfferV2"?"shopee_productOfferV2":"unknown",
    // A seller ID proves seller identity, not cross-seller product equivalence.
    verified_catalog_family:null,
    verified_equivalence:false
  };
}
export function shopeeSellerIdentityDiagnostics(offers) {
  const rows=Array.isArray(offers)?offers:[];
  let shop_ids_present=0, commission_known=0;
  for(const row of rows) {
    const x=projectShopeeSellerIdentity(row);
    if(x.shop_id)shop_ids_present++;
    if(x.estimated_commission_percent>0)commission_known++;
  }
  return {count:rows.length,shop_ids_present,shop_ids_missing:rows.length-shop_ids_present,
    commission_known,verified_equivalence_count:0,
    read_only:true,requires_future_ingest_persistence:true};
}

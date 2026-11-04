/**
 * Conservative price/availability gate for user-forwarded Amazon discoveries.
 * No network, no Telegram, no DB writes. Draft-only by default.
 * Only official, entitled Creators API product data can support a price claim.
 * Any claimed conditional price (Prime, recurrence, PIX) must be independently
 * verified for that same purchase condition and product ASIN.
 */
const ASIN=/^[A-Z0-9]{10}$/;
const TAG=/^[A-Za-z0-9_-]{1,40}-20$/;

function validMoney(x) {
  return typeof x==="number" && Number.isFinite(x) && x>0 && x<=1000000;
}
function toIsoMillis(value){
  const timestamp=Date.parse(String(value||""));
  return Number.isFinite(timestamp)?timestamp:null;
}
const unique=(list)=>[...new Set(list)];

/**
 * @param {object} args
 *  - candidate: { asin,title,claimedPrice,claimed:{recurrence,pix,primeFreeShipping} }
 *  - observation: { source:'amazon_creators_api', credentialApproved:true,
 *      asin,price,observedAt,purchasePlan:'one_time'|'recurring',
 *      paymentMethod:'standard'|'pix', primeShippingVerified:boolean,
 *      inStock:boolean, shippingKnown:boolean, shippingPrice:number, marketplace:'BR' }
 *  - ownLink: {tag, linkCheckerVerified:boolean}
 *  - now: Date or ISO string
 */
export function evaluateAmazonForwardedOffer({candidate={},observation=null,ownLink=null,now=new Date(),maxAgeMinutes=30}={}){
  const reasons=[];
  const asin=String(candidate.asin||"").toUpperCase();
  const claim=candidate.claimed||{};
  if(!ASIN.test(asin))reasons.push("product_not_identified");
  if(!candidate.title||String(candidate.title).trim().length<6)reasons.push("title_not_confirmed");
  if(!validMoney(candidate.claimedPrice))reasons.push("claim_price_missing");
  if(!observation)reasons.push("official_quote_missing");
  else {
    if(observation.source!=="amazon_creators_api"||observation.credentialApproved!==true)
      reasons.push("quote_not_official_or_not_authorized");
    if(String(observation.marketplace||"")!=="BR")
      reasons.push("marketplace_mismatch");
    if(String(observation.asin||"").toUpperCase()!==asin)
      reasons.push("asin_mismatch");
    if(observation.inStock!==true)
      reasons.push("stock_not_verified");
    if(!validMoney(observation.price))
      reasons.push("price_not_verified");
    const at=toIsoMillis(observation.observedAt),current=now instanceof Date?now.getTime():toIsoMillis(now);
    if(!at||!current||at>current+60000||current-at>maxAgeMinutes*60000)
      reasons.push("quote_stale_or_undated");
    // Purchase conditions must be equivalent to the source's claimed deal.
    if(claim.recurrence===true&&observation.purchasePlan!=="recurring")
      reasons.push("recurring_price_not_verified");
    if(claim.pix===true&&observation.paymentMethod!=="pix")
      reasons.push("pix_price_not_verified");
    if(claim.primeFreeShipping===true&&observation.primeShippingVerified!==true)
      reasons.push("prime_free_shipping_not_verified");
    if(claim.primeFreeShipping===true&&
       (observation.shippingKnown!==true||observation.shippingPrice!==0))
      reasons.push("shipping_cost_not_verified");
    if(validMoney(candidate.claimedPrice)&&validMoney(observation.price) &&
        observation.price>candidate.claimedPrice+0.01)
      reasons.push("current_price_exceeds_claimed_price");
  }
  if(!ownLink||!TAG.test(String(ownLink.tag||""))||ownLink.linkCheckerVerified!==true)
    reasons.push("own_affiliate_link_not_verified");
  const blockingReasons=unique(reasons);
  return Object.freeze({
    asin:ASIN.test(asin)?asin:null,
    sourcePrice:validMoney(candidate.claimedPrice)?candidate.claimedPrice:null,
    officialObservedPrice:observation?.source==="amazon_creators_api" &&
      observation.credentialApproved===true && validMoney(observation.price)?observation.price:null,
    quoteAgeLimitMinutes:maxAgeMinutes,
    blockingReasons,
    gatesPassed:blockingReasons.length===0,
    // This is a validator, not an authorization to publish. A separate
    // reviewed channel/rule approval is always required.
    publicationAllowed:false,
    action:blockingReasons.length===0?"ready_for_final_publication_review":"hold_for_review"
  });
}

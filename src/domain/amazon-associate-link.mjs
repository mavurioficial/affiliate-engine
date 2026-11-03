/**
 * Amazon Brasil Associate URL builder, based on Amazon's official documented
 * simple-text product link form. No page scraping or API calls.
 *
 * https://associados.amazon.com.br/help/node/topic/GP38PJ6EUR6PFBEC
 * Never infer an ASIN from the body of a shortened link.amazon URL.
 */
const TRACKING_ID_RE = /^[A-Za-z0-9_-]{1,40}-20$/;
const ASIN_RE = /^[A-Z0-9]{10}$/;

export function parseAmazonAsin(productUrl) {
  if (typeof productUrl !== 'string') return null;
  let url;
  try { url = new URL(productUrl); } catch { return null; }
  if (url.protocol !== 'https:' ||
      !['amazon.com.br','www.amazon.com.br'].includes(url.hostname.toLowerCase()) ||
      url.username || url.password || url.port) return null;
  const m = url.pathname.match(/(?:^|\/)(?:dp|gp\/product)\/([a-zA-Z0-9]{10})(?:\/|$)/);
  return m?.[1]?.toUpperCase() || null;
}

export function createAmazonAssociatePreview({asin, trackingId}={}) {
  const cleanedAsin=String(asin||'').trim().toUpperCase();
  const tag=String(trackingId||'').trim();
  if (!ASIN_RE.test(cleanedAsin)) throw new Error('amazon_asin_not_validated');
  if (!TRACKING_ID_RE.test(tag)) throw new Error('amazon_tracking_id_invalid');
  const productUrl='https://www.amazon.com.br/dp/'+cleanedAsin;
  const affiliateUrl='https://www.amazon.com.br/dp/'+cleanedAsin+'/ref=nosim?tag='+encodeURIComponent(tag);
  return Object.freeze({
    marketplace:'amazon',
    asin:cleanedAsin,
    canonical_product_url:productUrl,
    candidate_affiliate_url:affiliateUrl,
    link_format:'official_documented_text_link',
    product_identification_verified:false,
    link_checker_verified:false,
    current_price_verified:false,
    publication_allowed:false
  });
}

export function previewAmazonFromProductUrl({productUrl,trackingId}={}) {
  const asin=parseAmazonAsin(productUrl);
  if(!asin) throw new Error('canonical_amazon_product_url_required');
  return createAmazonAssociatePreview({asin,trackingId});
}

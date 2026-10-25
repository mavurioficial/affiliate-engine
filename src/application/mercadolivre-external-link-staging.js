// Stage offers imported from third-party Mercado Livre affiliate links.
// IMPORTANT: this never treats the originating short link as OUR commission link.
// Pure function: no network, no database, no queue, no publishing.

function officialProductUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    const validHost = host === 'mercadolivre.com.br' ||
      host.endsWith('.mercadolivre.com.br') ||
      host === 'mercadolibre.com' ||
      host.endsWith('.mercadolibre.com');
    if (url.protocol !== 'https:' || !validHost ||
      url.username || url.password) return null;
    const match = url.pathname.match(/(?:^|\/)(?:p\/)?MLB[-_]?([0-9]{6,})(?:\/|$)/i);
    if (!match) return null;
    // A canonical product URL cannot inherit another affiliate's query parameters.
    return {
      productId: 'MLB' + match[1],
      url: url.origin + url.pathname
    };
  } catch { return null; }
}
function validSourceHost(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password &&
      (host === 'meli.la' || host === 'mercadolivre.com.br' ||
       host.endsWith('.mercadolivre.com.br') ||
       host === 'mercadolibre.com' ||
       host.endsWith('.mercadolibre.com'));
  } catch { return false; }
}

export function stageExternalMercadoLivreOffer(sourceAffiliateUrl, resolved) {
  if (!validSourceHost(sourceAffiliateUrl)) {
    throw new Error('invalid_mercadolivre_source_link');
  }
  const product = officialProductUrl(resolved?.product_url);
  const claimed = String(resolved?.item_id || '').toUpperCase().replace(/[-_]/g, '');
  if (!product || (claimed && claimed !== product.productId)) {
    throw new Error('unconfirmed_or_mismatched_product');
  }
  const title = String(resolved?.product?.title || '').trim();
  const price = Number(resolved?.product?.price);
  if (!title || !Number.isFinite(price) || price <= 0) {
    throw new Error('product_data_incomplete');
  }
  // No sourceAffiliateUrl or resolved.affiliate_url in the returned payload.
  // Downstream publisher must require a separately generated, verified OWN link.
  return {
    marketplace: 'mercadolivre',
    sourceType: 'external_affiliate_import',
    externalProductId: product.productId,
    productUrl: product.url,
    title,
    price,
    imageUrl: resolved.product.thumbnail || resolved.product.image || null,
    affiliateUrl: null,
    affiliateLinkStatus: 'awaiting_own_link',
    readyToPublish: false,
  };
}

/**
 * Experimental, strictly non-publishing normalizer for official ML catalog item data.
 * No credentials, DB, network, or affiliate links. Maintains listing/seller identity.
 */
export function normalizeCatalogOffers(product, competitors, { maxOffers = 8 } = {}) {
  const catalogId = String(product?.id ?? '').toUpperCase();
  if (!/^MLB\d{6,}$/.test(catalogId) || product?.status !== 'active' ||
      !Array.isArray(competitors?.results)) return [];
  const title = String(product.name || product.family_name || '').trim();
  if (title.length < 5) return [];
  const seen = new Set(), results = [];
  for (const item of competitors.results) {
    if (results.length >= Math.max(0, Math.min(8, Math.floor(maxOffers)))) break;
    const id = String(item?.item_id ?? '').toUpperCase();
    if (!/^MLB\d{6,}$/.test(id) || seen.has(id)) continue;
    if (item.currency_id !== 'BRL' || item.condition !== 'new') continue;
    if (Number(item.min_purchase_unit ?? 1) !== 1) continue;
    if (item.status && item.status !== 'active') continue;
    if (item.available_quantity != null && Number(item.available_quantity) < 1) continue;
    const price = Number(item.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const previous = item.original_price == null ? null : Number(item.original_price);
    const regular = Number.isFinite(previous) && previous > price ? previous : null;
    seen.add(id);
    results.push({
      catalog_id: catalogId, item_id: id, title,
      seller_id: item.seller_id == null ? null : String(item.seller_id),
      price, regular_price: regular,
      verified_discount_percent: regular === null ? null : Math.round(100 * (1 - price / regular)),
      product_url: 'https://www.mercadolivre.com.br/p/' + catalogId + '?wid=' + id,
      affiliate_url: null, affiliate_attribution_verified: false,
      publish_ready: false, evidence: 'official_catalog_items_api',
    });
  }
  return results;
}

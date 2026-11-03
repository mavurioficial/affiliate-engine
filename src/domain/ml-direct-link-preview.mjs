/**
 * Experimental Mercado Livre direct-link PREVIEW.
 *
 * Not the official affiliate link generator. Navigation success does not prove
 * tracked clicks, attribution, purchases, or commission.
 *
 * DO NOT write the resulting url to affiliate_url, distribution queues,
 * or Telegram before an independent attribution validation.
 */
const BRAZIL_HOSTS = new Set(["mercadolivre.com.br", "www.mercadolivre.com.br"]);
const CATALOG_ROUTE = /(?:^|\/)p\/(MLB[0-9]{6,})(?:\/)?$/;
const TAG = /^[a-zA-Z0-9_-]{2,64}$/;
const TOOL = /^[0-9]{1,24}$/;

/**
 * Build a direct URL for a catalog product with an affiliate identifier.
 * Only accepts an untracked, clean catalog URL, never a short link, social
 * referral, seller-specific URL, or link carrying someone else's tracking.
 */
export function previewMlDirectLink({ productUrl, mattWord, mattTool } = {}) {
  if (typeof productUrl !== "string") throw new Error("product_url_required");
  if (typeof mattWord !== "string" || !TAG.test(mattWord)) {
    throw new Error("affiliate_identifier_invalid");
  }
  if (typeof mattTool !== "string" || !TOOL.test(mattTool)) {
    throw new Error("affiliate_tool_invalid");
  }
  let url;
  try {
    url = new URL(productUrl);
  } catch {
    throw new Error("invalid_product_url");
  }
  if (
    url.protocol !== "https:" ||
    !BRAZIL_HOSTS.has(url.hostname.toLowerCase()) ||
    url.port ||
    url.username ||
    url.password
  ) throw new Error("unsupported_product_host");
  if (url.search || url.hash) throw new Error("requires_clean_catalog_url");
  const match = url.pathname.match(CATALOG_ROUTE);
  if (!match) throw new Error("requires_catalog_product_id");
  const id = match[1];
  const direct = new URL("https://www.mercadolivre.com.br/p/" + id);
  direct.searchParams.set("matt_word", mattWord);
  direct.searchParams.set("matt_tool", mattTool);

  return Object.freeze({
    candidate_url: direct.toString(),
    catalog_id: id,
    kind: "unverified_direct_url",
    navigation_test: "pending",
    affiliate_attribution_verified: false,
    official_link: false,
    publication_allowed: false
  });
}

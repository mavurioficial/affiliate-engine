/**
 * EXPERIMENTAL / DRY RUN ONLY.
 * This constructs an UNVERIFIED URL candidate; it does not generate an
 * official Mercado Livre affiliate link or prove commission attribution.
 * Absolutely no network requests, cookies, DB operations, or publication.
 */
const ALLOWED_HOSTS = new Set(['mercadolivre.com.br', 'www.mercadolivre.com.br']);
const PRODUCT_PATH = /\/p\/MLB\d{6,}(?:\/)?$/i;

export function buildUnverifiedCandidate(productUrl, { mattWord, mattTool }) {
  if (typeof productUrl !== 'string') throw new Error('product_url_required');
  let u;
  try { u = new URL(productUrl); } catch { throw new Error('invalid_product_url'); }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname.toLowerCase()) ||
      u.username || u.password || u.port || !PRODUCT_PATH.test(u.pathname)) {
    throw new Error('not_a_supported_product_page');
  }
  if (!/^[A-Za-z0-9_-]{2,80}$/.test(String(mattWord || '')) ||
      !/^\d{3,20}$/.test(String(mattTool || ''))) {
    throw new Error('invalid_affiliate_metadata');
  }
  // Discard browsing trackers and fragments. Seller-specific variants are
  // NOT verified, so this script must never be used for live publication.
  u.search = '';
  u.hash = '';
  u.searchParams.set('matt_word', mattWord);
  u.searchParams.set('matt_tool', mattTool);
  return {
    candidate_url: u.toString(),
    product_id: u.pathname.match(/\/p\/(MLB\d+)/i)[1].toUpperCase(),
    classification: 'unverified_direct_url_not_officially_generated',
    no_network_requests: true,
    no_db_writes: true,
    no_publication: true,
    commission_attribution_verified: false,
  };
}

export function examineOfficialSocialLink(officialLink) {
  const u = new URL(officialLink);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname.toLowerCase()) ||
      !/^\/social\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)) {
    throw new Error('not_an_official_social_link_shape');
  }
  return {
    target_type: 'social_profile',
    has_matt_word: Boolean(u.searchParams.get('matt_word')),
    has_matt_tool: Boolean(u.searchParams.get('matt_tool')),
    has_product_specific_ref: Boolean(u.searchParams.get('ref')),
    is_direct_product_url: false,
  };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  try {
    const output = buildUnverifiedCandidate(args.product, {
      mattWord: args['matt-word'], mattTool: args['matt-tool'],
    });
    console.log(JSON.stringify(output, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, reason: err?.message || 'invalid_input' }));
    process.exitCode = 1;
  }
}

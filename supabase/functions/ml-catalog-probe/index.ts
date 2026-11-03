// Manual, experimental ML catalog API probe. NOT DEPLOYED.
// No cron, browser cookies, ML affiliate-link generation, jobs, or Telegram.
// Requires owner JWT and ML_CATALOG_PROBE_ENABLED=true. OAuth refresh can
// update only encrypted connection credentials (same flow as meli-auth).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalizeCatalogOffers } from './normalize.mjs';

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': 'https://mavurioficial.github.io',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'cache-control': 'no-store',
};
const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const BASE = 'https://api.mercadolibre.com';
const SAMPLE_QUERY = 'celular samsung galaxy a17';
const MAX_PRODUCTS = 2;
const MAX_LISTINGS = 5;

async function apiGet(token: string, path: string) {
  const r = await fetch(BASE + path, {
    method: 'GET', redirect: 'error',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  return { status: r.status, data: r.ok ? await r.json().catch(() => null) : null };
}

async function authorizedToken(admin: ReturnType<typeof createClient>,
  uid: string, marketplace: string, account: string) {
  const { data, error } = await admin.rpc('mavuri_get_meli_token', {
    p_user_id: uid, p_marketplace_id: marketplace, p_affiliate_account_id: account,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.access_token) return { token: null, refreshed: false, reason: 'oauth_connection_missing' };
  if (row.expires_at && Date.parse(String(row.expires_at)) > Date.now() + 60000)
    return { token: String(row.access_token), refreshed: false, reason: null };
  if (!row.refresh_token) return { token: null, refreshed: false, reason: 'oauth_refresh_missing' };
  const clientId = Deno.env.get('MELI_CLIENT_ID');
  const secret = Deno.env.get('MELI_CLIENT_SECRET');
  if (!clientId || !secret) return { token: null, refreshed: false, reason: 'oauth_client_missing' };
  const r = await fetch(BASE + '/oauth/token', {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', client_id: clientId,
      client_secret: secret, refresh_token: String(row.refresh_token),
    }),
  });
  const payload = r.ok ? await r.json().catch(() => ({})) : {};
  if (!r.ok || !payload.access_token)
    return { token: null, refreshed: false, reason: 'oauth_refresh_http_' + r.status };
  const { error: saveError } = await admin.rpc('mavuri_store_meli_token', {
    p_user_id: uid, p_marketplace_id: marketplace, p_affiliate_account_id: account,
    p_external_account_id: payload.user_id ? String(payload.user_id) : row.external_account_id,
    p_access_token: payload.access_token,
    p_refresh_token: payload.refresh_token || row.refresh_token,
    p_expires_in: Number(payload.expires_in || 0),
    p_scopes: String(payload.scope || (row.scopes || []).join(' ')).split(/\s+/).filter(Boolean),
  });
  if (saveError) return { token: null, refreshed: false, reason: 'oauth_refresh_store_failed' };
  return { token: String(payload.access_token), refreshed: true, reason: null };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST') return respond({ ok: false, reason: 'post_only' }, 405);
  if (Deno.env.get('ML_CATALOG_PROBE_ENABLED') !== 'true')
    return respond({ ok: false, reason: 'probe_disabled', publication: false }, 410);
  const ownerId = Deno.env.get('MAVURI_OWNER_USER_ID') || '';
  const url = Deno.env.get('SUPABASE_URL') || '';
  const pub = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
  const sec = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  const publicKey = pub.default || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const adminKey = sec.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!ownerId || !url || !publicKey || !adminKey)
    return respond({ ok: false, reason: 'probe_environment_missing' }, 503);
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer '))
    return respond({ ok: false, reason: 'owner_jwt_required' }, 401);
  try {
    const userClient = createClient(url, publicKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: identity, error: identityError } = await userClient.auth.getUser();
    if (identityError || identity.user?.id !== ownerId)
      return respond({ ok: false, reason: 'owner_jwt_invalid' }, 403);
    const body = await request.json().catch(() => ({}));
    if (body?.mode !== 'dry_run') return respond({ ok: false, reason: 'dry_run_only' }, 400);
    const admin = createClient(url, adminKey);
    const { data: market } = await admin.from('flow_marketplaces')
      .select('id').eq('slug', 'mercadolivre').maybeSingle();
    if (!market?.id) return respond({ ok: false, reason: 'marketplace_missing' }, 404);
    const { data: accounts } = await admin.from('flow_affiliate_accounts')
      .select('id').eq('user_id', ownerId).eq('marketplace_id', market.id)
      .eq('status', 'connected').limit(2);
    if (accounts?.length !== 1) return respond({ ok: false, reason: 'affiliate_account_not_unique' }, 409);
    const connection = await authorizedToken(admin, ownerId, market.id, accounts[0].id);
    if (!connection.token) return respond({ ok: false, reason: connection.reason, no_publication: true }, 424);

    // A deliberately tiny set of documented GET requests; never fallback on 403.
    const search = await apiGet(connection.token,
      '/products/search?status=active&site_id=MLB&q=' +
      encodeURIComponent(SAMPLE_QUERY) + '&limit=' + MAX_PRODUCTS);
    if (search.status !== 200) return respond({
      ok: false, reason: 'catalog_search_http_' + search.status,
      oauth_refreshed: connection.refreshed, no_publication: true,
    });
    const rows = Array.isArray(search.data?.results) ? search.data.results : [];
    const ids = [...new Set(rows.map((p: any) => String(p?.id || '').toUpperCase())
      .filter((v: string) => /^MLB\d{6,}$/.test(v)))].slice(0, MAX_PRODUCTS);
    const reports: Record<string, unknown>[] = [], samples: Record<string, unknown>[] = [];
    let accepted = 0;
    for (const id of ids) {
      const detail = await apiGet(connection.token, '/products/' + id);
      if (detail.status === 401 || detail.status === 403) {
        reports.push({ catalog_id: id, detail_http: detail.status }); break;
      }
      if (detail.status !== 200 || detail.data?.status !== 'active') {
        reports.push({ catalog_id: id, detail_http: detail.status, active: false }); continue;
      }
      const offers = await apiGet(connection.token, '/products/' + id + '/items?limit=' + MAX_LISTINGS);
      reports.push({ catalog_id: id, detail_http: detail.status, offers_http: offers.status });
      if (offers.status === 401 || offers.status === 403) break;
      if (offers.status !== 200) continue;
      const normalized = normalizeCatalogOffers(detail.data, offers.data, { maxOffers: MAX_LISTINGS });
      accepted += normalized.length;
      samples.push(...normalized.slice(0, 2));
    }
    return respond({
      ok: reports.some(r => r.offers_http === 200),
      mode: 'official_catalog_read_only', search_http: search.status,
      catalog_products_examined: ids.length, viable_listing_records: accepted,
      statuses: reports, samples: samples.slice(0, 4),
      oauth_refreshed: connection.refreshed,
      note: 'Sample prices are point-in-time API observations, not verified discounts unless original_price exists.',
      affiliate_links_generated: 0, attribution_verified: false,
      offer_database_writes: 0, delivery_jobs_created: 0, telegram_posts: 0,
    });
  } catch (e) {
    console.error('[ml-catalog-probe] bounded manual probe failed; no raw data logged');
    return respond({ ok: false, reason: e instanceof Error && e.name === 'TimeoutError'
      ? 'upstream_timeout' : 'probe_failed', no_publication: true }, 503);
  }
});

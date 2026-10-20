import assert from 'node:assert/strict'
import {
  normalizeDashboardPeriod, renderDashboardOperations, loadDashboardOperations
} from '../src/application/dashboard-operations.js'

assert.equal(normalizeDashboardPeriod(1), 1)
assert.equal(normalizeDashboardPeriod('7'), 7)
assert.equal(normalizeDashboardPeriod(30), 30)
assert.equal(normalizeDashboardPeriod(31), 1)

const requested = []
const stub = {
  rpc: async (name, payload) => {
    requested.push({ name, payload })
    return { data: { channels: [], generated_at: '2026-10-20T18:00:00Z' }, error: null }
  }
}
await loadDashboardOperations(stub, 7)
assert.deepEqual(requested[0], { name: 'mavuri_dashboard_operations_v1', payload: { p_days: 7 } })

const safe = (x) => String(x).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const metrics = {
  offers_created: 57, unique_offers_published: 126, messages_sent: 345,
  coupon_messages_sent: 19, errors: 6, pending: 5,
  generated_at: '2026-10-20T18:00:00Z',
  categories: { audited: 57, needs_review: 31, other: 13, fallback: 17 },
  channels: [{
    name: '<iframe>alert(1)</iframe>', type: 'telegram', sent: 345, offers: 326,
    coupons: 19, failed: 6, pending: 5, status: 'connected'
  }],
  marketplaces: [{ slug: 'mercadolivre', name: 'Mercado Livre', offers_published: 56 }],
  whapi: [{ paused: true, status: 'connected', next_check: '2026-10-20T19:00:00Z' }],
  latest_errors: [{ channel: 'Whatsapp', kind: 'oferta', error: '<img src=x>', created_at: '2026-10-20T18:00:00Z' }]
}
const html = renderDashboardOperations({ data: metrics, days: 7, loaded: true }, safe, (x) => x)
assert.match(html, /data-dashboard-period="7"/)
assert.match(html, /345/)
assert.match(html, /WhatsApp pausado por cota/)
assert.match(html, /&lt;iframe&gt;/)
assert.match(html, /&lt;img src=x&gt;/)
assert.doesNotMatch(html, /<iframe>/)
assert.doesNotMatch(html, /<img src=x>/)
const emptyHtml = renderDashboardOperations({ days: 1, error: '<unauthorized>' }, safe, (x) => x)
assert.match(emptyHtml, /&lt;unauthorized&gt;/)
console.log('Mavuri dashboard QA: OK')

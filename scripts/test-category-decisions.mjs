import assert from 'node:assert/strict'
import {
  applyCategoryDecision, undoCategoryDecision, loadCategoryDecisionHistory,
  renderCategoryDecisionControls, renderCategoryDecisionDialogs, renderCategoryHistoryList
} from '../src/application/category-decisions.js'

const calls = []
const supabase = {
  rpc: async (name, args) => {
    calls.push({ name, args })
    if (name === 'mavuri_dashboard_category_decide_v1') {
      return { data: { ok: true, action_id: 123, category: args.p_category_slug || 'beleza' }, error: null }
    }
    if (name === 'mavuri_dashboard_category_undo_v1') {
      return { data: { ok: true, undo_id: 124 }, error: null }
    }
    return { data: { items: [{ id: 123, action: 'correct', category_before: 'outros',
      category_after: 'beleza', created_at: '2026-10-20T16:00:00Z', note: '<script>' }] }, error: null }
  }
}
await applyCategoryDecision(supabase, {
  offerId: 'offer1', action: 'approve', updatedAt: '2026-10-20T16:00:00Z'
})
assert.deepEqual(calls[0], { name: 'mavuri_dashboard_category_decide_v1', args: {
  p_offer_id: 'offer1', p_action: 'approve', p_category_slug: null,
  p_expected_updated_at: '2026-10-20T16:00:00Z', p_note: null
}})
await applyCategoryDecision(supabase, {
  offerId: 'offer2', action: 'correct', targetSlug: 'beleza',
  updatedAt: '2026-10-20T16:00:00Z', note: '  Conferido  '
})
assert.equal(calls[1].args.p_category_slug, 'beleza')
assert.equal(calls[1].args.p_note, 'Conferido')
await undoCategoryDecision(supabase, 123)
assert.equal(calls[2].args.p_action_id, 123)
const history = await loadCategoryDecisionHistory(supabase, 'offer2')
assert.equal(history.items.length, 1)

const escapeHtml = (x) => String(x)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
const categories = [{ slug: 'moda', name: 'Moda' }, { slug: 'beleza', name: 'Beleza' },
  { slug: 'outros', name: 'Outros' }, { slug: '<script>', name: '<script>' }]
const approval = renderCategoryDecisionControls({
  offer_id: 'offer1', category_slug: 'moda', needs_review: true
}, categories, escapeHtml)
assert.match(approval, /data-cat-approve="offer1"/)
assert.match(approval, /data-cat-correct="offer1"/)
assert.doesNotMatch(approval, /<script>/)
const pending = renderCategoryDecisionControls({
  offer_id: 'offer2', category_slug: 'outros', needs_review: true
}, categories, escapeHtml)
assert.doesNotMatch(pending, /data-cat-approve/)
assert.match(pending, /data-cat-correct/)
const reviewed = renderCategoryDecisionControls({
  offer_id: 'offer2', category_slug: 'beleza', manual_decision: 'correct',
  last_action_id: 123, last_action_kind: 'correct', needs_review: false
}, categories, escapeHtml)
assert.match(reviewed, /data-cat-undo="123"/)
assert.doesNotMatch(reviewed, /data-cat-correct/)
assert.match(renderCategoryDecisionDialogs(), /id="cat-decision-confirm"/)
const log = renderCategoryHistoryList(history, escapeHtml, (x) => x)
assert.match(log, /Categoria corrigida/)
assert.match(log, /&lt;script&gt;/)
assert.doesNotMatch(log, /<script>/)

await assert.rejects(() => applyCategoryDecision(supabase,
  { offerId: 'a', action: 'correct', targetSlug: 'outros', updatedAt: 'now' }), /categoria específica/)
await assert.rejects(() => undoCategoryDecision(supabase, 'invalid'), /inválido/)

console.log('Mavuri category decisions QA: OK')

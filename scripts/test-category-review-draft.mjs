import assert from 'node:assert/strict'
import {
  emptyCategoryReviewDraft, normalizeCategoryReviewDraft, loadCategoryReviewDraft,
  saveCategoryReviewDraft, clearCategoryReviewDraft,
  captureCategoryReviewCards, restoreCategoryReviewCards,
  canRestorePendingCategoryDecision, removeCategoryReviewOfferDraft
} from '../src/application/category-review-draft.js'
import { readFile } from 'node:fs/promises'

const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'
const userId = '99999999-9999-4999-8999-999999999999'
const mock = new Map()
const storage = {
  getItem: (key) => mock.get(key) ?? null,
  setItem: (key, value) => mock.set(key, value),
  removeItem: (key) => mock.delete(key)
}
assert.deepEqual(loadCategoryReviewDraft(storage, userId), emptyCategoryReviewDraft())
const state = normalizeCategoryReviewDraft({
  version: 1, days: 7, view: 'other', marketplace: 'amazon', offset: 50,
  openOfferIds: [a,b,a,'<script>'],
  selections: { [a]: 'saude-bem-estar', [b]: 'automotivo', junk: '<script>' },
  pending: {
    offerId: a, action: 'correct', targetSlug: 'saude-bem-estar',
    updatedAt: '2026-10-20T21:42:49Z', note: 'Preciso conferir o produto'
  }
})
assert.equal(state.openOfferIds.length, 2)
assert.equal(state.selections.junk, undefined)
assert.equal(state.pending.action, 'correct')
assert.equal(state.pending.note, 'Preciso conferir o produto')
assert.equal(saveCategoryReviewDraft(storage, userId, state), true)
assert.deepEqual(loadCategoryReviewDraft(storage, userId), state)
assert.notDeepEqual(loadCategoryReviewDraft(storage, '88888888-8888-4888-8888-888888888888'), state)
assert.deepEqual(normalizeCategoryReviewDraft({ version: 44 }), emptyCategoryReviewDraft())
assert.equal(normalizeCategoryReviewDraft({ version: 1, view: '<script>', days: 999 }).view, 'review')

function card(offerId, open, currentValue, list) {
  const select = {
    value: currentValue,
    options: list.map((value) => ({ value }))
  }
  return {
    open,
    getAttribute: (name) => name === 'data-offer-id' ? offerId : null,
    querySelector: (sel) => sel === '[data-cat-target]' ? select : null,
    select
  }
}
const aBefore = card(a, true, 'saude-bem-estar', ['', 'saude-bem-estar', 'beleza'])
const bBefore = card(b, false, 'automotivo', ['', 'automotivo', 'casa'])
const root = { querySelectorAll: () => [aBefore,bBefore] }
const after = captureCategoryReviewCards(root, state)
assert.deepEqual(after.openOfferIds, [a])
assert.equal(after.selections[a], 'saude-bem-estar')
assert.equal(after.selections[b], 'automotivo')
assert.equal(after.pending.action, 'correct')
const aNew = card(a, false, '', ['', 'saude-bem-estar'])
const bNew = card(b, false, '', ['', 'automotivo'])
restoreCategoryReviewCards({ querySelectorAll: () => [aNew,bNew] }, after)
assert.equal(aNew.open, true)
assert.equal(bNew.open, false)
assert.equal(aNew.select.value, 'saude-bem-estar')
assert.equal(bNew.select.value, 'automotivo')

// Switching marketplace removes cards from the DOM, but does not discard their drafts.
const filteredOut = captureCategoryReviewCards({ querySelectorAll: () => [] }, after)
assert.deepEqual(filteredOut, after)
const onlyB = card(b, true, 'casa', ['', 'casa'])
const filteredIn = captureCategoryReviewCards({ querySelectorAll: () => [onlyB] }, after)
assert.ok(filteredIn.openOfferIds.includes(a))
assert.ok(filteredIn.openOfferIds.includes(b))
assert.equal(filteredIn.selections[a], 'saude-bem-estar')
assert.equal(filteredIn.selections[b], 'casa')

const reviewed = {
  offer_id: a, category_slug: 'outros',
  audit_updated_at: '2026-10-20T21:42:49Z', needs_review: true
}
assert.equal(canRestorePendingCategoryDecision(state.pending, reviewed, [
  { slug: 'saude-bem-estar' }
]), true)
assert.equal(canRestorePendingCategoryDecision(state.pending, {
  ...reviewed, audit_updated_at: '2026-10-20T22:00:00Z'
}, [{ slug: 'saude-bem-estar' }]), false)
assert.equal(canRestorePendingCategoryDecision(state.pending, {
  ...reviewed, needs_review: false
}, [{ slug: 'saude-bem-estar' }]), false)
assert.equal(canRestorePendingCategoryDecision(state.pending, reviewed, [
  { slug: 'automotivo' }
]), false)

const undo = {
  offerId: a, action: 'undo', actionId: 17, updatedAt: null, note: ''
}
assert.equal(canRestorePendingCategoryDecision(undo, {
  offer_id: a, manual_decision: 'approve',
  last_action_id: 17, last_action_kind: 'approve'
}), true)
assert.equal(canRestorePendingCategoryDecision(undo, {
  offer_id: a, manual_decision: 'approve',
  last_action_id: 18, last_action_kind: 'approve'
}), false)

const cleared = removeCategoryReviewOfferDraft(state,a)
assert.equal(cleared.pending, null)
assert.equal(cleared.selections[a], undefined)
assert.ok(!cleared.openOfferIds.includes(a))
assert.equal(cleared.selections[b], 'automotivo')

clearCategoryReviewDraft(storage,userId)
assert.deepEqual(loadCategoryReviewDraft(storage,userId), emptyCategoryReviewDraft())
assert.equal(saveCategoryReviewDraft({ setItem(){ throw Error('disabled') } },userId,state),false)

// A session refresh or browser tab focus MUST NOT rebuild the entire UI.
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8')
assert.match(main, /if \(previousUserId === nextUserId\) return/)
assert.match(main, /captureVisibleCategoryDraft\(\)/)
assert.match(main, /restoreCategoryReviewCards\(root, categoryUiDraft\)/)
assert.match(main, /canRestorePendingCategoryDecision\(/)
console.log('Mavuri category draft preservation QA: OK')

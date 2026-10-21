// Mavuri v0.1.47 — per-tab category-review UI draft.
// This module contains ONLY presentation state; no Supabase writes or tokens.
import {
  normalizeCategoryReviewView, normalizeCategoryReviewMarketplace,
  normalizeCategoryReviewOffset
} from './category-review.js?v=0.1.47'

const VERSION = 1
const OFFER_LIMIT = 150
const VALID_ACTIONS = new Set(['approve', 'correct', 'revise', 'undo'])

export function emptyCategoryReviewDraft() {
  return {
    version: VERSION,
    days: 1,
    view: 'review',
    marketplace: '',
    offset: 0,
    openOfferIds: [],
    selections: {},
    pending: null
  }
}

const id = (value) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
  ? value : null

export function normalizeCategoryReviewDraft(value) {
  const defaults = emptyCategoryReviewDraft()
  if (!value || typeof value !== 'object' || value.version !== VERSION) return defaults
  const days = [1, 7, 30].includes(Number(value.days)) ? Number(value.days) : 1
  const openOfferIds = Array.isArray(value.openOfferIds)
    ? [...new Set(value.openOfferIds.filter(id))].slice(-OFFER_LIMIT)
    : []
  const selections = {}
  if (value.selections && typeof value.selections === 'object' &&
    !Array.isArray(value.selections)) {
    for (const [offerId, category] of Object.entries(value.selections).slice(-OFFER_LIMIT)) {
      if (id(offerId) && /^[a-z0-9-]{1,64}$/.test(String(category || ''))) {
        selections[offerId] = String(category)
      }
    }
  }
  const raw = value.pending
  const pending = raw && id(raw.offerId) && VALID_ACTIONS.has(raw.action) &&
      (!['correct','revise'].includes(raw.action) || /^[a-z0-9-]{1,64}$/.test(String(raw.targetSlug || '')))
    ? {
        offerId: raw.offerId, action: raw.action,
        targetSlug: typeof raw.targetSlug === 'string' ? raw.targetSlug : null,
        actionId: Number.isSafeInteger(Number(raw.actionId)) && Number(raw.actionId) > 0
          ? Number(raw.actionId) : null,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt.slice(0, 64) : null,
        note: typeof raw.note === 'string' ? raw.note.slice(0, 500) : ''
      }
    : null
  return {
    version: VERSION,
    days,
    view: normalizeCategoryReviewView(value.view),
    marketplace: normalizeCategoryReviewMarketplace(value.marketplace),
    offset: normalizeCategoryReviewOffset(value.offset),
    openOfferIds,
    selections,
    pending
  }
}

export function categoryReviewDraftKey(userId) {
  return 'mavuri.categoryReview.ui.v1:' + userId
}

export function loadCategoryReviewDraft(storage, userId) {
  if (!storage || !id(userId)) return emptyCategoryReviewDraft()
  try {
    const content = storage.getItem(categoryReviewDraftKey(userId))
    return content ? normalizeCategoryReviewDraft(JSON.parse(content)) : emptyCategoryReviewDraft()
  } catch {
    return emptyCategoryReviewDraft()
  }
}

export function saveCategoryReviewDraft(storage, userId, data) {
  if (!storage || !id(userId)) return false
  try {
    storage.setItem(categoryReviewDraftKey(userId),
      JSON.stringify(normalizeCategoryReviewDraft(data)))
    return true
  } catch {
    // Private browsing and storage restrictions must not break the review UI.
    return false
  }
}

export function clearCategoryReviewDraft(storage, userId) {
  if (!storage || !id(userId)) return
  try { storage.removeItem(categoryReviewDraftKey(userId)) } catch { /* restricted storage */ }
}

// Preserve only cards currently rendered; keep selections from other filters/pages.
export function captureCategoryReviewCards(root, draft) {
  const state = normalizeCategoryReviewDraft(draft)
  if (!root || typeof root.querySelectorAll !== 'function') return state
  const cards = [...root.querySelectorAll('.cat-review-card[data-offer-id]')]
  if (!cards.length) return state
  const expanded = new Set(state.openOfferIds)
  for (const card of cards) {
    const offerId = id(card.getAttribute('data-offer-id'))
    if (!offerId) continue
    if (card.open) expanded.add(offerId)
    else expanded.delete(offerId)
    const select = card.querySelector('[data-cat-target]')
    if (!select) continue
    const category = String(select.value || '')
    if (category && [...select.options].some((o) => o.value === category)) {
      state.selections[offerId] = category
    } else {
      delete state.selections[offerId]
    }
  }
  state.openOfferIds = [...expanded].slice(-OFFER_LIMIT)
  return state
}

export function restoreCategoryReviewCards(root, draft) {
  const state = normalizeCategoryReviewDraft(draft)
  if (!root || typeof root.querySelectorAll !== 'function') return
  const open = new Set(state.openOfferIds)
  for (const card of root.querySelectorAll('.cat-review-card[data-offer-id]')) {
    const offerId = id(card.getAttribute('data-offer-id'))
    if (!offerId) continue
    card.open = open.has(offerId)
    const select = card.querySelector('[data-cat-target]')
    const remembered = state.selections[offerId]
    if (select && remembered && [...select.options].some((o) => o.value === remembered)) {
      select.value = remembered
    }
  }
}

export function removeCategoryReviewOfferDraft(draft, offerId) {
  const state = normalizeCategoryReviewDraft(draft)
  state.openOfferIds = state.openOfferIds.filter((x) => x !== offerId)
  delete state.selections[offerId]
  if (state.pending?.offerId === offerId) state.pending = null
  return state
}

export function canRestorePendingCategoryDecision(pending, item, validCategories) {
  if (!pending || !item || pending.offerId !== item.offer_id) return false
  if (pending.action === 'undo') {
    return Boolean(item.manual_decision) &&
      Number(item.last_action_id) === Number(pending.actionId) &&
      ['approve', 'correct', 'revise'].includes(item.last_action_kind)
  }
  if (pending.action === 'revise') {
    return Boolean(item.manual_decision) &&
      item.audit_updated_at === pending.updatedAt &&
      Number(item.last_action_id) === Number(pending.actionId) &&
      ['approve', 'correct', 'revise'].includes(item.last_action_kind) &&
      pending.targetSlug !== item.category_slug &&
      Array.isArray(validCategories) &&
      validCategories.some((c) => c.slug === pending.targetSlug)
  }
  if (!item.needs_review || item.manual_decision ||
      item.audit_updated_at !== pending.updatedAt) return false
  if (pending.action === 'approve') {
    return Boolean(item.category_slug && item.category_slug !== 'outros')
  }
  return pending.action === 'correct' &&
    pending.targetSlug !== item.category_slug &&
    Array.isArray(validCategories) &&
    validCategories.some((c) => c.slug === pending.targetSlug)
}

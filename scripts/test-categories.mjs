import assert from 'node:assert/strict'
import {
  normalizeCategoryReviewView, normalizeCategoryReviewMarketplace,
  normalizeCategoryReviewOffset, loadCategoryReviews, renderCategoryReviews
} from '../src/application/category-review.js'

assert.equal(normalizeCategoryReviewView('review'), 'review')
assert.equal(normalizeCategoryReviewView('other'), 'other')
assert.equal(normalizeCategoryReviewView('bad'), 'review')
assert.equal(normalizeCategoryReviewMarketplace('amazon'), 'amazon')
assert.equal(normalizeCategoryReviewMarketplace('unknown'), '')
assert.equal(normalizeCategoryReviewOffset(-100), 0)
assert.equal(normalizeCategoryReviewOffset('50'), 50)
assert.equal(normalizeCategoryReviewOffset('100000'), 5000)

const calls = []
const supabase = {
  rpc: async (name, args) => {
    calls.push({ name, args })
    return { data: { total: 36, review_total: 36, other_total: 15, items: [] }, error: null }
  }
}
const data = await loadCategoryReviews(supabase, {
  days: 7, view: 'review', marketplace: 'amazon', offset: 50
})
assert.equal(data.total, 36)
assert.deepEqual(calls[0], {
  name: 'mavuri_dashboard_category_reviews_v1',
  args: { p_days: 7, p_view: 'review', p_marketplace: 'amazon', p_limit: 50, p_offset: 50 }
})

const escapeHtml = (x) => String(x)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')

const rows = [
  {
    offer_id: 'a',
    title: '<img src=x onerror=alert(1)> Kit Shampoo automotivo Vonixx',
    marketplace: 'mercadolivre',
    source_category_id: 'MLB431864',
    source_category_name: 'Shampoo para Carros',
    category_slug: 'automotivo',
    category_name: 'Automotivo',
    tags: [],
    classification_source: 'marketplace_category_map',
    confidence: 1,
    review_reason: 'official_category_unmapped',
    needs_review: true,
    created_at: '2026-10-20T15:00:00Z',
    affiliate_url: 'javascript:alert(1)',
    image_url: 'javascript:alert(1)',
    official_map_slug: 'automotivo',
    statistical_suggestion: null
  },
  {
    offer_id: 'b',
    title: 'Produto sem classificação',
    marketplace: 'amazon',
    source_category_id: null,
    source_category_name: null,
    category_slug: 'outros',
    category_name: 'Outros',
    tags: ['<svg onload=alert(1)>'],
    classification_source: 'unclassified',
    confidence: .2,
    review_reason: 'missing_official_category',
    needs_review: true,
    created_at: '2026-10-20T17:00:00Z',
    affiliate_url: 'https://www.amazon.com.br/dp/B012345678?tag=affiliate',
    image_url: 'https://images.example.com/a.png',
    official_map_slug: null,
    statistical_suggestion: {
      slug: 'casa',
      occurrences: 2,
      confidence: .65
    }
  }
]
const rendered = renderCategoryReviews({
  days: 1, view: 'review', marketplace: '', offset: 0,
  data: { items: rows, total: 2, review_total: 2, other_total: 1 },
  loaded: true, error: ''
}, escapeHtml, (x) => x)
assert.match(rendered, /Auditoria de categorias/)
assert.match(rendered, /data-cat-view/)
assert.match(rendered, /data-cat-marketplace/)
assert.match(rendered, /Shampoo para Carros/)
assert.match(rendered, /Somente leitura/)
assert.match(rendered, /Indício estatístico — não aprovado/)
assert.match(rendered, /Não aplicar sem conferir exemplos reais/)
assert.match(rendered, /&lt;img src=x onerror=alert\(1\)&gt;/)
assert.match(rendered, /&lt;svg onload=alert\(1\)&gt;/)
assert.doesNotMatch(rendered, /href="javascript/)
assert.doesNotMatch(rendered, /src="javascript/)
assert.doesNotMatch(rendered, /<svg onload=/)
const empty = renderCategoryReviews({
  days: 1, view: 'other', marketplace: 'amazon', offset: 0,
  data: { items: [], total: 0, review_total: 0, other_total: 0 },
  loaded: true, error: ''
}, escapeHtml, (x) => x)
assert.match(empty, /Nenhuma oferta corresponde aos filtros/)
const failures = renderCategoryReviews({ days: 1, view: 'review', error: '<erro>' }, escapeHtml, (x) => x)
assert.match(failures, /&lt;erro&gt;/)

console.log('Mavuri categories QA: OK')

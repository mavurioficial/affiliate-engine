// Mavuri v0.1.46 — auditoria com confirmação e histórico de ações individuais.
// Nunca cria mapeamentos automáticos de categoria oficial.
import { renderCategoryDecisionControls, renderCategoryDecisionDialogs } from './category-decisions.js?v=0.1.46.1'
export const CATEGORY_REVIEW_VIEWS = ['review', 'other', 'reviewed', 'all']
export const CATEGORY_REVIEW_MARKETS = ['', 'mercadolivre', 'shopee', 'magalu', 'amazon']
const CATEGORY_REVIEW_LIMIT = 50

export function normalizeCategoryReviewView(value) {
  return CATEGORY_REVIEW_VIEWS.includes(value) ? value : 'review'
}
export function normalizeCategoryReviewMarketplace(value) {
  return CATEGORY_REVIEW_MARKETS.includes(value) ? value : ''
}
export function normalizeCategoryReviewOffset(value) {
  const offset = Math.trunc(Number(value) || 0)
  return Math.max(0, Math.min(5000, offset))
}
export async function loadCategoryReviews(supabase, options = {}) {
  const days = [1, 7, 30].includes(Number(options.days)) ? Number(options.days) : 1
  const { data, error } = await supabase.rpc('mavuri_dashboard_category_reviews_v1', {
    p_days: days,
    p_view: normalizeCategoryReviewView(options.view),
    p_marketplace: normalizeCategoryReviewMarketplace(options.marketplace),
    p_limit: CATEGORY_REVIEW_LIMIT,
    p_offset: normalizeCategoryReviewOffset(options.offset)
  })
  if (error) throw error
  if (!data || !Array.isArray(data.items) || !Number.isFinite(Number(data.total))) {
    throw new Error('A auditoria retornou dados inválidos.')
  }
  return data
}

const marketNames = {
  mercadolivre: 'Mercado Livre',
  shopee: 'Shopee',
  magalu: 'Magalu',
  amazon: 'Amazon'
}
const displayCategory = (slug) => {
  const names = {
    automotivo: 'Automotivo', beleza: 'Beleza', casa: 'Casa',
    cozinha: 'Cozinha', infantil: 'Infantil', informatica: 'Informática',
    eletronicos: 'Eletrônicos', ferramentas: 'Ferramentas', moda: 'Moda',
    pet: 'Pet', outros: 'Outros', 'saude-bem-estar': 'Saúde e bem-estar'
  }
  return names[slug] || (slug ? String(slug).replaceAll('-', ' ') : 'Não identificada')
}
const displayReason = (reason, hasOfficial) => {
  if (String(reason || '').startsWith('category_title_conflict:')) {
    return 'Conflito entre a categoria oficial e o conteúdo do título'
  }
  if (reason === 'missing_official_category') return 'Marketplace não forneceu uma categoria oficial'
  if (reason === 'unmapped_category_no_fallback') return 'Categoria oficial sem mapeamento e título inconclusivo'
  if (reason === 'official_category_unmapped') {
    return hasOfficial ? 'Categoria oficial ainda não possui mapeamento aprovado' : 'Classificação por título, sem categoria oficial mapeável'
  }
  if (reason === 'low_confidence') return 'Classificação com confiança insuficiente'
  return reason ? 'Revisão necessária: ' + String(reason).replaceAll('_', ' ') : 'Classificação pendente de conferência'
}
const categoryConfidence = (value) => {
  const n = Number(value)
  return value === null || value === undefined || !Number.isFinite(n)
    ? 'Sem confiança registrada'
    : Math.round(Math.max(0, Math.min(1, n)) * 100) + '% de confiança registrada'
}
function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}
function reviewBadge(item) {
  if (item.manual_decision) return [item.manual_decision === 'correct' ? 'Corrigida' : 'Aprovada', 'classified']
  const reason = String(item.review_reason || '')
  if (reason.startsWith('category_title_conflict:')) return ['Conflito', 'conflict']
  if (item.category_slug === 'outros') return ['Sem classificação útil', 'unclassified']
  if (item.needs_review) return ['Revisar', 'review']
  return ['Classificada', 'classified']
}

export function renderCategoryReviews(state, escapeHtml, formatDateTimeBR) {
  const safe = (value) => escapeHtml(String(value ?? ''))
  const data = state.data || null
  const pageItems = Array.isArray(data?.items) ? data.items : []
  const view = normalizeCategoryReviewView(state.view)
  const marketplace = normalizeCategoryReviewMarketplace(state.marketplace)
  const offset = normalizeCategoryReviewOffset(state.offset)
  const total = Math.max(0, Number(data?.total || 0))
  const limit = CATEGORY_REVIEW_LIMIT
  const firstNumber = total ? offset + 1 : 0
  const lastNumber = Math.min(total, offset + pageItems.length)
  const reviewCount = data?.review_total ?? 0
  const otherCount = data?.other_total ?? 0
  const error = state.error ? '<p class="cat-error" role="alert">' + safe(state.error) + '</p>' : ''
  const notice = state.notice ? '<p class="cat-result-notice" role="status">' + safe(state.notice) + '</p>' : ''

  const selectView = CATEGORY_REVIEW_VIEWS.map((id) => {
    const label = id === 'review' ? 'Em revisão' : id === 'other' ? 'Classificadas em Outros' : id === 'reviewed' ? 'Revisadas manualmente' : 'Todas auditadas'
    return '<option value="' + id + '"' + (id === view ? ' selected' : '') + '>' + label + '</option>'
  }).join('')
  const selectMarkets = CATEGORY_REVIEW_MARKETS.map((id) => {
    const label = id ? marketNames[id] : 'Todos os marketplaces'
    return '<option value="' + safe(id) + '"' + (id === marketplace ? ' selected' : '') + '>' + safe(label) + '</option>'
  }).join('')

  const cards = pageItems.map((item) => {
    const [badge, badgeClass] = reviewBadge(item)
    const originalName = item.source_category_name || ''
    const officialId = item.source_category_id || ''
    const hasOfficial = Boolean(officialId || originalName)
    const confidence = categoryConfidence(item.confidence)
    const image = safeHttpUrl(item.image_url)
    const link = safeHttpUrl(item.affiliate_url)
    const tags = Array.isArray(item.tags) ? item.tags : []
    const mapped = item.official_map_slug ? displayCategory(item.official_map_slug) : 'Nenhum mapeamento aprovado'
    const mismatch = item.official_map_slug && item.official_map_slug !== item.category_slug
    const stat = item.statistical_suggestion
    const suggestion = stat && stat.slug
      ? '<div class="cat-statistical"><strong>Indício estatístico — não aprovado:</strong> ' +
        safe(displayCategory(stat.slug)) +
        ' · ' + Math.max(0, Number(stat.occurrences) || 0) + ' ocorrência(s) na auditoria. ' +
        'Não aplicar sem conferir exemplos reais.</div>'
      : ''
    const media = image
      ? '<img src="' + safe(image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" />'
      : '<span aria-hidden="true">📦</span>'
    const action = link
      ? '<a class="cat-action" href="' + safe(link) + '" target="_blank" rel="noopener noreferrer sponsored">Abrir oferta afiliada ↗</a>'
      : '<span class="cat-action-muted">Sem link válido disponível</span>'
    return '<details class="cat-review-card">' +
      '<summary class="cat-summary">' +
        '<span class="cat-thumb">' + media + '</span>' +
        '<span class="cat-summary-main"><strong>' + safe(item.title || 'Produto sem título') + '</strong>' +
          '<span class="cat-summary-meta">' + safe(marketNames[item.marketplace] || item.marketplace || 'Marketplace') +
            ' · Categoria atual: ' + safe(displayCategory(item.category_slug)) +
            ' · ' + safe(formatDateTimeBR(item.created_at)) + '</span>' +
        '</span>' +
        '<span class="cat-review-badge ' + badgeClass + '">' + badge + '</span>' +
        '<span class="cat-expand" aria-hidden="true">⌄</span>' +
      '</summary>' +
      '<div class="cat-details">' +
        (item.manual_decision
          ? '<div class="cat-reason cat-reason-approved"><strong>Revisão manual concluída</strong><span>Decisão registrada com histórico e reversão da última ação.</span></div>'
          : '<div class="cat-reason"><strong>Por que revisar?</strong><span>' +
              safe(displayReason(item.review_reason, hasOfficial)) + '</span></div>') +
        '<div class="cat-comparison">' +
          '<div><small>Categoria oficial do marketplace</small><strong>' +
            safe(originalName || (officialId ? 'Nome não informado' : 'Não informada')) + '</strong>' +
            '<span>' + (officialId ? 'ID: ' + safe(officialId) : 'Sem ID oficial') + '</span></div>' +
          '<div><small>Mapeamento oficial no Mavuri</small><strong>' + safe(mapped) + '</strong>' +
            (mismatch ? '<span class="cat-warning">Diverge da classificação atual; conferir regra específica.</span>' : '') +
            '</div>' +
          '<div><small>Categoria atribuída ao produto</small><strong>' +
            safe(item.category_name || displayCategory(item.category_slug)) + '</strong>' +
            '<span>' + safe(confidence) + '</span></div>' +
        '</div>' +
        '<div class="cat-details-row"><span><b>Método:</b> ' +
          safe(item.classification_source || 'Não informado') + '</span>' +
          '<span><b>Etiquetas:</b> ' + safe(tags.length ? tags.join(', ') : 'Nenhuma') + '</span></div>' +
        suggestion +
        '<div class="cat-actions">' + action +
          '<span>Somente leitura até você confirmar uma decisão</span></div>' +
        renderCategoryDecisionControls(item, data?.categories, escapeHtml) +
      '</div>' +
    '</details>'
  }).join('')

  const current = Math.floor(offset / limit) + 1
  const maxPage = Math.max(1, Math.ceil(total / limit))
  const hasPrev = offset > 0
  const hasNext = offset + pageItems.length < total
  return '<section id="mavuri-category-reviews" class="cat-review-panel" aria-label="Auditoria individual de categorias">' +
    '<div class="cat-review-header"><div><p class="cat-eyebrow">QUALIDADE DOS NICHOS</p>' +
      '<h2>Auditoria de categorias</h2>' +
      '<p>Abra cada produto e confira a categoria oficial, a classificação atual e o motivo do alerta.</p></div>' +
      '<span class="cat-count">' + (data ? Number(reviewCount).toLocaleString('pt-BR') : '—') +
        ' em revisão · ' + (data ? Number(data.reviewed_total || 0).toLocaleString('pt-BR') : '—') + ' revisadas</span></div>' +
    '<div class="cat-review-filters">' +
      '<label><span>Situação</span><select data-cat-view>' + selectView + '</select></label>' +
      '<label><span>Marketplace</span><select data-cat-marketplace>' + selectMarkets + '</select></label>' +
      '<span class="cat-filter-note">' + Number(otherCount).toLocaleString('pt-BR') +
        ' em Outros no período e marketplace selecionados</span>' +
    '</div>' + error + notice +
    (state.loading && !data ? '<p class="cat-empty">Carregando ofertas auditadas…</p>'
      : data
        ? '<div class="cat-results"><span>' + firstNumber + '–' + lastNumber + ' de ' +
            total.toLocaleString('pt-BR') + ' resultado(s)</span>' +
            '<span>Período sincronizado com os indicadores acima</span></div>' +
          (cards || '<p class="cat-empty">Nenhuma oferta corresponde aos filtros selecionados.</p>') +
          '<div class="cat-pagination">' +
            '<span>Página ' + current + ' de ' + maxPage + '</span>' +
            '<div><button type="button" data-cat-page="prev"' +
              (hasPrev ? '' : ' disabled') + '>← Anterior</button>' +
            '<button type="button" data-cat-page="next"' +
              (hasNext ? '' : ' disabled') + '>Próxima →</button></div></div>'
        : '<p class="cat-empty">Não foi possível carregar a auditoria.</p>') +
    '<p class="cat-footnote">A confiança registrada pelo classificador não prova que uma categoria esteja correta. ' +
      'Decisões manuais são individuais, registradas em histórico e não aprovam mapeamentos oficiais em lote.</p>' +
  '</section>' + renderCategoryDecisionDialogs()
}

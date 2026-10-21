// Mavuri v0.1.46: authorizações autenticadas para decisões individuais.
// Nunca altera mapeamentos oficiais em lote e nunca chama rotinas de publicação.

export async function applyCategoryDecision(supabase, { offerId, action, targetSlug, updatedAt, note = '' }) {
  if (!offerId || !['approve', 'correct'].includes(action) || !updatedAt) {
    throw new Error('Dados incompletos para a decisão.')
  }
  if (action === 'correct' && (!targetSlug || targetSlug === 'outros')) {
    throw new Error('Selecione uma categoria específica para corrigir.')
  }
  const { data, error } = await supabase.rpc('mavuri_dashboard_category_decide_v1', {
    p_offer_id: offerId,
    p_action: action,
    p_category_slug: action === 'correct' ? targetSlug : null,
    p_expected_updated_at: updatedAt,
    p_note: note?.trim() || null
  })
  if (error) throw error
  if (!data?.ok || !data.action_id) throw new Error('A decisão não foi confirmada pelo Supabase.')
  return data
}

export async function reviseCategoryDecision(supabase, { offerId, targetSlug, updatedAt, expectedActionId, note = '' }) {
  const lastId = Number(expectedActionId)
  if (!offerId || !targetSlug || targetSlug === 'outros' || !updatedAt ||
    !Number.isSafeInteger(lastId) || lastId <= 0) {
    throw new Error('Dados incompletos para alterar a categoria.')
  }
  const { data, error } = await supabase.rpc('mavuri_dashboard_category_revise_v1', {
    p_offer_id: offerId,
    p_category_slug: targetSlug,
    p_expected_updated_at: updatedAt,
    p_expected_action_id: lastId,
    p_note: note?.trim() || null
  })
  if (error) throw error
  if (!data?.ok || data.action !== 'revise' || !data.action_id) {
    throw new Error('A nova categoria não foi confirmada pelo Supabase.')
  }
  return data
}

export async function undoCategoryDecision(supabase, actionId) {
  const id = Number(actionId)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Identificador da decisão inválido.')
  const { data, error } = await supabase.rpc('mavuri_dashboard_category_undo_v1', {
    p_action_id: id
  })
  if (error) throw error
  if (!data?.ok || !data.undo_id) throw new Error('A reversão não foi confirmada pelo Supabase.')
  return data
}

export async function loadCategoryDecisionHistory(supabase, offerId) {
  if (!offerId) throw new Error('Oferta não identificada.')
  const { data, error } = await supabase.rpc('mavuri_dashboard_category_history_v1', {
    p_offer_id: offerId
  })
  if (error) throw error
  if (!data || !Array.isArray(data.items)) throw new Error('Histórico indisponível.')
  return data
}

export function renderCategoryDecisionControls(item, categories, escapeHtml) {
  const safe = (value) => escapeHtml(String(value ?? ''))
  const offerId = safe(item.offer_id)
  const reviewed = Boolean(item.manual_decision)
  const needsReview = item.needs_review === true
  const eligible = needsReview && !reviewed
  const active = Array.isArray(categories)
    ? categories.filter((c) => c?.slug && c.slug !== 'outros' && c.slug !== item.category_slug)
    : []
  const options = active.map((c) =>
    '<option value="' + safe(c.slug) + '">' + safe(c.name || c.slug) + '</option>'
  ).join('')
  const heading = reviewed
    ? '<span class="cat-approved-note">✓ ' +
      (item.manual_decision === 'correct' ? 'Categoria corrigida manualmente' : 'Categoria aprovada manualmente') +
      '</span>'
    : '<span class="cat-review-hint">A revisão vale somente para esta oferta.</span>'
  const approval = eligible && item.category_slug && item.category_slug !== 'outros'
    ? '<button type="button" class="cat-decision-approve" data-cat-approve="' + offerId +
      '">✓ Aprovar categoria atual</button>'
    : ''
  const correction = (eligible || reviewed) && options
    ? '<label class="cat-target-wrapper"><span>Corrigir para:</span>' +
        '<select data-cat-target><option value="">Selecionar categoria…</option>' + options + '</select>' +
      '</label>' +
      (reviewed
        ? '<button type="button" class="cat-decision-correct" data-cat-revise="' + offerId + '">Alterar categoria</button>'
        : '<button type="button" class="cat-decision-correct" data-cat-correct="' + offerId + '">Corrigir categoria</button>')
    : ''
  const undo = reviewed && item.last_action_id && ['approve', 'correct', 'revise'].includes(item.last_action_kind)
    ? '<button type="button" class="cat-decision-undo" data-cat-undo="' +
       safe(item.last_action_id) + '" data-cat-offer="' + offerId + '">↶ Desfazer última decisão</button>'
    : ''
  return '<div class="cat-decision-controls">' + heading +
    '<div class="cat-decision-tools">' + approval + correction + undo +
    '<button type="button" class="cat-decision-history" data-cat-history="' + offerId +
    '">Histórico</button></div>' +
    '<small>Confirmação obrigatória · sem alteração de categoria oficial ou republicação.</small>' +
  '</div>'
}

export function renderCategoryDecisionDialogs() {
  return '<dialog class="cat-decision-dialog" id="cat-decision-confirm" aria-labelledby="cat-confirm-title">' +
    '<form method="dialog" class="cat-decision-form">' +
      '<div class="cat-dialog-eyebrow">REVISÃO INDIVIDUAL</div>' +
      '<h3 id="cat-confirm-title">Confirmar decisão</h3>' +
      '<p id="cat-confirm-product" class="cat-dialog-product"></p>' +
      '<p id="cat-confirm-description" class="cat-dialog-description"></p>' +
      '<label class="cat-dialog-note"><span>Observação (opcional)</span>' +
        '<textarea id="cat-confirm-note" maxlength="500" rows="2" placeholder="Ex.: conferido pelo título e foto do produto"></textarea>' +
      '</label>' +
      '<p class="cat-dialog-warning">Esta ação vale somente para a oferta selecionada. Não cria um mapeamento global e não altera mensagens já publicadas.</p>' +
      '<p class="cat-dialog-error" id="cat-confirm-error" role="alert" hidden></p>' +
      '<div class="cat-dialog-buttons">' +
        '<button type="button" data-cat-confirm-cancel>Cancelar</button>' +
        '<button type="button" data-cat-confirm-submit>Confirmar decisão</button>' +
      '</div></form></dialog>' +
    '<dialog class="cat-decision-dialog" id="cat-decision-history" aria-labelledby="cat-history-title">' +
      '<div class="cat-decision-form">' +
        '<div class="cat-dialog-eyebrow">RASTREABILIDADE</div>' +
        '<h3 id="cat-history-title">Histórico de decisões</h3>' +
        '<p id="cat-history-product" class="cat-dialog-product"></p>' +
        '<div id="cat-history-entries" class="cat-history-entries">Carregando histórico…</div>' +
        '<div class="cat-dialog-buttons"><button type="button" data-cat-history-close>Fechar</button></div>' +
      '</div></dialog>'
}

export function renderCategoryHistoryList(history, escapeHtml, formatDateTimeBR) {
  const safe = (v) => escapeHtml(String(v ?? ''))
  const names = {
    approve: 'Categoria aprovada',
    correct: 'Categoria corrigida',
    revise: 'Categoria alterada novamente',
    undo: 'Decisão desfeita'
  }
  if (!history?.items?.length) {
    return '<p class="cat-history-empty">Nenhuma decisão manual registrada para esta oferta.</p>'
  }
  return '<div class="cat-history-list">' + history.items.map((e) =>
    '<div class="cat-history-entry"><strong>' + safe(names[e.action] || e.action) +
    '</strong><time>' + safe(formatDateTimeBR(e.created_at)) + '</time>' +
    '<p>' + safe(e.category_before || 'Sem categoria') +
      ' → ' + safe(e.category_after || 'Sem categoria') + '</p>' +
    (e.note ? '<small>' + safe(e.note) + '</small>' : '') +
    '</div>'
  ).join('') + '</div>'
}

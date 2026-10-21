// Mavuri v0.1.48 — learning signals, read-only.
// Human-reviewed samples do NOT create global categories or automatic rules.
export async function loadCategoryLearningCandidates(supabase) {
  const { data, error } = await supabase.rpc('mavuri_dashboard_learning_candidates_v1', {
    p_min_examples: 2
  })
  if (error) throw error
  if (!data || !Array.isArray(data.items) || data.automatic_rules_applied !== false) {
    throw new Error('A consulta de aprendizado retornou dados inesperados.')
  }
  return data
}

const marketplaceNames = {
  mercadolivre: 'Mercado Livre', shopee: 'Shopee',
  magalu: 'Magalu', amazon: 'Amazon'
}

export function renderCategoryLearningCandidates(state, escapeHtml) {
  const safe = (value) => escapeHtml(String(value ?? ''))
  const entries = Array.isArray(state.data?.items) ? state.data.items : []
  const cards = entries.map((item) => {
    const isConflict = item.confidence_label === 'conflito' || Number(item.destinations) > 1
    const name = item.source_category_name || 'Categoria sem nome'
    const label = isConflict ? 'Classificações conflitantes' :
      item.confidence_label === 'candidato_forte' ? 'Consistência observada' : 'Precisa de mais exemplos'
    const examples = (Array.isArray(item.examples) ? item.examples : []).slice(0,3).map((sample) =>
      '<li><strong>' + safe(sample.title) + '</strong><small>Destino revisado: ' +
      safe(sample.category) + '</small></li>'
    ).join('')
    return '<article class="cat-learning-card">' +
      '<div class="cat-learning-card-head">' +
        '<strong>' + safe(marketplaceNames[item.marketplace] || item.marketplace) +
          ' · ' + safe(name) + '</strong>' +
        '<span class="' + (isConflict ? 'cat-learning-conflict' : 'cat-learning-status') +
          '">' + safe(label) + '</span>' +
      '</div>' +
      '<div class="cat-learning-card-meta">Categoria oficial: <code>' +
        safe(item.source_category_id) + '</code> · ' +
        Number(item.reviewed_examples || 0).toLocaleString('pt-BR') +
        ' produtos revisados</div>' +
      '<p>' + (isConflict
        ? 'Existem destinos divergentes. Não criar regra automática.'
        : 'Sugestão de destino: <strong>' + safe(item.suggested_category) + '</strong>') + '</p>' +
      '<details class="cat-learning-examples"><summary>Ver exemplos que sustentam a sugestão</summary>' +
        '<ul>' + examples + '</ul></details>' +
      '</article>'
  }).join('')

  return '<section class="cat-learning-panel" aria-label="Padrões sugeridos pelo histórico de revisões">' +
    '<div class="cat-learning-heading">' +
      '<div><div class="cat-learning-eyebrow">APRENDIZADO SUPERVISIONADO</div>' +
        '<h2>Possíveis melhorias do classificador</h2>' +
        '<p>Somente categorias oficiais com dois ou mais produtos revisados. Confirme os exemplos antes de transformar qualquer sugestão em regra.</p></div>' +
      '<span>' + (state.data ? entries.length : '—') + ' padrões</span>' +
    '</div>' +
    (state.loading && !state.data
      ? '<p class="cat-learning-empty">Carregando sugestões…</p>'
      : state.error
        ? '<p class="cat-error" role="alert">' + safe(state.error) + '</p>'
        : cards || '<p class="cat-learning-empty">Ainda não há exemplos suficientes para propor um padrão confiável.</p>') +
    '<p class="cat-learning-footnote">Nenhuma regra foi aplicada automaticamente. Uma alteração individual não autoriza mudanças em ofertas semelhantes. Itens multiuso devem continuar sendo avaliados caso a caso.</p>' +
  '</section>'
}

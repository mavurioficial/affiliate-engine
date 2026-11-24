// Dashboard operacional V1, dados agregados pelo Supabase e isolados por auth.uid().
export const DASHBOARD_PERIODS = Object.freeze([1, 7, 30])

export function normalizeDashboardPeriod(value) {
  const period = Number(value)
  return DASHBOARD_PERIODS.includes(period) ? period : 1
}

export async function loadDashboardOperations(supabase, days = 1) {
  const { data, error } = await supabase.rpc('mavuri_dashboard_operations_v1', {
    p_days: normalizeDashboardPeriod(days)
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || !Array.isArray(data.channels)) {
    throw new Error('Resumo operacional inválido. Atualize o painel.')
  }
  // The current-channel monitor is owner-only; legacy metrics remain available if it fails.
  let monitor = null, monitorError = ''
  try {
    const m = await supabase.rpc('mavuri_monitor_dashboard')
    if (m.error || !m.data || !Array.isArray(m.data.queues)) throw new Error('monitor unavailable')
    monitor = m.data
  } catch { monitorError = 'Indicadores do monitor indisponíveis nesta sessão.' }
  return { ...data, monitor, monitorError }
}

const quantity = (value) => Math.max(0, Number(value) || 0).toLocaleString('pt-BR')
const pct = (numerator, denominator) => Number(denominator) > 0
  ? Math.max(0, Math.min(100, Math.round(Number(numerator || 0) * 100 / Number(denominator))))
  : 0

export function renderDashboardOperations(state, escapeHtml, formatDateTime) {
  const safe = (value) => escapeHtml(String(value ?? ''))
  const days = normalizeDashboardPeriod(state.days)
  const data = state.data
  const periodName = days === 1 ? 'hoje' : days === 7 ? 'últimos 7 dias' : 'últimos 30 dias'
  const tabs = DASHBOARD_PERIODS.map((period) =>
    '<button type="button" data-dashboard-period="' + period + '" class="ops-period ' +
    (period === days ? 'active' : '') + '" aria-pressed="' + (period === days) + '">' +
    (period === 1 ? 'Hoje' : period + ' dias') + '</button>'
  ).join('')

  const heading = '<div class="ops-toolbar"><div><h2>Operação Mavuri</h2>' +
    '<p>Dados reais do Supabase · ' + safe(periodName) + ' · fuso de Brasília</p></div>' +
    '<div class="ops-periods" role="group" aria-label="Período">' + tabs + '</div></div>'

  if (!data) {
    return '<section class="dashboard-panel ops-panel" aria-label="Painel operacional">' + heading +
      (state.error ? '<div class="notice" role="alert">' + safe(state.error) + '</div>'
        : '<div class="dashboard-loading">Carregando indicadores da operação...</div>') + '</section>'
  }

  const categories = data.categories || {}
  const channels = Array.isArray(data.channels) ? data.channels : []
  const marketplaces = Array.isArray(data.marketplaces) ? data.marketplaces : []
  const errors = Array.isArray(data.latest_errors) ? data.latest_errors : []
  const whatsapps = Array.isArray(data.whapi) ? data.whapi : []
  const paused = whatsapps.some((x) => x.paused === true)
  const connected = whatsapps.some((x) => x.status === 'connected')
  const status = whatsapps.length === 0 ? 'WhatsApp não configurado'
    : paused ? 'WhatsApp pausado por cota' : connected ? 'WhatsApp conectado' : 'WhatsApp sem conexão'
  const statusClass = paused || (!connected && whatsapps.length) ? 'warning' : connected ? 'success' : 'neutral'
  const maxSent = Math.max(1, ...channels.map((x) => Number(x.sent || 0)))
  const auditPct = pct(categories.needs_review, categories.audited)
  const nextCheck = whatsapps.find((x) => x.next_check)?.next_check
  const metrics = [
    ['📦', 'Ofertas encontradas', data.offers_created, 'Cadastradas no período'],
    ['🔥', 'Ofertas publicadas', data.unique_offers_published, 'Produtos distintos, sem duplicar canais'],
    ['📨', 'Mensagens enviadas', data.messages_sent, 'Ofertas e cupons em todos os canais'],
    ['🎟️', 'Mensagens de cupons', data.coupon_messages_sent, 'Telegram e WhatsApp'],
    ['⚠️', 'Falhas', data.errors, 'Não confirmadas no período'],
    ['⏳', 'Pendências', data.pending, 'Na fila ou em processamento']
  ]

  const metricHtml = metrics.map((item) =>
    '<article class="ops-metric"><span>' + item[0] + ' ' + safe(item[1]) + '</span>' +
    '<strong>' + quantity(item[2]) + '</strong><small>' + safe(item[3]) + '</small></article>'
  ).join('')

  const channelsHtml = channels.map((item) => {
    const width = pct(item.sent, maxSent)
    return '<div class="ops-channel"><div class="ops-channel-header"><strong>' +
      (item.type === 'whatsapp' ? '🟢 ' : '✈️ ') + safe(item.name) + '</strong><b>' + quantity(item.sent) +
      '</b></div><div class="ops-bar"><i style="width:' + width + '%"></i></div><small>' +
      quantity(item.offers) + ' ofertas · ' + quantity(item.coupons) + ' cupons · ' +
      quantity(item.failed) + ' falhas · ' + quantity(item.pending) + ' pendentes</small></div>'
  }).join('')

  const marketHtml = marketplaces.map((item) =>
    '<div><span>' + safe(item.name || item.slug) + '</span><b>' +
    quantity(item.offers_published) + '</b></div>'
  ).join('')

  const errorsHtml = errors.length
    ? '<div class="ops-error-list">' + errors.map((item) =>
      '<div><strong>' + safe(item.channel || 'Canal') + '</strong><small>' +
      safe(formatDateTime(item.created_at)) + ' · ' + safe(item.kind || 'publicação') +
      '</small><span>' + safe(item.error || 'Sem detalhes') + '</span></div>'
    ).join('') + '</div>'
    : '<p>Nenhuma falha registrada no período.</p>'

  const monitor = data.monitor
  const monitoring = (() => {
    if (!monitor) return '<section class="ops-subpanel"><h3>Monitor dos canais atuais</h3><p>' + safe(data.monitorError || 'Dados indisponíveis.') + '</p></section>'
    const groups = monitor.groups || []
    const volumes = monitor.volumes || []
    const stamp = v => v ? safe(formatDateTime(v)) : '—'
    const cards = ['waha_test','telegram'].map(dest => {
      const name = dest === 'waha_test' ? 'WhatsApp · WAHA' : 'Telegram'
      const q = monitor.queues.find(x => x.destination === dest) || {}
      const group = groups.find(x => x.channel === (dest === 'waha_test' ? 'whatsapp' : 'telegram'))
      const rows = volumes.filter(x => x.destination === dest)
      const total = kind => rows.filter(x => x.kind === kind).reduce((n,x) => n + Number(x.items || 0),0)
      const messages = rows.reduce((n,x) => n + Number(x.messages || 0),0)
      const change = group?.previous_count == null ? 'Sem base anterior' : 'Saldo: ' + (group.participant_count - group.previous_count)
      return '<article class="ops-subpanel"><h3>' + safe(name) + '</h3><p>' +
        (dest === 'waha_test' ? 'Sessão: ' + safe(monitor.wa_status || 'desconhecida') + ' · verificada ' + stamp(monitor.session_checked_at) : 'Último recibo: ' + stamp(q.last_receipt)) +
        '</p><div class="ops-quality-grid"><div><b>' + quantity(total('offer')) + '</b><small>Ofertas hoje</small></div><div><b>' + quantity(total('coupon')) + '</b><small>Cupons hoje</small></div><div><b>' + quantity(messages) + '</b><small>Mensagens com recibo</small></div></div><p>Última publicação: ' + stamp(q.last_receipt) +
        '</p><p>Fila: ' + quantity(q.queued) + ' · Pausadas: ' + quantity(q.paused) + ' · Falhas hoje: ' + quantity(q.failed_today) + ' · Sem confirmação: ' + quantity(q.unconfirmed_today) +
        '</p><p>Participantes: <strong>' + (group ? quantity(group.participant_count) : '—') + '</strong> · ' + safe(change) + (group ? ' · ' + stamp(group.checked_at) : '') + '</p></article>'
    }).join('')
    const alertRows = (monitor.latest_alerts || []).map(a => '<div><strong>' + safe(a.event) + '</strong><small>' + stamp(a.created_at) + ' · ' + safe(a.provider_status || '') + '</small></div>').join('')
    const history = (monitor.group_history || []).map(g => '<div><strong>' + safe(g.day) + ' · ' + safe(g.channel) + '</strong><span>' + quantity(g.participant_count) + ' participantes</span></div>').join('')
    return '<section class="ops-subpanel"><h3>Monitor dos canais atuais · hoje</h3><p>Dados da operação independente; não somar com os indicadores legados abaixo.</p><div class="ops-columns">' + cards + '</div><p>WhatsApp: ' +
      quantity(monitor.ack_messages) + ' mensagens com confirmação de dispositivo via webhook (cobertura em validação). Recibo da API não equivale a leitura.</p><p>Vencimento Whazap registrado: ' + stamp(monitor.expires_at) +
      ' · Entradas/saídas registradas pelo webhook: ' + quantity(monitor.participant_changes?.joins) + '/' + quantity(monitor.participant_changes?.leaves) + ' (cobertura em validação).</p><h3>Histórico de participantes</h3><div class="ops-error-list">' + (history || '<p>Sem histórico.</p>') + '</div><h3>Alertas administrativos recentes</h3><div class="ops-error-list">' + (alertRows || '<p>Sem alertas.</p>') + '</div></section>'
  })()
  return '<section class="dashboard-panel ops-panel" aria-label="Painel operacional">' +
    heading + monitoring +
    '<div class="ops-updated"><span class="ops-status ' + statusClass + '">' + safe(monitor ? 'Indicadores legados (Whapi): ' + status : status) +
    '</span><span>Atualizado em ' + safe(formatDateTime(data.generated_at)) + '</span>' +
    (state.loading ? '<span>Atualizando…</span>' : '') + '</div>' +
    (state.error ? '<div class="notice" role="alert">' + safe(state.error) + '</div>' : '') +
    '<div class="ops-metrics">' + metricHtml + '</div>' +
    '<div class="ops-columns">' +
    '<section class="ops-subpanel"><h3>Publicações por canal</h3>' +
    '<p>Mensagens aceitas pelos provedores.</p><div class="ops-channel-list">' +
    (channelsHtml || '<p>Nenhum canal configurado.</p>') + '</div></section>' +
    '<section class="ops-subpanel"><h3>Qualidade das categorias</h3>' +
    '<p>Ofertas cadastradas no período.</p><div class="ops-quality"><strong>' +
    quantity(categories.audited) + '</strong><span>ofertas auditadas</span></div>' +
    '<div class="ops-quality-grid"><div><b>' + quantity(categories.needs_review) +
    '</b><small>Em revisão (' + auditPct + '%)</small></div><div><b>' +
    quantity(categories.other) + '</b><small>Em Outros</small></div><div><b>' +
    quantity(categories.fallback) + '</b><small>Por fallback</small></div></div>' +
    '<div class="ops-bar ops-quality-bar"><i style="width:' + auditPct + '%"></i></div>' +
    '<a href="#mavuri-category-reviews" class="ops-review-link">🔎 Abrir ' + quantity(categories.needs_review) + ' ofertas em revisão ↓</a>' +
    '<h3 class="ops-small-title">Ofertas únicas por marketplace</h3>' +
    '<div class="ops-market-grid">' + marketHtml + '</div></section></div>' +
    (paused ? '<p class="ops-alert">WhatsApp pausado por limite do provedor. O Telegram continua independente.' +
      (nextCheck ? ' Próxima verificação: ' + safe(formatDateTime(nextCheck)) + '.' : '') + '</p>' : '') +
    '<p class="ops-note">A cota de mensagens da Whapi não está integrada ao painel: confira o consumo no site do provedor. Nenhum token é enviado ao navegador.</p>' +
    '<section class="ops-subpanel ops-errors"><h3>Últimas falhas do período</h3>' +
    errorsHtml + '</section></section>'
}

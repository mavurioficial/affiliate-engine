import { getSession, onAuthChange, signIn, signOut, supabase } from './auth.js'
import { listOffers } from './application/offer-service.js'
import { listRules } from './application/rule-service.js'
import { listDeliveryJobs, retryFailedDeliveries } from './application/delivery-service.js'
import { captureMercadoLivreOffer } from './application/mercadolivre-offer-service.js'
import { createRule } from './application/rule-service.js'
import { createChannel, listChannels } from './application/channel-service.js'
import { createFlowCaptureDraftStorage } from './application/flow-capture-draft.js'

const root =
  document.querySelector('#app')

let session = null
let page = 'dashboard'
let flowState = { loading: false, loaded: false, offers: [], rules: [], jobs: [], channels: [], clicks: [], error: '', notice: '' }

function getFlowCaptureDraftStorage() {
  const userId = session?.user?.id
  if (!userId || typeof window === 'undefined' || !window.localStorage) return null

  return createFlowCaptureDraftStorage(
    window.localStorage,
    `mavuri.flow.captureDraft.v1:${userId}`
  )
}
function escapeHtml(value) {
  return String(
    value ?? ''
  )
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatMoney(value) {
  const amount =
    Number(value) || 0

  return new Intl.NumberFormat(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  ).format(amount)
}

function calculateDiscount(
  price,
  previousPrice
) {
  const current =
    Number(price) || 0

  const previous =
    Number(previousPrice) || 0

  if (
    previous <= 0 ||
    current <= 0 ||
    current >= previous
  ) {
    return 0
  }

  return Math.round(
    (
      1 -
      current / previous
    ) * 100
  )
}

function navigation() {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: '⌂'
    },
    {
      id: 'flow',
      label: 'Mavuri Flow',
      icon: '⚡'
    },
  ]

  return `
    <aside class="sidebar">

      <div class="brand">

        <div class="brand-mark">
          M
        </div>

        <div>

          <strong>
            MAVURI
          </strong>

          <span>
            Affiliate Engine
          </span>

        </div>

      </div>

      <nav>

        <div class="nav-group">

          <p>
            PRINCIPAL
          </p>

          ${navItems.map((item) => `
            <button
              class="nav-item ${
                page === item.id
                  ? 'active'
                  : ''
              }"
              data-page="${item.id}"
            >
              <span>
                ${item.icon}
              </span>

              ${item.label}
            </button>
          `).join('')}

        </div>

      </nav>

      <div class="sidebar-footer">

        <span>
          ${escapeHtml(
            session?.user?.email ||
            ''
          )}
        </span>

        <button
          data-logout
        >
          Sair
        </button>

      </div>

    </aside>
  `
}

function loginPage() {
  return `
    <main class="login-page">

      <section class="login-card">

        <div class="brand login-brand">

          <div class="brand-mark">
            M
          </div>

          <div>

            <strong>
              MAVURI
            </strong>

            <span>
              Affiliate Engine
            </span>

          </div>

        </div>

        <p class="eyebrow">
          ACESSO
        </p>

        <h1>
          Entre na plataforma
        </h1>

        <p>
          Utilize suas credenciais para acessar o ambiente administrativo.
        </p>

        <form
          data-login
        >

          <label>

            <span>
              E-mail
            </span>

            <input
              type="email"
              name="email"
              required
              autocomplete="email"
            />

          </label>

          <label>

            <span>
              Senha
            </span>

            <input
              type="password"
              name="password"
              required
              autocomplete="current-password"
            />

          </label>

          <p
            class="login-error"
            hidden
          ></p>

          <button
            type="submit"
            class="primary"
          >
            Entrar
          </button>

        </form>

      </section>

    </main>
  `
}

async function loadFlowState() {
  flowState.loading = true
  flowState.error = ''
  try {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) throw new Error('Usuário não autenticado.')
    const [offers, rules, jobs, channels, clicksResult] = await Promise.all([
      listOffers({ limit: 50 }),
      listRules(),
      listDeliveryJobs(),
      listChannels(),
      supabase.from('flow_clicks').select('id,offer_id,channel_id,tracking_id,click_count,last_clicked_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1000)
    ])
    if (clicksResult.error) throw clicksResult.error
    flowState = { loading: false, loaded: true, offers, rules, jobs, channels, clicks: clicksResult.data || [], error: '', notice: flowState.notice }
  } catch (error) {
    flowState = { ...flowState, loading: false, loaded: true, error: error.message || 'Não foi possível carregar o Flow.' }
  }
}

function flowPage() {
  const flowCaptureDraft = getFlowCaptureDraftStorage()?.read() || ''
  const sent = flowState.jobs.filter((job) => job.status === 'sent').length
  const queued = flowState.jobs.filter((job) => job.status === 'queued').length
  const processing = flowState.jobs.filter((job) => job.status === 'processing').length
  const failed = flowState.jobs.filter((job) => job.status === 'failed').length
  const clickCount = flowState.clicks.reduce((total, click) => total + Number(click.click_count || 0), 0)
  const clickedDeliveries = flowState.clicks.filter((click) => Number(click.click_count || 0) > 0).length
  const clickedOffers = new Set(flowState.clicks.filter((click) => Number(click.click_count || 0) > 0).map((click) => click.offer_id)).size
  const ctr = sent > 0 ? ((clickedDeliveries / sent) * 100).toFixed(1) : '0.0'
  const enabledRules = flowState.rules.filter((rule) => rule.enabled).length
  const describeRule = (rule) => {
    const c = rule.conditions || {}
    const a = rule.actions || {}
    const parts = []
    if (c.marketplace) parts.push(c.marketplace === 'mercadolivre' ? 'Mercado Livre' : c.marketplace)
    if (c.minDiscount != null) parts.push(`desconto ≥ ${c.minDiscount}%`)
    if (c.maxPrice != null) parts.push(`preço ≤ ${formatMoney(c.maxPrice)}`)
    const channelNames = (a.channel_ids || []).map((id) => flowState.channels.find((channel) => channel.id === id)?.name || 'Canal')
    if (channelNames.length) parts.push(`→ ${channelNames.join(', ')}`)
    return parts.join(' · ') || 'Sem condições configuradas'
  }
  return `
    <header class="page-heading"><p class="eyebrow">AUTOMAÇÃO</p><h1>Mavuri Flow</h1><p>Captura, oferta, regras e distribuição em um único fluxo operacional.</p></header>
    ${flowState.notice ? `<section class="notice flow-success">${escapeHtml(flowState.notice)}</section>` : ''}
    ${flowState.error ? `<section class="notice">${escapeHtml(flowState.error)}</section>` : ''}
    <section class="flow-capture-panel">
      <div class="section-title"><h2>Capturar oferta</h2><p>Cole somente o link de afiliado do Mercado Livre. O Flow identifica o produto automaticamente, consulta os dados reais e avalia as regras.</p><div class="flow-connection-hint">🔐 A conexão com o Mercado Livre é feita com OAuth; o Mavuri não pede seu token para colar no navegador.</div></div>
      <form data-flow-capture><div class="flow-capture-grid">
        <label><span>Links de afiliado oficiais</span><textarea name="affiliateUrl" rows="4" required placeholder="Cole 1 ou vários links https://meli.la/... separados por espaço ou nova linha" autocomplete="off">${escapeHtml(flowCaptureDraft)}</textarea><small class="flow-field-hint">Você pode colar vários links do Mercado Livre de uma vez, separados por espaço ou por nova linha. O Mavuri processa cada link individualmente.</small></label>
      </div><div class="form-actions"><button class="primary" type="submit">⚡ Capturar no Flow</button></div></form>
    </section>
    <section class="flow-pipeline">
      <div class="flow-node"><span>01</span><strong>Captura</strong><small>Mercado Livre</small></div><div class="flow-arrow">→</div>
      <div class="flow-node"><span>02</span><strong>Oferta</strong><small>${flowState.offers.length} capturadas</small></div><div class="flow-arrow">→</div>
      <div class="flow-node"><span>03</span><strong>Regras</strong><small>${enabledRules} ativas / ${flowState.rules.length} cadastradas</small></div><div class="flow-arrow">→</div>
      <div class="flow-node"><span>04</span><strong>Distribuição</strong><small>${flowState.jobs.length} jobs</small></div>
    </section>
    <section class="flow-metrics">
      <article><span>Ofertas</span><strong>${flowState.offers.length}</strong><small>capturadas</small></article>
      <article><span>Regras</span><strong>${enabledRules}</strong><small>ativas</small></article>
      <article><span>Na fila</span><strong>${queued}</strong><small>${processing} processando</small></article>
      <article><span>Enviadas</span><strong>${sent}</strong><small>concluídas</small></article>
      <article><span>Falhas</span><strong>${failed}</strong><small>para investigar</small></article>
      <article><span>Cliques</span><strong>${clickCount}</strong><small>${clickedOffers} oferta(s) clicada(s)</small></article>
      <article><span>CTR</span><strong>${ctr}%</strong><small>cliques / envios</small></article>
    </section>
    <section class="flow-columns">
      <div class="flow-panel"><div class="section-title"><h2>Regras do Flow</h2><p>Automação baseada nas características da oferta.</p></div>
        ${flowState.rules.map((rule) => `<div class="flow-row"><div><strong>${escapeHtml(rule.name)}</strong><small>${escapeHtml(describeRule(rule))}</small></div><span class="status-dot">${rule.enabled ? 'Ativa' : 'Pausada'}</span></div>`).join('') || '<div class="empty">Nenhuma regra cadastrada.</div>'}
      </div>
      <div class="flow-panel"><div class="section-title"><h2>Canais</h2><p>Destinos disponíveis para as regras.</p></div>
        ${flowState.channels.map((channel) => `<div class="flow-row"><div><strong>${escapeHtml(channel.name)}</strong><small>${escapeHtml(channel.type)} · ${escapeHtml(channel.external_ref || 'sem destino')}</small></div><span class="status-dot">${escapeHtml(channel.status)}</span></div>`).join('') || '<div class="empty">Nenhum canal configurado.</div>'}
      </div>
    </section>
    <section class="flow-columns">
      <div class="flow-panel"><div class="section-title"><h2>Nova regra</h2><p>Exemplo: Mercado Livre + desconto ≥ 20% + preço ≤ R$ 500 → Telegram.</p></div>
        <form data-flow-rule><div class="flow-form-grid">
          <label><span>Nome</span><input name="name" required value="Oferta ML ≥20% até R$500" /></label>
          <label><span>Prioridade</span><input name="priority" type="number" min="1" value="100" /></label>
          <label><span>Mercado</span><select name="marketplace"><option value="mercadolivre">Mercado Livre</option><option value="">Qualquer</option></select></label>
          <label><span>Desconto mínimo (%)</span><input name="minDiscount" type="number" min="0" max="100" value="20" /></label>
          <label><span>Desconto máximo (%)</span><input name="maxDiscount" type="number" min="0" max="100" placeholder="Sem limite" /></label>
          <label><span>Preço máximo (R$)</span><input name="maxPrice" type="number" min="0" step="0.01" value="500" /></label>
          <label><span>Preço mínimo (R$)</span><input name="minPrice" type="number" min="0" step="0.01" placeholder="Sem mínimo" /></label>
          <label><span>Categoria</span><input name="category" placeholder="Nome exato ou ID (opcional)" /></label>
          <label><span>Vendedor</span><input name="seller" placeholder="Nome exato ou ID (opcional)" /></label>
          <label><span>Palavras-chave</span><input name="keywords" placeholder="tv, notebook, gamer" /></label>
          <label><span>Excluir palavras</span><input name="deniedKeywords" placeholder="usado, quebrado" /></label>
          <label><span>Exigir cupom</span><select name="couponRequired"><option value="">Indiferente</option><option value="true">Sim</option><option value="false">Não</option></select></label>
          <label><span>Canal</span><select name="channelId" required><option value="">Selecione um canal</option>${flowState.channels.map((channel) => `<option value="${channel.id}">${escapeHtml(channel.name)} · ${escapeHtml(channel.type)}</option>`).join('')}</select></label>
        </div><div class="form-actions"><button class="primary" type="submit" ${flowState.channels.length ? '' : 'disabled'}>＋ Criar regra</button></div>
        ${!flowState.channels.length ? '<small class="flow-hint">Cadastre um canal abaixo antes de criar a regra.</small>' : ''}</form>
      </div>
      <div class="flow-panel"><div class="section-title"><h2>Novo canal Telegram</h2><p>O token do bot fica fora do banco e será lido como segredo do worker.</p></div>
        <form data-flow-channel><div class="flow-form-grid">
          <label><span>Nome</span><input name="name" required placeholder="Telegram — Ofertas" /></label>
          <label><span>Chat ID</span><input name="externalRef" required placeholder="-1001234567890" /></label>
        </div><div class="form-actions"><button class="primary" type="submit">＋ Cadastrar Telegram</button></div>
        <small class="flow-hint">O bot token nunca é armazenado no navegador.</small></form>
      </div>
    </section>
    <section class="flow-panel"><div class="section-title"><h2>Fila de distribuição</h2><p>Acompanhe e processe os jobs pendentes.</p></div>
      <div class="form-actions">
        <button data-flow-worker class="primary" ${queued || processing ? '' : 'disabled'}>▶ Processar fila</button>
        <button data-flow-retry ${failed ? '' : 'disabled'}>↻ Reenfileirar falhas (${failed})</button>
      </div>
      ${flowState.jobs.slice(0,8).map((job) => `<div class="flow-row"><div><strong>${escapeHtml(flowState.channels.find((channel) => channel.id === job.channel_id)?.name || 'Canal')}</strong><small>${escapeHtml(job.status)} · tentativa ${Number(job.attempts || 0)}</small></div><span class="status-dot">${escapeHtml(job.error_message || job.status)}</span></div>`).join('') || '<div class="empty">A fila está vazia.</div>'}
    </section>
    <section class="flow-columns">
      <div class="flow-panel"><div class="section-title"><h2>Performance</h2><p>Produtos e canais que já geraram cliques.</p></div>
        ${(() => {
          const grouped = new Map()
          for (const click of flowState.clicks) {
            const key = `${click.offer_id}:${click.channel_id}`
            const current = grouped.get(key) || { offer_id: click.offer_id, channel_id: click.channel_id, clicks: 0 }
            current.clicks += Number(click.click_count || 0)
            grouped.set(key, current)
          }
          const topOffers = [...grouped.values()]
            .filter((item) => item.clicks > 0)
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 5)
          return topOffers.map((item) => {
            const offer = flowState.offers.find((candidate) => candidate.id === item.offer_id)
            const channel = flowState.channels.find((candidate) => candidate.id === item.channel_id)
            return `<div class="flow-row"><div><strong>${escapeHtml(offer?.title || 'Oferta')}</strong><small>${escapeHtml(channel?.name || 'Canal')}</small></div><strong>${item.clicks} clique(s)</strong></div>`
          }).join('') || '<div class="empty">Ainda não há cliques registrados.</div>'
        })()}
      </div>
      <div class="flow-panel"><div class="section-title"><h2>Últimas ofertas</h2><p>Produtos processados pelo mecanismo.</p></div>
        <div class="flow-offer-list">
        ${flowState.offers.slice(0,5).map((offer) => {
          const monetized = Boolean(offer.affiliate_url)
          const image = String(offer.image_url || '').trim()
          return `<div class="flow-offer-row"><div class="flow-offer-thumb">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" />` : '🛍️'}</div><div class="flow-offer-main"><strong>${escapeHtml(offer.title)}</strong><small>${escapeHtml(offer.source_type || 'manual')} · ${formatMoney(offer.price)}</small></div><span class="flow-offer-status ${monetized ? 'is-ready' : 'is-pending'}">${monetized ? 'Monetizável' : 'Sem afiliado'}</span></div>`
        }).join('') || '<div class="empty">Nenhuma oferta capturada ainda.</div>'}
        </div>
      </div>
      <div class="flow-panel"><div class="section-title"><h2>Fluxo operacional</h2><p>Capture → avalie → enfileire → publique.</p></div>
        <ol class="flow-hint-list"><li>Cadastre o canal Telegram.</li><li>Crie a regra.</li><li>Capture uma oferta que atenda às condições.</li><li>O job é criado automaticamente.</li><li>Processe a fila para publicar.</li></ol>
      </div>
    </section>
  `
}

function dashboard() {
  return `
    <header class="page-heading">

      <p class="eyebrow">
        VISÃO GERAL
      </p>

      <h1>
        Painel Mavuri
      </h1>

      <p>
        Gerencie o fluxo de captura, avaliação e distribuição das suas ofertas.
      </p>

    </header>

    <section class="next-steps">

      <h2>
        Mavuri Flow
      </h2>

      <p>
        Capture links de afiliado do Mercado Livre, aplique suas regras e publique as ofertas nos canais configurados.
      </p>

      <div class="form-actions">

        <button
          class="primary"
          data-page="flow"
        >
          Abrir Mavuri Flow
        </button>

      </div>

    </section>
  `
}
function currentPage() {
  if (page === 'flow') {
    return flowPage()
  }

  return dashboard()
}
async function render() {
  if (!root) {
    return
  }

  if (!session) {
    root.innerHTML =
      loginPage()

    bindEvents()

    return
  }

  if (page === 'flow' && !flowState.loaded && !flowState.loading) {
    await loadFlowState()
  }

  root.innerHTML = `
    <main class="app-shell">

      ${navigation()}

      <section class="content">

        <div class="topbar">

          <div>

            <span class="topbar-label">
              Mavuri Affiliate Engine
            </span>

          </div>

          <div class="topbar-actions"></div>

        </div>

        <div class="page-content">

          ${currentPage()}

        </div>

      </section>

    </main>
  `

  bindEvents()
}

function bindEvents() {
  document
    .querySelectorAll(
      '[data-page]'
    )
    .forEach(
      (button) => {
        button.addEventListener(
          'click',
          async () => {
            const nextPage =
              button.dataset.page

            if (!nextPage) {
              return
            }

            page =
              nextPage

            await render()
          }
        )
      }
    )

  const logoutButton =
    document.querySelector(
      '[data-logout]'
    )

  if (logoutButton) {
    logoutButton.addEventListener(
      'click',
      async () => {
        try {
          await signOut()
        } catch (error) {
          console.error(error)

          window.alert(
            'Não foi possível encerrar a sessão.'
          )
        }
      }
    )
  }

  const loginForm =
    document.querySelector(
      '[data-login]'
    )

  if (loginForm) {
    loginForm.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault()

        const form =
          event.currentTarget

        const errorElement =
          form.querySelector(
            '.login-error'
          )

        const data =
          new FormData(
            form
          )

        const email =
          String(
            data.get('email') ||
            ''
          ).trim()

        const password =
          String(
            data.get('password') ||
            ''
          )

        try {
          if (errorElement) {
            errorElement.hidden =
              true

            errorElement.textContent =
              ''
          }

          await signIn(
            email,
            password
          )

        } catch (error) {
          console.error(error)

          if (errorElement) {
            errorElement.textContent =
              error.message ||
              'Não foi possível entrar.'

            errorElement.hidden =
              false
          }
        }
      }
    )
  }

  const flowCaptureForm =
    document.querySelector(
      '[data-flow-capture]'
    )

  if (flowCaptureForm) {
    const flowCaptureInput = flowCaptureForm.querySelector('[name="affiliateUrl"]')
    const flowCaptureDraftStorage = getFlowCaptureDraftStorage()

    if (flowCaptureInput && flowCaptureDraftStorage) {
      flowCaptureInput.addEventListener('input', () => {
        flowCaptureDraftStorage.write(flowCaptureInput.value)
      })
    }

    flowCaptureForm.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault()

        const data = new FormData(flowCaptureForm)
        const rawAffiliateInput = String(data.get('affiliateUrl') || '').trim()
        const affiliateUrls = [...new Set(
          rawAffiliateInput
            .split(/\s+/)
            .map((item) => item.trim())
            .filter(Boolean)
        )]
        const productUrl = null

        if (!affiliateUrls.length) {
          throw new Error('Cole pelo menos um link de afiliado oficial do Mercado Livre.')
        }

        const invalidUrls = affiliateUrls.filter((url) => {
          try {
            const parsed = new URL(url)
            return !['meli.la', 'www.meli.la', 'mercadolivre.com.br', 'www.mercadolivre.com.br'].includes(parsed.hostname.toLowerCase())
          } catch {
            return true
          }
        })

        if (invalidUrls.length) {
          throw new Error(`Links inválidos ou fora do Mercado Livre: ${invalidUrls.join(', ')}`)
        }

        const button = flowCaptureForm.querySelector('button[type="submit"]')
        const originalText = button?.textContent || '⚡ Capturar no Flow'

        if (button) {
          button.disabled = true
          button.textContent = `Preparando 0/${affiliateUrls.length}...`
        }

        try {
          const session = (await supabase.auth.getSession()).data.session
          if (!session?.access_token) throw new Error('Sua sessão do Mavuri expirou. Entre novamente.')

          const meliAuthEndpoint = 'https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/meli-auth'

          const getMeliConnectionStatus = async () => {
            const response = await fetch(`${meliAuthEndpoint}?action=status`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
              cache: 'no-store'
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(payload.error || 'Não foi possível verificar a conexão com o Mercado Livre.')
            return payload
          }

          const connectMercadoLivre = async () => {
            if (button) button.textContent = 'Conectando Mercado Livre...'

            const popup = window.open('about:blank', 'mavuri-meli-connect', 'width=520,height=700')
            if (!popup) throw new Error('O navegador bloqueou a janela de conexão. Permita pop-ups para o Mavuri e tente novamente.')

            const connectResponse = await fetch(meliAuthEndpoint, {
              headers: { Authorization: `Bearer ${session.access_token}` },
              cache: 'no-store'
            })
            const connectPayload = await connectResponse.json().catch(() => ({}))
            if (!connectResponse.ok || !connectPayload.auth_url) {
              popup.close()
              throw new Error(connectPayload.error || 'Não foi possível iniciar a conexão com o Mercado Livre.')
            }
            popup.location.href = connectPayload.auth_url

            await new Promise((resolve, reject) => {
              const poll = async () => {
                try {
                  const status = await getMeliConnectionStatus()
                  if (status.connected) {
                    window.clearInterval(timer)
                    window.clearTimeout(timeout)
                    if (!popup.closed) popup.close()
                    resolve()
                  }
                } catch {}
              }
              const timer = window.setInterval(poll, 1500)
              const timeout = window.setTimeout(() => {
                window.clearInterval(timer)
                reject(new Error('A conexão com o Mercado Livre demorou mais que o esperado.'))
              }, 120000)
              poll()
            })

            const status = await getMeliConnectionStatus()
            if (!status.connected) throw new Error('O Mercado Livre não confirmou a conexão. Tente autorizar novamente.')
          }

          const capture = (affiliateUrl) => captureMercadoLivreOffer(productUrl, {
            accessToken: session.access_token,
            affiliateUrl
          })

          let connection = await getMeliConnectionStatus()
          if (!connection.connected) await connectMercadoLivre()

          const capturedOffers = []
          const failures = []

          for (let index = 0; index < affiliateUrls.length; index += 1) {
            const affiliateUrl = affiliateUrls[index]

            if (button) {
              button.textContent = `Capturando ${index + 1}/${affiliateUrls.length}...`
            }

            try {
              let capturedOffer
              try {
                capturedOffer = await capture(affiliateUrl)
              } catch (captureError) {
                const message = captureError?.message || ''
                if (/Mercado Livre recusou esta consulta \(HTTP 403\)/i.test(message)) {
                  throw new Error('O Mercado Livre recusou a consulta pela API. A conexão do Mercado Livre está ativa, mas este tipo de consulta não é autorizado para esta conta.')
                }
                if (!/Mercado Livre não conectado ao Mavuri|conexão do Mercado Livre expirou/i.test(message)) throw captureError
                await connectMercadoLivre()
                capturedOffer = await capture(affiliateUrl)
              }

              capturedOffers.push({ affiliateUrl, offer: capturedOffer })
            } catch (captureError) {
              failures.push({
                affiliateUrl,
                message: captureError?.message || 'Não foi possível capturar esta oferta.'
              })
            }
          }

          if (failures.length) {
            getFlowCaptureDraftStorage()?.write(failures.map((item) => item.affiliateUrl).join('\n'))
          } else {
            getFlowCaptureDraftStorage()?.clear()
          }

          const successCount = capturedOffers.length
          const failureCount = failures.length
          const notice = failureCount === 0
            ? `${successCount} oferta(s) capturada(s) e pronta(s) para distribuição monetizada.`
            : successCount
              ? `${successCount} oferta(s) capturada(s). ${failureCount} link(s) ficaram pendentes para nova tentativa.`
              : ''

          const error = failureCount
            ? failures.map((item) => `${item.affiliateUrl}: ${item.message}`).join(' | ')
            : ''

          flowState = { ...flowState, loaded: false, notice, error }
          await render()
        } catch (error) {
          console.error(error)
          flowState = { ...flowState, error: error.message || 'Não foi possível capturar as ofertas.', notice: '' }
          await render()
        } finally {
          if (button && document.body.contains(button)) {
            button.disabled = false
            button.textContent = originalText
          }
        }
      }
    )
  }

  const flowRuleForm = document.querySelector('[data-flow-rule]')
  if (flowRuleForm) {
    flowRuleForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const data = new FormData(flowRuleForm)
      try {
        const channelId = String(data.get('channelId') || '').trim()
        if (!channelId) throw new Error('Selecione um canal.')
        const conditions = {}
        const marketplace = String(data.get('marketplace') || '').trim()
        const minDiscount = Number(data.get('minDiscount') || 0)
        const maxDiscount = Number(data.get('maxDiscount') || 0)
        const minPrice = Number(data.get('minPrice') || 0)
        const maxPrice = Number(data.get('maxPrice') || 0)
        const category = String(data.get('category') || '').trim()
        const seller = String(data.get('seller') || '').trim()
        const keywords = String(data.get('keywords') || '').split(',').map((item) => item.trim()).filter(Boolean)
        const deniedKeywords = String(data.get('deniedKeywords') || '').split(',').map((item) => item.trim()).filter(Boolean)
        const couponRequired = String(data.get('couponRequired') || '').trim()
        if (marketplace) conditions.marketplace = marketplace
        if (minDiscount > 0) conditions.minDiscount = minDiscount
        if (maxDiscount > 0) conditions.maxDiscount = maxDiscount
        if (minPrice > 0) conditions.minPrice = minPrice
        if (maxPrice > 0) conditions.maxPrice = maxPrice
        if (category) {
          if (/^\d+$/.test(category)) conditions.categoryId = category
          else conditions.category = category
        }
        if (seller) {
          if (/^\d+$/.test(seller)) conditions.sellerId = seller
          else conditions.seller = seller
        }
        if (keywords.length) conditions.keywords = keywords
        if (deniedKeywords.length) conditions.deniedKeywords = deniedKeywords
        if (couponRequired) conditions.couponRequired = couponRequired === 'true'
        await createRule({
          name: String(data.get('name') || '').trim(),
          priority: Number(data.get('priority') || 100),
          enabled: true,
          conditions,
          actions: { channel_ids: [channelId] }
        })
        flowState = { ...flowState, loaded: false, notice: 'Regra criada com sucesso.', error: '' }
        await render()
      } catch (error) {
        console.error(error)
        flowState = { ...flowState, error: error.message || 'Não foi possível criar a regra.', notice: '' }
        await render()
      }
    })
  }

  const flowChannelForm = document.querySelector('[data-flow-channel]')
  if (flowChannelForm) {
    flowChannelForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const data = new FormData(flowChannelForm)
      try {
        await createChannel({ type: 'telegram', name: String(data.get('name') || '').trim(), externalRef: String(data.get('externalRef') || '').trim() })
        flowState = { ...flowState, loaded: false, notice: 'Canal Telegram cadastrado. O token do bot será configurado no backend.', error: '' }
        await render()
      } catch (error) {
        console.error(error)
        flowState = { ...flowState, error: error.message || 'Não foi possível cadastrar o canal.', notice: '' }
        await render()
      }
    })
  }

  const flowRetryButton = document.querySelector('[data-flow-retry]')
  if (flowRetryButton) {
    flowRetryButton.addEventListener('click', async () => {
      flowRetryButton.disabled = true
      flowRetryButton.textContent = 'Reenfileirando...'
      try {
        const jobs = await retryFailedDeliveries()
        flowState = { ...flowState, loaded: false, notice: jobs.length ? `${jobs.length} job(s) reenfileirado(s).` : 'Nenhuma falha para reenfileirar.', error: '' }
        await render()
      } catch (error) {
        console.error(error)
        flowState = { ...flowState, error: error.message || 'Não foi possível reenfileirar as falhas.', notice: '' }
        await render()
      }
    })
  }

  const flowWorkerButton = document.querySelector('[data-flow-worker]')
  if (flowWorkerButton) {
    flowWorkerButton.addEventListener('click', async () => {
      const originalText = flowWorkerButton.textContent
      flowWorkerButton.disabled = true
      flowWorkerButton.textContent = 'Processando...'
      try {
        const { data, error } = await supabase.functions.invoke('flow-worker', { body: { limit: 10 } })
        if (error) throw error
        flowState = { ...flowState, loaded: false, notice: data?.processed != null ? `${data.processed} job(s) processado(s).` : 'Fila processada.', error: '' }
        await render()
      } catch (error) {
        console.error(error)
        flowState = { ...flowState, error: error.message || 'Não foi possível processar a fila.', notice: '' }
        await render()
      }
    })
  }

}

async function bootstrap() {
  try {
    session =
      await getSession()

    await render()

    onAuthChange(
      async (
        nextSession
      ) => {
        session =
          nextSession

        if (!session) {
          page =
            'dashboard'

          getFlowCaptureDraftStorage()?.clear()

          flowState = { loading: false, loaded: false, offers: [], rules: [], jobs: [], channels: [], clicks: [], error: '', notice: '' }
        }

        await render()
      }
    )

  } catch (error) {
    console.error(error)

    if (root) {
      root.innerHTML = `
        <main class="login-page">

          <section class="login-card">

            <h1>
              Erro ao iniciar o Mavuri
            </h1>

            <p>
              ${
                escapeHtml(
                  error.message ||
                  'Verifique a configuração da aplicação.'
                )
              }
            </p>

          </section>

        </main>
      `
    }
  }
}

bootstrap()

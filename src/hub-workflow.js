const HUB_URL = 'https://mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user'
const STORAGE_KEY = 'mavuri.hub.capture'
const APP_VERSION = 'MAVURI v2026.08.28.06'

let lastMode = ''

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function readCapture() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

function writeCapture(capture) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(capture))
}

function clearCapture() {
  localStorage.removeItem(STORAGE_KEY)
}

function normalizeCapture(data = {}) {
  return {
    affiliateUrl: String(data.affiliateUrl || '').trim(),
    productName: String(data.productName || '').trim(),
    category: String(data.category || '').trim(),
    price: String(data.price || '').trim(),
    previousPrice: String(data.previousPrice || '').trim(),
    installments: String(data.installments || '').trim(),
    description: String(data.description || '').trim()
  }
}

function saveHubForm(form) {
  if (!form) return null
  const data = new FormData(form)
  const capture = normalizeCapture({
    affiliateUrl: data.get('affiliateUrl'),
    productName: data.get('productName'),
    category: data.get('category'),
    price: data.get('price'),
    previousPrice: data.get('previousPrice'),
    installments: data.get('installments'),
    description: data.get('description')
  })

  if (capture.affiliateUrl || capture.productName || capture.description) {
    writeCapture(capture)
  }

  return capture
}

function hubPage() {
  const capture = normalizeCapture(readCapture() || {})

  return `
    <header class="page-heading">
      <p class="eyebrow">MERCADO LIVRE AFILIADOS</p>
      <h1>Hub de Afiliados</h1>
      <p>O Mavuri trabalha a partir do seu portal de afiliados. Você escolhe produtos reais do Hub, copia o seu link de afiliado e o Mavuri prepara a divulgação.</p>
    </header>

    <section class="next-steps hub-intro">
      <h2>Fluxo de trabalho</h2>
      <div class="hub-steps">
        <div><strong>1. Abrir o Hub</strong><span>Usa sua sessão já autenticada no Mercado Livre.</span></div>
        <div><strong>2. Escolher oportunidades</strong><span>Mais vendidos, categorias, campanhas e ofertas do próprio portal.</span></div>
        <div><strong>3. Copiar seu link</strong><span>Use o botão Compartilhar do Mercado Livre e copie o link de afiliado.</span></div>
        <div><strong>4. Gerar divulgação</strong><span>Cole o link no Mavuri e monte a prévia para seus canais.</span></div>
      </div>
      <div class="form-actions">
        <button class="primary" type="button" data-open-hub>↗ Abrir Hub de Afiliados</button>
      </div>
      <p class="hub-note">Não fazemos mais uma busca genérica de produtos. O Hub do Mercado Livre é a fonte das oportunidades.</p>
    </section>

    <section class="form-card hub-capture">
      <form data-hub-capture>
        <div class="section-title">
          <div>
            <h2>Capturar oferta escolhida</h2>
            <p>Cole aqui o link copiado no botão Compartilhar do seu Hub. Os dados ficam preservados enquanto você navega no Mavuri.</p>
          </div>
        </div>

        <label>
          <span>Seu link de afiliado *</span>
          <input type="url" name="affiliateUrl" value="${escapeHtml(capture.affiliateUrl)}" placeholder="Cole o link de afiliado aqui" required />
        </label>

        <div class="form-grid">
          <label><span>Nome do produto <small>(opcional)</small></span><input type="text" name="productName" value="${escapeHtml(capture.productName)}" placeholder="Ex.: TV Samsung 55..." /></label>
          <label><span>Categoria <small>(opcional)</small></span><input type="text" name="category" value="${escapeHtml(capture.category)}" placeholder="Ex.: Eletrônicos" /></label>
        </div>

        <div class="form-grid">
          <label><span>Preço atual <small>(opcional)</small></span><input type="number" step="0.01" min="0" name="price" value="${escapeHtml(capture.price)}" placeholder="0,00" /></label>
          <label><span>Preço anterior <small>(opcional)</small></span><input type="number" step="0.01" min="0" name="previousPrice" value="${escapeHtml(capture.previousPrice)}" placeholder="0,00" /></label>
          <label><span>Parcelas <small>(opcional)</small></span><input type="number" min="1" name="installments" value="${escapeHtml(capture.installments)}" placeholder="Ex.: 10" /></label>
        </div>

        <label>
          <span>Observação/descrição <small>(opcional)</small></span>
          <textarea name="description" rows="3" placeholder="Opcional: detalhe que deseja destacar na mensagem">${escapeHtml(capture.description)}</textarea>
        </label>

        <div class="form-actions">
          <button class="primary" type="submit">Gerar prévia da divulgação</button>
          <button type="button" data-hub-clear>Limpar</button>
        </div>
      </form>
    </section>

    <section class="next-steps hub-automation-status">
      <h2>Próximo nível de automação</h2>
      <p>O passo seguinte é automatizar a captura do produto selecionado no Hub onde você já está autenticado. Enquanto isso, o fluxo atual não perde o link e já permite gerar uma prévia usando apenas o seu link de afiliado.</p>
    </section>
  `
}

function applyHubDraft() {
  const capture = normalizeCapture(readCapture() || {})
  if (!capture.affiliateUrl) return false

  const form = document.querySelector('[data-divulgacao]')
  if (!form) return false

  const set = (name, value) => {
    const field = form.elements.namedItem(name)
    if (field && value !== undefined && value !== null) field.value = value
  }

  // O link é o único dado obrigatório neste fluxo. Se os demais dados ainda não
  // foram capturados, geramos uma prévia inicial sem bloquear o usuário.
  set('productName', capture.productName || 'Oferta do Mercado Livre')
  set('description', capture.description || '')
  set('productUrl', capture.affiliateUrl)
  set('affiliateUrl', capture.affiliateUrl)
  set('price', capture.price || '')
  set('previousPrice', capture.previousPrice || '')
  set('installments', capture.installments || '')
  set('installmentInterest', 'no-interest')

  // Mantém o rascunho salvo. Ele só é apagado pelo botão Limpar.
  form.requestSubmit()
  return true
}

function bindHubEvents(container) {
  container.querySelector('[data-open-hub]')?.addEventListener('click', () => {
    window.open(HUB_URL, '_blank', 'noopener')
  })

  const form = container.querySelector('[data-hub-capture]')

  form?.addEventListener('input', () => {
    saveHubForm(form)
  })

  form?.addEventListener('change', () => {
    saveHubForm(form)
  })

  container.querySelector('[data-hub-clear]')?.addEventListener('click', () => {
    form?.reset()
    clearCapture()
  })

  form?.addEventListener('submit', (event) => {
    event.preventDefault()
    const capture = saveHubForm(event.currentTarget)

    if (!capture?.affiliateUrl) return

    document.querySelector('[data-page="divulgacao"]')?.click()
  })
}

function decorateNavigation() {
  document.querySelectorAll('[data-page="buscar-ofertas"]').forEach((button) => {
    if (button.textContent.trim() !== 'Hub de Afiliados') {
      button.textContent = 'Hub de Afiliados'
    }
  })
}

function ensureVersionBadge() {
  if (!document.getElementById('mavuri-version-style')) {
    const style = document.createElement('style')
    style.id = 'mavuri-version-style'
    style.textContent = `
      #mavuri-version-badge {
        position: fixed;
        right: 12px;
        bottom: 12px;
        z-index: 2147483647;
        padding: 7px 10px;
        border-radius: 6px;
        background: #172b1d;
        color: #fff;
        font: 700 11px/1.2 system-ui, sans-serif;
        letter-spacing: .02em;
        box-shadow: 0 2px 10px rgba(0,0,0,.25);
        pointer-events: none;
      }
    `
    document.head.appendChild(style)
  }

  let badge = document.getElementById('mavuri-version-badge')
  if (!badge) {
    badge = document.createElement('div')
    badge.id = 'mavuri-version-badge'
    document.body.appendChild(badge)
  }
  badge.textContent = APP_VERSION
}

function syncUi() {
  ensureVersionBadge()
  decorateNavigation()

  const title = document.querySelector('.page-content .page-heading h1')?.textContent.trim()

  if (title === 'Buscar ofertas') {
    const content = document.querySelector('.page-content')
    if (content && lastMode !== 'hub') {
      lastMode = 'hub'
      content.innerHTML = hubPage()
      bindHubEvents(content)
    }
    return
  }

  if (title === 'Nova divulgação') {
    if (lastMode !== 'divulgacao') {
      lastMode = 'divulgacao'
      applyHubDraft()
    }
    return
  }

  lastMode = title || ''
}

const observer = new MutationObserver(() => syncUi())
observer.observe(document.documentElement, { childList: true, subtree: true })

document.addEventListener('DOMContentLoaded', () => {
  ensureVersionBadge()
  syncUi()
})

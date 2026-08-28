const HUB_URL = 'https://mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user'
const STORAGE_KEY = 'mavuri.hub.capture'
const APP_VERSION = 'APP 2026.08.28.06'

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
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') || {}
  } catch {
    return {}
  }
}

function writeCapture(capture) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(capture || {}))
}

function clearCapture() {
  sessionStorage.removeItem(STORAGE_KEY)
}

function hubPage() {
  const capture = readCapture()

  return `
    <header class="page-heading">
      <p class="eyebrow">MERCADO LIVRE AFILIADOS</p>
      <h1>Hub de Afiliados</h1>
      <p>O Mavuri agora trabalha a partir do seu portal de afiliados. Você escolhe produtos reais do Hub, copia o seu link de afiliado e o Mavuri prepara a divulgação.</p>
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
      <p class="hub-note">Nesta etapa não fazemos mais uma busca genérica de produtos. O Hub do Mercado Livre passa a ser a fonte das oportunidades.</p>
    </section>

    <section class="form-card hub-capture">
      <form data-hub-capture>
        <div class="section-title">
          <div>
            <h2>Capturar oferta escolhida</h2>
            <p>Cole aqui o link copiado no botão Compartilhar do seu Hub.</p>
          </div>
        </div>

        <label>
          <span>Seu link de afiliado *</span>
          <input type="url" name="affiliateUrl" value="${escapeHtml(capture.affiliateUrl || '')}" placeholder="Cole o link de afiliado aqui" required />
        </label>

        <div class="form-grid">
          <label><span>Nome do produto</span><input type="text" name="productName" value="${escapeHtml(capture.productName || '')}" placeholder="Opcional" /></label>
          <label><span>Categoria</span><input type="text" name="category" value="${escapeHtml(capture.category || '')}" placeholder="Opcional" /></label>
        </div>

        <div class="form-grid">
          <label><span>Preço atual</span><input type="number" step="0.01" min="0" name="price" value="${escapeHtml(capture.price || '')}" placeholder="Opcional" /></label>
          <label><span>Preço anterior</span><input type="number" step="0.01" min="0" name="previousPrice" value="${escapeHtml(capture.previousPrice || '')}" placeholder="Opcional" /></label>
          <label><span>Parcelas</span><input type="number" min="1" name="installments" value="${escapeHtml(capture.installments || '')}" placeholder="Opcional" /></label>
        </div>

        <label>
          <span>Observação/descrição</span>
          <textarea name="description" rows="3" placeholder="Opcional: detalhe que deseja destacar na mensagem">${escapeHtml(capture.description || '')}</textarea>
        </label>

        <div class="form-actions">
          <button class="primary" type="submit">Gerar prévia da divulgação</button>
          <button type="button" data-hub-clear>Limpar</button>
        </div>
      </form>
    </section>

    <section class="next-steps hub-automation-status">
      <h2>Próximo nível de automação</h2>
      <p>O passo seguinte é uma extensão do navegador para ler diretamente a página do Hub onde você já está autenticado e enviar para o Mavuri o produto selecionado e o link copiado. Isso evita depender de uma API pública de busca e mantém o fluxo dentro do seu ambiente de afiliado.</p>
    </section>
  `
}

function persistHubForm(form) {
  if (!form) return
  const data = new FormData(form)
  writeCapture({
    affiliateUrl: String(data.get('affiliateUrl') || '').trim(),
    productName: String(data.get('productName') || '').trim(),
    category: String(data.get('category') || '').trim(),
    price: String(data.get('price') || '').trim(),
    previousPrice: String(data.get('previousPrice') || '').trim(),
    installments: String(data.get('installments') || '').trim(),
    description: String(data.get('description') || '').trim()
  })
}

function applyHubDraft() {
  const capture = readCapture()
  if (!capture.affiliateUrl) return false

  const form = document.querySelector('[data-divulgacao]')
  if (!form) return false

  const set = (name, value) => {
    const field = form.elements.namedItem(name)
    if (field && value !== undefined && value !== null) field.value = value
  }

  set('productName', capture.productName || 'Oferta selecionada no Mercado Livre')
  set('description', capture.description || '')
  set('productUrl', capture.affiliateUrl)
  set('affiliateUrl', capture.affiliateUrl)
  set('price', capture.price || '')
  set('previousPrice', capture.previousPrice || '')
  set('installments', capture.installments || '')
  set('installmentInterest', 'no-interest')

  form.requestSubmit()
  clearCapture()
  return true
}

function bindHubEvents(container) {
  container.querySelector('[data-open-hub]')?.addEventListener('click', () => {
    persistHubForm(container.querySelector('[data-hub-capture]'))
    window.open(HUB_URL, '_blank', 'noopener')
  })

  container.querySelector('[data-hub-clear]')?.addEventListener('click', () => {
    clearCapture()
    container.querySelector('[data-hub-capture]')?.reset()
  })

  const form = container.querySelector('[data-hub-capture]')

  form?.addEventListener('input', () => persistHubForm(form))
  form?.addEventListener('change', () => persistHubForm(form))

  form?.addEventListener('submit', (event) => {
    event.preventDefault()
    persistHubForm(event.currentTarget)

    const affiliateUrl = String(readCapture().affiliateUrl || '').trim()
    if (!affiliateUrl) return

    document.querySelector('[data-page="divulgacao"]')?.click()
  })
}

function ensureVersionBadge() {
  if (!document.getElementById('mavuri-version-badge')) {
    const style = document.createElement('style')
    style.textContent = `
      #mavuri-version-badge {
        position: fixed;
        right: 12px;
        bottom: 10px;
        z-index: 2147483647;
        padding: 7px 10px;
        border-radius: 6px;
        background: #1f3d2a;
        color: #fff;
        font: 700 11px/1.2 Arial, sans-serif;
        box-shadow: 0 2px 10px rgba(0,0,0,.25);
        letter-spacing: .3px;
      }
    `
    document.head.appendChild(style)

    const badge = document.createElement('div')
    badge.id = 'mavuri-version-badge'
    document.body.appendChild(badge)
  }

  document.getElementById('mavuri-version-badge').textContent = APP_VERSION
}

function decorateNavigation() {
  document.querySelectorAll('[data-page="buscar-ofertas"]').forEach((button) => {
    const text = button.textContent.trim()
    if (text !== 'Hub de Afiliados') button.textContent = 'Hub de Afiliados'
  })
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
    lastMode = 'divulgacao'
    applyHubDraft()
    return
  }

  lastMode = title || ''
}

const observer = new MutationObserver(() => syncUi())
observer.observe(document.documentElement, { childList: true, subtree: true })

document.addEventListener('DOMContentLoaded', syncUi)
ensureVersionBadge()

const HUB_URL = 'https://mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user'
const STORAGE_KEY = 'mavuri.hub.capture'

let lastMode = ''

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function money(value) {
  const number = Number(value || 0)
  return Number.isFinite(number)
    ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : ''
}

function readCapture() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

function writeCapture(capture) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(capture))
}

function clearCapture() {
  sessionStorage.removeItem(STORAGE_KEY)
}

function hubPage() {
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
          <input type="url" name="affiliateUrl" placeholder="Cole o link de afiliado aqui" required />
        </label>

        <div class="form-grid">
          <label><span>Nome do produto</span><input type="text" name="productName" placeholder="Ex.: TV Samsung 55..." /></label>
          <label><span>Categoria</span><input type="text" name="category" placeholder="Ex.: Eletrônicos" /></label>
        </div>

        <div class="form-grid">
          <label><span>Preço atual</span><input type="number" step="0.01" min="0" name="price" placeholder="0,00" /></label>
          <label><span>Preço anterior</span><input type="number" step="0.01" min="0" name="previousPrice" placeholder="0,00" /></label>
          <label><span>Parcelas</span><input type="number" min="1" name="installments" placeholder="Ex.: 10" /></label>
        </div>

        <label>
          <span>Observação/descrição</span>
          <textarea name="description" rows="3" placeholder="Opcional: detalhe que deseja destacar na mensagem"></textarea>
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

function applyHubDraft() {
  const capture = readCapture()
  if (!capture) return false

  const form = document.querySelector('[data-divulgacao]')
  if (!form) return false

  const set = (name, value) => {
    const field = form.elements.namedItem(name)
    if (field && value !== undefined && value !== null) field.value = value
  }

  set('productName', capture.productName || '')
  set('description', capture.description || '')
  set('productUrl', capture.affiliateUrl || '')
  set('affiliateUrl', capture.affiliateUrl || '')
  set('price', capture.price || '')
  set('previousPrice', capture.previousPrice || '')
  set('installments', capture.installments || '')
  set('installmentInterest', 'no-interest')

  clearCapture()
  form.requestSubmit()
  return true
}

function bindHubEvents(container) {
  container.querySelector('[data-open-hub]')?.addEventListener('click', () => {
    window.open(HUB_URL, '_blank', 'noopener')
  })

  container.querySelector('[data-hub-clear]')?.addEventListener('click', () => {
    container.querySelector('[data-hub-capture]')?.reset()
  })

  container.querySelector('[data-hub-capture]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const affiliateUrl = String(data.get('affiliateUrl') || '').trim()

    if (!affiliateUrl) return

    writeCapture({
      affiliateUrl,
      productName: String(data.get('productName') || '').trim(),
      category: String(data.get('category') || '').trim(),
      price: String(data.get('price') || '').trim(),
      previousPrice: String(data.get('previousPrice') || '').trim(),
      installments: String(data.get('installments') || '').trim(),
      description: String(data.get('description') || '').trim()
    })

    document.querySelector('[data-page="divulgacao"]')?.click()
  })
}

function decorateNavigation() {
  document.querySelectorAll('[data-page="buscar-ofertas"]').forEach((button) => {
    const text = button.textContent.trim()
    if (text !== 'Hub de Afiliados') button.textContent = 'Hub de Afiliados'
  })
}

function syncUi() {
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

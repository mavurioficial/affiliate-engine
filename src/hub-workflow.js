const HUB_URL = 'https://mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user'
const RESOLVER_ENDPOINT = 'https://mavuri-api-test.vercel.app/api/resolve'
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
        <div><strong>4. Localizar anúncio</strong><span>O Mavuri segue o link até encontrar a página real do produto.</span></div>
        <div><strong>5. Gerar divulgação</strong><span>Os dados do anúncio serão usados sem perder seu link de afiliado.</span></div>
      </div>
      <div class="form-actions">
        <button class="primary" type="button" data-open-hub>↗ Abrir Hub de Afiliados</button>
      </div>
    </section>

    <section class="form-card hub-capture">
      <form data-hub-capture>
        <div class="section-title">
          <div>
            <h2>Capturar oferta escolhida</h2>
            <p>Cole o link copiado no botão Compartilhar do seu Hub. Primeiro vamos localizar automaticamente o anúncio real.</p>
          </div>
        </div>

        <label>
          <span>Seu link de afiliado *</span>
          <input type="url" name="affiliateUrl" placeholder="Cole o link de afiliado aqui" required />
        </label>

        <div class="form-actions">
          <button class="primary" type="button" data-resolve-link>Buscar anúncio pelo link</button>
        </div>

        <div data-resolve-status aria-live="polite" style="margin: 14px 0 18px;"></div>

        <div data-resolved-result hidden>
          <div class="form-grid">
            <label><span>Página intermediária</span><input type="text" name="socialUrl" readonly /></label>
          </div>
          <div class="form-grid">
            <label><span>Anúncio real localizado</span><input type="text" name="productUrl" readonly /></label>
            <label><span>ID do produto</span><input type="text" name="productId" readonly /></label>
          </div>
        </div>

        <div class="form-grid">
          <label><span>Nome do produto</span><input type="text" name="productName" placeholder="Será preenchido na próxima etapa" /></label>
          <label><span>Categoria</span><input type="text" name="category" placeholder="Será preenchida na próxima etapa" /></label>
        </div>

        <div class="form-grid">
          <label><span>Preço atual</span><input type="number" step="0.01" min="0" name="price" placeholder="Será preenchido na próxima etapa" /></label>
          <label><span>Preço anterior</span><input type="number" step="0.01" min="0" name="previousPrice" placeholder="Será preenchido na próxima etapa" /></label>
          <label><span>Parcelas</span><input type="number" min="1" name="installments" placeholder="Será preenchido na próxima etapa" /></label>
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
      <h2>Etapa atual</h2>
      <p>Primeiro resolvemos o caminho <strong>link de afiliado → página social → anúncio real</strong>. O próximo passo será usar o anúncio localizado para preencher automaticamente nome, preço, desconto, parcelas e imagem.</p>
    </section>
  `
}

function setResolveStatus(container, message, kind = 'info') {
  const status = container.querySelector('[data-resolve-status]')
  if (!status) return
  const tone = kind === 'error' ? '#8b1e1e' : kind === 'success' ? '#245c35' : '#4b5563'
  status.innerHTML = `<div style="padding:10px 12px;border:1px solid currentColor;border-radius:8px;color:${tone};background:#fff">${escapeHtml(message)}</div>`
}

async function resolveAffiliateLink(container) {
  const form = container.querySelector('[data-hub-capture]')
  const input = form?.elements.namedItem('affiliateUrl')
  const button = container.querySelector('[data-resolve-link]')
  const affiliateUrl = String(input?.value || '').trim()

  if (!affiliateUrl) {
    input?.focus()
    setResolveStatus(container, 'Cole primeiro o seu link de afiliado.', 'error')
    return
  }

  try {
    new URL(affiliateUrl)
  } catch {
    setResolveStatus(container, 'O link informado não parece ser uma URL válida.', 'error')
    return
  }

  button.disabled = true
  const originalText = button.textContent
  button.textContent = 'Localizando anúncio...'
  setResolveStatus(container, 'Seguindo o link de afiliado e procurando o anúncio real do produto...')

  try {
    const url = new URL(RESOLVER_ENDPOINT)
    url.searchParams.set('url', affiliateUrl)
    const response = await fetch(url.toString(), { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok || !payload.ok || !payload.productUrl) {
      throw new Error(payload.message || 'O anúncio real ainda não foi localizado.')
    }

    form.elements.namedItem('socialUrl').value = payload.socialUrl || ''
    form.elements.namedItem('productUrl').value = payload.productUrl || ''
    form.elements.namedItem('productId').value = payload.productId || ''
    container.querySelector('[data-resolved-result]').hidden = false

    setResolveStatus(container, 'Anúncio localizado com sucesso. Seu link de afiliado original continua preservado.', 'success')
  } catch (error) {
    setResolveStatus(container, error.message || 'Não foi possível localizar o anúncio automaticamente.', 'error')
  } finally {
    button.disabled = false
    button.textContent = originalText
  }
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
  set('productUrl', capture.productUrl || capture.affiliateUrl || '')
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

  container.querySelector('[data-resolve-link]')?.addEventListener('click', () => resolveAffiliateLink(container))

  container.querySelector('[data-hub-clear]')?.addEventListener('click', () => {
    container.querySelector('[data-hub-capture]')?.reset()
    const result = container.querySelector('[data-resolved-result]')
    if (result) result.hidden = true
    const status = container.querySelector('[data-resolve-status]')
    if (status) status.innerHTML = ''
  })

  container.querySelector('[data-hub-capture]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const affiliateUrl = String(data.get('affiliateUrl') || '').trim()

    if (!affiliateUrl) return

    writeCapture({
      affiliateUrl,
      socialUrl: String(data.get('socialUrl') || '').trim(),
      productUrl: String(data.get('productUrl') || '').trim(),
      productId: String(data.get('productId') || '').trim(),
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

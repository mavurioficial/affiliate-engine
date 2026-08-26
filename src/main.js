import { sections } from './app/catalog.js'
import { getSession, signIn, signOut, onAuthChange } from './app/auth.js'

const root = document.querySelector('#root')

const labels = {
  name: 'Nome',
  description: 'Descrição',
  locale: 'Localidade',
  currency: 'Moeda',
  markets: 'Mercados',
  languages: 'Idiomas',
  status: 'Estado',
  platform: 'Plataforma',
  category: 'Categoria',
  product: 'Produto',
  market: 'Mercado',
  offer: 'Oferta',
  destination: 'Destino',
  capability: 'Capacidade'
}

let page = 'dashboard'
let session = null
let catalogs = {}
let catalogsLoaded = false

// Mantém o rascunho da divulgação enquanto o usuário navega entre as abas.
let divulgacaoDraft = {
  platform: 'mercadolivre',
  productUrl: '',
  affiliateUrl: '',
  productName: '',
  price: '',
  previousPrice: '',
  installments: '',
  installmentInterest: 'no-interest',
  language: 'pt'
}

let divulgacaoPreview = ''

const value = (item) =>
  Array.isArray(item) ? item.join(' · ') : (item ?? '')

const editable = (entry, field) =>
  Array.isArray(entry[field])
    ? entry[field].join(', ')
    : (entry[field] ?? '')

const escapeHtml = (item) =>
  String(item ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

async function loadCatalogs() {
  const results = await Promise.all(
    sections.map(async (section) => {
      const entries = await section.repository.list()
      return [section.id, entries]
    })
  )

  catalogs = Object.fromEntries(results)
  catalogsLoaded = true
}

function getEntries(section) {
  return catalogs[section.id] || []
}

function navigation() {
  return `
    <aside>
      <button
        class="brand"
        data-page="dashboard"
        aria-label="Ir ao dashboard"
      >
        <span>M</span>
        <b>Mavuri</b>
        <em>Affiliate Engine</em>
      </button>

      <nav aria-label="Navegação principal">
        <button
          class="${page === 'dashboard' ? 'active' : ''}"
          data-page="dashboard"
        >
          Visão geral
        </button>

        <p>Divulgação</p>

        <button
          class="${page === 'divulgacao' ? 'active' : ''}"
          data-page="divulgacao"
        >
          Nova divulgação
        </button>

        <p>Administração</p>

        ${sections.map((s) => `
          <button
            class="${page === s.id ? 'active' : ''}"
            data-page="${s.id}"
          >
            ${s.label}
          </button>
        `).join('')}
      </nav>

      <footer>
        <strong>${session?.user?.email || ''}</strong><br>
        Fundação MVP<br>
        Dados no Supabase<br><br>

        <button data-logout>Sair</button>
      </footer>
    </aside>
  `
}

function loginPage() {
  return `
    <div class="login-shell">
      <form class="login-card" data-login>
        <p class="eyebrow">MAVURI</p>

        <h1>Affiliate Engine</h1>

        <p>Acesse o ambiente administrativo.</p>

        <label>
          <span>E-mail</span>

          <input
            type="email"
            name="email"
            required
            autocomplete="email"
            placeholder="seu@email.com"
          />
        </label>

        <label>
          <span>Senha</span>

          <input
            type="password"
            name="password"
            required
            autocomplete="current-password"
            placeholder="Sua senha"
          />
        </label>

        <p class="login-error" hidden></p>

        <button class="primary" type="submit">
          Entrar
        </button>
      </form>
    </div>
  `
}

function dashboard() {
  return `
    <header class="page-heading">
      <p class="eyebrow">MVP · Supabase</p>

      <h1>Fundação do Affiliate Engine</h1>

      <p>
        Uma visão navegável do domínio com persistência dos dados no banco.
      </p>
    </header>

    <section class="status-card">
      <div>
        <p class="eyebrow">Estado atual</p>

        <h2>Interface administrativa integrada ao Supabase</h2>

        <p>
          Os cadastros são armazenados no banco de dados e podem ser
          acessados posteriormente.
        </p>
      </div>

      <span class="status-dot">
        Integração com banco ativa
      </span>
    </section>

    <section>
      <div class="section-title">
        <h2>Áreas disponíveis</h2>

        <p>
          Escolha uma área para consultar e administrar os dados.
        </p>
      </div>

      <div class="area-grid">
        ${sections.map((s) => `
          <button
            class="area-card"
            data-page="${s.id}"
          >
            <span>${s.eyebrow}</span>

            <strong>${s.label}</strong>

            <small>
              ${getEntries(s).length} registro(s)
            </small>
          </button>
        `).join('')}
      </div>
    </section>

    <section class="next-steps">
      <h2>Backup dos dados</h2>

      <p>
        Você pode exportar os cadastros atuais para um arquivo JSON
        e importar novamente esse backup quando necessário.
      </p>

      <div class="form-actions">
        <button data-export>
          Exportar backup
        </button>

        <button data-import>
          Importar backup
        </button>
      </div>

      <input
        id="backup-file"
        type="file"
        accept="application/json,.json"
        hidden
      />
    </section>

    <section class="next-steps">
      <h2>Limites desta etapa</h2>

      <ul>
        <li>Os dados são armazenados no Supabase.</li>

        <li>
          A autenticação e as permissões continuam sendo tratadas
          separadamente.
        </li>

        <li>
          Telegram continua apenas como canal conceitual,
          sem credenciais ou chamadas de API.
        </li>
      </ul>
    </section>
  `
}

function divulgacaoPage() {
  return `
    <header class="page-heading">
      <p class="eyebrow">DIVULGAÇÃO</p>

      <h1>Nova divulgação</h1>

      <p>
        Prepare uma nova oferta utilizando os links oficiais
        das plataformas de afiliados.
      </p>
    </header>

    <section class="divulgacao-layout">

      <form
        class="divulgacao-form"
        data-divulgacao
      >

        <label>
          <span>Plataforma</span>

          <select
            name="platform"
            required
          >
            <option value="mercadolivre" ${divulgacaoDraft.platform === 'mercadolivre' ? 'selected' : ''}>
              Mercado Livre
            </option>

            <option
              value="shopee"
              disabled
            >
              Shopee — em breve
            </option>

            <option
              value="amazon"
              disabled
            >
              Amazon — em breve
            </option>

            <option
              value="aliexpress"
              disabled
            >
              AliExpress — em breve
            </option>
          </select>
        </label>

        <label>
          <span>URL original do produto</span>

          <input
            type="url"
            name="productUrl"
            value="${escapeHtml(divulgacaoDraft.productUrl)}"
            placeholder="https://produto.mercadolivre.com.br/..."
          />
        </label>

        <label>
          <span>Link oficial de afiliado</span>

          <input
            type="url"
            name="affiliateUrl"
            value="${escapeHtml(divulgacaoDraft.affiliateUrl)}"
            placeholder="https://meli.la/..."
            required
          />

          <small>
            Utilize o link gerado oficialmente
            pela plataforma de afiliados.
          </small>
        </label>

        <label>
          <span>Nome do produto</span>

          <input
            name="productName"
            value="${escapeHtml(divulgacaoDraft.productName)}"
            placeholder="Ex.: Tênis Asics Gel Shogun"
            required
          />
        </label>

        <div class="form-grid">

  <label>
    <span>Preço atual</span>

<input
  name="price"
  value="${escapeHtml(divulgacaoDraft.price)}"
  placeholder="Ex.: 285"
/>
  </label>

  <label>
    <span>Preço anterior</span>

<input
  name="previousPrice"
  value="${escapeHtml(divulgacaoDraft.previousPrice)}"
  placeholder="Ex.: 459"
/>
  </label>

</div>

<div class="form-grid">

  <label>
    <span>Número de parcelas</span>

<input
  type="number"
  name="installments"
  min="2"
  value="${escapeHtml(divulgacaoDraft.installments)}"
  placeholder="Ex.: 10"
/>
  </label>

  <label>
    <span>Parcelamento</span>

<select name="installmentInterest">
  <option
    value="no-interest"
    ${divulgacaoDraft.installmentInterest === 'no-interest' ? 'selected' : ''}
  >
    Sem juros
  </option>

  <option
    value="with-interest"
    ${divulgacaoDraft.installmentInterest === 'with-interest' ? 'selected' : ''}
  >
    Com juros
  </option>
</select>
  </label>

</div>

        <label>
          <span>Idioma</span>

          <select name="language">

            <option value="pt" ${divulgacaoDraft.language === 'pt' ? 'selected' : ''}>
              Português
            </option>

            <option value="en" ${divulgacaoDraft.language === 'en' ? 'selected' : ''}>
              Inglês
            </option>

            <option value="both" ${divulgacaoDraft.language === 'both' ? 'selected' : ''}>
              Português e Inglês
            </option>

          </select>
        </label>

        <button
          class="primary"
          type="submit"
        >
          Gerar prévia
        </button>

      </form>

      <section
        class="promotion-preview"
        data-promotion-preview
      >

        ${divulgacaoPreview || `
          <div class="preview-empty">
            <span>🚀</span>
            <h2>Sua divulgação aparecerá aqui</h2>
            <p>Preencha os dados do produto e gere uma prévia da publicação.</p>
          </div>
        `}

      </section>

    </section>
  `
}
function fieldInput(s, entry, field) {
  const reference = s.references?.[field]

  if (reference) {
    const options =
      sections.find(
        (section) => section.id === reference.section
      )

    const entries =
      options
        ? getEntries(options)
        : []

    const selected =
      Array.isArray(entry?.[field])
        ? entry[field]
        : entry?.[field]
          ? [entry[field]]
          : []

    if (reference.multiple) {
      return `
        <label>
          <span>${labels[field]}</span>

          <select
            name="${field}"
            multiple
          >
            ${entries.map((item) => `
              <option
                value="${escapeHtml(item.id)}"
                ${selected.includes(item.id) ? 'selected' : ''}
              >
                ${escapeHtml(item.name)}
              </option>
            `).join('')}
          </select>
        </label>
      `
    }

    return `
      <label>
        <span>${labels[field]}</span>

        <select
          name="${field}"
        >
          <option value="">
            Selecione...
          </option>

          ${entries.map((item) => `
            <option
              value="${escapeHtml(item.id)}"
              ${selected.includes(item.id) ? 'selected' : ''}
            >
              ${escapeHtml(item.name)}
            </option>
          `).join('')}
        </select>
      </label>
    `
  }

  return `
    <label>
      <span>${labels[field]}</span>

      <input
        name="${field}"
        value="${escapeHtml(editable(entry || {}, field))}"
      />
    </label>
  `
}

function formPage(section, entry = null) {
  const editing = Boolean(entry)

  return `
    <header class="page-heading">
      <p class="eyebrow">
        ${section.eyebrow}
      </p>

      <div class="heading-row">
        <div>
          <h1>
            ${editing ? 'Editar cadastro' : 'Novo cadastro'}
          </h1>

          <p>
            ${editing
              ? `Atualize as informações de ${escapeHtml(entry.name)}.`
              : `Inclua um novo registro em ${section.label}.`
            }
          </p>
        </div>

        <button
          data-page="${section.id}"
        >
          Cancelar
        </button>
      </div>
    </header>

    <form
      class="entry-form"
      data-form="${section.id}"
      data-id="${entry?.id || ''}"
    >
      ${fieldInput(
        section,
        entry,
        'name'
      )}

      <label>
        <span>Descrição</span>

        <textarea
          name="description"
          rows="4"
        >${escapeHtml(entry?.description || '')}</textarea>
      </label>

      ${section.fields.map((field) =>
        fieldInput(
          section,
          entry,
          field
        )
      ).join('')}

      <div class="form-actions">
        <button
          class="primary"
          type="submit"
        >
          ${editing
            ? 'Salvar alterações'
            : 'Criar cadastro'
          }
        </button>

        <button
          type="button"
          data-page="${section.id}"
        >
          Cancelar
        </button>
      </div>
    </form>
  `
}

function sectionPage(section) {
  const entries = getEntries(section)

  return `
    <header class="page-heading">
      <p class="eyebrow">
        ${section.eyebrow}
      </p>

      <div class="heading-row">
        <div>
          <h1>${section.title}</h1>

          <p>${section.intro}</p>
        </div>

        <button
          class="primary"
          data-add="${section.id}"
        >
          + Novo cadastro
        </button>
      </div>
    </header>

    <section
      class="catalog"
      aria-label="${section.title}"
    >
      ${
        entries.length
          ? entries.map((entry) => `
            <article class="entry">

              <div>
                <h2>
                  ${escapeHtml(entry.name)}
                </h2>

                <p>
                  ${escapeHtml(entry.description)}
                </p>
              </div>

              <dl>
                ${section.fields.map((field) => `
                  <div>
                    <dt>
                      ${labels[field]}
                    </dt>

                    <dd>
                      ${escapeHtml(
                        displayField(
                          section,
                          entry,
                          field
                        )
                      )}
                    </dd>
                  </div>
                `).join('')}
              </dl>

              <div class="entry-actions">

                <button
                  data-edit="${section.id}:${entry.id}"
                >
                  Editar
                </button>

                <button
                  class="danger"
                  data-remove="${section.id}:${entry.id}"
                >
                  Excluir
                </button>

              </div>

            </article>
          `).join('')
          : `
            <div class="empty">
              Nenhum cadastro nesta área.
            </div>
          `
      }
    </section>

    <p class="notice">
      Os dados ficam armazenados no Supabase.
      Use o backup da Visão geral como medida adicional de segurança.
    </p>
  `
}

function displayField(section, entry, field) {
  const reference =
    section.references?.[field]

  if (!reference) {
    return value(entry[field])
  }

  const targetSection =
    sections.find(
      (item) =>
        item.id === reference.section
    )

  if (!targetSection) {
    return value(entry[field])
  }

  const allEntries =
    getEntries(targetSection)

  const ids =
    Array.isArray(entry[field])
      ? entry[field]
      : entry[field]
        ? [entry[field]]
        : []

  const names =
    ids
      .map((id) =>
        allEntries.find(
          (item) => item.id === id
        )?.name
      )
      .filter(Boolean)

  return names.join(' · ')
}

function errorPage(error) {
  return `
    <div class="error-page">
      <h1>
        Não foi possível carregar os dados
      </h1>

      <p>
        ${escapeHtml(
          error?.message ||
          'Ocorreu um erro inesperado.'
        )}
      </p>

      <button
        class="primary"
        data-reload
      >
        Tentar novamente
      </button>
    </div>
  `
}
async function render() {
  if (!session) {
    root.innerHTML = loginPage()
    bind()
    return
  }

  try {
    if (!catalogsLoaded) {
      await loadCatalogs()
    }

    const section =
      sections.find(
        (s) => s.id === page
      )

    const edit =
      page.startsWith('edit:')
        ? sections.find(
            (s) =>
              s.id === page.split(':')[1]
          )
        : null

    const add =
      page.startsWith('add:')
        ? sections.find(
            (s) =>
              s.id === page.split(':')[1]
          )
        : null

    const entry =
      edit
        ? getEntries(edit).find(
            (item) =>
              item.id === page.split(':')[2]
          )
        : null

    const content =
      page === 'divulgacao'
        ? divulgacaoPage()
        : edit
          ? formPage(edit, entry)
          : add
            ? formPage(add)
            : section
              ? sectionPage(section)
              : dashboard()

    root.innerHTML = `
      <div class="shell">
        ${navigation()}

        <main>
          ${content}
        </main>
      </div>
    `

    bind()
  } catch (error) {
    root.innerHTML = `
      <div class="shell">
        ${navigation()}

        <main>
          ${errorPage(error)}
        </main>
      </div>
    `

    bind()
  }
}

function saveDivulgacaoDraft(form) {
  const formData =
    new FormData(form)

  divulgacaoDraft = {
    platform:
      String(
        formData.get('platform') ||
        'mercadolivre'
      ),

    productUrl:
      String(
        formData.get('productUrl') ||
        ''
      ),

    affiliateUrl:
      String(
        formData.get('affiliateUrl') ||
        ''
      ),

    productName:
      String(
        formData.get('productName') ||
        ''
      ),

    price:
      String(
        formData.get('price') ||
        ''
      ),

    previousPrice:
      String(
        formData.get('previousPrice') ||
        ''
      ),

    installments:
      String(
        formData.get('installments') ||
        ''
      ),

    installmentInterest:
      String(
        formData.get('installmentInterest') ||
        'no-interest'
      ),

    language:
      String(
        formData.get('language') ||
        'pt'
      )
  }
}

function formatPromotionPrice(value) {
  const text =
    String(value || '')
      .trim()
      .replace(/\./g, '')
      .replace(',', '.')

  const number =
    Number(text)

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return String(value || '')
  }

  return new Intl.NumberFormat(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  ).format(number)
}

function promotionPreviewHtml(data) {
  const productName =
    String(data.productName || '').trim()

  const affiliateUrl =
    String(data.affiliateUrl || '').trim()

  const language =
    data.language || 'pt'

  const installments =
    Number(data.installments || 0)

  const installmentInterest =
    data.installmentInterest || 'no-interest'

  const parsePrice = (value) => {
    if (!value) {
      return 0
    }

    const normalized =
      String(value)
        .replace('R$', '')
        .trim()
        .replace(/\./g, '')
        .replace(',', '.')

    return Number(normalized) || 0
  }

  const formatPrice = (value) =>
    Number(value).toLocaleString(
      'pt-BR',
      {
        style: 'currency',
        currency: 'BRL'
      }
    )

  const currentPrice =
    parsePrice(data.price)

  const oldPrice =
    parsePrice(data.previousPrice)

  const hasDiscount =
    oldPrice > currentPrice &&
    currentPrice > 0

  const discount =
    hasDiscount
      ? Math.round(
          (
            1 -
            currentPrice / oldPrice
          ) * 100
        )
      : 0

  const savings =
    hasDiscount
      ? oldPrice - currentPrice
      : 0

  const installmentValue =
    installments > 1 &&
    currentPrice > 0
      ? currentPrice / installments
      : 0

  const promotionPt = `
    <div class="promotion-card">

      <p class="promotion-badge">
        🔥 OFERTA ENCONTRADA!
      </p>

      <h2>
        👟 ${escapeHtml(productName)}
      </h2>

      ${
        hasDiscount
          ? `
            <p class="promotion-previous">
              📉 De
              <s>
                ${formatPrice(oldPrice)}
              </s>
            </p>
          `
          : ''
      }

      ${
        currentPrice
          ? `
            <p class="promotion-price">
              Por 💰
              <strong>
                ${formatPrice(currentPrice)}
              </strong>
              ${
                discount
                  ? `— ${discount}% OFF`
                  : ''
              }
            </p>
          `
          : ''
      }

      ${
        savings
          ? `
            <p class="promotion-savings">
              💸 Economize
              <strong>
                ${formatPrice(savings)}
              </strong>
            </p>
          `
          : ''
      }

      ${
        installmentValue
          ? `
            <p class="promotion-installments">
              💳
              <strong>
                ${installments}x de ${formatPrice(installmentValue)}
              </strong>
              ${
                installmentInterest === 'no-interest'
                  ? 'sem juros'
                  : 'com juros'
              }
            </p>
          `
          : ''
      }

      <p>
        👉 Aproveite a oferta:
      </p>

      <a
        href="${escapeHtml(affiliateUrl)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${escapeHtml(affiliateUrl)}
      </a>

    </div>
  `

  const promotionEn = `
    <div class="promotion-card">

      <p class="promotion-badge">
        🔥 DEAL FOUND
      </p>

      <h2>
        👟 ${escapeHtml(productName)}
      </h2>

      ${
        hasDiscount
          ? `
            <p class="promotion-previous">
              📉 Was
              <s>
                ${formatPrice(oldPrice)}
              </s>
            </p>
          `
          : ''
      }

      ${
        currentPrice
          ? `
            <p class="promotion-price">
              Now 💰
              <strong>
                ${formatPrice(currentPrice)}
              </strong>
              ${
                discount
                  ? `— ${discount}% OFF`
                  : ''
              }
            </p>
          `
          : ''
      }

      ${
        installmentValue
          ? `
            <p class="promotion-installments">
              💳
              <strong>
                ${installments}x of ${formatPrice(installmentValue)}
              </strong>
              ${
                installmentInterest === 'no-interest'
                  ? 'interest free'
                  : 'with interest'
              }
            </p>
          `
          : ''
      }

      <p>
        👉 Check the deal:
      </p>

      <a
        href="${escapeHtml(affiliateUrl)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${escapeHtml(affiliateUrl)}
      </a>

    </div>
  `

  if (language === 'en') {
    return promotionEn
  }

  if (language === 'both') {
    return `
      <div class="promotion-language">

        <p class="eyebrow">
          PORTUGUÊS
        </p>

        ${promotionPt}

      </div>

      <div class="promotion-language">

        <p class="eyebrow">
          ENGLISH
        </p>

        ${promotionEn}

      </div>
    `
  }

  return promotionPt
}

function bind() {
  const reloadButton =
    root.querySelector('[data-reload]')

  if (reloadButton) {
    reloadButton.addEventListener(
      'click',
      async () => {
        catalogsLoaded = false
        await render()
      }
    )
  }

  // --------------------------------------------------
  // NOVA DIVULGAÇÃO
  // --------------------------------------------------

  const divulgacaoForm =
    root.querySelector('[data-divulgacao]')

  if (divulgacaoForm) {
    const saveDraft = () => {
      saveDivulgacaoDraft(divulgacaoForm)
    }

    divulgacaoForm.addEventListener(
      'input',
      saveDraft
    )

    divulgacaoForm.addEventListener(
      'change',
      saveDraft
    )

    divulgacaoForm.addEventListener(
      'submit',
      (event) => {
        event.preventDefault()

        saveDivulgacaoDraft(
          divulgacaoForm
        )

        divulgacaoPreview =
          promotionPreviewHtml(
            divulgacaoDraft
          )

        const preview =
          root.querySelector(
            '[data-promotion-preview]'
          )

        if (preview) {
          preview.innerHTML =
            divulgacaoPreview
        }
      }
    )
  }

  // --------------------------------------------------
  // LOGIN
  // --------------------------------------------------

  const loginForm =
    root.querySelector('[data-login]')

  if (loginForm) {
    loginForm.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault()

        const formData =
          new FormData(loginForm)

        const email =
          String(
            formData.get('email') ||
            ''
          )

        const password =
          String(
            formData.get('password') ||
            ''
          )

        const errorBox =
          loginForm.querySelector(
            '.login-error'
          )

        const button =
          loginForm.querySelector(
            'button[type="submit"]'
          )

        try {
          if (button) {
            button.disabled = true
            button.textContent =
              'Entrando...'
          }

          if (errorBox) {
            errorBox.hidden = true
            errorBox.textContent = ''
          }

          await signIn(
            email,
            password
          )
        } catch (error) {
          if (errorBox) {
            errorBox.hidden = false

            errorBox.textContent =
              error?.message ||
              'Não foi possível entrar.'
          }

          if (button) {
            button.disabled = false
            button.textContent =
              'Entrar'
          }
        }
      }
    )
  }

  // --------------------------------------------------
  // NAVEGAÇÃO
  // --------------------------------------------------

  root
    .querySelectorAll('[data-page]')
    .forEach((button) => {
      button.addEventListener(
        'click',
        async () => {
          page =
            button.dataset.page

          await render()
        }
      )
    })

  // --------------------------------------------------
  // NOVO CADASTRO
  // --------------------------------------------------

  root
    .querySelectorAll('[data-add]')
    .forEach((button) => {
      button.addEventListener(
        'click',
        async () => {
          page =
            `add:${button.dataset.add}`

          await render()
        }
      )
    })

  // --------------------------------------------------
  // EDITAR CADASTRO
  // --------------------------------------------------

  root
    .querySelectorAll('[data-edit]')
    .forEach((button) => {
      button.addEventListener(
        'click',
        async () => {
          page =
            `edit:${button.dataset.edit}`

          await render()
        }
      )
    })

  // --------------------------------------------------
  // EXCLUIR CADASTRO
  // --------------------------------------------------

  root
    .querySelectorAll('[data-remove]')
    .forEach((button) => {
      button.addEventListener(
        'click',
        async () => {
          const [
            sectionId,
            entryId
          ] =
            button.dataset.remove.split(':')

          const section =
            sections.find(
              (item) =>
                item.id === sectionId
            )

          if (!section) {
            return
          }

          const entry =
            getEntries(section).find(
              (item) =>
                item.id === entryId
            )

          const name =
            entry?.name ||
            'este cadastro'

          const confirmed =
            window.confirm(
              `Deseja realmente excluir "${name}"?`
            )

          if (!confirmed) {
            return
          }

          try {
            await section.repository.remove(
              entryId
            )

            catalogsLoaded = false

            await render()
          } catch (error) {
            window.alert(
              error?.message ||
              'Não foi possível excluir o cadastro.'
            )
          }
        }
      )
    })

  // --------------------------------------------------
  // FORMULÁRIOS DE CADASTRO
  // --------------------------------------------------

  root
    .querySelectorAll('[data-form]')
    .forEach((form) => {
      form.addEventListener(
        'submit',
        async (event) => {
          event.preventDefault()

          const sectionId =
            form.dataset.form

          const entryId =
            form.dataset.id

          const section =
            sections.find(
              (item) =>
                item.id === sectionId
            )

          if (!section) {
            return
          }

          const formData =
            new FormData(form)

          const data = {
            name:
              String(
                formData.get('name') ||
                ''
              ).trim(),

            description:
              String(
                formData.get('description') ||
                ''
              ).trim()
          }

          section.fields.forEach(
            (field) => {
              const reference =
                section.references?.[field]

              if (
                reference?.multiple
              ) {
                data[field] =
                  formData
                    .getAll(field)
                    .filter(Boolean)

                return
              }

              const raw =
                formData.get(field)

              data[field] =
                raw === null
                  ? ''
                  : String(raw).trim()
            }
          )

          try {
            const button =
              form.querySelector(
                'button[type="submit"]'
              )

            if (button) {
              button.disabled = true
              button.textContent =
                'Salvando...'
            }

            if (entryId) {
              await section.repository.update(
                entryId,
                data
              )
            } else {
              await section.repository.create(
                data
              )
            }

            catalogsLoaded = false

            page =
              sectionId

            await render()
          } catch (error) {
            window.alert(
              error?.message ||
              'Não foi possível salvar o cadastro.'
            )

            const button =
              form.querySelector(
                'button[type="submit"]'
              )

            if (button) {
              button.disabled = false

              button.textContent =
                entryId
                  ? 'Salvar alterações'
                  : 'Criar cadastro'
            }
          }
        }
      )
    })

  // --------------------------------------------------
  // EXPORTAR BACKUP
  // --------------------------------------------------

  const exportButton =
    root.querySelector('[data-export]')

  if (exportButton) {
    exportButton.addEventListener(
      'click',
      () => {
        const backup = {
          exportedAt:
            new Date().toISOString(),

          version: 1,

          catalogs:
            Object.fromEntries(
              sections.map(
                (section) => [
                  section.id,
                  getEntries(section)
                ]
              )
            )
        }

        const blob =
          new Blob(
            [
              JSON.stringify(
                backup,
                null,
                2
              )
            ],
            {
              type:
                'application/json'
            }
          )

        const url =
          URL.createObjectURL(blob)

        const link =
          document.createElement('a')

        link.href = url

        link.download =
          `mavuri-backup-${
            new Date()
              .toISOString()
              .slice(0, 10)
          }.json`

        document.body.appendChild(link)

        link.click()

        link.remove()

        URL.revokeObjectURL(url)
      }
    )
  }

  // --------------------------------------------------
  // IMPORTAR BACKUP
  // --------------------------------------------------

  const importButton =
    root.querySelector('[data-import]')

  const backupFile =
    root.querySelector('#backup-file')

  if (
    importButton &&
    backupFile
  ) {
    importButton.addEventListener(
      'click',
      () => {
        backupFile.click()
      }
    )

    backupFile.addEventListener(
      'change',
      async () => {
        const file =
          backupFile.files?.[0]

        if (!file) {
          return
        }

        try {
          const text =
            await file.text()

          const backup =
            JSON.parse(text)

          if (
            !backup?.catalogs ||
            typeof backup.catalogs !==
              'object'
          ) {
            throw new Error(
              'Arquivo de backup inválido.'
            )
          }

          const confirmed =
            window.confirm(
              'A importação poderá adicionar ou atualizar registros. Deseja continuar?'
            )

          if (!confirmed) {
            backupFile.value = ''
            return
          }

          for (
            const section of sections
          ) {
            const entries =
              backup.catalogs[
                section.id
              ]

            if (
              !Array.isArray(entries)
            ) {
              continue
            }

            for (
              const entry of entries
            ) {
              const {
                id,
                ...data
              } = entry

              if (
                id &&
                typeof section.repository.update ===
                  'function'
              ) {
                try {
                  await section.repository.update(
                    id,
                    data
                  )
                } catch {
                  await section.repository.create(
                    data
                  )
                }
              } else {
                await section.repository.create(
                  data
                )
              }
            }
          }

          catalogsLoaded = false

          window.alert(
            'Backup importado com sucesso.'
          )

          await render()
        } catch (error) {
          window.alert(
            error?.message ||
            'Não foi possível importar o backup.'
          )
        } finally {
          backupFile.value = ''
        }
      }
    )
  }

  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  const logoutButton =
    root.querySelector('[data-logout]')

  if (logoutButton) {
    logoutButton.addEventListener(
      'click',
      async () => {
        try {
          await signOut()
        } catch (error) {
          window.alert(
            error?.message ||
            'Não foi possível sair.'
          )
        }
      }
    )
  }
}

async function initialize() {
  try {
    session =
      await getSession()

    onAuthChange(
      async (nextSession) => {
        session =
          nextSession

        if (!session) {
          catalogs = {}
          catalogsLoaded = false
          page = 'dashboard'
        }

        await render()
      }
    )

    await render()
  } catch (error) {
    console.error(
      'Erro ao inicializar Mavuri:',
      error
    )

    root.innerHTML = `
      <div class="error-page">
        <h1>
          Erro ao iniciar o Mavuri
        </h1>

        <p>
          ${escapeHtml(
            error?.message ||
            'Verifique a configuração da aplicação.'
          )}
        </p>
      </div>
    `
  }
}

initialize()

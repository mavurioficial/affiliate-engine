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

// Mantém o rascunho da divulgação enquanto o usuário navega.
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

// --------------------------------------------------
// BUSCA DE OFERTAS
// --------------------------------------------------

// Nesta primeira etapa os resultados são simulados.
// Depois este ponto será substituído pela integração
// oficial com o backend/API do Mavuri.
let ofertasBuscaDraft = {
  platform: 'mercadolivre',
  query: '',
  discount: '20',
  priceMax: '',
  limit: '10'
}

let ofertasEncontradas = []

const ofertasDemo = [
  {
    id: 'MLB-DEMO-001',
    platform: 'mercadolivre',
    name: 'Tênis Asics Gel Shogun',
    description: 'Oferta demonstrativa para validar o fluxo automático.',
    productUrl: 'https://www.mercadolivre.com.br/',
    price: 285,
    previousPrice: 459,
    installments: 10,
    installmentInterest: 'no-interest',
    image: '',
    category: 'Calçados'
  },
  {
    id: 'MLB-DEMO-002',
    platform: 'mercadolivre',
    name: 'Smart TV 50 polegadas 4K',
    description: 'Produto demonstrativo com desconto para testar a seleção.',
    productUrl: 'https://www.mercadolivre.com.br/',
    price: 2199,
    previousPrice: 2999,
    installments: 10,
    installmentInterest: 'no-interest',
    image: '',
    category: 'Eletrônicos'
  },
  {
    id: 'MLB-DEMO-003',
    platform: 'mercadolivre',
    name: 'Fone de Ouvido Bluetooth Premium',
    description: 'Produto demonstrativo para validar filtros e geração.',
    productUrl: 'https://www.mercadolivre.com.br/',
    price: 179,
    previousPrice: 299,
    installments: 6,
    installmentInterest: 'no-interest',
    image: '',
    category: 'Tecnologia'
  },
  {
    id: 'MLB-DEMO-004',
    platform: 'mercadolivre',
    name: 'Air Fryer 5 Litros',
    description: 'Produto demonstrativo para a primeira versão do motor.',
    productUrl: 'https://www.mercadolivre.com.br/',
    price: 349,
    previousPrice: 499,
    installments: 8,
    installmentInterest: 'no-interest',
    image: '',
    category: 'Casa'
  },
  {
    id: 'MLB-DEMO-005',
    platform: 'mercadolivre',
    name: 'Notebook 15,6 polegadas',
    description: 'Oferta demonstrativa com maior valor e desconto.',
    productUrl: 'https://www.mercadolivre.com.br/',
    price: 2899,
    previousPrice: 3799,
    installments: 12,
    installmentInterest: 'with-interest',
    image: '',
    category: 'Informática'
  }
]

const value = (item) =>
  Array.isArray(item)
    ? item.join(' · ')
    : (item ?? '')

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

function parseMoney(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return 0
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : 0
  }

  const normalized =
    String(value)
      .replace('R$', '')
      .trim()
      .replace(/\./g, '')
      .replace(',', '.')

  return Number(normalized) || 0
}

function formatMoney(value) {
  const number =
    Number(value) || 0

  return new Intl.NumberFormat(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  ).format(number)
}

function calculateDiscount(
  price,
  previousPrice
) {
  const current =
    parseMoney(price)

  const previous =
    parseMoney(previousPrice)

  if (
    !current ||
    !previous ||
    previous <= current
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

function calculateMavuriScore(offer) {
  const discount =
    calculateDiscount(
      offer.price,
      offer.previousPrice
    )

  let score = 40

  score += Math.min(
    discount,
    50
  )

  if (
    offer.installments &&
    offer.installments >= 6
  ) {
    score += 5
  }

  if (
    offer.installmentInterest ===
    'no-interest'
  ) {
    score += 5
  }

  return Math.min(
    Math.round(score),
    100
  )
}

async function loadCatalogs() {
  const results = await Promise.all(
    sections.map(async (section) => {
      const entries =
        await section.repository.list()

      return [
        section.id,
        entries
      ]
    })
  )

  catalogs =
    Object.fromEntries(results)

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
          class="${
            page === 'dashboard'
              ? 'active'
              : ''
          }"
          data-page="dashboard"
        >
          Visão geral
        </button>

        <p>Divulgação</p>

        <button
          class="${
            page === 'divulgacao'
              ? 'active'
              : ''
          }"
          data-page="divulgacao"
        >
          Nova divulgação
        </button>

        <button
          class="${
            page === 'buscar-ofertas'
              ? 'active'
              : ''
          }"
          data-page="buscar-ofertas"
        >
          🔥 Buscar ofertas
        </button>

        <p>Administração</p>

        ${sections.map((s) => `
          <button
            class="${
              page === s.id
                ? 'active'
                : ''
            }"
            data-page="${s.id}"
          >
            ${s.label}
          </button>
        `).join('')}

      </nav>

      <footer>
        <strong>
          ${session?.user?.email || ''}
        </strong><br>

        Fundação MVP<br>
        Dados no Supabase<br><br>

        <button data-logout>
          Sair
        </button>
      </footer>
    </aside>
  `
}

function loginPage() {
  return `
    <div class="login-shell">

      <form
        class="login-card"
        data-login
      >

        <p class="eyebrow">
          MAVURI
        </p>

        <h1>
          Affiliate Engine
        </h1>

        <p>
          Acesse o ambiente administrativo.
        </p>

        <label>

          <span>
            E-mail
          </span>

          <input
            type="email"
            name="email"
            required
            autocomplete="email"
            placeholder="seu@email.com"
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
            placeholder="Sua senha"
          />

        </label>

        <p
          class="login-error"
          hidden
        ></p>

        <button
          class="primary"
          type="submit"
        >
          Entrar
        </button>

      </form>

    </div>
  `
}

function dashboard() {
  return `
    <header class="page-heading">

      <p class="eyebrow">
        MVP · Supabase
      </p>

      <h1>
        Fundação do Affiliate Engine
      </h1>

      <p>
        Uma visão navegável do domínio com persistência
        dos dados no banco.
      </p>

    </header>

    <section class="status-card">

      <div>

        <p class="eyebrow">
          Estado atual
        </p>

        <h2>
          Interface administrativa integrada ao Supabase
        </h2>

        <p>
          Os cadastros são armazenados no banco de dados
          e podem ser acessados posteriormente.
        </p>

      </div>

      <span class="status-dot">
        Integração com banco ativa
      </span>

    </section>

    <section>

      <div class="section-title">

        <h2>
          Áreas disponíveis
        </h2>

        <p>
          Escolha uma área para consultar e administrar
          os dados.
        </p>

      </div>

      <div class="area-grid">

        <button
          class="area-card"
          data-page="buscar-ofertas"
        >
          <span>
            OPORTUNIDADES
          </span>

          <strong>
            🔥 Buscar ofertas
          </strong>

          <small>
            Encontre oportunidades para gerar novas divulgações.
          </small>
        </button>

        ${sections.map((s) => `
          <button
            class="area-card"
            data-page="${s.id}"
          >

            <span>
              ${s.eyebrow}
            </span>

            <strong>
              ${s.label}
            </strong>

            <small>
              ${getEntries(s).length} registro(s)
            </small>

          </button>
        `).join('')}

      </div>

    </section>

    <section class="next-steps">

      <h2>
        Backup dos dados
      </h2>

      <p>
        Você pode exportar os cadastros atuais para um
        arquivo JSON e importar novamente esse backup
        quando necessário.
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

      <h2>
        Limites desta etapa
      </h2>

      <ul>

        <li>
          Os dados são armazenados no Supabase.
        </li>

        <li>
          A autenticação e as permissões continuam sendo
          tratadas separadamente.
        </li>

        <li>
          Telegram continua apenas como canal conceitual,
          sem credenciais ou chamadas de API.
        </li>

      </ul>

    </section>
  `
}

function buscarOfertasPage() {
  const hasResults =
    ofertasEncontradas.length > 0

  return `
    <header class="page-heading">

      <p class="eyebrow">
        OPORTUNIDADES
      </p>

      <h1>
        🔥 Buscar ofertas
      </h1>

      <p>
        Encontre oportunidades e envie os melhores produtos
        diretamente para a criação da divulgação.
      </p>

    </header>

    <section class="next-steps">

      <h2>
        Critérios da busca
      </h2>

      <p>
        Nesta primeira versão os resultados são simulados
        para validarmos o fluxo completo do Mavuri.
        Depois esta tela será conectada à API oficial.
      </p>

      <form
        class="entry-form"
        data-buscar-ofertas
      >

        <div class="form-grid">

          <label>

            <span>
              Plataforma
            </span>

            <select
              name="platform"
            >

              <option
                value="mercadolivre"
                ${
                  ofertasBuscaDraft.platform ===
                  'mercadolivre'
                    ? 'selected'
                    : ''
                }
              >
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

            </select>

          </label>

          <label>

            <span>
              Buscar produto
            </span>

            <input
              name="query"
              value="${escapeHtml(
                ofertasBuscaDraft.query
              )}"
              placeholder="Ex.: tênis, TV, notebook..."
            />

          </label>

        </div>

        <div class="form-grid">

          <label>

            <span>
              Desconto mínimo
            </span>

            <select name="discount">

              <option
                value="0"
                ${
                  ofertasBuscaDraft.discount ===
                  '0'
                    ? 'selected'
                    : ''
                }
              >
                Qualquer desconto
              </option>

              <option
                value="10"
                ${
                  ofertasBuscaDraft.discount ===
                  '10'
                    ? 'selected'
                    : ''
                }
              >
                10% ou mais
              </option>

              <option
                value="20"
                ${
                  ofertasBuscaDraft.discount ===
                  '20'
                    ? 'selected'
                    : ''
                }
              >
                20% ou mais
              </option>

              <option
                value="30"
                ${
                  ofertasBuscaDraft.discount ===
                  '30'
                    ? 'selected'
                    : ''
                }
              >
                30% ou mais
              </option>

              <option
                value="40"
                ${
                  ofertasBuscaDraft.discount ===
                  '40'
                    ? 'selected'
                    : ''
                }
              >
                40% ou mais
              </option>

            </select>

          </label>

          <label>

            <span>
              Preço máximo
            </span>

            <input
              type="number"
              min="0"
              name="priceMax"
              value="${escapeHtml(
                ofertasBuscaDraft.priceMax
              )}"
              placeholder="Ex.: 1000"
            />

          </label>

        </div>

        <div class="form-grid">

          <label>

            <span>
              Quantidade máxima
            </span>

            <select name="limit">

              <option
                value="5"
                ${
                  ofertasBuscaDraft.limit ===
                  '5'
                    ? 'selected'
                    : ''
                }
              >
                5 ofertas
              </option>

              <option
                value="10"
                ${
                  ofertasBuscaDraft.limit ===
                  '10'
                    ? 'selected'
                    : ''
                }
              >
                10 ofertas
              </option>

              <option
                value="20"
                ${
                  ofertasBuscaDraft.limit ===
                  '20'
                    ? 'selected'
                    : ''
                }
              >
                20 ofertas
              </option>

            </select>

          </label>

        </div>

        <div class="form-actions">

          <button
            class="primary"
            type="submit"
          >
            🔎 Buscar ofertas
          </button>

        </div>

      </form>

    </section>

    ${
      hasResults
        ? `
          <section class="catalog">

            <div class="section-title">

              <div>

                <h2>
                  Ofertas encontradas
                </h2>

                <p>
                  ${ofertasEncontradas.length}
                  oportunidade(s) encontradas para os
                  critérios selecionados.
                </p>

              </div>

            </div>

            ${ofertasEncontradas.map((offer) => {
              const discount =
                calculateDiscount(
                  offer.price,
                  offer.previousPrice
                )

              const savings =
                parseMoney(
                  offer.previousPrice
                ) -
                parseMoney(
                  offer.price
                )

              const score =
                calculateMavuriScore(
                  offer
                )

              return `
                <article
                  class="entry"
                >

                  <div>

                    <p class="eyebrow">
                      ${escapeHtml(
                        offer.platform ===
                        'mercadolivre'
                          ? 'MERCADO LIVRE'
                          : offer.platform
                      )}
                    </p>

                    <h2>
                      ${escapeHtml(
                        offer.name
                      )}
                    </h2>

                    <p>
                      ${escapeHtml(
                        offer.description
                      )}
                    </p>

                  </div>

                  <dl>

                    <div>

                      <dt>
                        Preço anterior
                      </dt>

                      <dd>
                        ${
                          offer.previousPrice
                            ? `
                              <s>
                                ${formatMoney(
                                  offer.previousPrice
                                )}
                              </s>
                            `
                            : '—'
                        }
                      </dd>

                    </div>

                    <div>

                      <dt>
                        Preço atual
                      </dt>

                      <dd>
                        <strong>
                          ${formatMoney(
                            offer.price
                          )}
                        </strong>
                      </dd>

                    </div>

                    <div>

                      <dt>
                        Desconto
                      </dt>

                      <dd>
                        ${discount}% OFF
                      </dd>

                    </div>

                    <div>

                      <dt>
                        Economia
                      </dt>

                      <dd>
                        ${
                          savings > 0
                            ? formatMoney(
                                savings
                              )
                            : '—'
                        }
                      </dd>

                    </div>

                    <div>

                      <dt>
                        Score Mavuri
                      </dt>

                      <dd>
                        ⭐ ${score}/100
                      </dd>

                    </div>

                  </dl>

                  <div class="entry-actions">

                    <button
                      class="primary"
                      data-gerar-divulgacao="${escapeHtml(
                        offer.id
                      )}"
                    >
                      Gerar divulgação
                    </button>

                  </div>

                </article>
              `
            }).join('')}

          </section>
        `
        : `
          <section class="next-steps">

            <h2>
              Pronto para buscar
            </h2>

            <p>
              Configure os critérios e clique em
              <strong>Buscar ofertas</strong>.
            </p>

            <p>
              Na próxima etapa, estes resultados serão
              fornecidos pelo motor de integração do Mavuri.
            </p>

          </section>
        `
    }
  `
}

function divulgacaoPage() {
  return `
    <header class="page-heading">

      <p class="eyebrow">
        DIVULGAÇÃO
      </p>

      <h1>
        Nova divulgação
      </h1>

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

          <span>
            Plataforma
          </span>

          <select
            name="platform"
            required
          >

            <option
              value="mercadolivre"
              ${
                divulgacaoDraft.platform ===
                'mercadolivre'
                  ? 'selected'
                  : ''
              }
            >
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

          <span>
            URL original do produto
          </span>

          <input
            type="url"
            name="productUrl"
            value="${escapeHtml(
              divulgacaoDraft.productUrl
            )}"
            placeholder="https://produto.mercadolivre.com.br/..."
          />

        </label>

        <label>

          <span>
            Link oficial de afiliado
          </span>

          <input
            type="url"
            name="affiliateUrl"
            value="${escapeHtml(
              divulgacaoDraft.affiliateUrl
            )}"
            placeholder="https://meli.la/..."
            required
          />

          <small>
            Utilize o link gerado oficialmente
            pela plataforma de afiliados.
          </small>

        </label>

        <label>

          <span>
            Nome do produto
          </span>

          <input
            name="productName"
            value="${escapeHtml(
              divulgacaoDraft.productName
            )}"
            placeholder="Ex.: Tênis Asics Gel Shogun"
            required
          />

        </label>

        <div class="form-grid">

          <label>

            <span>
              Preço atual
            </span>

            <input
              name="price"
              value="${escapeHtml(
                divulgacaoDraft.price
              )}"
              placeholder="Ex.: 285"
            />

          </label>

          <label>

            <span>
              Preço anterior
            </span>

            <input
              name="previousPrice"
              value="${escapeHtml(
                divulgacaoDraft.previousPrice
              )}"
              placeholder="Ex.: 459"
            />

          </label>

        </div>

        <div class="form-grid">

          <label>

            <span>
              Número de parcelas
            </span>

            <input
              type="number"
              name="installments"
              min="2"
              value="${escapeHtml(
                divulgacaoDraft.installments
              )}"
              placeholder="Ex.: 10"
            />

          </label>

          <label>

            <span>
              Parcelamento
            </span>

            <select
              name="installmentInterest"
            >

              <option
                value="no-interest"
                ${
                  divulgacaoDraft.installmentInterest ===
                  'no-interest'
                    ? 'selected'
                    : ''
                }
              >
                Sem juros
              </option>

              <option
                value="with-interest"
                ${
                  divulgacaoDraft.installmentInterest ===
                  'with-interest'
                    ? 'selected'
                    : ''
                }
              >
                Com juros
              </option>

            </select>

          </label>

        </div>

        <label>

          <span>
            Idioma
          </span>

          <select name="language">

            <option
              value="pt"
              ${
                divulgacaoDraft.language ===
                'pt'
                  ? 'selected'
                  : ''
              }
            >
              Português
            </option>

            <option
              value="en"
              ${
                divulgacaoDraft.language ===
                'en'
                  ? 'selected'
                  : ''
              }
            >
              Inglês
            </option>

            <option
              value="both"
              ${
                divulgacaoDraft.language ===
                'both'
                  ? 'selected'
                  : ''
              }
            >
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

        ${
  divulgacaoPreview
    ? renderPromotionPreview(
        divulgacaoPreview
      )
    : `
      <div class="preview-empty">

        <span>
          🚀
        </span>

        <h2>
          Sua divulgação aparecerá aqui
        </h2>

        <p>
          Preencha os dados do produto e gere uma
          prévia da publicação.
        </p>

      </div>
    `
}

      </section>

    </section>
  `
}
function sectionPage(s) {
  const entries = getEntries(s)

  return `
    <header class="page-heading">

      <p class="eyebrow">
        ${s.eyebrow}
      </p>

      <div class="heading-row">

        <div>

          <h1>
            ${s.title}
          </h1>

          <p>
            ${s.intro}
          </p>

        </div>

        <button
          class="primary"
          data-add="${s.id}"
        >
          + Novo cadastro
        </button>

      </div>

    </header>

    <section
      class="catalog"
      aria-label="${s.title}"
    >

      ${
        entries.length
          ? entries.map((entry) => `
              <article class="entry">

                <div>

                  <h2>
                    ${escapeHtml(
                      entry.name
                    )}
                  </h2>

                  <p>
                    ${escapeHtml(
                      entry.description
                    )}
                  </p>

                </div>

                <dl>

                  ${s.fields.map((field) => `
                    <div>

                      <dt>
                        ${labels[field]}
                      </dt>

                      <dd>
                        ${escapeHtml(
                          value(entry[field])
                        )}
                      </dd>

                    </div>
                  `).join('')}

                </dl>

                <div class="entry-actions">

                  <button
                    data-edit="${entry.id}"
                  >
                    Editar
                  </button>

                  <button
                    class="danger"
                    data-remove="${entry.id}"
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
      Os dados são armazenados no Supabase.
    </p>
  `
}

function fieldControl(
  s,
  field,
  entry = {}
) {
  const reference =
    s.references?.[field]

  if (reference) {
    const referencedSection =
      sections.find(
        (section) =>
          section.id ===
          reference.section
      )

    const options =
      referencedSection
        ? getEntries(
            referencedSection
          )
        : []

    const selected =
      reference.multiple
        ? (
            Array.isArray(
              entry[field]
            )
              ? entry[field]
              : String(
                  entry[field] || ''
                )
                  .split(',')
                  .map(
                    (item) =>
                      item.trim()
                  )
                  .filter(Boolean)
          )
        : entry[field] || ''

    return `
      <label>

        <span>
          ${labels[field]}
        </span>

        <select
          name="${field}"
          ${
            reference.multiple
              ? 'multiple'
              : ''
          }
        >

          ${
            reference.multiple
              ? ''
              : `
                  <option value="">
                    Selecione...
                  </option>
                `
          }

          ${options.map((option) => {
            const isSelected =
              reference.multiple
                ? selected.includes(
                    option.id
                  )
                : selected ===
                  option.id

            return `
              <option
                value="${escapeHtml(
                  option.id
                )}"
                ${
                  isSelected
                    ? 'selected'
                    : ''
                }
              >
                ${escapeHtml(
                  option.name
                )}
              </option>
            `
          }).join('')}

        </select>

      </label>
    `
  }

  const currentValue =
    editable(
      entry,
      field
    )

  return `
    <label>

      <span>
        ${labels[field]}
      </span>

      <input
        name="${field}"
        value="${escapeHtml(
          currentValue
        )}"
      />

    </label>
  `
}

function formPage(
  s,
  entry = null
) {
  const isEdit =
    Boolean(entry)

  return `
    <header class="page-heading">

      <p class="eyebrow">
        ${s.eyebrow}
      </p>

      <h1>
        ${
          isEdit
            ? `Editar ${s.label}`
            : `Novo cadastro · ${s.label}`
        }
      </h1>

      <p>
        ${
          isEdit
            ? 'Atualize os dados do cadastro selecionado.'
            : 'Preencha os dados para criar um novo cadastro.'
        }
      </p>

    </header>

    <section class="next-steps">

      <form
        class="entry-form"
        data-entry-form="${s.id}"
        ${
          isEdit
            ? `data-entry-id="${entry.id}"`
            : ''
        }
      >

        <label>

          <span>
            Nome
          </span>

          <input
            name="name"
            required
            value="${escapeHtml(
              entry?.name || ''
            )}"
          />

        </label>

        <label>

          <span>
            Descrição
          </span>

          <textarea
            name="description"
            rows="4"
          >${escapeHtml(
            entry?.description || ''
          )}</textarea>

        </label>

        <div class="form-grid">

          ${s.fields.map((field) =>
            fieldControl(
              s,
              field,
              entry || {}
            )
          ).join('')}

        </div>

        <div class="form-actions">

          <button
            class="primary"
            type="submit"
          >
            ${
              isEdit
                ? 'Salvar alterações'
                : 'Salvar cadastro'
            }
          </button>

          <button
            type="button"
            data-page="${s.id}"
          >
            Cancelar
          </button>

        </div>

      </form>

    </section>
  `
}

function updateDivulgacaoDraft(
  form
) {
  const data =
    new FormData(form)

  divulgacaoDraft = {
    platform:
      data.get('platform') ||
      'mercadolivre',

    productUrl:
      data.get('productUrl') ||
      '',

    affiliateUrl:
      data.get('affiliateUrl') ||
      '',

    productName:
      data.get('productName') ||
      '',

    price:
      data.get('price') ||
      '',

    previousPrice:
      data.get('previousPrice') ||
      '',

    installments:
      data.get('installments') ||
      '',

    installmentInterest:
      data.get(
        'installmentInterest'
      ) || 'no-interest',

    language:
      data.get('language') ||
      'pt'
  }
}

function generatePromotionText(
  draft
) {
  const name =
    String(
      draft.productName || ''
    ).trim()

  const price =
    parseMoney(
      draft.price
    )

  const previousPrice =
    parseMoney(
      draft.previousPrice
    )

  const discount =
    calculateDiscount(
      price,
      previousPrice
    )

  const savings =
    previousPrice > price
      ? previousPrice - price
      : 0

  const installments =
    Number(
      draft.installments
    ) || 0

  const installmentValue =
    installments > 0 && price > 0
      ? price / installments
      : 0

  const link =
    draft.affiliateUrl ||
    draft.productUrl

  const lines = []

  if (
    draft.language === 'en'
  ) {
    lines.push(
      '🔥 **DEAL FOUND!**',
      '',
      `🛍 ${name || 'Product'}`
    )

    if (
      previousPrice > price
    ) {
      lines.push(
        `📉 From ~~${formatMoney(previousPrice)}~~`
      )
    }

    if (price) {
      let current =
        `Now 💰 **${formatMoney(price)}**`

      if (discount) {
        current +=
          ` — **${discount}% OFF**`
      }

      lines.push(current)
    }

    if (savings > 0) {
      lines.push(
        `💸 Save ${formatMoney(savings)}`
      )
    }

    if (installments > 1) {
      lines.push(
        `💳 ${installments}x of ${formatMoney(
          installmentValue
        )}${
          draft.installmentInterest ===
          'no-interest'
            ? ' interest-free'
            : ''
        }`
      )
    }

    if (link) {
      lines.push(
        '',
        '👉 Get the deal:',
        link
      )
    }

    return lines.join('\n')
  }

  lines.push(
    '🔥 **OFERTA ENCONTRADA!**',
    '',
    `🛍 ${name || 'Produto'}`
  )

  if (
    previousPrice > price
  ) {
    lines.push(
      `📉 De ~~${formatMoney(
        previousPrice
      )}~~`
    )
  }

  if (price) {
    let current =
      `Por 💰 **${formatMoney(
        price
      )}**`

    if (discount) {
      current +=
        ` — **${discount}% OFF**`
    }

    lines.push(current)
  }

  if (savings > 0) {
    lines.push(
      `💸 Economize ${formatMoney(
        savings
      )}`
    )
  }

  if (installments > 1) {
    lines.push(
      `💳 ${installments}x de ${formatMoney(
        installmentValue
      )}${
        draft.installmentInterest ===
        'no-interest'
          ? ' sem juros'
          : ''
      }`
    )
  }

  if (link) {
    lines.push(
      '',
      '👉 Aproveite a oferta:',
      link
    )
  }

  const portuguese =
    lines.join('\n')

  if (
    draft.language === 'both'
  ) {
    return `${portuguese}

────────────────

🔥 **DEAL FOUND!**

🛍 ${name || 'Product'}${
      previousPrice > price
        ? `

📉 From ~~${formatMoney(
            previousPrice
          )}~~`
        : ''
    }${
      price
        ? `

Now 💰 **${formatMoney(
            price
          )}**${
            discount
              ? ` — **${discount}% OFF**`
              : ''
          }`
        : ''
    }${
      savings > 0
        ? `

💸 Save ${formatMoney(
            savings
          )}`
        : ''
    }${
      installments > 1
        ? `

💳 ${installments}x of ${formatMoney(
            installmentValue
          )}${
            draft.installmentInterest ===
            'no-interest'
              ? ' interest-free'
              : ''
          }`
        : ''
    }${
      link
        ? `

👉 Get the deal:
${link}`
        : ''
    }`
  }

  return portuguese
}

function renderPromotionPreview(
  text
) {
  const html =
    escapeHtml(text)
      .replaceAll(
        /\*\*(.*?)\*\*/g,
        '<strong>$1</strong>'
      )
      .replaceAll(
        /~~(.*?)~~/g,
        '<s>$1</s>'
      )
      .replaceAll(
        /\n/g,
        '<br>'
      )

  return `
    <div class="preview-content">

      <p class="eyebrow">
        PRÉVIA DA DIVULGAÇÃO
      </p>

      <div class="promotion-message">
        ${html}
      </div>

      <div class="form-actions">

        <button
          type="button"
          data-copy-preview
        >
          Copiar texto
        </button>

      </div>

    </div>
  `
}
function filterDemoOffers() {
  const query =
    String(
      ofertasBuscaDraft.query || ''
    )
      .trim()
      .toLowerCase()

  const minimumDiscount =
    Number(
      ofertasBuscaDraft.discount
    ) || 0

  const maximumPrice =
    Number(
      ofertasBuscaDraft.priceMax
    ) || 0

  const limit =
    Number(
      ofertasBuscaDraft.limit
    ) || 10

  return ofertasDemo
    .filter((offer) => {
      if (
        offer.platform !==
        ofertasBuscaDraft.platform
      ) {
        return false
      }

      const discount =
        calculateDiscount(
          offer.price,
          offer.previousPrice
        )

      if (
        discount <
        minimumDiscount
      ) {
        return false
      }

      if (
        maximumPrice > 0 &&
        offer.price > maximumPrice
      ) {
        return false
      }

      if (query) {
        const searchable = [
          offer.name,
          offer.description,
          offer.category
        ]
          .join(' ')
          .toLowerCase()

        if (
          !searchable.includes(query)
        ) {
          return false
        }
      }

      return true
    })
    .sort((a, b) => {
      return (
        calculateMavuriScore(b) -
        calculateMavuriScore(a)
      )
    })
    .slice(0, limit)
}

function sendOfferToDivulgacao(
  offer
) {
  if (!offer) {
    return
  }

  divulgacaoDraft = {
    platform:
      offer.platform ||
      'mercadolivre',

    productUrl:
      offer.productUrl ||
      '',

    // Por enquanto usamos a URL do produto.
    // Depois este campo receberá o link oficial
    // gerado pela integração de afiliados.
    affiliateUrl:
      offer.affiliateUrl ||
      offer.productUrl ||
      '',

    productName:
      offer.name ||
      '',

    price:
      String(
        offer.price || ''
      ),

    previousPrice:
      String(
        offer.previousPrice || ''
      ),

    installments:
      String(
        offer.installments || ''
      ),

    installmentInterest:
      offer.installmentInterest ||
      'no-interest',

    language:
      'pt'
  }

  divulgacaoPreview =
    generatePromotionText(
      divulgacaoDraft
    )

  page = 'divulgacao'

  render()
}

function updateBuscaDraft(
  form
) {
  const data =
    new FormData(form)

  ofertasBuscaDraft = {
    platform:
      data.get('platform') ||
      'mercadolivre',

    query:
      data.get('query') ||
      '',

    discount:
      data.get('discount') ||
      '0',

    priceMax:
      data.get('priceMax') ||
      '',

    limit:
      data.get('limit') ||
      '10'
  }
}

async function handleEntryForm(
  form
) {
  const sectionId =
    form.dataset.entryForm

  const section =
    sections.find(
      (item) =>
        item.id === sectionId
    )

  if (!section) {
    return
  }

  const data =
    new FormData(form)

  const payload = {
    name:
      String(
        data.get('name') || ''
      ).trim(),

    description:
      String(
        data.get('description') || ''
      ).trim()
  }

  for (
    const field of section.fields
  ) {
    const reference =
      section.references?.[field]

    if (
      reference?.multiple
    ) {
      payload[field] =
        data.getAll(field)
    } else {
      payload[field] =
        data.get(field) || ''
    }
  }

  try {
    const entryId =
      form.dataset.entryId

    if (entryId) {
      await section.repository.update(
        entryId,
        payload
      )
    } else {
      await section.repository.create(
        payload
      )
    }

    await loadCatalogs()

    page = section.id

    await render()
  } catch (error) {
    console.error(error)

    alert(
      'Não foi possível salvar o cadastro.'
    )
  }
}

async function handleRemove(
  section,
  entryId
) {
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

    await loadCatalogs()

    await render()
  } catch (error) {
    console.error(error)

    alert(
      'Não foi possível excluir o cadastro.'
    )
  }
}

function exportBackup() {
  const backup = {
    version: 1,
    exportedAt:
      new Date().toISOString(),
    catalogs
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
    URL.createObjectURL(
      blob
    )

  const link =
    document.createElement('a')

  link.href = url

  link.download =
    `mavuri-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`

  document.body.appendChild(
    link
  )

  link.click()

  link.remove()

  URL.revokeObjectURL(
    url
  )
}

async function importBackup(
  file
) {
  if (!file) {
    return
  }

  try {
    const text =
      await file.text()

    const backup =
      JSON.parse(text)

    if (
      !backup ||
      typeof backup !== 'object' ||
      !backup.catalogs
    ) {
      throw new Error(
        'Arquivo inválido.'
      )
    }

    const confirmed =
      window.confirm(
        'Importar este backup poderá substituir os dados atuais. Deseja continuar?'
      )

    if (!confirmed) {
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

      const currentEntries =
        await section.repository.list()

      for (
        const current of currentEntries
      ) {
        await section.repository.remove(
          current.id
        )
      }

      for (
        const entry of entries
      ) {
        const {
          id,
          created_at,
          updated_at,
          ...payload
        } = entry

        await section.repository.create(
          payload
        )
      }
    }

    await loadCatalogs()

    alert(
      'Backup importado com sucesso.'
    )

    page = 'dashboard'

    await render()
  } catch (error) {
    console.error(error)

    alert(
      'Não foi possível importar este backup. Verifique se o arquivo é um backup válido do Mavuri.'
    )
  }
}
function bind() {
  root.querySelectorAll(
    '[data-page]'
  ).forEach((button) => {
    button.addEventListener(
      'click',
      async () => {
        const form =
          root.querySelector(
            '[data-divulgacao]'
          )

        if (form) {
          updateDivulgacaoDraft(
            form
          )
        }

        page =
          button.dataset.page

        await render()
      }
    )
  })

  root.querySelectorAll(
    '[data-add]'
  ).forEach((button) => {
    button.addEventListener(
      'click',
      async () => {
        page =
          `add:${button.dataset.add}`

        await render()
      }
    )
  })

  root.querySelectorAll(
    '[data-edit]'
  ).forEach((button) => {
    button.addEventListener(
      'click',
      async () => {
        const section =
          sections.find(
            (item) =>
              item.id === page
          )

        if (!section) {
          return
        }

        page =
          `edit:${section.id}:${button.dataset.edit}`

        await render()
      }
    )
  })

  root.querySelectorAll(
    '[data-remove]'
  ).forEach((button) => {
    button.addEventListener(
      'click',
      async () => {
        const section =
          sections.find(
            (item) =>
              item.id === page
          )

        if (!section) {
          return
        }

        await handleRemove(
          section,
          button.dataset.remove
        )
      }
    )
  })

  const loginForm =
    root.querySelector(
      '[data-login]'
    )

  if (loginForm) {
    loginForm.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault()

        const errorElement =
          loginForm.querySelector(
            '.login-error'
          )

        const button =
          loginForm.querySelector(
            'button[type="submit"]'
          )

        const data =
          new FormData(
            loginForm
          )

        errorElement.hidden =
          true

        button.disabled =
          true

        try {
          await signIn(
            data.get('email'),
            data.get('password')
          )
        } catch (error) {
          console.error(error)

          errorElement.textContent =
            'Não foi possível entrar. Verifique seu e-mail e senha.'

          errorElement.hidden =
            false
        } finally {
          button.disabled =
            false
        }
      }
    )

    return
  }

  const logoutButton =
    root.querySelector(
      '[data-logout]'
    )

  if (logoutButton) {
    logoutButton.addEventListener(
      'click',
      async () => {
        await signOut()
      }
    )
  }

  const divulgacaoForm =
    root.querySelector(
      '[data-divulgacao]'
    )

  if (divulgacaoForm) {
    const saveDraft = () => {
      updateDivulgacaoDraft(
        divulgacaoForm
      )
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

        updateDivulgacaoDraft(
          divulgacaoForm
        )

        divulgacaoPreview =
          generatePromotionText(
            divulgacaoDraft
          )

        const preview =
          root.querySelector(
            '[data-promotion-preview]'
          )

        if (preview) {
          preview.innerHTML =
            renderPromotionPreview(
              divulgacaoPreview
            )
        }

        bind()
      }
    )
  }

  const buscarOfertasForm =
    root.querySelector(
      '[data-buscar-ofertas]'
    )

  if (buscarOfertasForm) {
    const saveBuscaDraft = () => {
      updateBuscaDraft(
        buscarOfertasForm
      )
    }

    buscarOfertasForm.addEventListener(
      'input',
      saveBuscaDraft
    )

    buscarOfertasForm.addEventListener(
      'change',
      saveBuscaDraft
    )

    buscarOfertasForm.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault()

        updateBuscaDraft(
          buscarOfertasForm
        )

        ofertasEncontradas =
          filterDemoOffers()

        await render()
      }
    )
  }

  root.querySelectorAll(
    '[data-gerar-divulgacao]'
  ).forEach((button) => {
    button.addEventListener(
      'click',
      () => {
        const offer =
          ofertasEncontradas.find(
            (item) =>
              item.id ===
              button.dataset
                .gerarDivulgacao
          )

        sendOfferToDivulgacao(
          offer
        )
      }
    )
  })

  const copyPreviewButton =
    root.querySelector(
      '[data-copy-preview]'
    )

  if (copyPreviewButton) {
    copyPreviewButton.addEventListener(
      'click',
      async () => {
        try {
          await navigator.clipboard.writeText(
            divulgacaoPreview
          )

          const originalText =
            copyPreviewButton.textContent

          copyPreviewButton.textContent =
            '✓ Copiado'

          setTimeout(
            () => {
              copyPreviewButton.textContent =
                originalText
            },
            2000
          )
        } catch (error) {
          console.error(error)

          alert(
            'Não foi possível copiar o texto automaticamente.'
          )
        }
      }
    )
  }

  root.querySelectorAll(
    '[data-entry-form]'
  ).forEach((form) => {
    form.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault()

        await handleEntryForm(
          form
        )
      }
    )
  })

  const exportButton =
    root.querySelector(
      '[data-export]'
    )

  if (exportButton) {
    exportButton.addEventListener(
      'click',
      exportBackup
    )
  }

  const importButton =
    root.querySelector(
      '[data-import]'
    )

  const backupInput =
    root.querySelector(
      '#backup-file'
    )

  if (
    importButton &&
    backupInput
  ) {
    importButton.addEventListener(
      'click',
      () => {
        backupInput.click()
      }
    )

    backupInput.addEventListener(
      'change',
      async () => {
        const file =
          backupInput.files?.[0]

        await importBackup(
          file
        )

        backupInput.value =
          ''
      }
    )
  }
}

async function render() {
  if (!session) {
    root.innerHTML =
      loginPage()

    bind()

    return
  }

  if (!catalogsLoaded) {
    try {
      await loadCatalogs()
    } catch (error) {
      console.error(error)

      root.innerHTML = `
        <div class="shell">

          ${navigation()}

          <main>

            <section class="next-steps">

              <h1>
                Não foi possível carregar os dados
              </h1>

              <p>
                Verifique a conexão com o Supabase e tente
                atualizar a página.
              </p>

            </section>

          </main>

        </div>
      `

      bind()

      return
    }
  }

  const section =
    sections.find(
      (s) =>
        s.id === page
    )

  const edit =
    page.startsWith('edit:')
      ? sections.find(
          (s) =>
            s.id ===
            page.split(':')[1]
        )
      : null

  const add =
    page.startsWith('add:')
      ? sections.find(
          (s) =>
            s.id ===
            page.split(':')[1]
        )
      : null

  const entry =
    edit
      ? getEntries(edit).find(
          (item) =>
            item.id ===
            page.split(':')[2]
        )
      : null

  let content

  if (
    page === 'divulgacao'
  ) {
    content =
      divulgacaoPage()
  } else if (
    page === 'buscar-ofertas'
  ) {
    content =
      buscarOfertasPage()
  } else if (edit) {
    content =
      formPage(
        edit,
        entry
      )
  } else if (add) {
    content =
      formPage(add)
  } else if (section) {
    content =
      sectionPage(section)
  } else {
    content =
      dashboard()
  }

  root.innerHTML = `
    <div class="shell">

      ${navigation()}

      <main>
        ${content}
      </main>

    </div>
  `

  bind()
}

async function initialize() {
  try {
    session =
      await getSession()

    onAuthChange(
      async (nextSession) => {
        session =
          nextSession

        catalogsLoaded =
          false

        if (!session) {
          page =
            'dashboard'
        }

        await render()
      }
    )

    await render()
  } catch (error) {
    console.error(error)

    root.innerHTML = `
      <section class="next-steps">

        <h1>
          Erro ao iniciar o Mavuri
        </h1>

        <p>
          Verifique a configuração do projeto e atualize
          a página.
        </p>

      </section>
    `
  }
}

initialize()

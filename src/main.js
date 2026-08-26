import { getSession, onAuthChange, signIn, signOut } from './auth.js'
import { sections } from '../domain/catalog.js'
import { developmentCatalogs } from '../infrastructure/development/catalog.js'

const root =
  document.querySelector('#app')

let session = null
let page = 'dashboard'
let catalogsLoaded = false

const catalogs = {}

let ofertasEncontradas = []

let ofertasBuscaDraft = {
  platform: 'mercadolivre',
  query: '',
  discount: '0',
  priceMax: '',
  limit: '10'
}

let ofertasBuscaState = {
  status: 'idle',
  error: '',
  sourceLabel: ''
}

let divulgacaoDraft = {
  platform: 'mercadolivre',
  productUrl: '',
  affiliateUrl: '',
  productName: '',
  description: '',
  price: '',
  previousPrice: '',
  installments: '',
  installmentInterest: 'no-interest',
  language: 'pt'
}

let divulgacaoPreview = ''

const labels = {
  locale: 'Idioma',
  currency: 'Moeda',
  markets: 'Mercados',
  languages: 'Idiomas',
  status: 'Status',
  platform: 'Plataforma',
  category: 'Categoria',
  product: 'Produto',
  market: 'Mercado',
  offer: 'Oferta',
  destination: 'Destino',
  capability: 'Capacidade'
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

function value(input) {
  if (
    input === null ||
    input === undefined ||
    input === ''
  ) {
    return '—'
  }

  if (
    Array.isArray(input)
  ) {
    return input.join(', ')
  }

  return String(input)
}

function editable(
  entry,
  field
) {
  const current =
    entry?.[field]

  if (
    Array.isArray(current)
  ) {
    return current.join(', ')
  }

  return current ?? ''
}

function getEntries(section) {
  return catalogs[
    section.id
  ] || []
}

async function loadCatalogs() {
  for (
    const section of sections
  ) {
    catalogs[
      section.id
    ] =
      await section.repository.list()
  }

  catalogsLoaded = true
}

function parseMoney(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return 0
  }

  if (
    typeof value ===
    'number'
  ) {
    return Number.isFinite(value)
      ? value
      : 0
  }

  const normalized =
    String(value)
      .trim()
      .replace(/\./g, '')
      .replace(',', '.')

  const parsed =
    Number(normalized)

  return Number.isFinite(parsed)
    ? parsed
    : 0
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

function calculateMavuriScore(
  offer
) {
  let score = 50

  const discount =
    calculateDiscount(
      offer.price,
      offer.previousPrice
    )

  score +=
    Math.min(
      30,
      discount
    )

  if (
    offer.installments >= 10
  ) {
    score += 8
  } else if (
    offer.installments >= 6
  ) {
    score += 5
  } else if (
    offer.installments >= 3
  ) {
    score += 2
  }

  if (
    offer.installmentInterest ===
    'no-interest'
  ) {
    score += 8
  }

  if (
    offer.seller
  ) {
    score += 2
  }

  if (
    offer.image
  ) {
    score += 2
  }

  return Math.min(
    100,
    Math.round(score)
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
      id: 'buscar-ofertas',
      label: 'Buscar ofertas',
      icon: '⌕'
    },
    {
      id: 'divulgacao',
      label: 'Divulgação',
      icon: '✦'
    }
  ]

  const catalogItems =
    sections.map(
      (section) => ({
        id: section.id,
        label: section.label,
        icon: '○'
      })
    )

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

        <div class="nav-group">

          <p>
            CATÁLOGOS
          </p>

          ${catalogItems.map((item) => `
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

function dashboard() {
  const totals =
    sections.map(
      (section) => ({
        label: section.label,
        value:
          getEntries(
            section
          ).length
      })
    )

  return `
    <header class="page-heading">

      <p class="eyebrow">
        VISÃO GERAL
      </p>

      <h1>
        Painel Mavuri
      </h1>

      <p>
        Acompanhe os cadastros, encontre ofertas e prepare divulgações.
      </p>

    </header>

    <section class="dashboard-grid">

      ${totals.map((item) => `
        <article class="metric-card">

          <span>
            ${escapeHtml(
              item.label
            )}
          </span>

          <strong>
            ${item.value}
          </strong>

        </article>
      `).join('')}

    </section>

    <section class="next-steps">

      <h2>
        Próximos passos
      </h2>

      <p>
        Comece pesquisando produtos em Buscar ofertas ou organize os cadastros do catálogo.
      </p>

      <div class="form-actions">

        <button
          class="primary"
          data-page="buscar-ofertas"
        >
          Buscar ofertas
        </button>

        <button
          data-page="produtos"
        >
          Gerenciar produtos
        </button>

      </div>

    </section>
  `
}

function buscarOfertasPage() {
  const state =
    ofertasBuscaState.status

  return `
    <header class="page-heading">

      <p class="eyebrow">
        OPORTUNIDADES
      </p>

      <h1>
        Buscar ofertas
      </h1>

      <p>
        Encontre oportunidades, aplique filtros e envie os melhores produtos para a área de divulgação.
      </p>

    </header>

    <section class="form-card">

      <form
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

            </select>

          </label>

          <label>

            <span>
              Buscar produto
            </span>

            <input
              type="text"
              name="query"
              value="${escapeHtml(
                ofertasBuscaDraft.query
              )}"
              placeholder="Ex.: tênis, TV, notebook..."
            />

          </label>

          <label>

            <span>
              Desconto mínimo
            </span>

            <input
              type="number"
              name="discount"
              min="0"
              max="100"
              value="${escapeHtml(
                ofertasBuscaDraft.discount
              )}"
            />

          </label>

          <label>

            <span>
              Preço máximo
            </span>

            <input
              type="number"
              name="priceMax"
              min="0"
              step="0.01"
              value="${escapeHtml(
                ofertasBuscaDraft.priceMax
              )}"
              placeholder="Sem limite"
            />

          </label>

          <label>

            <span>
              Máximo de resultados
            </span>

            <select
              name="limit"
            >

              ${[5, 10, 20, 50].map((number) => `
                <option
                  value="${number}"
                  ${
                    Number(
                      ofertasBuscaDraft.limit
                    ) === number
                      ? 'selected'
                      : ''
                  }
                >
                  ${number}
                </option>
              `).join('')}

            </select>

          </label>

        </div>

        <div class="form-actions">

          <button
            class="primary"
            type="submit"
            ${
              state === 'loading'
                ? 'disabled'
                : ''
            }
          >
            ${
              state === 'loading'
                ? 'Buscando ofertas...'
                : '🔎 Buscar ofertas'
            }
          </button>

        </div>

      </form>

    </section>

    ${
      state === 'idle'
        ? `
            <section class="next-steps">

              <h2>
                Pronto para buscar
              </h2>

              <p>
                Pesquise uma categoria ou produto para encontrar ofertas disponíveis.
              </p>

            </section>
          `
        : ''
    }

    ${
      state === 'loading'
        ? `
            <section class="next-steps">

              <h2>
                Consultando ofertas
              </h2>

              <p>
                Aguarde enquanto o Mavuri consulta
                ${escapeHtml(
                  ofertasBuscaState.sourceLabel ||
                  'as ofertas'
                )}.
              </p>

            </section>
          `
        : ''
    }

    ${
      state === 'error'
        ? `
            <section class="next-steps">

              <h2>
                Não foi possível buscar ofertas
              </h2>

              <p>
                ${escapeHtml(
                  ofertasBuscaState.error
                )}
              </p>

            </section>
          `
        : ''
    }

    ${
      state === 'success' &&
      !ofertasEncontradas.length
        ? `
            <section class="next-steps">

              <h2>
                Nenhuma oferta encontrada
              </h2>

              <p>
                Tente alterar os filtros ou pesquisar outro produto.
              </p>

            </section>
          `
        : ''
    }

    ${
      state === 'success' &&
      ofertasEncontradas.length
        ? `
            <section class="offers-results">

              <div class="section-title">

                <div>

                  <h2>
                    Ofertas encontradas
                  </h2>

                  <p>
                    ${ofertasEncontradas.length}
                    oportunidade(s) encontradas.
                  </p>

                </div>

                ${
                  ofertasBuscaState.sourceLabel
                    ? `
                        <span class="status-dot">
                          ${escapeHtml(
                            ofertasBuscaState.sourceLabel
                          )}
                        </span>
                      `
                    : ''
                }

              </div>

              <div class="offers-grid">

                ${ofertasEncontradas.map(
                  (offer) =>
                    offerCard(offer)
                ).join('')}

              </div>

            </section>
          `
        : ''
    }
  `
}

function offerCard(offer) {
  const discount =
    calculateDiscount(
      offer.price,
      offer.previousPrice
    )

  const economy =
    Math.max(
      0,
      (
        Number(
          offer.previousPrice
        ) || 0
      ) -
      (
        Number(
          offer.price
        ) || 0
      )
    )

  const score =
    calculateMavuriScore(
      offer
    )

  return `
    <article
      class="offer-card"
    >

      <div
        class="offer-image"
      >

        ${
          offer.image
            ? `
                <img
                  src="${escapeHtml(
                    offer.image
                  )}"
                  alt="${escapeHtml(
                    offer.name
                  )}"
                  loading="lazy"
                />
              `
            : `
                <span>
                  🛍️
                </span>
              `
        }

        <span class="offer-score">
          Mavuri ${score}
        </span>

      </div>

      <div
        class="offer-content"
      >

        <div
          class="offer-meta"
        >

          ${
            offer.category
              ? `
                  <span>
                    ${escapeHtml(
                      offer.category
                    )}
                  </span>
                `
              : ''
          }

          ${
            offer.seller
              ? `
                  <span>
                    ${escapeHtml(
                      offer.seller
                    )}
                  </span>
                `
              : ''
          }

        </div>

        <h2>
          ${escapeHtml(
            offer.name
          )}
        </h2>

        <p>
          ${escapeHtml(
            offer.description || ''
          )}
        </p>

        <div
          class="offer-prices"
        >

          ${
            Number(
              offer.previousPrice
            ) >
            Number(
              offer.price
            )
              ? `
                  <span
                    class="old-price"
                  >
                    De
                    ${formatMoney(
                      offer.previousPrice
                    )}
                  </span>
                `
              : ''
          }

          <strong>
            ${formatMoney(
              offer.price
            )}
          </strong>

          ${
            discount > 0
              ? `
                  <span
                    class="discount"
                  >
                    ${discount}% OFF
                  </span>
                `
              : ''
          }

        </div>

        ${
          economy > 0
            ? `
                <p
                  class="offer-economy"
                >
                  Economia de
                  <strong>
                    ${formatMoney(
                      economy
                    )}
                  </strong>
                </p>
              `
            : ''
        }

        ${
          Number(
            offer.installments
          ) > 0
            ? `
                <p
                  class="offer-installments"
                >
                  ${offer.installments}x de aproximadamente
                  ${formatMoney(
                    Number(
                      offer.price
                    ) /
                    Number(
                      offer.installments
                    )
                  )}

                  ${
                    offer.installmentInterest ===
                    'no-interest'
                      ? ' sem juros'
                      : ''
                  }
                </p>
              `
            : ''
        }

        <div
          class="offer-actions"
        >

          <button
            class="primary"
            data-gerar-divulgacao="${escapeHtml(
              offer.id
            )}"
          >
            Gerar divulgação
          </button>

          ${
            offer.productUrl
              ? `
                  <a
                    href="${escapeHtml(
                      offer.productUrl
                    )}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver produto
                  </a>
                `
              : ''
          }

        </div>

      </div>

    </article>
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
        Prepare uma mensagem pronta para divulgar a oferta selecionada.
      </p>

    </header>

    <section class="divulgacao-layout">

      <section class="form-card">

        <form
          data-divulgacao
        >

          <label>

            <span>
              Produto
            </span>

            <input
              type="text"
              name="productName"
              value="${escapeHtml(
                divulgacaoDraft.productName
              )}"
              placeholder="Nome do produto"
              required
            />

          </label>

          <label>

            <span>
              Descrição
            </span>

            <textarea
              name="description"
              rows="4"
              placeholder="Descrição da oferta"
            >${escapeHtml(
              divulgacaoDraft.description || ''
            )}</textarea>

          </label>

          <label>

            <span>
              Link do produto
            </span>

            <input
              type="url"
              name="productUrl"
              value="${escapeHtml(
                divulgacaoDraft.productUrl
              )}"
              placeholder="https://..."
            />

          </label>

          <label>

            <span>
              Link de afiliado
            </span>

            <input
              type="url"
              name="affiliateUrl"
              value="${escapeHtml(
                divulgacaoDraft.affiliateUrl
              )}"
              placeholder="https://..."
            />

          </label>

          <div class="form-grid">

            <label>

              <span>
                Preço atual
              </span>

              <input
                type="text"
                name="price"
                value="${escapeHtml(
                  divulgacaoDraft.price
                )}"
                placeholder="0,00"
              />

            </label>

            <label>

              <span>
                Preço anterior
              </span>

              <input
                type="text"
                name="previousPrice"
                value="${escapeHtml(
                  divulgacaoDraft.previousPrice
                )}"
                placeholder="0,00"
              />

            </label>

          </div>

          <div class="form-grid">

            <label>

              <span>
                Parcelas
              </span>

              <input
                type="number"
                name="installments"
                min="1"
                value="${escapeHtml(
                  divulgacaoDraft.installments
                )}"
              />

            </label>

            <label>

              <span>
                Tipo
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

            <select
              name="language"
            >

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

            </select>

          </label>

          <div class="form-actions">

            <button
              type="submit"
              class="primary"
            >
              Gerar prévia
            </button>

            <button
              type="button"
              data-clear-divulgacao
            >
              Limpar
            </button>

          </div>

        </form>

      </section>

      <section class="preview-card">

        <div class="preview-header">

          <div>

            <p class="eyebrow">
              PRÉVIA
            </p>

            <h2>
              Mensagem de divulgação
            </h2>

          </div>

          ${
            divulgacaoPreview
              ? `
                  <button
                    data-copy-divulgacao
                  >
                    Copiar
                  </button>
                `
              : ''
          }

        </div>

        <div
          id="promotion-preview"
        >

          ${
            divulgacaoPreview
              ? renderPromotionPreview()
              : `
                  <div class="empty-preview">

                    <span>
                      ✨
                    </span>

                    <p>
                      Preencha os dados da oferta e clique em “Gerar prévia”.
                    </p>

                  </div>
                `
          }

        </div>

      </section>

    </section>
  `
}

function updateDivulgacaoDraft(
  form
) {
  const data =
    new FormData(
      form
    )

  divulgacaoDraft = {
    ...divulgacaoDraft,

    productName:
      String(
        data.get(
          'productName'
        ) || ''
      ),

    description:
      String(
        data.get(
          'description'
        ) || ''
      ),

    productUrl:
      String(
        data.get(
          'productUrl'
        ) || ''
      ),

    affiliateUrl:
      String(
        data.get(
          'affiliateUrl'
        ) || ''
      ),

    price:
      String(
        data.get(
          'price'
        ) || ''
      ),

    previousPrice:
      String(
        data.get(
          'previousPrice'
        ) || ''
      ),

    installments:
      String(
        data.get(
          'installments'
        ) || ''
      ),

    installmentInterest:
      String(
        data.get(
          'installmentInterest'
        ) || 'no-interest'
      ),

    language:
      String(
        data.get(
          'language'
        ) || 'pt'
      )
  }
}

function generatePromotionText() {
  const name =
    divulgacaoDraft.productName
      .trim()

  const description =
    (
      divulgacaoDraft.description ||
      ''
    ).trim()

  const price =
    parseMoney(
      divulgacaoDraft.price
    )

  const previousPrice =
    parseMoney(
      divulgacaoDraft.previousPrice
    )

  const installments =
    Number(
      divulgacaoDraft.installments
    ) || 0

  const discount =
    calculateDiscount(
      price,
      previousPrice
    )

  const link =
    divulgacaoDraft.affiliateUrl.trim() ||
    divulgacaoDraft.productUrl.trim()

  const lines = []

  lines.push(
    '🔥 OFERTA ENCONTRADA!'
  )

  lines.push('')

  if (name) {
    lines.push(
      `🛍️ ${name}`
    )
  }

  if (description) {
    lines.push(
      description
    )
  }

  lines.push('')

  if (
    previousPrice > 0 &&
    previousPrice > price
  ) {
    lines.push(
      `❌ De: ${formatMoney(
        previousPrice
      )}`
    )
  }

  if (price > 0) {
    lines.push(
      `🔥 Por: ${formatMoney(
        price
      )}`
    )
  }

  if (discount > 0) {
    lines.push(
      `💥 ${discount}% OFF`
    )
  }

  if (
    installments > 1 &&
    price > 0
  ) {
    const installmentValue =
      price / installments

    let installmentText =
      `💳 ${installments}x de ${formatMoney(
        installmentValue
      )}`

    if (
      divulgacaoDraft.installmentInterest ===
      'no-interest'
    ) {
      installmentText +=
        ' sem juros'
    }

    lines.push(
      installmentText
    )
  }

  if (link) {
    lines.push('')

    lines.push(
      '👉 Aproveite a oferta:'
    )

    lines.push(
      link
    )
  }

  return lines.join(
    '\n'
  )
}

function renderPromotionPreview() {
  if (
    !divulgacaoPreview
  ) {
    return ''
  }

  return `
    <pre class="promotion-preview">${escapeHtml(
      divulgacaoPreview
    )}</pre>
  `
}

async function searchOffers() {
  ofertasBuscaState = {
    status: 'loading',
    error: '',
    sourceLabel:
      'Mercado Livre'
  }

  await render()

  try {
    const result =
      await fetchOffers(
        ofertasBuscaDraft
      )

    ofertasEncontradas =
      Array.isArray(
        result
      )
        ? result
        : []

    ofertasBuscaState = {
      status: 'success',
      error: '',
      sourceLabel:
        'Mercado Livre'
    }

  } catch (error) {
    console.error(error)

    ofertasEncontradas = []

    ofertasBuscaState = {
      status: 'error',
      error:
        error.message ||
        'Ocorreu um erro ao buscar as ofertas.',
      sourceLabel: ''
    }
  }
}
async function fetchOffers(filters) {
  const query =
    String(
      filters.query || ''
    ).trim()

  const limit =
    Math.max(
      1,
      Number(
        filters.limit
      ) || 10
    )

  const discountMin =
    Math.max(
      0,
      Number(
        filters.discount
      ) || 0
    )

  const priceMax =
    parseMoney(
      filters.priceMax
    )

  const searchQuery =
    new URLSearchParams()

  if (query) {
    searchQuery.set(
      'q',
      query
    )
  }

  searchQuery.set(
    'limit',
    String(limit)
  )

  const response =
    await fetch(
      `/api/offers?${searchQuery.toString()}`
    )

  if (!response.ok) {
    throw new Error(
      'Não foi possível consultar as ofertas.'
    )
  }

  const payload =
    await response.json()

  const rawOffers =
    Array.isArray(
      payload
    )
      ? payload
      : (
          payload.results ||
          payload.items ||
          []
        )

  const normalized =
    rawOffers.map(
      (
        item,
        index
      ) => normalizeOffer(
        item,
        index
      )
    )

  return normalized
    .filter(
      (offer) => {
        const discount =
          calculateDiscount(
            offer.price,
            offer.previousPrice
          )

        if (
          discount < discountMin
        ) {
          return false
        }

        if (
          priceMax > 0 &&
          offer.price > priceMax
        ) {
          return false
        }

        return true
      }
    )
    .slice(
      0,
      limit
    )
}

function normalizeOffer(
  item,
  index
) {
  const price =
    parseMoney(
      item.price ||
      item.currentPrice ||
      item.sale_price ||
      item.salePrice
    )

  const previousPrice =
    parseMoney(
      item.previousPrice ||
      item.originalPrice ||
      item.original_price ||
      item.listPrice
    )

  const installments =
    Number(
      item.installments ||
      item.installmentQuantity ||
      item.installments_count ||
      0
    ) || 0

  return {
    id:
      item.id ||
      item.item_id ||
      item.sku ||
      `offer-${Date.now()}-${index}`,

    name:
      item.name ||
      item.title ||
      item.productName ||
      'Produto sem nome',

    description:
      item.description ||
      '',

    price,

    previousPrice,

    installments,

    installmentInterest:
      item.installmentInterest ||
      item.installment_interest ||
      (
        item.freeInterest === true
          ? 'no-interest'
          : 'no-interest'
      ),

    image:
      item.image ||
      item.thumbnail ||
      item.image_url ||
      '',

    seller:
      item.seller ||
      item.seller_name ||
      '',

    category:
      item.category ||
      item.category_name ||
      '',

    platform:
      item.platform ||
      ofertasBuscaDraft.platform ||
      'mercadolivre',

    productUrl:
      item.productUrl ||
      item.permalink ||
      item.url ||
      item.link ||
      '',

    affiliateUrl:
      item.affiliateUrl ||
      item.affiliate_link ||
      item.productUrl ||
      item.permalink ||
      item.url ||
      ''
  }
}

async function persistOfferInSupabase(
  offer
) {
  const productRepository =
    developmentCatalogs.products

  const offerRepository =
    developmentCatalogs.offers

  const affiliateRepository =
    developmentCatalogs.affiliateLinks

  const productName =
    String(
      offer.name || ''
    ).trim()

  if (!productName) {
    throw new Error(
      'A oferta não possui um nome válido.'
    )
  }

  const products =
    await productRepository.list()

  let product =
    products.find(
      (item) =>
        String(
          item.name || ''
        )
          .trim()
          .toLowerCase() ===
        productName.toLowerCase()
    )

  const productPayload = {
    name: productName,
    description:
      offer.description || ''
  }

  if (
    offer.platform
  ) {
    productPayload.platform =
      offer.platform
  }

  if (
    offer.category
  ) {
    productPayload.category =
      offer.category
  }

  if (!product) {
    product =
      await productRepository.create(
        productPayload
      )
  }

  const offers =
    await offerRepository.list()

  let savedOffer =
    offers.find(
      (item) =>
        String(
          item.name || ''
        )
          .trim()
          .toLowerCase() ===
        productName.toLowerCase()
    )

  const offerPayload = {
    name: productName,
    description:
      offer.description ||
      '',
    product:
      product.id,
    status:
      'active'
  }

  if (
    offer.market
  ) {
    offerPayload.market =
      offer.market
  }

  if (savedOffer) {
    savedOffer =
      await offerRepository.update(
        savedOffer.id,
        offerPayload
      )
  } else {
    savedOffer =
      await offerRepository.create(
        offerPayload
      )
  }

  const destination =
    String(
      offer.affiliateUrl ||
      offer.productUrl ||
      ''
    ).trim()

  if (destination) {
    const links =
      await affiliateRepository.list()

    const existingLink =
      links.find(
        (item) =>
          String(
            item.destination || ''
          ).trim() ===
          destination
      )

    const linkPayload = {
      name:
        `Link - ${productName}`,

      description:
        `Link da oferta ${productName}`,

      offer:
        savedOffer.id,

      platform:
        offer.platform || '',

      destination
    }

    if (existingLink) {
      await affiliateRepository.update(
        existingLink.id,
        linkPayload
      )
    } else {
      await affiliateRepository.create(
        linkPayload
      )
    }
  }

  await loadCatalogs()

  return {
    product,
    offer: savedOffer
  }
}

async function sendOfferToDivulgacao(
  offer
) {
  if (!offer) {
    throw new Error(
      'Oferta inválida.'
    )
  }

  await persistOfferInSupabase(
    offer
  )

  divulgacaoDraft = {
    ...divulgacaoDraft,

    platform:
      offer.platform ||
      'mercadolivre',

    productName:
      offer.name || '',

    description:
      offer.description || '',

    productUrl:
      offer.productUrl || '',

    affiliateUrl:
      offer.affiliateUrl ||
      offer.productUrl ||
      '',

    price:
      offer.price !== undefined
        ? String(
            offer.price
          )
        : '',

    previousPrice:
      offer.previousPrice !== undefined
        ? String(
            offer.previousPrice
          )
        : '',

    installments:
      offer.installments !== undefined
        ? String(
            offer.installments
          )
        : '',

    installmentInterest:
      offer.installmentInterest ||
      'no-interest'
  }

  divulgacaoPreview =
    generatePromotionText()

  page =
    'divulgacao'

  await render()
}

function updateBuscaDraft(
  form
) {
  const data =
    new FormData(
      form
    )

  ofertasBuscaDraft = {
    ...ofertasBuscaDraft,

    platform:
      String(
        data.get(
          'platform'
        ) || 'mercadolivre'
      ),

    query:
      String(
        data.get(
          'query'
        ) || ''
      ),

    discount:
      String(
        data.get(
          'discount'
        ) || '0'
      ),

    priceMax:
      String(
        data.get(
          'priceMax'
        ) || ''
      ),

    limit:
      String(
        data.get(
          'limit'
        ) || '10'
      )
  }
}

function resetDivulgacao() {
  divulgacaoDraft = {
    platform:
      'mercadolivre',

    productUrl:
      '',

    affiliateUrl:
      '',

    productName:
      '',

    description:
      '',

    price:
      '',

    previousPrice:
      '',

    installments:
      '',

    installmentInterest:
      'no-interest',

    language:
      'pt'
  }

  divulgacaoPreview =
    ''
}

function getReferenceLabel(
  sectionId,
  id
) {
  if (
    id === null ||
    id === undefined ||
    id === ''
  ) {
    return ''
  }

  const section =
    sections.find(
      (item) =>
        item.id === sectionId
    )

  if (!section) {
    return String(id)
  }

  const entry =
    getEntries(
      section
    ).find(
      (item) =>
        String(item.id) ===
        String(id)
    )

  return (
    entry?.name ||
    String(id)
  )
}

function resolveEntryField(
  section,
  field,
  entry
) {
  const reference =
    section.references?.[
      field
    ]

  const currentValue =
    entry[field]

  if (!reference) {
    return value(
      currentValue
    )
  }

  if (
    Array.isArray(
      currentValue
    )
  ) {
    return currentValue
      .map(
        (id) =>
          getReferenceLabel(
            reference.section,
            id
          )
      )
      .filter(Boolean)
      .join(' · ')
  }

  return getReferenceLabel(
    reference.section,
    currentValue
  )
}

function sectionPage(s) {
  const entries =
    getEntries(s)

  return `
    <header class="page-heading">

      <p class="eyebrow">
        ${escapeHtml(
          s.eyebrow
        )}
      </p>

      <div class="heading-row">

        <div>

          <h1>
            ${escapeHtml(
              s.title
            )}
          </h1>

          <p>
            ${escapeHtml(
              s.intro
            )}
          </p>

        </div>

        <button
          class="primary"
          data-add="${escapeHtml(
            s.id
          )}"
        >
          + Novo cadastro
        </button>

      </div>

    </header>

    <section
      class="catalog"
      aria-label="${escapeHtml(
        s.title
      )}"
    >

      ${
        entries.length
          ? entries.map(
              (entry) => `
                <article
                  class="entry"
                >

                  <div>

                    <h2>
                      ${escapeHtml(
                        entry.name
                      )}
                    </h2>

                    ${
                      entry.description
                        ? `
                            <p>
                              ${escapeHtml(
                                entry.description
                              )}
                            </p>
                          `
                        : ''
                    }

                  </div>

                  <dl>

                    ${s.fields.map(
                      (field) => `
                        <div>

                          <dt>
                            ${escapeHtml(
                              labels[field] ||
                              field
                            )}
                          </dt>

                          <dd>
                            ${escapeHtml(
                              resolveEntryField(
                                s,
                                field,
                                entry
                              )
                            )}
                          </dd>

                        </div>
                      `
                    ).join('')}

                  </dl>

                  <div
                    class="entry-actions"
                  >

                    <button
                      data-edit="${escapeHtml(
                        entry.id
                      )}"
                    >
                      Editar
                    </button>

                    <button
                      class="danger"
                      data-remove="${escapeHtml(
                        entry.id
                      )}"
                    >
                      Excluir
                    </button>

                  </div>

                </article>
              `
            ).join('')
          : `
              <div class="empty">
                Nenhum cadastro nesta área.
              </div>
            `
      }

    </section>
  `
}
function referenceOptions(
  section,
  field,
  selected
) {
  const reference =
    section.references?.[
      field
    ]

  if (!reference) {
    return ''
  }

  const referenceSection =
    sections.find(
      (item) =>
        item.id ===
        reference.section
    )

  if (!referenceSection) {
    return ''
  }

  const entries =
    getEntries(
      referenceSection
    )

  const selectedValues =
    Array.isArray(selected)
      ? selected.map(
          String
        )
      : [
          String(
            selected ?? ''
          )
        ]

  return `
    <label>

      <span>
        ${escapeHtml(
          labels[field] ||
          field
        )}
      </span>

      <select
        name="${escapeHtml(
          field
        )}"
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
                  Selecione
                </option>
              `
        }

        ${entries.map(
          (entry) => `
            <option
              value="${escapeHtml(
                entry.id
              )}"
              ${
                selectedValues.includes(
                  String(
                    entry.id
                  )
                )
                  ? 'selected'
                  : ''
              }
            >
              ${escapeHtml(
                entry.name
              )}
            </option>
          `
        ).join('')}

      </select>

    </label>
  `
}

function formPage(
  section,
  entry = null
) {
  const isEdit =
    Boolean(entry)

  return `
    <header class="page-heading">

      <p class="eyebrow">
        ${escapeHtml(
          section.eyebrow
        )}
      </p>

      <h1>
        ${
          isEdit
            ? `Editar ${escapeHtml(
                section.label
              )}`
            : `Novo cadastro em ${escapeHtml(
                section.label
              )}`
        }
      </h1>

      <p>
        ${
          isEdit
            ? 'Atualize os dados deste cadastro.'
            : 'Preencha as informações para criar um novo cadastro.'
        }
      </p>

    </header>

    <section
      class="form-card"
    >

      <form
        data-entry-form="${escapeHtml(
          section.id
        )}"
        ${
          entry
            ? `data-entry-id="${escapeHtml(
                entry.id
              )}"`
            : ''
        }
      >

        <label>

          <span>
            Nome
          </span>

          <input
            type="text"
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

        ${section.fields.map(
          (field) => {
            const reference =
              section.references?.[
                field
              ]

            if (reference) {
              return referenceOptions(
                section,
                field,
                entry?.[field]
              )
            }

            return `
              <label>

                <span>
                  ${escapeHtml(
                    labels[field] ||
                    field
                  )}
                </span>

                <input
                  type="text"
                  name="${escapeHtml(
                    field
                  )}"
                  value="${escapeHtml(
                    editable(
                      entry || {},
                      field
                    )
                  )}"
                />

              </label>
            `
          }
        ).join('')}

        <div
          class="form-actions"
        >

          <button
            type="button"
            data-page="${escapeHtml(
              section.id
            )}"
          >
            Cancelar
          </button>

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

        </div>

      </form>

    </section>
  `
}

function getBackupData() {
  const data = {}

  for (
    const section of sections
  ) {
    data[
      section.id
    ] =
      getEntries(
        section
      )
  }

  return data
}

async function saveEntry(
  section,
  form,
  entryId = null
) {
  const data =
    new FormData(
      form
    )

  const entry = {
    name:
      String(
        data.get('name') ||
        ''
      ).trim(),

    description:
      String(
        data.get(
          'description'
        ) || ''
      ).trim()
  }

  for (
    const field of section.fields
  ) {
    const reference =
      section.references?.[
        field
      ]

    if (reference) {
      if (
        reference.multiple
      ) {
        entry[field] =
          data
            .getAll(field)
            .filter(Boolean)
      } else {
        entry[field] =
          String(
            data.get(field) ||
            ''
          )
      }

      continue
    }

    const fieldValue =
      data.get(field)

    if (
      fieldValue !== null &&
      fieldValue !== undefined &&
      fieldValue !== ''
    ) {
      entry[field] =
        String(
          fieldValue
        )
    }
  }

  if (!entry.name) {
    throw new Error(
      'Informe o nome do cadastro.'
    )
  }

  if (entryId) {
    await section.repository.update(
      entryId,
      entry
    )
  } else {
    await section.repository.create(
      entry
    )
  }

  await loadCatalogs()

  page =
    section.id

  await render()
}

async function removeEntry(
  section,
  id
) {
  const confirmed =
    window.confirm(
      'Deseja realmente excluir este cadastro?'
    )

  if (!confirmed) {
    return
  }

  await section.repository.remove(
    id
  )

  await loadCatalogs()

  await render()
}

async function exportBackup() {
  try {
    const backup = {
      exportedAt:
        new Date()
          .toISOString(),

      application:
        'Mavuri Affiliate Engine',

      version:
        '1.0',

      catalogs:
        getBackupData()
    }

    const content =
      JSON.stringify(
        backup,
        null,
        2
      )

    const blob =
      new Blob(
        [content],
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
      document.createElement(
        'a'
      )

    link.href =
      url

    link.download =
      `mavuri-backup-${
        new Date()
          .toISOString()
          .slice(0, 10)
      }.json`

    document.body.appendChild(
      link
    )

    link.click()

    link.remove()

    URL.revokeObjectURL(
      url
    )

  } catch (error) {
    console.error(error)

    window.alert(
      'Não foi possível exportar o backup.'
    )
  }
}

async function importBackup(
  file
) {
  if (!file) {
    return
  }

  try {
    const content =
      await file.text()

    const backup =
      JSON.parse(
        content
      )

    if (
      !backup ||
      typeof backup !==
      'object'
    ) {
      throw new Error(
        'Arquivo inválido.'
      )
    }

    const source =
      backup.catalogs ||
      backup

    const confirmed =
      window.confirm(
        'Os dados do backup serão adicionados aos cadastros atuais. Deseja continuar?'
      )

    if (!confirmed) {
      return
    }

    for (
      const section of sections
    ) {
      const entries =
        source[
          section.id
        ]

      if (
        !Array.isArray(
          entries
        )
      ) {
        continue
      }

      const currentEntries =
        await section.repository.list()

      for (
        const importedEntry of entries
      ) {
        const {
          id,
          created_at,
          updated_at,
          ...entry
        } =
          importedEntry

        const existing =
          currentEntries.find(
            (item) =>
              item.name ===
              entry.name
          )

        if (existing) {
          await section.repository.update(
            existing.id,
            entry
          )
        } else {
          await section.repository.create(
            entry
          )
        }
      }
    }

    await loadCatalogs()

    await render()

    window.alert(
      'Backup importado com sucesso.'
    )

  } catch (error) {
    console.error(error)

    window.alert(
      `Não foi possível importar o backup: ${
        error.message ||
        'arquivo inválido'
      }`
    )
  }
}

async function copyPromotionText() {
  if (
    !divulgacaoPreview
  ) {
    return
  }

  try {
    await navigator.clipboard.writeText(
      divulgacaoPreview
    )

    const button =
      document.querySelector(
        '[data-copy-divulgacao]'
      )

    if (button) {
      const originalText =
        button.textContent

      button.textContent =
        'Copiado!'

      setTimeout(
        () => {
          button.textContent =
            originalText
        },
        1500
      )
    }

  } catch (error) {
    console.error(error)

    window.alert(
      'Não foi possível copiar a mensagem.'
    )
  }
}

function currentPage() {
  if (
    page === 'dashboard'
  ) {
    return dashboard()
  }

  if (
    page === 'divulgacao'
  ) {
    return divulgacaoPage()
  }

  if (
    page === 'buscar-ofertas'
  ) {
    return buscarOfertasPage()
  }

  const section =
    sections.find(
      (item) =>
        item.id === page
    )

  if (section) {
    return sectionPage(
      section
    )
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

  if (!catalogsLoaded) {
    root.innerHTML = `
      <main class="app-shell">
        <section class="loading-page">
          Carregando Mavuri...
        </section>
      </main>
    `

    try {
      await loadCatalogs()
    } catch (error) {
      console.error(error)

      root.innerHTML = `
        <main class="app-shell">
          <section class="loading-page">
            Não foi possível carregar os dados.
          </section>
        </main>
      `

      return
    }
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

          <div class="topbar-actions">

            <button
              data-export-backup
              title="Exportar backup"
            >
              Exportar
            </button>

            <label
              class="import-button"
              title="Importar backup"
            >
              Importar

              <input
                type="file"
                accept=".json,application/json"
                data-import-backup
                hidden
              />

            </label>

          </div>

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

  document
    .querySelectorAll(
      '[data-add]'
    )
    .forEach(
      (button) => {
        button.addEventListener(
          'click',
          async () => {
            const section =
              sections.find(
                (item) =>
                  item.id ===
                  button.dataset.add
              )

            if (!section) {
              return
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

                  </div>

                  <div class="page-content">

                    ${formPage(
                      section
                    )}

                  </div>

                </section>

              </main>
            `

            bindEvents()
          }
        )
      }
    )

  document
    .querySelectorAll(
      '[data-edit]'
    )
    .forEach(
      (button) => {
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

            const entry =
              getEntries(
                section
              ).find(
                (item) =>
                  String(
                    item.id
                  ) ===
                  String(
                    button.dataset.edit
                  )
              )

            if (!entry) {
              return
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

                  </div>

                  <div class="page-content">

                    ${formPage(
                      section,
                      entry
                    )}

                  </div>

                </section>

              </main>
            `

            bindEvents()
          }
        )
      }
    )

  document
    .querySelectorAll(
      '[data-remove]'
    )
    .forEach(
      (button) => {
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

            try {
              await removeEntry(
                section,
                button.dataset.remove
              )
            } catch (error) {
              console.error(error)

              window.alert(
                error.message ||
                'Não foi possível excluir o cadastro.'
              )
            }
          }
        )
      }
    )

  document
    .querySelectorAll(
      '[data-entry-form]'
    )
    .forEach(
      (form) => {
        form.addEventListener(
          'submit',
          async (event) => {
            event.preventDefault()

            const section =
              sections.find(
                (item) =>
                  item.id ===
                  form.dataset.entryForm
              )

            if (!section) {
              return
            }

            try {
              await saveEntry(
                section,
                form,
                form.dataset.entryId ||
                null
              )
            } catch (error) {
              console.error(error)

              window.alert(
                error.message ||
                'Não foi possível salvar o cadastro.'
              )
            }
          }
        )
      }
    )

  const buscarOfertasForm =
    document.querySelector(
      '[data-buscar-ofertas]'
    )

  if (buscarOfertasForm) {
    buscarOfertasForm.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault()

        updateBuscaDraft(
          buscarOfertasForm
        )

        await searchOffers()

        await render()
      }
    )
  }

  document
    .querySelectorAll(
      '[data-gerar-divulgacao]'
    )
    .forEach(
      (button) => {
        button.addEventListener(
          'click',
          async () => {
            const offer =
              ofertasEncontradas.find(
                (item) =>
                  String(
                    item.id
                  ) ===
                  String(
                    button.dataset
                      .gerarDivulgacao
                  )
              )

            if (!offer) {
              window.alert(
                'Não foi possível localizar a oferta selecionada.'
              )

              return
            }

            const originalText =
              button.textContent

            button.disabled =
              true

            button.textContent =
              'Preparando...'

            try {
              await sendOfferToDivulgacao(
                offer
              )
            } catch (error) {
              console.error(error)

              window.alert(
                error.message ||
                'Não foi possível preparar a divulgação.'
              )

              button.disabled =
                false

              button.textContent =
                originalText
            }
          }
        )
      }
    )

  const divulgacaoForm =
    document.querySelector(
      '[data-divulgacao]'
    )

  if (divulgacaoForm) {
    divulgacaoForm.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault()

        updateDivulgacaoDraft(
          divulgacaoForm
        )

        divulgacaoPreview =
          generatePromotionText()

        await render()
      }
    )
  }

  const clearDivulgacaoButton =
    document.querySelector(
      '[data-clear-divulgacao]'
    )

  if (clearDivulgacaoButton) {
    clearDivulgacaoButton.addEventListener(
      'click',
      async () => {
        resetDivulgacao()

        await render()
      }
    )
  }

  const copyDivulgacaoButton =
    document.querySelector(
      '[data-copy-divulgacao]'
    )

  if (copyDivulgacaoButton) {
    copyDivulgacaoButton.addEventListener(
      'click',
      copyPromotionText
    )
  }

  const exportButton =
    document.querySelector(
      '[data-export-backup]'
    )

  if (exportButton) {
    exportButton.addEventListener(
      'click',
      exportBackup
    )
  }

  const importInput =
    document.querySelector(
      '[data-import-backup]'
    )

  if (importInput) {
    importInput.addEventListener(
      'change',
      async (event) => {
        const file =
          event.target.files?.[0]

        await importBackup(
          file
        )

        event.target.value =
          ''
      }
    )
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

          catalogsLoaded =
            false

          ofertasEncontradas =
            []

          ofertasBuscaState = {
            status: 'idle',
            error: '',
            sourceLabel: ''
          }

          resetDivulgacao()
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

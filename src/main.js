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
// MOTOR DE BUSCA DE OFERTAS
// --------------------------------------------------
// A interface nunca consulta diretamente uma plataforma.
// Ela conversa com um provider. Hoje usamos demo; depois o
// backend seguro poderá habilitar Mercado Livre e outras APIs.
const ofertaSource = {
  mode: 'demo',

  providers: {
    demo: {
      enabled: true,
      label: 'Dados demonstrativos'
    },

    mercadolivre: {
      enabled: false,
      label: 'Mercado Livre'
    }
  }
}

let ofertasBuscaDraft = {
  platform: 'mercadolivre',
  query: '',
  discount: '20',
  priceMax: '',
  limit: '10'
}

let ofertasBuscaState = {
  status: 'idle',
  error: '',
  sourceLabel: 'Dados demonstrativos'
}

let ofertasEncontradas = []

// Contrato interno do Mavuri. Qualquer provider deve ser
// normalizado para este formato antes de chegar à interface.
function normalizeOffer(raw = {}) {
  const price =
    parseMoney(raw.price)

  const previousPrice =
    parseMoney(raw.previousPrice)

  return {
    id: String(
      raw.id || crypto.randomUUID()
    ),

    platform:
      raw.platform ||
      'mercadolivre',

    name:
      raw.name ||
      'Produto sem nome',

    description:
      raw.description ||
      '',

    productUrl:
      raw.productUrl ||
      raw.permalink ||
      '',

    affiliateUrl:
      raw.affiliateUrl ||
      '',

    price,

    previousPrice,

    installments:
      Number(raw.installments) ||
      0,

    installmentInterest:
      raw.installmentInterest ||
      'no-interest',

    image:
      raw.image ||
      '',

    category:
      raw.category ||
      '',

    seller:
      raw.seller ||
      raw.store ||
      '',

    sellerRating:
      raw.sellerRating ||
      '',

    capturedAt:
      raw.capturedAt ||
      new Date().toISOString()
  }
}

const ofertasDemo = [
  {
    id: 'MLB-DEMO-001',
    platform: 'mercadolivre',

    name:
      'Tênis Asics Gel Shogun',

    description:
      'Oferta demonstrativa para validar o fluxo automático.',

    productUrl:
      'https://www.mercadolivre.com.br/',

    price: 285,
    previousPrice: 459,

    installments: 10,

    installmentInterest:
      'no-interest',

    image:
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',

    category:
      'Calçados',

    seller:
      'Loja oficial demonstrativa'
  },

  {
    id: 'MLB-DEMO-002',
    platform: 'mercadolivre',

    name:
      'Smart TV 50 polegadas 4K',

    description:
      'Produto demonstrativo com desconto para testar a seleção.',

    productUrl:
      'https://www.mercadolivre.com.br/',

    price: 2199,
    previousPrice: 2999,

    installments: 10,

    installmentInterest:
      'no-interest',

    image:
      'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80',

    category:
      'Eletrônicos',

    seller:
      'Eletrônicos demonstrativo'
  },

  {
    id: 'MLB-DEMO-003',
    platform: 'mercadolivre',

    name:
      'Fone de Ouvido Bluetooth Premium',

    description:
      'Produto demonstrativo para validar filtros e geração.',

    productUrl:
      'https://www.mercadolivre.com.br/',

    price: 179,
    previousPrice: 299,

    installments: 6,

    installmentInterest:
      'no-interest',

    image:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',

    category:
      'Tecnologia',

    seller:
      'Tech demonstrativo'
  },

  {
    id: 'MLB-DEMO-004',
    platform: 'mercadolivre',

    name:
      'Air Fryer 5 Litros',

    description:
      'Produto demonstrativo para a primeira versão do motor.',

    productUrl:
      'https://www.mercadolivre.com.br/',

    price: 349,
    previousPrice: 499,

    installments: 8,

    installmentInterest:
      'no-interest',

    image:
      'https://images.unsplash.com/photo-1648478635091-1b9f64b3b0f1?auto=format&fit=crop&w=800&q=80',

    category:
      'Casa',

    seller:
      'Casa demonstrativo'
  },

  {
    id: 'MLB-DEMO-005',
    platform: 'mercadolivre',

    name:
      'Notebook 15,6 polegadas',

    description:
      'Oferta demonstrativa com maior valor e desconto.',

    productUrl:
      'https://www.mercadolivre.com.br/',

    price: 2899,
    previousPrice: 3799,

    installments: 12,

    installmentInterest:
      'with-interest',

    image:
      'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=80',

    category:
      'Informática',

    seller:
      'Informática demonstrativo'
  }
]

async function fetchDemoOffers() {
  // Mantém a mesma interface assíncrona que será usada
  // posteriormente pelas APIs reais.
  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        350
      )
  )

  return ofertasDemo.map(
    normalizeOffer
  )
}

async function fetchMercadoLivreOffers() {
  // Nunca coloque token ou segredo aqui.
  //
  // A futura integração deve chamar um backend do Mavuri,
  // que por sua vez conversa com a API oficial.
  throw new Error(
    'A integração oficial do Mercado Livre ainda não foi habilitada.'
  )
}

async function fetchOffersFromSource() {
  if (
    ofertaSource.mode ===
    'mercadolivre'
  ) {
    return fetchMercadoLivreOffers()
  }

  return fetchDemoOffers()
}

function filterOffers(offers) {
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

  return offers
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

      if (!query) {
        return true
      }

      const searchable = [
        offer.name,
        offer.description,
        offer.category,
        offer.seller
      ]
        .join(' ')
        .toLowerCase()

      return searchable.includes(
        query
      )
    })
    .sort((a, b) =>
      calculateMavuriScore(b) -
      calculateMavuriScore(a)
    )
    .slice(0, limit)
}

async function searchOffers() {
  ofertasBuscaState = {
    status: 'loading',

    error: '',

    sourceLabel:
      ofertaSource.providers[
        ofertaSource.mode
      ]?.label ||
      'Fonte de ofertas'
  }

  await render()

  try {
    const rawOffers =
      await fetchOffersFromSource()

    ofertasEncontradas =
      filterOffers(
        rawOffers.map(
          normalizeOffer
        )
      )

    ofertasBuscaState.status =
      'success'
  } catch (error) {
    console.error(error)

    ofertasEncontradas = []

    ofertasBuscaState.status =
      'error'

    ofertasBuscaState.error =
      error?.message ||
      'Não foi possível buscar ofertas.'
  }
}

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

  if (
    typeof value === 'number'
  ) {
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
  const results =
    await Promise.all(
      sections.map(
        async (section) => {
          const entries =
            await section.repository.list()

          return [
            section.id,
            entries
          ]
        }
      )
    )

  catalogs =
    Object.fromEntries(
      results
    )

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
function sectionPage(s) {
  const entries =
    getEntries(s)

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
                    ${escapeHtml(entry.name)}
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
                          value(
                            entry[field]
                          )
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
      Os dados ficam armazenados no banco de dados.
      Utilize o backup antes de fazer alterações
      importantes.
    </p>
  `
}

function referenceOptions(
  section,
  field,
  selected
) {
  const reference =
    section.references?.[field]

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
      ? selected.map(String)
      : [
          String(
            selected ?? ''
          )
        ]

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
                  Selecione
                </option>
              `
        }

        ${entries.map((entry) => `
          <option
            value="${escapeHtml(entry.id)}"
            ${
              selectedValues.includes(
                String(entry.id)
              )
                ? 'selected'
                : ''
            }
          >
            ${escapeHtml(
              entry.name
            )}
          </option>
        `).join('')}

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
        ${section.eyebrow}
      </p>

      <h1>
        ${
          isEdit
            ? `Editar ${section.label}`
            : `Novo cadastro em ${section.label}`
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

    <section class="form-card">

      <form
        data-entry-form="${section.id}"
        ${
          entry
            ? `data-entry-id="${entry.id}"`
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

        ${section.fields.map((field) => {
          const reference =
            section.references?.[field]

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
                ${labels[field]}
              </span>

              <input
                type="text"
                name="${field}"
                value="${escapeHtml(
                  editable(
                    entry || {},
                    field
                  )
                )}"
              />

            </label>
          `
        }).join('')}

        <div class="form-actions">

          <button
            type="button"
            data-page="${section.id}"
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
        Encontre oportunidades, aplique filtros e envie
        os melhores produtos para a área de divulgação.
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
                Os resultados atuais utilizam dados demonstrativos
                normalizados pelo motor do Mavuri. A mesma tela será
                utilizada posteriormente com a API oficial.
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
                  ofertasBuscaState.sourceLabel
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
                Tente diminuir o desconto mínimo, aumentar o preço
                máximo ou usar outro termo de busca.
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

                <span class="status-dot">
                  ${escapeHtml(
                    ofertasBuscaState.sourceLabel
                  )}
                </span>

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
      offer.previousPrice -
      offer.price
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
            offer.description
          )}
        </p>

        <div
          class="offer-prices"
        >

          ${
            offer.previousPrice >
            offer.price
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
            discount
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
          offer.installments > 0
            ? `
                <p
                  class="offer-installments"
                >
                  ${
                    offer.installments
                  }x de aproximadamente
                  ${formatMoney(
                    offer.price /
                    offer.installments
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
  const previewHtml =
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

  return `
    <header class="page-heading">

      <p class="eyebrow">
        DIVULGAÇÃO
      </p>

      <h1>
        Nova divulgação
      </h1>

      <p>
        Prepare a mensagem promocional e valide a
        publicação antes de enviar para os canais.
      </p>

    </header>

    <section class="divulgacao-layout">

      <section class="form-card">

        <form data-divulgacao>

          <div class="form-grid">

            <label>

              <span>
                Plataforma
              </span>

              <select name="platform">

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

              </select>

            </label>

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
                  English
                </option>

              </select>

            </label>

          </div>

          <label>

            <span>
              Nome do produto
            </span>

            <input
              type="text"
              name="productName"
              value="${escapeHtml(
                divulgacaoDraft.productName
              )}"
              placeholder="Ex.: Tênis Asics Gel"
              required
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
                placeholder="285,00"
                required
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
                placeholder="459,00"
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
                min="0"
                value="${escapeHtml(
                  divulgacaoDraft.installments
                )}"
                placeholder="10"
              />

            </label>

            <label>

              <span>
                Juros
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
              Link original do produto
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

          <div class="form-actions">

            <button
              class="primary"
              type="submit"
            >
              Gerar prévia
            </button>

          </div>

        </form>

      </section>

      <section
        class="promotion-preview-section"
      >

        <div class="section-title">

          <div>

            <h2>
              Prévia da divulgação
            </h2>

            <p>
              Visualização da mensagem promocional.
            </p>

          </div>

        </div>

        <div
          class="promotion-preview"
          data-promotion-preview
        >
          ${previewHtml}
        </div>

      </section>

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
      String(
        data.get('productUrl') || ''
      ).trim(),

    affiliateUrl:
      String(
        data.get('affiliateUrl') || ''
      ).trim(),

    productName:
      String(
        data.get('productName') || ''
      ).trim(),

    price:
      String(
        data.get('price') || ''
      ).trim(),

    previousPrice:
      String(
        data.get('previousPrice') || ''
      ).trim(),

    installments:
      String(
        data.get('installments') || ''
      ).trim(),

    installmentInterest:
      data.get(
        'installmentInterest'
      ) ||
      'no-interest',

    language:
      data.get('language') ||
      'pt'
  }
}

function generatePromotionText(
  draft
) {
  const productName =
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

  const economy =
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

  const url =
    String(
      draft.affiliateUrl ||
      draft.productUrl ||
      ''
    ).trim()

  if (
    draft.language === 'en'
  ) {
    const lines = [
      '🔥 **DEAL FOUND!**',
      '',
      `🛍️ **${productName}**`
    ]

    if (
      previousPrice > price
    ) {
      lines.push(
        `📉 From ~~${formatMoney(previousPrice)}~~`
      )
    }

    lines.push(
      `💰 **Now ${formatMoney(price)}**${
        discount
          ? ` — **${discount}% OFF**`
          : ''
      }`
    )

    if (economy > 0) {
      lines.push(
        `💸 Save **${formatMoney(economy)}**`
      )
    }

    if (
      installments > 0
    ) {
      lines.push(
        `💳 ${installments}x of approximately ${formatMoney(
          installmentValue
        )}${
          draft.installmentInterest ===
          'no-interest'
            ? ' interest-free'
            : ''
        }`
      )
    }

    if (url) {
      lines.push(
        '',
        '👉 Check out this deal:',
        url
      )
    }

    return lines.join('\n')
  }

  const lines = [
    '🔥 **OFERTA ENCONTRADA!**',
    '',
    `🛍️ **${productName}**`
  ]

  if (
    previousPrice > price
  ) {
    lines.push(
      `📉 De ~~${formatMoney(
        previousPrice
      )}~~`
    )
  }

  lines.push(
    `Por 💰 **${formatMoney(
      price
    )}**${
      discount
        ? ` — **${discount}% OFF**`
        : ''
    }`
  )

  if (economy > 0) {
    lines.push(
      `💸 Economia de **${formatMoney(
        economy
      )}**`
    )
  }

  if (
    installments > 0
  ) {
    lines.push(
      `💳 Em até ${installments}x de aproximadamente ${formatMoney(
        installmentValue
      )}${
        draft.installmentInterest ===
        'no-interest'
          ? ' sem juros'
          : ''
      }`
    )
  }

  if (url) {
    lines.push(
      '',
      '👉 Aproveite a oferta:',
      url
    )
  }

  return lines.join('\n')
}

function renderPromotionPreview(
  text
) {
  if (!text) {
    return ''
  }

  const lines =
    String(text).split('\n')

  const html = lines
    .map((line) => {
      const escaped =
        escapeHtml(line)

      if (!escaped.trim()) {
        return '<div class="promotion-space"></div>'
      }

      const formatted =
        escaped
          .replace(
            /\*\*(.*?)\*\*/g,
            '<strong>$1</strong>'
          )
          .replace(
            /~~(.*?)~~/g,
            '<del>$1</del>'
          )

      if (
        formatted.includes(
          'OFERTA ENCONTRADA'
        ) ||
        formatted.includes(
          'DEAL FOUND'
        )
      ) {
        return `
          <div class="promotion-title">
            ${formatted}
          </div>
        `
      }

      if (
        formatted.startsWith(
          '👉 '
        )
      ) {
        return `
          <div class="promotion-cta">
            ${formatted}
          </div>
        `
      }

      if (
        /^https?:\/\//i.test(
          line.trim()
        )
      ) {
        const safeUrl =
          escapeHtml(
            line.trim()
          )

        return `
          <div class="promotion-link">
            <a
              href="${safeUrl}"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${safeUrl}
            </a>
          </div>
        `
      }

      if (
        formatted.startsWith(
          'Por 💰'
        ) ||
        formatted.startsWith(
          '💰 '
        )
      ) {
        return `
          <div class="promotion-price">
            ${formatted}
          </div>
        `
      }

      if (
        formatted.startsWith(
          '📉 '
        )
      ) {
        return `
          <div class="promotion-old-price">
            ${formatted}
          </div>
        `
      }

      return `
        <div class="promotion-line">
          ${formatted}
        </div>
      `
    })
    .join('')

  return `
    <article
      class="promotion-card"
    >

      <div
        class="promotion-body"
      >
        ${html}
      </div>

      <div
        class="promotion-actions"
      >

        <button
          type="button"
          data-copy-preview
        >
          Copiar texto
        </button>

      </div>

    </article>
  `
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
async function saveEntry(
  sectionId,
  form,
  entryId = null
) {
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

  section.fields.forEach(
    (field) => {
      const reference =
        section.references?.[field]

      if (
        reference?.multiple
      ) {
        payload[field] =
          data
            .getAll(field)
            .filter(Boolean)

        return
      }

      payload[field] =
        String(
          data.get(field) || ''
        ).trim()
    }
  )

  if (
    entryId
  ) {
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

  page =
    section.id

  render()
}

async function removeEntry(
  sectionId,
  entryId
) {
  const section =
    sections.find(
      (item) =>
        item.id === sectionId
    )

  if (!section) {
    return
  }

  const confirmed =
    window.confirm(
      'Deseja realmente excluir este cadastro?'
    )

  if (!confirmed) {
    return
  }

  await section.repository.remove(
    entryId
  )

  await loadCatalogs()

  render()
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
    document.createElement(
      'a'
    )

  link.href = url

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
}

async function importBackup(
  file
) {
  if (!file) {
    return
  }

  const confirmed =
    window.confirm(
      'A importação adicionará os dados do backup ao sistema. Deseja continuar?'
    )

  if (!confirmed) {
    return
  }

  try {
    const text =
      await file.text()

    const backup =
      JSON.parse(
        text
      )

    const backupCatalogs =
      backup.catalogs

    if (
      !backupCatalogs ||
      typeof backupCatalogs !==
      'object'
    ) {
      throw new Error(
        'Arquivo de backup inválido.'
      )
    }

    for (
      const section of sections
    ) {
      const entries =
        backupCatalogs[
          section.id
        ]

      if (
        !Array.isArray(
          entries
        )
      ) {
        continue
      }

      for (
        const entry of entries
      ) {
        const payload = {
          ...entry
        }

        delete payload.id
        delete payload.created_at
        delete payload.updated_at

        if (
          !payload.name
        ) {
          continue
        }

        await section.repository.create(
          payload
        )
      }
    }

    await loadCatalogs()

    alert(
      'Backup importado com sucesso.'
    )

    page =
      'dashboard'

    render()
  } catch (error) {
    console.error(error)

    alert(
      error?.message ||
      'Não foi possível importar o backup.'
    )
  }
}

function bindEvents() {
  root
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

            page =
              nextPage

            await render()
          }
        )
      }
    )

  const logoutButton =
    root.querySelector(
      '[data-logout]'
    )

  if (
    logoutButton
  ) {
    logoutButton.addEventListener(
      'click',
      async () => {
        await signOut()

        session = null

        page =
          'dashboard'

        render()
      }
    )
  }

  const loginForm =
    root.querySelector(
      '[data-login]'
    )

  if (
    loginForm
  ) {
    loginForm.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault()

        const errorElement =
          loginForm.querySelector(
            '.login-error'
          )

        const submitButton =
          loginForm.querySelector(
            'button[type="submit"]'
          )

        const data =
          new FormData(
            loginForm
          )

        try {
          if (
            errorElement
          ) {
            errorElement.hidden =
              true

            errorElement.textContent =
              ''
          }

          submitButton.disabled =
            true

          submitButton.textContent =
            'Entrando...'

          await signIn(
            String(
              data.get('email')
            ).trim(),

            String(
              data.get('password')
            )
          )
        } catch (error) {
          console.error(error)

          if (
            errorElement
          ) {
            errorElement.hidden =
              false

            errorElement.textContent =
              error?.message ||
              'Não foi possível entrar.'
          }

          submitButton.disabled =
            false

          submitButton.textContent =
            'Entrar'
        }
      }
    )
  }

  root
    .querySelectorAll(
      '[data-add]'
    )
    .forEach(
      (button) => {
        button.addEventListener(
          'click',
          async () => {
            page =
              `new:${button.dataset.add}`

            await render()
          }
        )
      }
    )

  root
    .querySelectorAll(
      '[data-edit]'
    )
    .forEach(
      (button) => {
        button.addEventListener(
          'click',
          async () => {
            const entryId =
              button.dataset.edit

            const section =
              sections.find(
                (item) =>
                  getEntries(item)
                    .some(
                      (entry) =>
                        String(entry.id) ===
                        String(entryId)
                    )
              )

            if (!section) {
              return
            }

            page =
              `edit:${section.id}:${entryId}`

            await render()
          }
        )
      }
    )

  root
    .querySelectorAll(
      '[data-remove]'
    )
    .forEach(
      (button) => {
        button.addEventListener(
          'click',
          async () => {
            const entryId =
              button.dataset.remove

            const section =
              sections.find(
                (item) =>
                  getEntries(item)
                    .some(
                      (entry) =>
                        String(entry.id) ===
                        String(entryId)
                    )
              )

            if (!section) {
              return
            }

            await removeEntry(
              section.id,
              entryId
            )
          }
        )
      }
    )

  root
    .querySelectorAll(
      '[data-entry-form]'
    )
    .forEach(
      (form) => {
        form.addEventListener(
          'submit',
          async (event) => {
            event.preventDefault()

            const submitButton =
              form.querySelector(
                'button[type="submit"]'
              )

            const originalText =
              submitButton.textContent

            try {
              submitButton.disabled =
                true

              submitButton.textContent =
                'Salvando...'

              await saveEntry(
                form.dataset.entryForm,
                form,
                form.dataset.entryId ||
                  null
              )
            } catch (error) {
              console.error(error)

              alert(
                error?.message ||
                'Não foi possível salvar.'
              )

              submitButton.disabled =
                false

              submitButton.textContent =
                originalText
            }
          }
        )
      }
    )

  const searchForm =
    root.querySelector(
      '[data-buscar-ofertas]'
    )

  if (
    searchForm
  ) {
    searchForm.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault()

        updateBuscaDraft(
          searchForm
        )

        await searchOffers()

        await render()
      }
    )
  }

  root
    .querySelectorAll(
      '[data-gerar-divulgacao]'
    )
    .forEach(
      (button) => {
        button.addEventListener(
          'click',
          () => {
            const offer =
              ofertasEncontradas.find(
                (item) =>
                  String(item.id) ===
                  String(
                    button.dataset
                      .gerarDivulgacao
                  )
              )

            sendOfferToDivulgacao(
              offer
            )
          }
        )
      }
    )

  const divulgacaoForm =
    root.querySelector(
      '[data-divulgacao]'
    )

  if (
    divulgacaoForm
  ) {
    divulgacaoForm.addEventListener(
      'input',
      () => {
        updateDivulgacaoDraft(
          divulgacaoForm
        )
      }
    )

    divulgacaoForm.addEventListener(
      'change',
      () => {
        updateDivulgacaoDraft(
          divulgacaoForm
        )
      }
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

        if (
          preview
        ) {
          preview.innerHTML =
            renderPromotionPreview(
              divulgacaoPreview
            )

          bindEvents()
        }
      }
    )
  }

  const copyPreviewButton =
    root.querySelector(
      '[data-copy-preview]'
    )

  if (
    copyPreviewButton
  ) {
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
            'Copiado!'

          setTimeout(
            () => {
              copyPreviewButton.textContent =
                originalText
            },
            1500
          )
        } catch (error) {
          console.error(error)

          alert(
            'Não foi possível copiar o texto.'
          )
        }
      }
    )
  }

  const exportButton =
    root.querySelector(
      '[data-export]'
    )

  if (
    exportButton
  ) {
    exportButton.addEventListener(
      'click',
      exportBackup
    )
  }

  const importButton =
    root.querySelector(
      '[data-import]'
    )

  const backupFile =
    root.querySelector(
      '#backup-file'
    )

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

        await importBackup(
          file
        )

        backupFile.value =
          ''
      }
    )
  }
}

function currentContent() {
  if (
    page === 'dashboard'
  ) {
    return dashboard()
  }

  if (
    page === 'buscar-ofertas'
  ) {
    return buscarOfertasPage()
  }

  if (
    page === 'divulgacao'
  ) {
    return divulgacaoPage()
  }

  if (
    page.startsWith(
      'new:'
    )
  ) {
    const sectionId =
      page.replace(
        'new:',
        ''
      )

    const section =
      sections.find(
        (item) =>
          item.id ===
          sectionId
      )

    if (
      section
    ) {
      return formPage(
        section
      )
    }
  }

  if (
    page.startsWith(
      'edit:'
    )
  ) {
    const [
      ,
      sectionId,
      entryId
    ] =
      page.split(':')

    const section =
      sections.find(
        (item) =>
          item.id ===
          sectionId
      )

    const entry =
      section
        ? getEntries(
            section
          ).find(
            (item) =>
              String(item.id) ===
              String(entryId)
          )
        : null

    if (
      section &&
      entry
    ) {
      return formPage(
        section,
        entry
      )
    }

    page =
      sectionId ||
      'dashboard'

    return currentContent()
  }

  const section =
    sections.find(
      (item) =>
        item.id === page
    )

  if (
    section
  ) {
    return sectionPage(
      section
    )
  }

  page =
    'dashboard'

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

  if (
    !catalogsLoaded
  ) {
    try {
      root.innerHTML = `
        <main class="app-loading">
          Carregando dados...
        </main>
      `

      await loadCatalogs()
    } catch (error) {
      console.error(error)

      root.innerHTML = `
        <main class="app-loading">
          Não foi possível carregar os dados.
        </main>
      `

      return
    }
  }

  root.innerHTML = `
    <div class="app-shell">
      ${navigation()}

      <main>
        ${currentContent()}
      </main>
    </div>
  `

  bindEvents()
}

async function initialize() {
  try {
    session =
      await getSession()

    onAuthChange(
      async (nextSession) => {
        session =
          nextSession

        if (
          session &&
          !catalogsLoaded
        ) {
          await loadCatalogs()
        }

        await render()
      }
    )

    await render()
  } catch (error) {
    console.error(error)

    if (root) {
      root.innerHTML = `
        <main class="app-loading">
          Não foi possível iniciar o Mavuri.
        </main>
      `
    }
  }
}

initialize()

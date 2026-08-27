// Ponte entre o fluxo legado do Affiliate Engine e a API validada
// no projeto mavuri-api-test. O GitHub Pages não pode falar diretamente
// com o Mercado Livre com segurança, por isso a chamada passa pelo proxy.
const OFFERS_ENDPOINT = 'https://mavuri-api-test.vercel.app/api/meli'
const MELI_TOKEN_KEY = 'mavuri.meli.access-token'
const nativeFetch = window.fetch.bind(window)

function isOffersRequest(input) {
  const raw = typeof input === 'string'
    ? input
    : input instanceof Request
      ? input.url
      : String(input)

  try {
    const url = new URL(raw, window.location.origin)
    return url.pathname === '/api/offers' ||
      url.pathname.endsWith('/affiliate-engine/api/offers')
  } catch {
    return false
  }
}

function getMeliToken() {
  try {
    const saved = window.sessionStorage.getItem(MELI_TOKEN_KEY)
    if (saved) return saved
  } catch {
    // Se sessionStorage estiver indisponível, seguimos com a sessão atual.
  }

  const token = window.prompt(
    'Cole o Access Token do Mercado Livre para esta sessão. Ele não será salvo permanentemente.'
  )

  const normalized = String(token || '').trim()
  if (!normalized) return ''

  try {
    window.sessionStorage.setItem(MELI_TOKEN_KEY, normalized)
  } catch {
    // O token continua disponível somente para esta chamada.
  }

  return normalized
}

function numberOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue

    if (typeof value === 'string') {
      const text = value.trim()
      if (!text) continue

      // Aceita 1.234,56 e 1234.56 sem transformar preço válido em zero.
      const normalized = text.includes(',')
        ? text.replace(/\./g, '').replace(',', '.')
        : text
      const parsed = Number(normalized)
      if (Number.isFinite(parsed)) return parsed
      continue
    }

    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }

  return null
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value
  }
  return []
}

function normalizeInstallments(item) {
  const source = item?.installments ?? item?.parcelas
  const nested = source && typeof source === 'object' ? source : {}
  const pricing = item?.pricing || item?.price_data || {}

  const quantity = numberOrNull(
    nested.quantity,
    nested.quantidade,
    nested.installments,
    item?.installmentQuantity,
    item?.installments_count,
    item?.installment_quantity,
    item?.parcelas_quantidade,
    typeof source === 'number' ? source : null
  ) || 0

  const amount = numberOrNull(
    nested.amount,
    nested.valor,
    nested.value,
    item?.installment_amount,
    item?.installmentAmount,
    item?.parcela_valor,
    pricing?.installment_amount
  ) || 0

  const rate = numberOrNull(
    nested.rate,
    nested.juros,
    item?.installment_rate,
    item?.installmentRate,
    item?.taxa_juros
  ) || 0

  return { quantity, amount, rate }
}

function normalizeOfferPayload(item) {
  const installments = normalizeInstallments(item)
  const pricing = item?.pricing || item?.price_data || item?.prices || {}

  const price = numberOrNull(
    item?.price,
    item?.preco,
    item?.currentPrice,
    item?.current_price,
    item?.preco_atual,
    item?.valor,
    item?.sale_price,
    item?.salePrice,
    pricing?.price,
    pricing?.current_price,
    pricing?.sale_price,
    item?.buy_box_winner?.price
  ) || 0

  const originalPrice = numberOrNull(
    item?.original_price,
    item?.originalPrice,
    item?.previousPrice,
    item?.previous_price,
    item?.preco_original,
    item?.preco_anterior,
    item?.listPrice,
    item?.list_price,
    pricing?.original_price,
    pricing?.previous_price,
    item?.buy_box_winner?.original_price
  ) || 0

  const title = firstText(
    item?.title,
    item?.titulo,
    item?.name,
    item?.nome,
    item?.productName,
    item?.product_name,
    item?.id
  )

  const description = firstText(
    item?.description,
    item?.descricao,
    item?.subtitle,
    item?.short_description,
    item?.descricao_curta,
    item?.attributes?.find?.((attribute) => attribute?.id === 'MODEL')?.value_name
  )

  const image = firstText(
    item?.thumbnail,
    item?.imagem,
    item?.image,
    item?.image_url,
    item?.pictures?.[0]?.url
  )

  const permalink = firstText(
    item?.permalink,
    item?.link,
    item?.url,
    item?.productUrl,
    item?.product_url,
    item?.id ? `https://produto.mercadolivre.com.br/${item.id}` : ''
  )

  return {
    ...item,
    title,
    titulo: title,
    name: title,
    description,
    descricao: description,
    price,
    preco: price,
    currentPrice: price,
    current_price: price,
    original_price: originalPrice,
    originalPrice,
    previousPrice: originalPrice,
    previous_price: originalPrice,
    preco_original: originalPrice,
    installments: installments.quantity,
    parcelas: installments.quantity,
    installmentQuantity: installments.quantity,
    installmentAmount: installments.amount,
    installmentRate: installments.rate,
    installmentInterest: installments.rate === 0 ? 'no-interest' : 'with-interest',
    thumbnail: image,
    image,
    imagem: image,
    permalink,
    productUrl: permalink,
    product_url: permalink,
    link: permalink
  }
}

async function enrichMissingOfferData(item) {
  const normalized = normalizeOfferPayload(item)

  // O proxy pode devolver dados parciais quando o resultado vem do catálogo.
  // Nesse caso consultamos o item real pelo ID e só usamos os campos ausentes.
  const itemId = firstText(
    normalized.id,
    item?.item_id,
    item?.buy_box_winner?.item_id
  )

  const needsDetails = itemId && (
    normalized.price <= 0 ||
    !normalized.description ||
    normalized.installments <= 0 ||
    !normalized.image
  )

  if (!needsDetails) return normalized

  try {
    const headers = { accept: 'application/json' }
    const token = getMeliToken()
    if (token) headers.authorization = `Bearer ${token}`

    const response = await nativeFetch(
      `https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}`,
      { headers, cache: 'no-store' }
    )

    if (!response.ok) return normalized

    const detail = await response.json()
    const detailNormalized = normalizeOfferPayload(detail)

    return normalizeOfferPayload({
      ...normalized,
      ...detailNormalized,
      // Mantém a descrição já enriquecida pelo proxy quando existir.
      description: detailNormalized.description || normalized.description,
      permalink: detailNormalized.permalink || normalized.permalink,
      productUrl: detailNormalized.productUrl || normalized.productUrl,
      thumbnail: detailNormalized.thumbnail || normalized.thumbnail,
      image: detailNormalized.image || normalized.image,
      price: detailNormalized.price || normalized.price,
      original_price: detailNormalized.original_price || normalized.original_price,
      installments: detailNormalized.installments || normalized.installments,
      installmentAmount: detailNormalized.installmentAmount || normalized.installmentAmount,
      installmentRate: detailNormalized.installmentRate || normalized.installmentRate
    })
  } catch {
    return normalized
  }
}

async function normalizeOffersResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return response

  try {
    const payload = await response.clone().json()
    const source = Array.isArray(payload)
      ? payload
      : firstArray(
          payload?.results,
          payload?.items,
          payload?.products,
          payload?.produtos,
          payload?.data?.results,
          payload?.data?.items,
          payload?.data?.products,
          payload?.data?.produtos
        )

    if (!source.length && !Array.isArray(payload)) return response

    const normalized = await Promise.all(
      source.map(enrichMissingOfferData)
    )

    // Sempre expõe results. O Affiliate Engine antigo entende results/items,
    // enquanto a API pode devolver products/produtos dependendo da origem.
    const body = Array.isArray(payload)
      ? normalized
      : {
          ...payload,
          results: normalized,
          items: normalized,
          products: normalized,
          produtos: normalized
        }

    return new Response(JSON.stringify(body), {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    })
  } catch {
    return response
  }
}

window.fetch = async function (input, init = {}) {
  if (!isOffersRequest(input)) return nativeFetch(input, init)

  const requestUrl = new URL(
    typeof input === 'string' ? input : input.url,
    window.location.origin
  )

  const target = new URL(OFFERS_ENDPOINT)
  target.search = requestUrl.search
  target.searchParams.set('action', 'search')
  // Evita qualquer resposta intermediária antiga durante a troca de versões.
  target.searchParams.set('_v', '20260827-3')

  const token = getMeliToken()
  if (!token) {
    throw new Error('É necessário informar um Access Token do Mercado Livre para buscar ofertas.')
  }

  const response = await nativeFetch(target.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`
    },
    cache: 'no-store',
    signal: init?.signal
  })

  return normalizeOffersResponse(response)
}

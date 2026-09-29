import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { join, resolve } from 'node:path'

const DEFAULTS = {
  minDiscount: 10,
  maxDiscount: 85,
  minItemRating: 4.6,
  minShopRating: 4.6,
  minPrice: 8,
  maxPrice: 5000,
  maxSelected: 5,
  maxPerShop: 1,
  candidatePool: 100,
  cacheHours: 6,
}

function numberOrNull(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

function hasAny(text, words) {
  return words.some((word) => text.includes(normalizeText(word)))
}

function classify(row) {
  const title = String(row.title || '')
  const c1 = String(row.global_category1 || '')
  const c2 = String(row.global_category2 || '')
  const c3 = String(row.global_category3 || '')
  const text = normalizeText([title, c1, c2, c3].join(' '))
  const c1n = normalizeText(c1)
  const c2n = normalizeText(c2)
  const tags = new Set()
  let category = 'outros'

  if (['women clothes', 'women shoes', 'women bags'].includes(c1n)) {
    category = 'moda'
    tags.add('feminino')
    tags.add('moda')
    if (c1n.includes('shoes')) tags.add('calcados')
    if (c1n.includes('bags')) tags.add('bolsas')
    if (c1n.includes('clothes')) tags.add('roupa')
  } else if (c1n === 'beauty') {
    category = 'beleza'
    if (c2n === "men's care") tags.add('masculino')
    else tags.add('feminino')
    if (c2n === 'makeup') tags.add('maquiagem')
    else if (c2n === 'skincare') tags.add('skincare')
    else if (['hair care', 'beauty tools'].includes(c2n)) tags.add('cabelo')
    else if (c2n === 'hand, foot & nail care') tags.add('unhas')
    else if (c2n === 'perfumes & fragrances') tags.add('perfume')
  } else if (c1n === 'home & living') {
    if (c2n === 'tools & home improvement') {
      category = 'ferramentas'
      tags.add('ferramenta')
    } else {
      category = ['kitchenware', 'dinnerware'].includes(c2n) ? 'cozinha' : 'casa'
      tags.add('casa')
      if (['kitchenware', 'dinnerware'].includes(c2n)) tags.add('cozinha')
      if (c2n === 'home care supplies') tags.add('limpeza')
      if (['decoration', 'lighting', 'home fragrance & aromatherapy'].includes(c2n)) tags.add('decoracao')
    }
  } else if (c1n === 'home appliances') {
    if (['tvs & accessories', 'projectors & accessories'].includes(c2n)) {
      category = 'eletronicos'
      tags.add('eletronicos')
    } else {
      category = c2n === 'kitchen appliances' ? 'cozinha' : 'casa'
      tags.add('casa')
      if (c2n === 'kitchen appliances') tags.add('cozinha')
    }
  } else if (c1n === 'computers & accessories') {
    category = 'informatica'
    tags.add('informatica')
  } else if (['mobile & gadgets', 'audio', 'gaming & consoles', 'cameras & drones'].includes(c1n)) {
    category = 'eletronicos'
    tags.add('eletronicos')
    if (c1n === 'mobile & gadgets' && c2n === 'mobile phones') tags.add('celular')
  } else if (c1n === 'fashion accessories') {
    category = 'moda'
    if (['earrings', 'necklaces', 'rings', 'bracelets & bangles', 'hair accessories', 'anklets', 'scarves & shawls'].includes(c2n)) {
      tags.add('feminino')
      tags.add('acessorios-femininos')
    }
  } else if (c1n === 'watches') {
    category = 'moda'
    if (c2n === 'women watches') tags.add('feminino')
    if (c2n === 'men watches') tags.add('masculino')
  } else if (c1n === 'pets') {
    category = 'pet'
    tags.add('pet')
  } else if (['spare parts and accessories for vehicles', 'automobiles'].includes(c1n)) {
    category = 'automotivo'
  } else if (c1n === 'motorcycles') {
    category = 'moto'
    tags.add('moto')
  } else if (c1n.includes('sports') || c1n.includes('outdoor')) {
    category = 'esporte'
    tags.add('esporte')
  } else if (c1n.includes('baby') || c1n.includes('kids') || c1n.includes('toys') || c1n === 'mom & baby') {
    category = 'infantil'
    tags.add('infantil')
  }

  const tagRules = [
    ['feminino', ['feminina', 'para mulher', 'para mulheres', 'sutia', 'sutiã', 'calcinha', 'lingerie', 'vestido feminino', 'saia feminina', 'legging feminina', 'bolsa feminina', 'tenis feminino', 'tênis feminino', 'blusa feminina', 'camiseta feminina']],
    ['masculino', ['masculino', 'para homem', 'para homens', 'cueca', 'barba', 'pos barba', 'pós barba', 'after shave']],
    ['maquiagem', ['maquiagem', 'batom', 'rimel', 'rímel', 'delineador', 'blush', 'gloss', 'paleta de sombra', 'corretivo facial']],
    ['skincare', ['skincare', 'serum facial', 'sérum facial', 'retinol', 'niacinamida', 'acido hialuronico', 'ácido hialurônico', 'hidratante facial', 'agua micelar', 'água micelar', 'protetor solar facial']],
    ['cabelo', ['shampoo', 'condicionador', 'leave-in', 'mascara capilar', 'máscara capilar', 'escova alisadora', 'escova secadora', 'chapinha', 'modelador de cachos', 'babyliss']],
    ['unhas', ['esmalte', 'gel para unha', 'alongamento de unha', 'base para unha']],
    ['acessorios-femininos', ['brinco feminino', 'colar feminino', 'pulseira feminina', 'anel feminino', 'tiara feminina', 'presilha feminina']],
    ['cozinha', ['panela', 'frigideira', 'air fryer', 'fritadeira', 'liquidificador', 'sanduicheira', 'cafeteira', 'pipoqueira', 'pote', 'copos', 'copo', 'talher', 'garrafa termica', 'garrafa térmica']],
    ['limpeza', ['limpeza', 'detergente', 'lavanderia', 'vassoura', 'rodo', 'esfregao', 'esfregão', 'aspirador']],
    ['decoracao', ['decoracao', 'decoração', 'vaso para plantas', 'quadro decorativo', 'tapete', 'cortina', 'luminaria', 'luminária']],
    ['celular', ['celular', 'smartphone', 'iphone', 'galaxy']],
    ['eletronicos', ['smart tv', 'televisao', 'televisão', 'fone', 'headset', 'smartwatch', 'caixa de som', 'projetor', 'tablet', 'carregador']],
    ['informatica', ['notebook', 'computador', 'monitor', 'mouse', 'teclado', 'ssd', 'hd externo', 'roteador', 'cabo ethernet', 'gabinete']],
    ['moto', [' moto ', 'motocicleta', 'motocross', 'enduro', 'bros ', 'titan ', 'biz ', 'cg ']],
    ['trilha', ['trilha', 'motocross', 'enduro', 'off-road', 'off road']],
    ['ferramenta', ['ferramenta', 'soquete', 'catraca', 'furadeira', 'parafusadeira', 'alicate', 'chave combinada']],
    ['pet', ['racao', 'ração', ' gato ', 'gatos', 'cachorro', 'pet food', 'cat food', 'dog food']],
  ]

  for (const [tag, words] of tagRules) if (hasAny(text, words)) tags.add(tag)

  if (category === 'casa' && tags.has('cozinha')) category = 'cozinha'
  if (category === 'outros' && tags.has('informatica')) category = 'informatica'
  if (category === 'outros' && (tags.has('eletronicos') || tags.has('celular'))) category = 'eletronicos'
  if (category === 'outros' && (tags.has('maquiagem') || tags.has('skincare') || tags.has('cabelo') || tags.has('unhas'))) category = 'beleza'
  if (category === 'outros' && tags.has('ferramenta')) category = 'ferramentas'
  if (category === 'outros' && tags.has('pet')) category = 'pet'

  return { category, tags: [...tags] }
}

function channelsFor(classification) {
  const tags = new Set(classification.tags)
  const channels = ['Mavuri Ofertas']
  if ([...tags].some((tag) => ['feminino', 'maquiagem', 'skincare', 'cabelo', 'unhas', 'acessorios-femininos'].includes(tag)) && !tags.has('masculino') && !tags.has('infantil')) channels.push('Mavuri Mulher')
  if ([...tags].some((tag) => ['casa', 'cozinha', 'limpeza', 'decoracao'].includes(tag))) channels.push('Mavuri Casa & Cozinha')
  if ([...tags].some((tag) => ['eletronicos', 'informatica', 'celular'].includes(tag))) channels.push('Mavuri Tecnologia')
  return channels
}

function score(row, channels) {
  const discount = numberOrNull(row.discount_percentage) || 0
  const itemRating = numberOrNull(row.item_rating) || 0
  const shopRating = numberOrNull(row.shop_rating) || 0
  const salePrice = numberOrNull(row.sale_price) || 0
  const likes = Math.max(0, numberOrNull(row.like) || 0)
  const nicheBonus = Math.max(0, channels.length - 1) * 4

  // Desconto continua importante, mas a contribuição é limitada para não
  // transformar descontos extremos/suspeitos no único critério do ranking.
  const discountScore = Math.min(discount, 55) * 1.1

  // Pequeno bônus de "compra por impulso" para tickets acessíveis, sem
  // impedir que eletrônicos de maior valor apareçam quando a oferta for boa.
  const priceBonus =
    salePrice <= 80 ? 8 :
    salePrice <= 200 ? 6 :
    salePrice <= 500 ? 3 :
    salePrice <= 1500 ? 1 : 0

  return discountScore
    + Math.max(0, itemRating - 4.5) * 20
    + Math.max(0, shopRating - 4.5) * 10
    + Math.log10(likes + 1) * 4
    + nicheBonus
    + priceBonus
}

async function* parseCsv(filePath) {
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  let field = ''
  let row = []
  let quoted = false
  let pendingQuote = false
  let firstChunk = true

  for await (let chunk of stream) {
    if (firstChunk) {
      chunk = chunk.replace(/^\uFEFF/, '')
      firstChunk = false
    }

    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i]

      if (pendingQuote) {
        pendingQuote = false
        if (ch === '"') {
          field += '"'
          continue
        }
        quoted = false
      }

      if (ch === '"') {
        if (quoted) {
          if (i + 1 < chunk.length) {
            if (chunk[i + 1] === '"') {
              field += '"'
              i += 1
            } else {
              quoted = false
            }
          } else {
            pendingQuote = true
          }
        } else {
          quoted = true
        }
      } else if (ch === ',' && !quoted) {
        row.push(field)
        field = ''
      } else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && chunk[i + 1] === '\n') i += 1
        row.push(field)
        field = ''
        if (row.some((value) => value !== '')) yield row
        row = []
      } else {
        field += ch
      }
    }
  }

  if (pendingQuote) quoted = false
  if (field || row.length) {
    row.push(field)
    yield row
  }
}

async function publishToMavuri(offers) {
  const enabled = String(process.env.SHOPEE_ENABLE_PUBLISH || '').toLowerCase() === 'true'
  if (!enabled) {
    throw new Error('Publicação bloqueada: defina SHOPEE_ENABLE_PUBLISH=true para liberar.')
  }

  const accessToken = String(process.env.MAVURI_SUPABASE_ACCESS_TOKEN || '').trim()
  if (!accessToken) {
    throw new Error('MAVURI_SUPABASE_ACCESS_TOKEN não configurado.')
  }

  const supabaseUrl = String(process.env.MAVURI_SUPABASE_URL || 'https://otikoxnfotyjgphrdudn.supabase.co').replace(/\/$/, '')
  const publishableKey = String(
    process.env.MAVURI_SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_DSklSKpNz_Jlwi2Wx089TA_5JR8pBSt'
  ).trim()

  const endpoint = `${supabaseUrl}/functions/v1/flow-shopee-ingest`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      apikey: publishableKey,
    },
    body: JSON.stringify({
      offers: offers.map((item) => ({
        itemid: item.itemid,
        title: item.title,
        price: item.price,
        sale_price: item.sale_price,
        discount_percentage: item.discount_percentage,
        shop_rating: item.shop_rating,
        item_rating: item.item_rating,
        like: item.like,
        global_category1: item.global_category1,
        global_category2: item.global_category2,
        global_category3: item.global_category3,
        shop_name: item.shop_name,
        image_link: item.image_link,
        product_link: item.product_link,
        product_short_link: item.product_short_link,
        affiliate_url: item.affiliate_url,
      })),
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`flow-shopee-ingest HTTP ${response.status}: ${payload?.error || JSON.stringify(payload)}`)
  }

  return payload
}

async function resolveFeedFile(url, cacheHours) {
  const cacheDir = resolve(process.env.SHOPEE_CACHE_DIR || '.mavuri-cache')
  const filePath = join(cacheDir, 'shopee-feed.csv')
  await mkdir(cacheDir, { recursive: true })

  if (existsSync(filePath)) {
    const info = await stat(filePath)
    const ageHours = (Date.now() - info.mtimeMs) / 3_600_000
    if (info.size > 1024 && ageHours < cacheHours) {
      console.log(`Usando feed Shopee em cache (${ageHours.toFixed(1)}h de idade).`)
      return filePath
    }
  }

  console.log('Baixando feed atualizado da Shopee...')
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`Falha ao baixar feed: HTTP ${response.status}`)
  }

  const tempPath = `${filePath}.part`
  await pipeline(response.body, createWriteStream(tempPath))
  const info = await stat(tempPath)
  if (info.size < 1024) throw new Error('Feed baixado parece inválido ou vazio.')

  // Node 20+: rename via dynamic import keeps Windows replacement predictable.
  const { rename, rm } = await import('node:fs/promises')
  if (existsSync(filePath)) await rm(filePath, { force: true })
  await rename(tempPath, filePath)
  console.log(`Feed atualizado: ${(info.size / 1024 / 1024).toFixed(1)} MB.`)
  return filePath
}

async function main() {
  const fileArg = process.argv.find((arg) => arg.toLowerCase().endsWith('.csv')) || process.env.SHOPEE_FEED_FILE
  const feedUrl = process.env.SHOPEE_FEED_URL

  let filePath
  if (fileArg) {
    filePath = resolve(fileArg)
    await stat(filePath)
  } else if (feedUrl) {
    filePath = await resolveFeedFile(feedUrl, numberOrNull(process.env.SHOPEE_CACHE_HOURS) ?? DEFAULTS.cacheHours)
  } else {
    throw new Error('Informe SHOPEE_FEED_FILE, SHOPEE_FEED_URL ou passe o caminho do CSV na linha de comando.')
  }

  const iterator = parseCsv(filePath)[Symbol.asyncIterator]()
  const first = await iterator.next()
  const header = first.value
  if (!header) throw new Error('CSV vazio.')

  const columns = header.map((name) => name.trim())
  const required = ['itemid', 'title', 'sale_price', 'price', 'discount_percentage', 'shop_rating', 'item_rating', 'like', 'global_category1', 'global_category2', 'global_category3', 'shop_name', 'image_link', 'product_link', 'product_short link']
  const missing = required.filter((name) => !columns.includes(name))
  if (missing.length) throw new Error(`Colunas ausentes: ${missing.join(', ')}`)

  const cfg = {
    minDiscount: numberOrNull(process.env.SHOPEE_MIN_DISCOUNT) ?? DEFAULTS.minDiscount,
    maxDiscount: numberOrNull(process.env.SHOPEE_MAX_DISCOUNT) ?? DEFAULTS.maxDiscount,
    minItemRating: numberOrNull(process.env.SHOPEE_MIN_ITEM_RATING) ?? DEFAULTS.minItemRating,
    minShopRating: numberOrNull(process.env.SHOPEE_MIN_SHOP_RATING) ?? DEFAULTS.minShopRating,
    minPrice: numberOrNull(process.env.SHOPEE_MIN_PRICE) ?? DEFAULTS.minPrice,
    maxPrice: numberOrNull(process.env.SHOPEE_MAX_PRICE) ?? DEFAULTS.maxPrice,
    maxSelected: numberOrNull(process.env.SHOPEE_MAX_SELECTED) ?? DEFAULTS.maxSelected,
    maxPerShop: numberOrNull(process.env.SHOPEE_MAX_PER_SHOP) ?? DEFAULTS.maxPerShop,
    candidatePool: numberOrNull(process.env.SHOPEE_CANDIDATE_POOL) ?? DEFAULTS.candidatePool,
    cacheHours: numberOrNull(process.env.SHOPEE_CACHE_HOURS) ?? DEFAULTS.cacheHours,
  }

  const candidates = []
  let totalRows = 0

  for (;;) {
    const next = await iterator.next()
    if (next.done) break
    const values = next.value
    totalRows += 1

    const row = Object.fromEntries(columns.map((name, i) => [name, values[i] ?? '']))
    const salePrice = numberOrNull(row.sale_price)
    const regularPrice = numberOrNull(row.price)
    const discount = numberOrNull(row.discount_percentage)
    const itemRating = numberOrNull(row.item_rating)
    const shopRating = numberOrNull(row.shop_rating)

    if (!row.itemid || !row.title || !row.image_link || !row.product_link || !row['product_short link']) continue
    if (salePrice == null || salePrice < cfg.minPrice || salePrice > cfg.maxPrice) continue
    if (regularPrice == null || regularPrice <= 0) continue
    if (discount == null || discount < cfg.minDiscount || discount > cfg.maxDiscount) continue
    if (itemRating == null || itemRating < cfg.minItemRating) continue
    if (shopRating == null || shopRating < cfg.minShopRating) continue

    const classification = classify(row)
    const channels = channelsFor(classification)

    candidates.push({
      itemid: row.itemid,
      title: row.title,
      price: regularPrice,
      sale_price: salePrice,
      discount_percentage: discount,
      shop_rating: shopRating,
      item_rating: itemRating,
      like: numberOrNull(row.like) || 0,
      global_category1: row.global_category1,
      global_category2: row.global_category2,
      global_category3: row.global_category3,
      shop_name: row.shop_name,
      image_link: row.image_link,
      product_link: row.product_link,
      product_short_link: row['product_short link'],
      affiliate_url: row['product_short link'],
      mavuri_category: classification.category,
      mavuri_tags: classification.tags,
      channels,
      score: score(row, channels),
    })
  }

  candidates.sort((a, b) => b.score - a.score)

  const selected = []
  const selectedIds = new Set()
  const byShop = new Map()

  const canAdd = (candidate) => {
    if (selectedIds.has(candidate.itemid)) return false
    const shopKey = normalizeText(candidate.shop_name || 'sem-loja')
    return (byShop.get(shopKey) || 0) < cfg.maxPerShop
  }

  const add = (candidate) => {
    const shopKey = normalizeText(candidate.shop_name || 'sem-loja')
    selected.push(candidate)
    selectedIds.add(candidate.itemid)
    byShop.set(shopKey, (byShop.get(shopKey) || 0) + 1)
  }

  // Reserva espaço para os três canais de nicho atuais quando houver
  // ofertas qualificadas. O restante é preenchido pelo ranking geral.
  const nicheOrder = ['Mavuri Mulher', 'Mavuri Casa & Cozinha', 'Mavuri Tecnologia']
  for (const channelName of nicheOrder) {
    if (selected.length >= cfg.maxSelected) break
    const candidate = candidates.find((item) => item.channels.includes(channelName) && canAdd(item))
    if (candidate) add(candidate)
  }

  // Preenche o restante priorizando score e diversidade de categoria.
  const usedCategories = new Set(selected.map((item) => item.mavuri_category))
  for (const candidate of candidates) {
    if (selected.length >= cfg.maxSelected) break
    if (!canAdd(candidate)) continue
    if (usedCategories.has(candidate.mavuri_category)) continue
    add(candidate)
    usedCategories.add(candidate.mavuri_category)
  }

  // Se ainda faltarem posições, completa apenas pelo score.
  for (const candidate of candidates) {
    if (selected.length >= cfg.maxSelected) break
    if (!canAdd(candidate)) continue
    add(candidate)
  }

  // Pool maior para a futura ingestão automática: o backend faz a
  // deduplicação/cooldown e escolhe até 5 ofertas realmente publicáveis.
  const publishPool = []
  const publishIds = new Set()
  const publishByShop = new Map()

  for (const candidate of selected) {
    publishPool.push(candidate)
    publishIds.add(candidate.itemid)
    const shopKey = normalizeText(candidate.shop_name || 'sem-loja')
    publishByShop.set(shopKey, (publishByShop.get(shopKey) || 0) + 1)
  }

  for (const candidate of candidates) {
    if (publishPool.length >= cfg.candidatePool) break
    if (publishIds.has(candidate.itemid)) continue

    // No pool ampliado permitimos até 3 por loja; o top 5 continua limitado a 1.
    const shopKey = normalizeText(candidate.shop_name || 'sem-loja')
    if ((publishByShop.get(shopKey) || 0) >= 3) continue

    publishPool.push(candidate)
    publishIds.add(candidate.itemid)
    publishByShop.set(shopKey, (publishByShop.get(shopKey) || 0) + 1)
  }

  console.log(`Shopee feed: ${totalRows.toLocaleString('pt-BR')} produtos`)
  console.log(`Elegíveis após filtros: ${candidates.length.toLocaleString('pt-BR')}`)
  console.log(`Selecionados para visualização (DRY-RUN): ${selected.length}`)
  console.log(`Pool preparado para ingestão futura: ${publishPool.length}`)

  selected.forEach((item, index) => {
    console.log(`\n${index + 1}. ${item.title}`)
    console.log(`   R$ ${item.sale_price.toFixed(2)} | ${item.discount_percentage}% OFF | item ${item.item_rating.toFixed(2)} | loja ${item.shop_rating.toFixed(2)}`)
    console.log(`   ${item.mavuri_category} | tags: ${item.mavuri_tags.join(', ') || '-'} | canais: ${item.channels.join(' + ')}`)
    console.log(`   score=${item.score.toFixed(2)} | ${item.product_short_link}`)
  })

  if (process.argv.includes('--json')) {
    console.log(`\n${JSON.stringify({ config: cfg, selected, publishPool }, null, 2)}`)
  }

  if (process.argv.includes('--publish')) {
    console.log('\nModo --publish solicitado.')
    const result = await publishToMavuri(publishPool)
    console.log('Resultado da ingestão Shopee:')
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log('\nPublicação automática permanece DESATIVADA até validar o rastreamento do link no painel da Shopee.')
    console.log('Quando validarmos, use --publish + SHOPEE_ENABLE_PUBLISH=true para liberar explicitamente.')
  }

  console.log('O runner já está pronto para reutilizar o mesmo feed por algumas horas sem baixar ~190 MB a cada ciclo.')
}

main().catch((error) => {
  console.error('Shopee runner falhou:', error.message || error)
  process.exitCode = 1
})

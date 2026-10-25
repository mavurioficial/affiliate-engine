// Exact-port pure classification and rule matching from deployed flow-shopee-ingest on 2026-10-22.
// For SHADOW DIAGNOSTICS only; real DB classification override triggers may still change outcomes.
// This file intentionally contains no credentials, network, database access, or writes.
function textOrNull(v) {
  const s = String(v || "").trim()
  return s || null
}
function numberOrNull(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function normalizeUrl(v) {
  const s = String(v || "").trim()
  if (!s) return null
  try {
    const u = new URL(s)
    return ["http:", "https:"].includes(u.protocol) ? u.toString() : null
  } catch {
    return null
  }
}
function normalizeText(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
}
function hasAny(text, words) {
  return words.some((w) => text.includes(normalizeText(w)))
}
function asStringArray(value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean)
  if (typeof value === "string") return value.split(",").map((x) => x.trim()).filter(Boolean)
  return []
}

export function classifyShopee(offer) {
  const title = textOrNull(offer.title) || ""
  const c1 = textOrNull(offer.global_category1) || ""
  const c2 = textOrNull(offer.global_category2) || ""
  const c3 = textOrNull(offer.global_category3) || ""
  const text = normalizeText([title, c1, c2, c3].join(" "))
  const tags = new Set()
  let categorySlug = "outros"

  const c1n = normalizeText(c1)
  const c2n = normalizeText(c2)

  if (["women clothes","women shoes","women bags"].includes(c1n)) {
    categorySlug = "moda"
    tags.add("feminino")
    tags.add("moda")
    if (c1n.includes("shoes")) tags.add("calcados")
    if (c1n.includes("bags")) tags.add("bolsas")
    if (c1n.includes("clothes")) tags.add("roupa")
  } else if (c1n === "beauty") {
    categorySlug = "beleza"
    if (c2n === "men's care") {
      tags.add("masculino")
    } else {
      tags.add("feminino")
    }
    if (c2n === "makeup") {
      tags.add("maquiagem")
    } else if (c2n === "skincare") {
      tags.add("skincare")
    } else if (["hair care","beauty tools"].includes(c2n)) {
      tags.add("cabelo")
    } else if (c2n === "hand, foot & nail care") {
      tags.add("unhas")
    } else if (c2n === "perfumes & fragrances") {
      tags.add("perfume")
    }
  } else if (c1n === "home & living") {
    if (c2n === "tools & home improvement") {
      categorySlug = "ferramentas"
      tags.add("ferramenta")
    } else {
      categorySlug = c2n === "kitchenware" || c2n === "dinnerware" ? "cozinha" : "casa"
      tags.add("casa")
      if (["kitchenware","dinnerware"].includes(c2n)) tags.add("cozinha")
      if (["home care supplies"].includes(c2n)) tags.add("limpeza")
      if (["decoration","lighting","home fragrance & aromatherapy"].includes(c2n)) tags.add("decoracao")
    }
  } else if (c1n === "home appliances") {
    if (["tvs & accessories","projectors & accessories"].includes(c2n)) {
      categorySlug = "eletronicos"
      tags.add("eletronicos")
    } else {
      categorySlug = c2n === "kitchen appliances" ? "cozinha" : "casa"
      tags.add("casa")
      if (c2n === "kitchen appliances") tags.add("cozinha")
    }
  } else if (c1n === "computers & accessories") {
    categorySlug = "informatica"
    tags.add("informatica")
  } else if (["mobile & gadgets","audio","gaming & consoles","cameras & drones"].includes(c1n)) {
    categorySlug = "eletronicos"
    tags.add("eletronicos")
    if (c1n === "mobile & gadgets" && c2n === "mobile phones") tags.add("celular")
  } else if (c1n === "fashion accessories") {
    categorySlug = "moda"
    if (["earrings","necklaces","rings","bracelets & bangles","hair accessories","anklets","scarves & shawls"].includes(c2n)) {
      tags.add("feminino")
      tags.add("acessorios-femininos")
    }
  } else if (c1n === "watches") {
    categorySlug = "moda"
    if (c2n === "women watches") tags.add("feminino")
    if (c2n === "men watches") tags.add("masculino")
  } else if (c1n === "pets") {
    categorySlug = "pet"
    tags.add("pet")
  } else if (["spare parts and accessories for vehicles","automobiles"].includes(c1n)) {
    categorySlug = "automotivo"
  } else if (c1n === "motorcycles") {
    categorySlug = "moto"
    tags.add("moto")
  } else if (c1n.includes("sports") || c1n.includes("outdoor")) {
    categorySlug = "esporte"
    tags.add("esporte")
  } else if (c1n.includes("baby") || c1n.includes("kids") || c1n.includes("toys") || c1n === "mom & baby") {
    categorySlug = "infantil"
    tags.add("infantil")
  }

  const tagRules = [
    ["feminino", ["feminina","para mulher","para mulheres","sutia","sutiã","calcinha","lingerie","vestido feminino","saia feminina","legging feminina","bolsa feminina","tenis feminino","tênis feminino","blusa feminina","camiseta feminina"]],
    ["masculino", ["masculino","para homem","para homens","cueca","barba","pos barba","pós barba","after shave"]],
    ["maquiagem", ["maquiagem","batom","rimel","rímel","delineador","blush","gloss","paleta de sombra","corretivo facial"]],
    ["skincare", ["skincare","serum facial","sérum facial","retinol","niacinamida","acido hialuronico","ácido hialurônico","hidratante facial","agua micelar","água micelar","protetor solar facial","cleansing"]],
    ["cabelo", ["shampoo","condicionador","leave-in","mascara capilar","máscara capilar","escova alisadora","escova secadora","chapinha","modelador de cachos","babyliss"]],
    ["unhas", ["esmalte","gel para unha","alongamento de unha","base para unha"]],
    ["acessorios-femininos", ["brinco feminino","colar feminino","pulseira feminina","anel feminino","tiara feminina","presilha feminina"]],
    ["cozinha", ["panela","frigideira","air fryer","fritadeira","liquidificador","sanduicheira","cafeteira","pipoqueira","pote","copos","copo","talher","garrafa termica","garrafa térmica"]],
    ["limpeza", ["limpeza","detergente","lavanderia","vassoura","rodo","esfregao","esfregão","aspirador"]],
    ["decoracao", ["decoracao","decoração","vaso para plantas","quadro decorativo","tapete","cortina","luminaria","luminária"]],
    ["celular", ["celular","smartphone","iphone","galaxy"]],
    ["eletronicos", ["smart tv","televisao","televisão","fone","headset","smartwatch","caixa de som","projetor","tablet","carregador"]],
    ["informatica", ["notebook","computador","monitor","mouse","teclado","ssd","hd externo","roteador","cabo ethernet","gabinete"]],
    ["moto", [" moto ","motocicleta","motocross","enduro","bros ","titan ","biz ","cg "]],
    ["trilha", ["trilha","motocross","enduro","off-road","off road"]],
    ["ferramenta", ["ferramenta","soquete","catraca","furadeira","parafusadeira","alicate","chave combinada"]],
    ["pet", ["racao","ração"," gato ","gatos","cachorro","pet food","cat food","dog food"]]
  ]
  for (const [tag, words] of tagRules) if (hasAny(text, words)) tags.add(tag)

  if (categorySlug === "casa" && tags.has("cozinha")) categorySlug = "cozinha"
  if (categorySlug === "outros" && tags.has("informatica")) categorySlug = "informatica"
  if (categorySlug === "outros" && (tags.has("eletronicos") || tags.has("celular"))) categorySlug = "eletronicos"
  if (categorySlug === "outros" && (tags.has("maquiagem") || tags.has("skincare") || tags.has("cabelo") || tags.has("unhas"))) categorySlug = "beleza"
  if (categorySlug === "outros" && tags.has("ferramenta")) categorySlug = "ferramentas"
  if (categorySlug === "outros" && tags.has("pet")) categorySlug = "pet"

  return { categorySlug, tags: [...tags] }
}

export function diversityFamily(title) {
  const t = normalizeText(title)
  const families = [
    ["bicicleta", /\b(bicicleta|bicicletas|bike|ergometrica)\b/],
    ["bola-esportiva", /\b(bola de futebol|bola futebol|bola campo|bola society|bola de volei|bola de basquete|bola futsal)\b/],
    ["detergente", /\b(detergente|detergentes)\b/],
    ["amaciante", /\b(amaciante|amaciantes)\b/],
    ["sabao-lavanderia", /\b(sabao em po|sabao liquido|lava roupas|lava roupa)\b/],
    ["suplemento-proteina", /\b(whey|proteina|protein)\b/],
    ["creatina", /\b(creatina|creatine)\b/],
    ["cama-enxoval", /\b(lencol|lencois|jogo de cama|cobre leito|colcha|edredom|fronha|cobertor|manta)\b/],
    ["travesseiro", /\b(travesseiro|travesseiros)\b/],
    ["geladeira", /\b(geladeira|refrigerador|refrigeradores)\b/],
    ["lavadora", /\b(lavadora|maquina de lavar|lava e seca|tanquinho)\b/],
    ["airfryer", /\b(air fryer|airfryer|fritadeira)\b/],
    ["liquidificador", /\b(liquidificador|liquidificadores)\b/],
    ["cafeteira", /\b(cafeteira|cafeteiras)\b/],
    ["ventilador", /\b(ventilador|ventiladores)\b/],
    ["televisor", /\b(tv|televisao|televisor)\b/],

    ["toalha-banho", /\btoalhas?\b.*\b(banho|banhao)\b|\b(banho|banhao)\b.*\btoalhas?\b/],
    ["cueca-boxer", /\b(cueca|cuecas|boxer|box adulto)\b/],
    ["legging", /\b(legging|leggings)\b/],
    ["camiseta-camisa", /\b(camiseta|camisetas|camisa|camisas)\b/],
    ["tenis", /\b(tenis|sneaker|sapatênis|sapatenis)\b/],
    ["fone-headset", /\b(fone|headset|earbuds|auricular)\b/],
    ["carregador-powerbank", /\b(carregador|power bank|powerbank)\b/],
    ["smartphone", /\b(smartphone|celular|iphone|galaxy)\b/],
    ["panela-frigideira", /\b(panela|panelas|frigideira|frigideiras)\b/],
    ["pote-organizador", /\b(pote|potes|organizador|organizadora)\b/],
    ["brinquedo-infantil", /\b(brinquedo|boneca|boneco|carrinho infantil)\b/],
    ["skincare", /\b(protetor solar|hidratante|serum|sérum|creme facial|antirrugas)\b/],
    ["cabelo", /\b(shampoo|condicionador|mascara capilar|máscara capilar|secador|chapinha|escova secadora)\b/]
  ]
  for (const [key,re] of families) if (re.test(t)) return key
  return null
}

export function matchesRule(rule, offer) {
  const c = rule.conditions || {}
  const marketplace = normalizeText(c.marketplace || "")
  if (marketplace && marketplace !== "shopee") return false

  const minDiscount = numberOrNull(c.minDiscount ?? c.min_discount)
  const maxDiscount = numberOrNull(c.maxDiscount ?? c.max_discount)
  if (minDiscount !== null && (offer.discount === null || offer.discount < minDiscount)) return false
  if (maxDiscount !== null && (offer.discount === null || offer.discount > maxDiscount)) return false

  const minPrice = numberOrNull(c.minPrice ?? c.min_price)
  const maxPrice = numberOrNull(c.maxPrice ?? c.max_price)
  if (minPrice !== null && offer.price < minPrice) return false
  if (maxPrice !== null && offer.price > maxPrice) return false

  const reqCats = asStringArray(c.mavuriCategories ?? c.mavuri_categories ?? c.mavuriCategory ?? c.mavuri_category).map(normalizeText)
  if (reqCats.length && !reqCats.includes(normalizeText(offer.mavuriCategory))) return false

  const offerTags = new Set(offer.mavuriTags.map(normalizeText))
  const any = asStringArray(c.mavuriTagsAny ?? c.mavuri_tags_any).map(normalizeText)
  if (any.length && !any.some((x) => offerTags.has(x))) return false

  const all = asStringArray(c.mavuriTagsAll ?? c.mavuri_tags_all).map(normalizeText)
  if (all.length && !all.every((x) => offerTags.has(x))) return false

  const denied = asStringArray(c.deniedMavuriTags ?? c.denied_mavuri_tags).map(normalizeText)
  if (denied.some((x) => offerTags.has(x))) return false

  const deniedWords = asStringArray(c.deniedWords ?? c.denied_words)
  const lowerTitle = offer.title.toLocaleLowerCase("pt-BR")
  if (deniedWords.some((w) => lowerTitle.includes(w.toLocaleLowerCase("pt-BR")))) return false

  return true
}
export function channelIdsForRule(rule) {
  return asStringArray(rule.actions?.channel_ids ?? rule.actions?.channelIds)
}




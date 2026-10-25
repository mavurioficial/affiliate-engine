function normalizeText(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
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
  for (const [key,re] of families) if (re.test(t)) return String(key)
  return null
}


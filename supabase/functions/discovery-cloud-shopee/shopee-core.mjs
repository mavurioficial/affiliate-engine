// Shopee product projection ported from browser-discovery-v1 V85 (2026-10-22).
// Pure functions: no credentials, network, persistence or publication.
export function normalizeShopeeDiscount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(99, Math.round(pct * 100) / 100));
}
export function inferShopeeCategoryHints(title) {
  const t = String(title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(chaleira|cozedor|egg cooker|forno eletrico|forninho|mixer|batedor|batedeira|picador|processador|moedor|liquidificador|cafeteira|sanduicheira|torradeira|air fryer|fritadeira|panela eletrica|pipoqueira|espremedor|cooktop|micro-ondas|microondas)\b/.test(t))
    return { global_category1:"Home Appliances",global_category2:"Kitchen Appliances",global_category3:null };
  if (/\b(criado mudo|criado-mudo|mesa de cabeceira|cabeceira|lencol|jogo de lencol|jogo de cama|fronha|cobertor|edredom|colcha|manta|travesseiro|protetor de colchao|colchao|ventilador de teto|ventilador|armario|organizador|organizadora|estante|prateleira|balde|lixeira|cabide|varal|tapete|cortina|luminaria|abajur|lampada|decoracao|vaso|difusor|umidificador)\b/.test(t))
    return { global_category1:"Home & Living",global_category2:"Bedding",global_category3:null };
  if (/\b(panela|frigideira|pote|jogo de panelas|talher|talheres|copo|copos|caneca|garrafa termica|escorredor|forma|assadeira|tampa|utensilio de cozinha|utensilios de cozinha)\b/.test(t))
    return { global_category1:"Home & Living",global_category2:"Kitchenware",global_category3:null };
  if (/\b(short|shorts|bermuda|jaqueta|jaquetas|casaco|casacos|corta vento|corta-vento|camiseta|camisetas|camisa|camisas|calca|calcas|moletom|moletons|regata|regatas|vestido|vestidos|saia|saias|legging|leggings|blusa|blusas|roupa|roupas|cueca|cuecas|lingerie|sutia|calcinha|conjunto fitness|conjunto masculino|conjunto feminino)\b/.test(t)) {
    if (/\b(feminina|feminino|mulher|mulheres)\b/.test(t))
      return { global_category1:"Women Clothes",global_category2:null,global_category3:null };
    return { global_category1:"Fashion Accessories",global_category2:null,global_category3:null };
  }
  if (/\b(monitor|notebook|computador|mouse|teclado|ssd|hd externo|roteador|webcam|impressora)\b/.test(t))
    return { global_category1:"Computers & Accessories",global_category2:null,global_category3:null };
  if (/\b(smartphone|celular|iphone|galaxy|fone|headset|smartwatch|caixa de som|projetor|tablet|carregador)\b/.test(t))
    return { global_category1:"Mobile & Gadgets",global_category2:null,global_category3:null };
  if (/\b(batom|maquiagem|rimel|delineador|blush|gloss|serum facial|hidratante facial|skincare|shampoo|condicionador|mascara capilar|chapinha|escova secadora)\b/.test(t))
    return { global_category1:"Beauty",global_category2:"Makeup",global_category3:null };
  if (/\b(feminina|feminino|bota feminina|sandalia feminina|tenis feminino|bolsa feminina|vestido feminino|saia feminina|blusa feminina)\b/.test(t))
    return { global_category1:"Women Clothes",global_category2:null,global_category3:null };
  if (/\b(brinquedo|infantil|crianca|criancas|bebe|bebê|livro infantil|educativo)\b/.test(t))
    return { global_category1:"Toys & Hobbies",global_category2:null,global_category3:null };
  return { global_category1:null,global_category2:null,global_category3:null };
}
export function mapShopeeApiProduct(node) {
  const salePrice = Number(node?.priceMin ?? node?.priceMax ?? 0);
  const discount = normalizeShopeeDiscount(node?.priceDiscountRate);
  if (!node?.itemId || !node?.productName || !node?.offerLink || !node?.imageUrl || !Number.isFinite(salePrice) || salePrice <= 0) return null;
  const hints = inferShopeeCategoryHints(node.productName);
  return {
    itemid:String(node.itemId),title:String(node.productName),
    price:salePrice,sale_price:salePrice,discount_percentage:discount,
    item_rating:node?.ratingStar ?? null,shop_name:node?.shopName ?? null,
    product_link:node?.productLink ?? null,affiliate_url:node?.offerLink ?? null,
    product_short_link:node?.offerLink ?? null,image_link:node?.imageUrl ?? null,
    global_category1:hints.global_category1,global_category2:hints.global_category2,global_category3:hints.global_category3,
    description:null,
    _mavuri_api:{
      source:"shopee_productOfferV2",sales:node?.sales ?? null,
      commission_rate:node?.commissionRate ?? null,
      seller_commission_rate:node?.sellerCommissionRate ?? null,
      shopee_commission_rate:node?.shopeeCommissionRate ?? null,
      commission:node?.commission ?? null,shop_id:node?.shopId ?? null,
      shop_type:node?.shopType ?? null,period_start_time:node?.periodStartTime ?? null,
      period_end_time:node?.periodEndTime ?? null
    }
  };
}
// Mirrors V85's source lists, pages and unique-item candidate pool.
// The existing flow-shopee-ingest remains the authority for selected count (<=8).
export const SHOPEE_V85_SPECS = Object.freeze([
  { label:"top-performance",listType:2,sortType:2 },
  { label:"maior-comissao",listType:1,sortType:5 },
  { label:"recomendados",listType:0,sortType:1 }
]);
export function collectUniqueOffers(nodes, limit = 80) {
  const unique = new Map();
  for(const node of nodes || []) {
    const offer = mapShopeeApiProduct(node);
    if (!offer) continue;
    if (!unique.has(offer.itemid)) unique.set(offer.itemid,offer);
    if(unique.size >= limit) break;
  }
  return [...unique.values()];
}
export function previewSummary(offers) {
  const rows = Array.isArray(offers) ? offers : [];
  return {
    candidates:rows.length,
    discount_at_least_10:rows.filter(x=>Number(x.discount_percentage || 0) >= 10).length,
    affiliate_links_present:rows.filter(x=>Boolean(x.affiliate_url)).length,
    categories:rows.reduce((a,x)=>{const k=x.global_category1||"unclassified";a[k]=(a[k]||0)+1;return a;},{}),
    sample:rows.slice(0,10).map(x=>({
      itemid:x.itemid,title:x.title.slice(0,150),price:x.price,
      discount_percent:x.discount_percentage,category:x.global_category1,
      has_affiliate_link:Boolean(x.affiliate_url),has_image:Boolean(x.image_link)
    }))
  };
}

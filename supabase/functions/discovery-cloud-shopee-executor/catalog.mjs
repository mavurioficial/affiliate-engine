import {classifyShopee} from "./shopee-production-rules.mjs";
export function inferShopeeCategoryHints(title) {
  const t = String(title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // High-confidence hints from observed Shopee preview samples. Keep ambiguous products unclassified.
  if (/\b(arvore de natal|pinheiro de natal|guirlanda de natal|enfeite de natal|ornamento natalino|decoracao natalina|pisca pisca)\b/.test(t))
    return {global_category1:"Home & Living",global_category2:"Decoration",global_category3:null};
  if (/\b(toalha de banho|toalha banho|toalha de rosto|toalha rosto|jogo de toalhas|toalha gigante|toalha banhao)\b/.test(t))
    return {global_category1:"Home & Living",global_category2:"Bedding",global_category3:null};
  if (/\b(esfregao|mop giratorio|mop spray|vassoura|rodo|espanador|limpador de piso|limpeza domestica)\b/.test(t))
    return {global_category1:"Home & Living",global_category2:"Home Care Supplies",global_category3:null};
  if (/\b(fatiador|cortador de legumes|descascador|ralador|mandolina de cozinha|espremedor manual)\b/.test(t))
    return {global_category1:"Home & Living",global_category2:"Kitchenware",global_category3:null};
  if (/\b(bicicleta ergometrica|esteira ergometrica|equipamento fitness|halteres|halter|creatina|whey protein|peso de academia)\b/.test(t))
    return {global_category1:"Sports & Outdoors",global_category2:null,global_category3:null};
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

export function newCatalogRow(c,{owner,marketplace,account,categories}){
 if(!c.title||c.title.length<8||!c.image.startsWith('https://')||!c.productUrl.startsWith('https://'))return null;
 const hints=inferShopeeCategoryHints(c.title);
 const classification=classifyShopee({title:c.title,...hints});
 const category=categories.find(x=>x.active&&x.slug===classification.categorySlug);
 if(!category||category.slug==='outros')return null;
 return {user_id:owner,marketplace_id:marketplace,affiliate_account_id:account,source_type:'import',source_ref:c.id,title:c.title,price:c.price,discount_percent:c.discount,affiliate_url:c.url,product_url:c.productUrl,image_url:c.image,status:'captured',mavuri_category_id:category.id,mavuri_tags:classification.tags,metadata:{shopee:{...hints,item_rating:c.rating,source:'signed_affiliate_api'},mavuri:{category_slug:classification.categorySlug,tags:classification.tags,classification_source:'shopee_cloud_api'}},captured_at:new Date().toISOString()};
}

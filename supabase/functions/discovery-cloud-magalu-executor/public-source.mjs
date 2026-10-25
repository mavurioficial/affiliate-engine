// Public preview only. No Telegram session, browser, database or publisher.
export function decodeHtml(s) {
  return String(s).replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
    const v = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1),16) : Number(n);
    return v > 0 && v <= 0x10ffff ? String.fromCodePoint(v) : '';
  }).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
}
export function publicMessages(html) {
  const rows=[];
  for(const chunk of html.split('data-post="').slice(1)) {
    const post=chunk.match(/^parceiromagaludivulgador\/(\d+)"/);
    const date=chunk.match(/<time\b[^>]*datetime="([^"]+)"/);
    const body=chunk.match(/<div class="tgme_widget_message_text[^\"]*"[^>]*>([\s\S]*?)<\/div>/);
    if(!post||!date||!body)continue;
    rows.push({id:post[1],date:date[1],text:decodeHtml(body[1].replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,''))});
  }
  return rows;
}
export function storeLinks(html, code, store='magazinemavuri') {
  const found=[];
  for(const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const u=new URL(decodeHtml(match[1]),`https://www.magazinevoce.com.br/${store}/`);
      if(u.protocol==='https:'&&['www.magazinevoce.com.br','magazinevoce.com.br'].includes(u.hostname)&&u.pathname.startsWith(`/${store}/`)&&u.pathname.toLowerCase().includes(`/p/${code.toLowerCase()}/`))found.push(u.href);
    }catch{}
  }
  return [...new Set(found)];
}
export async function boundedGet(url) {
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});
  // Do not follow redirects to arbitrary hosts, or ingest unbounded responses.
  if(!response.ok){await response.body?.cancel();return {status:response.status,html:'',redirect:response.status>=300&&response.status<400};}
  const reader=response.body.getReader();let bytes=0;const chunks=[];
  try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2500000)throw Error('response_too_large');chunks.push(value);}}finally{await reader.cancel();}
  const all=new Uint8Array(bytes);let pos=0;for(const x of chunks){all.set(x,pos);pos+=x.length;}
  return {status:response.status,html:new TextDecoder().decode(all),bytes};
}
export function productData(html, code, url) {
  const products=[];
  const walk=(node,depth=0)=>{
    if(!node||depth>16)return;
    if(Array.isArray(node)){for(const n of node)walk(n,depth+1);return;}
    if(typeof node!=='object')return;
    if([node['@type']].flat().some(t=>String(t).toLowerCase()==='product'))products.push(node);
    for(const key of ['@graph','mainEntity','itemListElement','item'])if(node[key])walk(node[key],depth+1);
  };
  for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try{walk(JSON.parse(m[1]));}catch{}
  }
  const matches=products.filter(p=>String(p.sku||p.productID||'').toLowerCase()===code.toLowerCase()||String(p.url||'').toLowerCase().includes(`/p/${code.toLowerCase()}/`));
  // A single Product on an exact product URL is identifiable; do not pick
  // an arbitrary recommendation from an ItemList or a search result.
  const p=matches.length===1?matches[0]:products.length===1&&!products[0].sku&&!products[0].productID&&url.toLowerCase().includes(`/p/${code.toLowerCase()}/`)?products[0]:null;
  if(!p)return {product_identified:false,jsonld_products:products.length};
  const offers=[p.offers].flat().filter(Boolean);
  const priced=offers.filter(o=>o.priceCurrency==='BRL'&&Number(o.price)>0);
  const price=priced.length===1?Number(priced[0].price):null;
  const image=[p.image].flat().map(i=>typeof i==='string'?i:i?.url).find(i=>{try{return new URL(i).protocol==='https:';}catch{return false;}})||null;
  return {product_identified:true,jsonld_products:products.length,title:String(p.name||'').slice(0,260),title_present:typeof p.name==='string'&&p.name.length>=8,price,image,image_present:!!image,availability:priced.length===1?String(priced[0].availability||'').split('/').pop():null};
}


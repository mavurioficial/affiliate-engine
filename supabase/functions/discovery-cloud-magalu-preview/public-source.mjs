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

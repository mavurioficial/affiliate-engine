import {parseMagaluOfferMessage} from './parser.mjs';
import {parseMagaluCouponsFromMessage} from './coupons.mjs';
import {publicMessages,storeLinks,boundedGet,productData} from './public-source.mjs';
const publicBase='https://t.me/s/parceiromagaludivulgador';
export async function collectPublicHistory({now=Date.now(),get=boundedGet,maxPages=13}={}){
 const unique=new Map();let before=null,complete=false,pages=0;
 for(;pages<maxPages;){
  const r=await get(publicBase+(before?'?before='+before:''));pages++;
  if(r.status!==200)throw Error('telegram_http_'+r.status);
  const rows=publicMessages(r.html);if(!rows.length)throw Error('telegram_empty_or_changed');
  const oldest=Math.min(...rows.map(r=>Number(r.id)));let added=0;
  for(const row of rows){if(!unique.has(row.id)){unique.set(row.id,row);added++;}}
  if(rows.some(r=>Date.parse(r.date)<now-24*3600000)){complete=true;break;}
  if(!added||(before&&oldest>=Number(before)))break;
  before=String(oldest);
 }
 const allRecent=[...unique.values()].filter(r=>Date.parse(r.date)<=now&&Date.parse(r.date)>=now-24*3600000).sort((a,b)=>Number(b.id)-Number(a.id));
 if(allRecent.length>250)complete=false;
 const recent=allRecent.slice(0,250);
 return {rows:recent,pages,complete,oldest:recent.at(-1)?.date||null};
}
export function candidatesFromRows(rows){
 const offers=new Map(),coupons=new Map();let linkOnly=0,campaigns=0;
 for(const row of rows){
  const o=parseMagaluOfferMessage(row);
  if(/\bC[oó]digos\s*:/i.test(row.text))campaigns++;
  if(o){if(!o.code){linkOnly++;const match=String(o.product_url||'').match(/\/p\/([A-Za-z0-9]{8,14})(?:\/|$)/i);if(match)o.code=match[1];}
   if(o.code&&!offers.has(o.code.toLowerCase()))offers.set(o.code.toLowerCase(),o);
  }
  for(const c of parseMagaluCouponsFromMessage(row))if(!coupons.has(c.code)){
    const list=row.text.match(/\bC[oó]digos\s*:\s*([\s\S]*)/i)?.[1]||'';
    const codes=[...new Set([...list.matchAll(/\b[A-Za-z0-9]{8,14}\b/g)].map(m=>m[0]))];
    if(codes.length)c.eligibility={...c.eligibility,product_codes:codes};
    c.metadata={...c.metadata,source_message_id:row.id,product_restrictions:codes.length>0};
    if(codes.length){c.scope_label='Itens selecionados da campanha';c.terms=row.text.slice(0,4000);}
    coupons.set(c.code,c);
  }
 }
 return {offers:[...offers.values()].sort((a,b)=>b.score-a.score||Date.parse(b.source_message_date)-Date.parse(a.source_message_date)),coupons:[...coupons.values()],linkOnly,campaigns};
}
export function commercialCandidate(o,data,url,now=Date.now()){
 if(!data.product_identified||!data.title_present||!(data.price>0)||!data.image||data.availability!=='InStock')return {reason:'product_data_incomplete'};
 // A quoted Pix/coupon price is valid only when the live product confirms it.
 // Different price: do not retain stale coupon/discount/shipping conditions.
 const matched=Number(o.price)>0&&Math.abs(o.price-data.price)<0.011;
 if(!matched&&o.coupon)return {reason:'coupon_price_not_confirmed'};
 if(Number(o.price)>0&&!matched)return {reason:'announced_price_not_confirmed'};
 const previous=matched&&Number(o.previous_price)>data.price?Number(o.previous_price):null;
 return {offer:{...o,title:data.title,price:data.price,previous_price:previous,discount:previous?Math.round((1-data.price/previous)*100):null,coupon:matched?o.coupon:null,shipping_text:null,installments:null,product_url:url,affiliate_url:url,image_url:data.image,metadata:{...o.metadata,cloud_verified:true,price_source:'product_jsonld',price_checked_at:new Date(now).toISOString(),source_price_matched:matched}}};
}
export async function enrichCandidates(offers,{get=boundedGet,limit=20,store='magazinemavuri'}={}){
 const valid=[],rejected={};let checked=0;
 // Batches of three bound network concurrency and CPU within Edge limits.
 const batch=offers.slice(0,limit);
 for(let i=0;i<batch.length;i+=3){
  const results=await Promise.all(batch.slice(i,i+3).map(async o=>{
   try{
    const search=await get(`https://www.magazinevoce.com.br/${store}/busca/${encodeURIComponent(o.code)}/`);
    if(search.status!==200)return {reason:'store_search_http_'+search.status};
    const links=storeLinks(search.html,o.code,store);if(links.length!==1)return {reason:'product_link_ambiguous'};
    const product=await get(links[0]);if(product.status!==200)return {reason:'store_product_http_'+product.status};
    return commercialCandidate(o,productData(product.html,o.code,links[0]),links[0]);
   }catch{return {reason:'product_fetch_failed'};}
  }));
  for(const r of results){checked++;if(r.offer)valid.push(r.offer);else rejected[r.reason]=(rejected[r.reason]||0)+1;}
 }
 return {offers:valid,checked,rejected,remaining:Math.max(0,offers.length-checked)};
}

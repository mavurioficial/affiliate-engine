import {parseMagaluOfferMessage} from './parser.mjs';
import {publicMessages,storeLinks,boundedGet,productData} from './public-source.mjs';
const expected='3efb0f37ba962d865839b2beeffd672787e652b4059e4de53940403421cfd423';
const reply=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply({ok:false,reason:'post_only'},405);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
 if(hash!==expected)return reply({ok:false,reason:'unauthorized'},401);
 const start=Date.now();
 const flags={publishing:false,scheduled_runs:false,database_writes:0,browser_used:false,telegram_session_used:false};
 try {
  const tg=await boundedGet('https://t.me/s/parceiromagaludivulgador');
  const rows=publicMessages(tg.html);
  const recent=rows.filter(r=>{const age=Date.now()-Date.parse(r.date);return age>=0&&age<=24*3600000;});
  const parsed=recent.map(parseMagaluOfferMessage).filter(Boolean);
  const structured=parsed.filter(o=>o.code&&o.title&&o.price>0);
  const unique=[...new Map(structured.map(o=>[o.code,o])).values()];
  const checks=[];
  for(const o of unique.slice(0,2)) {
   try {
    const page=await boundedGet(`https://www.magazinevoce.com.br/magazinemavuri/busca/${encodeURIComponent(o.code)}/`);
    const links=storeLinks(page.html,o.code);
    let product=null;
    if(links.length===1){
      const direct=await boundedGet(links[0]);
      const data=productData(direct.html,o.code,links[0]);
      const {price,...safe}=data;
      product={http_status:direct.status,...safe,price_present:price>0,source_price_matches:price>0&&Math.abs(price-o.price)<0.011};
    }
    checks.push({http_status:page.status,bytes:page.bytes||0,redirect:!!page.redirect,exact_product_links:links.length,has_jsonld:/application\/ld\+json/i.test(page.html),product});
   }catch{checks.push({error:'store_fetch_failed'});}
  }
  return reply({ok:tg.status===200&&unique.length>0,mode:'magalu_public_preview',...flags,telegram_http_status:tg.status,messages:rows.length,recent_messages:recent.length,structured_offers:structured.length,unique_offers:unique.length,link_only:parsed.length-structured.length,store_checks:checks,coverage:'single_public_page_not_full_runner_history',ready_for_publication:false,elapsed_ms:Date.now()-start});
 }catch{return reply({ok:false,mode:'magalu_public_preview',...flags,reason:'source_probe_failed',elapsed_ms:Date.now()-start},502);}
});

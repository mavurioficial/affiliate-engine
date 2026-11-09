/**
 * Mavuri recurring collection. Reads newest messages from a group already
 * joined by the user's account, resolves Amazon ASINs and submits
 * candidates to Supabase with short-lived GitHub OIDC. No session write,
 * message archival. Source offer text is relayed with Amazon links replaced.
 */
const TARGET='grupotabugado';
const STORE_HOSTS=new Set(['amazon.com.br','www.amazon.com.br','link.amazon','amzn.to','a.co']);
const REDIRECT_HOSTS=new Set([...STORE_HOSTS,'amzlinks.in','www.amzlinks.in']);
const SHORT_HOSTS=new Set(['link.amazon','amzn.to','a.co','amzlinks.in','www.amzlinks.in']);
const URLS=/https?:\/\/[^\s<>"'()[\]]+/giu;
export function safeUrl(raw,allowed=STORE_HOSTS){
 try{const u=new URL(String(raw).trim().replace(/[.,;!?…]+$/g,''));
 if(u.protocol!=='https:'||u.username||u.password||u.port||
 !allowed.has(u.hostname.toLowerCase())||u.href.length>1900)return null;
 return u;}catch{return null;}
}
export function findAmazonLinks(message){
 const values=[...String(message?.message??'').matchAll(URLS)].map(m=>m[0]);
 for(const ent of message?.entities??[])if(typeof ent?.url==='string')values.push(ent.url);
 const links=[],seen=new Set();
 for(const link of values){const u=safeUrl(link);if(!u||seen.has(u.href))continue;
 seen.add(u.href);links.push(u.href);}
 return links;
}

/** Minimal factual product-name extraction. Never store original Telegram text. */
export function extractProductTitle(message){
 const pageTitle=String(message?.media?.webpage?.title||'').replace(/\s+/g,' ').trim();
 const looksLikeProduct=(line)=>line.length>=12 && line.length<=155 &&
   /[A-Za-zÀ-ÿ].*[A-Za-zÀ-ÿ].*[A-Za-zÀ-ÿ]/u.test(line) &&
   !/^(amazon(\.com\.br)?|frete|cupom|promoções?|promoção|preço|oferta|ganhos|link|prime|r\$|https?)/i.test(line);
 if(looksLikeProduct(pageTitle))return pageTitle;
 const lines=String(message?.message||'')
  .replace(/https?:\/\/\S+/giu,' ')
  .split(/[\n\r]+/)
  .map(x=>x.replace(/^[^\p{L}\p{N}]+/gu,'').replace(/\s+/g,' ').trim());
 for(const line of lines){
  if(looksLikeProduct(line) &&
    !/^\s*(?:frete gr[aá]tis|assine|ganhe|leve \d|pague \d|r\$|no pix|c[óo]digo|cupom|desconto|s[óo] hoje)/i.test(line))return line;
 }
 return null;
}


/** Extract product references from Mercado Livre without rewriting affiliate tracking. */
const ML_HOSTS=new Set(['meli.la','merc.li','www.mercadolivre.com.br','mercadolivre.com.br']);
const ML_LIMIT=8;
export function collectMercadoLivreCandidates(messages,minUnixSeconds=0,maxCandidates=ML_LIMIT) {
 const found=[],seen=new Set();
 for(const msg of messages) {
  const id=Number(msg?.id);
  const time=msg?.date instanceof Date?Math.trunc(msg.date.getTime()/1000):Number(msg?.date);
  if(!Number.isSafeInteger(id)||id<=541060||
     (minUnixSeconds&&(!Number.isFinite(time)||time<minUnixSeconds)))continue;
  const urls=[...String(msg?.message||'').matchAll(URLS)].map(match=>match[0]);
  for(const entity of msg?.entities||[])if(typeof entity?.url==='string')urls.push(entity.url);
  const scoped=[],ids=new Set();
  for(const raw of urls) {
   const url=safeUrl(raw,ML_HOSTS);
   if(!url||ids.has(url.href))continue;
   ids.add(url.href);scoped.push(url);
  }
  for(const url of scoped) {
   const key=url.href;
   if(seen.has(key))continue;seen.add(key);
   const match=url.pathname.match(/\/p\/(MLB[0-9]{6,})(?:\/|$)/i);
   found.push({
    source_message_id:id,original_url:key,
    ml_product_id:match?match[1].toUpperCase():null,
    claimed_title:scoped.length===1?extractProductTitle(msg):null
   });
   if(found.length>=Math.min(512,Math.max(1,Number(maxCandidates)||ML_LIMIT)))return found;
  }
 }
 return found;
}

export function getAsin(value){
 const u=safeUrl(value,new Set(['amazon.com.br','www.amazon.com.br']));
 if(!u)return null;
 const m=u.pathname.match(/(?:^|\/)(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i);
 return m?.[1]?.toUpperCase()||null;
}
export async function resolveAmazonAsin(link,request=fetch){
 let u=safeUrl(link);if(!u)return null;const visited=new Set();
 for(let hop=0;hop<5;hop++){
  const asin=getAsin(u.href);if(asin)return asin;
  if(visited.has(u.href)||!SHORT_HOSTS.has(u.hostname.toLowerCase()))return null;
  visited.add(u.href);let response;
  try{
   response=await request(u.href,{method:'GET',redirect:'manual',
    signal:AbortSignal.timeout(10000),headers:{accept:'*/*'}});
   if(![301,302,303,307,308].includes(response.status))return null;
   const target=response.headers.get('location');if(!target)return null;
   const next=safeUrl(new URL(target,u).href,REDIRECT_HOSTS);
   if(!next)return null;u=next;
  }catch{return null;}
  finally{try{await response?.body?.cancel?.();}catch{}}
 }
 return getAsin(u.href);
}
export async function collectCandidates(messages,request=fetch,minUnixSeconds=0){
 const result=[];
 for(const msg of [...messages].reverse()){
  const id=Number(msg?.id);
  const time=msg?.date instanceof Date?Math.trunc(msg.date.getTime()/1000):Number(msg?.date);
  if(!Number.isSafeInteger(id)||id<=541060)continue;
  if(minUnixSeconds&&(!Number.isFinite(time)||time<minUnixSeconds))continue;
  const links=findAmazonLinks(msg),products=[];
  for(const link of links){
   const asin=await resolveAmazonAsin(link,request);
   if(asin&&!products.some(p=>p.asin===asin))products.push({asin,source_link:link});
  }
  if(!products.length)continue;
  result.push({message_id:id,asin:products[0].asin,
   title:products.length===1?extractProductTitle(msg):null,
   source_text:String(msg?.message||'').slice(0,3500),
   products});
 }
 return result;
}

/** Only very specific product families are lightly throttled; all others mirror as before. */
export function amazonFamilyKey(text){
 const n=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ');
 // Narrow groups for closely related products that otherwise arrive consecutively.
 // Ketchup, mayonnaise and mixed kits count as one pantry family for 30 minutes.
 // Toilet-paper brands/pack sizes likewise share a light 30-minute cooldown.
 if(/\b(ketchup|catchup|maionese|maioneses|mayonnaise)\b/.test(n))
   return 'pantry:ketchup-mayonnaise';
 if(/\b(papel higienico|papeis higienicos)\b/.test(n))
   return 'household:toilet-paper';
 if(!/(fralda|pampers|huggies|mamy poko)/.test(n))return null;
 if(n.includes('pampers')&&n.includes('premium care')&&n.includes('pants'))return 'diaper:pampers-premium-care-pants';
 if(n.includes('pampers')&&n.includes('confort sec'))return 'diaper:pampers-confort-sec';
 if(n.includes('huggies')&&n.includes('tripla protecao'))return 'diaper:huggies-tripla-protecao';
 if(n.includes('huggies')&&n.includes('supreme care'))return 'diaper:huggies-supreme-care';
 return null;
}
export function filterAmazonSimilar(candidates,recentFamilies=[]){
 const seen=new Set(recentFamilies.filter(x=>typeof x==='string'));
 const accepted=[],blocked=[];
 for(const c of candidates){
  const key=amazonFamilyKey((c.title||'')+' '+(c.source_text||''));
  if(key&&seen.has(key)){blocked.push({message_id:c.message_id,family:key});continue;}
  if(key)seen.add(key);
  accepted.push({...c,family_key:key});
 }
 return {accepted,blocked};
}
export function isAmazonResumeAfterPause(lastPolledAt,now=Date.now()){
 const last=Date.parse(lastPolledAt||'');
 return Number.isFinite(last)&&last>0&&now-last>90*60000;
}


const ML_RESOLVE_HOSTS=new Set(['meli.la','merc.li','www.mercadolivre.com.br','mercadolivre.com.br','produto.mercadolivre.com.br']);
export function mlDirect(raw){
 const u=safeUrl(raw,ML_RESOLVE_HOSTS);if(!u||!u.hostname.endsWith('mercadolivre.com.br'))return null;
 if(/\/p\/MLB\d{6,}(?:\/|$)/i.test(u.pathname)||/\/MLB-?\d{6,}(?:-|\/|$)/i.test(u.pathname))return u.href;
 return null;
}
export async function resolveML(link,request=fetch){
 let u=safeUrl(link,ML_RESOLVE_HOSTS);const seen=new Set();
 for(let i=0;u&&i<6;i++){
 const direct=mlDirect(u.href);if(direct)return direct;
 if(seen.has(u.href))break;seen.add(u.href);
 let r;
 try{
 r=await request(u.href,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'user-agent':'Mozilla/5.0',accept:'text/html'}});
 if([301,302,303,307,308].includes(r.status)){const target=r.headers.get('location');u=target?safeUrl(new URL(target,u).href,ML_RESOLVE_HOSTS):null;continue}
 if(!r.ok)return null;
 const html=(await r.text()).slice(0,1000000);
 // Only explicit redirect/canonical metadata, never recommendations or title search.
 const urls=[...html.matchAll(/<(?:meta|link)\b[^>]+>/gi)].flatMap(m=>{
 const tag=m[0];if(!/(?:rel=["']canonical|property=["']og:url|http-equiv=["']refresh)/i.test(tag))return [];
 return [...tag.matchAll(/(?:href|content)=["']([^"']+)["']/gi)].map(x=>x[1].replace(/&amp;/g,'&').replace(/^.*?url=/i,''));
 });
 const directURLs=[...new Set(urls.map(mlDirect).filter(Boolean))];
 if(directURLs.length===1)return directURLs[0];
 return null;
 }catch{return null}finally{try{await r?.body?.cancel?.()}catch{}}
 }
 return null;
}
async function mirrorMLSource(client,group,mode){
 const recent=await client.getMessages(group.entity,{limit:100});
 const candidates=[],unresolved=[];
 for(const msg of [...recent].reverse()){
 const date=new Date(msg.date instanceof Date?msg.date.getTime():Number(msg.date)*1000);
 if(Date.now()-date.getTime()>2*3600000)continue;
 const links=[...String(msg.message||'').matchAll(URLS)].map(x=>x[0]);
 for(const e of msg.entities||[])if(e.url)links.push(e.url);
 const ml=[...new Set(links.filter(x=>safeUrl(x,ML_RESOLVE_HOSTS)))];if(!ml.length)continue;
 const products=[];
 for(const link of ml){const resolved=await resolveML(link);if(resolved)products.push({product_url:resolved})}
 // A single-link Telegram preview can provide its exact canonical destination.
 if(!products.length&&ml.length===1){
 const page=msg.media?.webpage;
 if(page&&String(page.url||'')===ml[0]){
 const direct=mlDirect(page.displayUrl)||mlDirect(page.display_url);
 if(direct)products.push({product_url:direct});
 }
 }
 if(products.length!==ml.length){unresolved.push(Number(msg.id));continue}
 candidates.push({message_id:Number(msg.id),source_date:date.toISOString(),source_text:String(msg.message||'').slice(0,3500),products});
 }
 console.log(JSON.stringify({phase:'ml_exact_link_resolution',source_posts:candidates.length+unresolved.length,resolved:candidates.length,unresolved}));
 const selected=filterAmazonSimilar(candidates).accepted;
 for(let i=0;i<selected.length;i+=8){
 const r=await fetch('https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/mavuri-telegram-ml-mirror',{method:'POST',headers:{authorization:'Bearer '+await githubToken(),'content-type':'application/json'},body:JSON.stringify({mode,candidates:selected.slice(i,i+8)}),signal:AbortSignal.timeout(120000)});
 const j=await r.json();console.log(JSON.stringify({phase:'ml_source_mirror',http_status:r.status,...j}));if(!r.ok||!j.ok)throw Error('ML mirror failed');
 }
}

async function githubToken(){
 const endpoint=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
 const secret=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 if(!endpoint||!secret)throw Error('GitHub OIDC missing');
 const u=new URL(endpoint);u.searchParams.set('audience','mavuri-telegram-amazon-onepost');
 const r=await fetch(u,{headers:{authorization:'bearer '+secret},signal:AbortSignal.timeout(12000)});
 const j=await r.json().catch(()=>({}));
 if(!r.ok||typeof j.value!=='string')throw Error('GitHub OIDC unavailable');
 return j.value;
}
const CLOUD_URL='https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/mavuri-telegram-amazon-mirror';
async function cloudRequest(_token,request){
 // GitHub OIDC credentials are short-lived: mint a fresh token for every batch and cursor commit.
 const freshToken=await githubToken();
 const response=await fetch(CLOUD_URL,{method:'POST',headers:{
  authorization:'Bearer '+freshToken,'content-type':'application/json'
 },body:JSON.stringify({workflow_run_id:process.env.GITHUB_RUN_ID,...request}),
 signal:AbortSignal.timeout(120000)});
 const data=await response.json().catch(()=>({ok:false,error:'unexpected_response'}));
 if(!response.ok||!data.ok)throw Error('Cloud '+request.mode+' rejected: '+(data.error||response.status)+' '+(request.mode==='cleanup'?JSON.stringify(data.groups||[]):''));
 return data;
}
async function run(){
 if(process.env.GITHUB_REPOSITORY!=='mavurioficial/affiliate-engine'||
    process.env.GITHUB_REF!=='refs/heads/main')throw Error('Run only on approved main repository');
 const mode=process.env.PILOT_MODE;
 const localHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
 if(mode==='send'&&(localHour<8||localHour>=22)){
  console.log('Outside 08:00–22:00 Brasilia: no publication.');return;
 }
 if(!['preview','send','cleanup','reconcile'].includes(mode))throw Error('Use preview/send/cleanup/reconcile mode');
 if(mode==='cleanup'){
  const token=await githubToken();
  const result=await cloudRequest(token,{mode:'cleanup',confirmed:'EXCLUIR_APENAS_NICHOS'});
  console.log(JSON.stringify({phase:'amazon_mirror_cleanup',...result}));
  return;
 }
 const id=Number(process.env.TG_API_ID||0),hash=process.env.TG_API_HASH||'',
 session=process.env.TG_SESSION_STRING||'';
 if(!Number.isSafeInteger(id)||id<1||!/^[a-f0-9]{32}$/i.test(hash)||session.length<40)
 throw Error('Telegram secrets not set');
 const {TelegramClient}=await import('teleproto');
 const {StringSession}=await import('teleproto/sessions');
 const token=await githubToken();
 if(mode==='reconcile'){
  const state=await cloudRequest(token,{mode:'reconcile_get'});
  const generalId='3d832e75-a1ac-4e3c-bd4a-b1c357bd48ed';
  const pending=(state.pending||[]).filter(x=>x.channel_id===generalId);
  if(!pending.length){console.log(JSON.stringify({phase:'amazon_reconcile',pending:0}));return}
  const clientRecon=new TelegramClient(new StringSession(session),id,hash,{connectionRetries:2,receiveUpdates:false});
  const findings=[];
  try{
   await clientRecon.connect();
   const dialogs=await clientRecon.getDialogs({limit:500});
   const general=dialogs.find(d=>String(d?.entity?.id||'')==='3537630337');
   if(!general)throw Error('Mavuri Ofertas group missing in Telegram personal session');
   const oldest=Math.min(...pending.map(x=>new Date(x.created_at).getTime()))-180000;
   const recent=[];
   let offsetId=0,complete=false;
   for(let pageNo=0;pageNo<30;pageNo++){
    const page=await clientRecon.getMessages(general.entity,{limit:100,...(offsetId?{offsetId}:{})});
    if(!page.length){complete=true;break}
    for(const msg of page){
     const when=msg.date instanceof Date?msg.date.getTime():Number(msg.date)*1000;
     if(when<oldest){complete=true;break}
     recent.push(msg);
    }
    if(complete||page.length<100){complete=true;break}
    const last=Number(page[page.length-1]?.id);
    if(!Number.isSafeInteger(last)||(offsetId&&last>=offsetId))throw Error('History pagination failed');
    offsetId=last;
   }
   for(const p of pending){
    const created=new Date(p.created_at).getTime();
    const matched=recent.find(msg=>{
     const when=msg.date instanceof Date?msg.date.getTime():Number(msg.date)*1000;
     const body=String(msg.message||'');
     return Math.abs(when-created)<180000&&
      body.includes('/dp/'+p.asin+'/ref=nosim?tag=lucasbrasil0e-20');
    });
    if(matched)findings.push({id:p.id,status:'sent',telegram_message_id:Number(matched.id)});
    else if(complete)findings.push({id:p.id,status:'retryable'});
   }
   console.log(JSON.stringify({phase:'telegram_reconcile_history',pending:pending.length,
    scanned:recent.length,complete,found:findings.filter(x=>x.status==='sent').length,
    safely_missing:findings.filter(x=>x.status==='retryable').length}));
  }finally{await clientRecon.disconnect().catch(()=>{})}
  if(findings.length){
   const outcome=await cloudRequest(token,{mode:'reconcile_apply',
    confirmed:'VERIFICADO_HISTORICO_TELEGRAM',findings});
   console.log(JSON.stringify({phase:'amazon_reconcile_applied',...outcome}));
  }
  return;
 }
 const cursor=await cloudRequest(token,{mode:'cursor_get'});
 const lastId=Number(cursor.last_message_id);
 if(!Number.isSafeInteger(lastId)||lastId<541060)
  throw Error('Invalid source cursor');
 console.log(JSON.stringify({phase:'telegram_cursor',last_message_id:lastId,
  initialized:cursor.initialized}));
 const client=new TelegramClient(new StringSession(session),id,hash,{connectionRetries:2,receiveUpdates:false});
 const resumed=mode==='send'&&isAmazonResumeAfterPause(cursor.last_polled_at);
 const resumeUnixSeconds=Math.floor(Date.now()/1000);
 let candidates=[],mlCandidates=[],highestSeen=lastId;
 try{
  await client.connect();
  if(!await client.getMe())throw Error('Telegram session invalid');
  const dialogs=await client.getDialogs({limit:500});

  // Read only the named official coupon channel already joined by this account.
  // Coupon failures are isolated so offer collection can continue.
  try {
   const official=dialogs.filter(d=>/^Afiliados e Criadores Mercado(?: Livre)?(?: Brasil)?\s*(?:🇧🇷)?$/i.test(String(d?.entity?.title||d?.title||'').trim()));
   if(official.length!==1)console.log(JSON.stringify({phase:'ml_official_coupons',source_matches:official.length,status:'source_unavailable_or_ambiguous'}));
   else {
    const source=official[0], recent=await client.getMessages(source.entity,{limit:30});
    const messages=recent.map(m=>({id:Number(m.id),date:new Date(m.date instanceof Date?m.date.getTime():Number(m.date)*1000).toISOString(),text:String(m.message||'').slice(0,12000)}))
     .filter(m=>Date.now()-Date.parse(m.date)<86400000&&/válid[oa]s?\s+(?:somente\s+em|at[eé]|em)/i.test(m.text)).slice(0,12);
    const response=await fetch('https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/mavuri-ml-private-coupons',{
     method:'POST',headers:{authorization:'Bearer '+await githubToken(),'content-type':'application/json'},
     body:JSON.stringify({mode,source_title:String(source.entity.title||source.title).trim(),source_id:String(source.entity.id),messages}),
     signal:AbortSignal.timeout(90000)});
    const result=await response.json();
    console.log(JSON.stringify({phase:'ml_official_coupons',source_title:String(source.entity.title||source.title),source_id:String(source.entity.id),messages_checked:messages.length,http_status:response.status,...result}));
   }
  }catch{console.log(JSON.stringify({phase:'ml_official_coupons',status:'collection_failed_check_next_cycle'}))}
  const group=dialogs.find(d=>String(d?.entity?.username||'').toLowerCase()==='grupotabugado');
  if(!group)throw Error('Source group unavailable');
  try{await mirrorMLSource(client,group,mode)}catch(e){console.log(JSON.stringify({phase:'ml_mirror_error',error:String(e.message)}))}
  let offsetId=0;
  const msgs=[];
  while(true){
   const page=await client.getMessages(group.entity,{limit:100,...(offsetId?{offsetId}:{})});
   if(!page.length)break;
   let reached=false;
   for(const m of page){
    const messageId=Number(m.id);
    if(messageId<=lastId){reached=true;break}
    if(!Number.isSafeInteger(messageId))throw Error('Invalid Telegram message ID');
    highestSeen=Math.max(highestSeen,messageId);
    msgs.push(m);
   }
   if(reached||page.length<100)break;
   const last=Number(page[page.length-1]?.id);
   if(!Number.isSafeInteger(last)||(offsetId!==0&&last>=offsetId))
    throw Error('Telegram pagination failed');
   offsetId=last;
  }
  candidates=await collectCandidates(msgs,fetch,resumed?resumeUnixSeconds:0);
  mlCandidates=collectMercadoLivreCandidates(msgs,0,256);
  if(mlCandidates.length>=256)throw Error('Mercado Livre candidate backlog too large - cursor not advanced');
  const familyFiltered=filterAmazonSimilar(candidates,cursor.recent_amazon_families||[]);
  candidates=familyFiltered.accepted;
  console.log(JSON.stringify({phase:'amazon_freshness_and_family',resumed,
   skipped_similar:familyFiltered.blocked.length,retained_amazon:candidates.length,
   mercato_candidates:mlCandidates.length}));
  console.log(JSON.stringify({phase:'telegram_cloud_read',group:'@GRUPOTABUGADO',
   messages_checked:msgs.length,amazon_products_resolved:candidates.length,
   asin_ids:candidates.map(c=>c.asin),
   mercado_livre_links_detected:mlCandidates.length,highest_message_id:highestSeen,
   previous_cursor:lastId,text_saved:false,session_saved:false}));
 }finally{await client.disconnect().catch(()=>{});}
 if(!candidates.length&&!mlCandidates.length) console.log('No recent Amazon or Mercado Livre candidate; reporting empty cycle to cloud.');
 let sent=0,skipped=0,unconfirmed=0;
 // A chunk is only a transport unit, never a selection or publication quota.
 const batches=[];
 let batch=[];
 for(const item of candidates){
  const trial=[...batch,item];
  if(batch.length&&(batch.length>=8||JSON.stringify(trial).length>50000)){
   batches.push(batch);batch=[];
  }
  batch.push(item);
 }
 if(batch.length)batches.push(batch);
 if(!batches.length)batches.push([]);
 for(let i=0;i<batches.length;i++){
  const data=await cloudRequest(token,{mode,confirmed:mode==='send'?'PUBLICAR':null,
   batch_index:i,candidates:batches[i],ml_candidates:i===0?mlCandidates.slice(0,8):[]});
  console.log(JSON.stringify({phase:'mavuri_amazon_mirror_'+mode,batch:i,...data}));
  sent+=Number(data.publications_sent||0);
  skipped+=Number(data.skipped||0);
  unconfirmed+=Number(data.unconfirmed||0);
 }
 // Save every Mercado Livre candidate separately; the mirror's cursor must not lose
 // older ML offers merely because Amazon resumed without replaying its backlog.
 for(let offset=8;offset<mlCandidates.length;offset+=8){
   const data=await cloudRequest(token,{mode,confirmed:mode==='send'?'PUBLICAR':null,
    batch_index:0,candidates:[],ml_candidates:mlCandidates.slice(offset,offset+8)});
   unconfirmed+=Number(data.unconfirmed||0);
 }
 // The cursor only advances once every delivery has been confirmed.
 // On incomplete deliveries, the next run rereads the same range; audit keys prevent re-sends.
 if(mode==='send'&&unconfirmed===0&&highestSeen>lastId){
  const committed=await cloudRequest(token,{mode:'cursor_commit',
   confirmed:'PUBLICAR',last_message_id:highestSeen});
  console.log(JSON.stringify({phase:'telegram_cursor_committed',...committed}));
  }else if(mode==='send'&&unconfirmed===0){
  const heartbeat=await cloudRequest(token,{mode:'cursor_heartbeat',confirmed:'PUBLICAR'});
  console.log(JSON.stringify({phase:'amazon_cursor_heartbeat',...heartbeat}));
 }else if(mode==='send'&&unconfirmed>0){
  console.log(JSON.stringify({phase:'telegram_cursor_held',unconfirmed,
   highest_message_id:highestSeen}));
 }
 console.log(JSON.stringify({phase:'mirror_completed',source_messages:candidates.length,
  telegram_deliveries:sent,skipped,unconfirmed,batches:batches.length}));

}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 run().catch(e=>{console.error('Pilot failed:',e?.message||'unknown');process.exitCode=1});
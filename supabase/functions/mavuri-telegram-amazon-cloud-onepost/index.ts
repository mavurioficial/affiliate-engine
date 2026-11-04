import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.1';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.0.12';

const AUD='mavuri-telegram-amazon-onepost';
const REPO='mavurioficial/affiliate-engine',REPO_ID='1346309308',ACTOR_ID='321065255';
const REF='refs/heads/main';
const WORKFLOW=REPO+'/.github/workflows/mavuri-telegram-amazon-onepost.yml@'+REF;
const CHANNEL='3d832e75-a1ac-4e3c-bd4a-b1c357bd48ed';
const CHAT='-1003537630337',USER='70ec226e-e169-46d0-b884-3452870b40c0',TAG='mavuri0a-20';
const KEYS=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json','cache-control':'no-store'}
});
const env=(key:string)=>Deno.env.get(key)||'';
const svc=(()=>{try{return JSON.parse(env('SUPABASE_SECRET_KEYS'))?.default||''}catch{return ''}})()||env('SUPABASE_SERVICE_ROLE_KEY');
const base=env('SUPABASE_URL'),telegramToken=env('TELEGRAM_BOT_TOKEN');
async function authenticate(req:Request){
 const header=req.headers.get('authorization')||'';
 if(!/^Bearer\s+\S+$/.test(header))throw Error('missing');
 const {payload}=await jwtVerify(header.slice(7),KEYS,{
  issuer:'https://token.actions.githubusercontent.com',audience:AUD,clockTolerance:'30s'
 });
 if(payload.repository!==REPO||String(payload.repository_id)!==REPO_ID||
 String(payload.actor_id)!==ACTOR_ID||payload.ref!==REF||
 payload.workflow_ref!==WORKFLOW||!['workflow_dispatch','schedule'].includes(String(payload.event_name))||
 payload.sub!==`repo:mavurioficial@321065255/affiliate-engine@1346309308:ref:${REF}`||
 String(payload.run_attempt)!=='1'||payload.runner_environment!=='github-hosted')throw Error('claims');
 if(!/^[0-9]{5,20}$/.test(String(payload.run_id||'')))throw Error('run_id');
 return String(payload.run_id);
}
function parseCandidates(raw:unknown){
 if(!Array.isArray(raw)||raw.length>8)return null;
 const out:{message_id:number,asin:string,title:string|null}[]=[];
 for(const item of raw){
  const id=Number(item?.message_id),asin=item?.asin;
  if(!Number.isSafeInteger(id)||id<=541060||id>5000000||
   typeof asin!=='string'||!/^[A-Z0-9]{10}$/.test(asin))return null;
  const rawTitle=typeof item?.title==='string'?item.title:'';
  const title=rawTitle.replace(/[<>\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,155);
  out.push({message_id:id,asin,title:title.length>=12?title:null});
 }
 return out;
}

function parseMlCandidates(raw:unknown){
 if(!Array.isArray(raw)||raw.length>8)return null;
 const seen=new Set<string>();
 const result:{source_message_id:number,original_url:string,source_message_url:string,claimed_title:string|null,ml_product_id:string|null}[]=[];
 const hosts=new Set(['meli.la','merc.li','www.mercadolivre.com.br','mercadolivre.com.br']);
 for(const item of raw){
  const id=Number(item?.message_id);
  const orig=String(item?.original_url||'');
  let u:URL;
  try{u=new URL(orig)}catch{return null}
  if(!Number.isSafeInteger(id)||id<=541060||id>5000000||
    u.protocol!=='https:'||!hosts.has(u.hostname.toLowerCase())||
    u.username||u.password||u.port||orig.length>1200)return null;
  const directId=u.pathname.match(/\/p\/(MLB[0-9]{6,})(?:\/|$)/i)?.[1]?.toUpperCase()||null;
  if(item.ml_product_id && item.ml_product_id!==directId)return null;
  const key=id+':'+orig;
  if(seen.has(key))continue;seen.add(key);
  const rawTitle=typeof item.claimed_title==='string'?item.claimed_title:'';
  const title=rawTitle.replace(/[<>\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,155);
  result.push({
   source_message_id:id,original_url:u.href,
   source_message_url:'https://t.me/GRUPOTABUGADO/'+id,
   claimed_title:title.length>=12?title:null,ml_product_id:directId
  });
 }
 return result;
}

async function telegram(method:string,data:unknown){
 const r=await fetch('https://api.telegram.org/bot'+telegramToken+'/'+method,{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify(data),signal:AbortSignal.timeout(12000)
 });
 const j=await r.json().catch(()=>null);
 if(!r.ok||j?.ok!==true)throw Error('telegram_not_confirmed');
 return j.result;
}
Deno.serve(async request=>{
 if(request.method!=='POST')return json({ok:false,error:'post_only'},405);
 if(!base||!svc||!telegramToken)return json({ok:false,error:'backend_not_configured'},503);
 let runId:string;
 try{runId=await authenticate(request)}catch{return json({ok:false,error:'workflow_identity_denied'},401)}
 let body:any;
 try{
  const raw=await request.text();
  if(raw.length>16000)return json({ok:false,error:'body_too_large'},413);
  body=JSON.parse(raw);
 }catch{return json({ok:false,error:'bad_request'},400)}
 if(!['preview','send'].includes(body?.mode))return json({ok:false,error:'invalid_mode'},400);
 if(body.workflow_run_id!==runId)return json({ok:false,error:'run_id_mismatch'},403);
 if(body.mode==='send'&&body.confirmed!=='PUBLICAR')return json({ok:false,error:'send_not_confirmed'},400);
 const candidates=parseCandidates(body.candidates);
 const mlCandidates=parseMlCandidates(body.ml_candidates||[]);
 if(!candidates||!mlCandidates)return json({ok:false,error:'invalid_candidates'},400);
 if(!candidates.length&&!mlCandidates.length)return json({ok:true,sent:false,no_recent_products:true});
 const db=createClient(base,svc,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:ch,error:chErr}=await db.from('flow_channels')
  .select('id,user_id,name,type,status,external_ref').eq('id',CHANNEL).eq('user_id',USER).maybeSingle();
 if(chErr||!ch||ch.name!=='Mavuri Ofertas'||ch.type!=='telegram'||
 ch.status!=='connected'||ch.external_ref!==CHAT)return json({ok:false,error:'destination_not_verified'},409);
 const {data:market,error:mErr}=await db.from('flow_marketplaces').select('id')
  .eq('slug','amazon').maybeSingle();
 if(mErr||!market)return json({ok:false,error:'market_not_configured'},409);
 const {data:account,error:aErr}=await db.from('flow_affiliate_accounts')
  .select('settings').eq('marketplace_id',market.id).eq('user_id',USER)
  .in('status',['active','connected']).maybeSingle();
 if(aErr||!account||account.settings?.tracking_id!==TAG)
  return json({ok:false,error:'affiliate_tag_not_connected'},409);
 let mlCaptured=0;
 if(body.mode==='send'&&mlCandidates.length){
  const {data:inserted,error:mlError}=await db.from('mavuri_ml_telegram_candidates')
    .upsert(mlCandidates,{onConflict:'source_message_id,original_url',ignoreDuplicates:true})
    .select('id');
  if(mlError)return json({ok:false,error:'ml_candidate_storage_failed'},503);
  mlCaptured=inserted?.length||0;
 }
 if(!candidates.length)return json({ok:true,sent:false,
  ml_candidates_collected:mlCandidates.length,ml_new_candidates_stored:mlCaptured,
  no_amazon_product:true});
 const testKey='tgcloudpilot:run:'+runId;
 const {data:previous,error:pErr}=await db.from('mavuri_telegram_onepost_audit')
  .select('status,telegram_message_id').eq('test_key',testKey).maybeSingle();
 if(pErr)return json({ok:false,error:'audit_unavailable'},503);
 if(previous)return json({ok:true,already_attempted:true,sent:false,
  status:previous.status,telegram_message_id:previous.telegram_message_id||null});
 let chosen:{message_id:number,asin:string,title:string|null}|null=null;
 for(const candidate of candidates){
  const {data:old,error:e}=await db.from('mavuri_telegram_onepost_audit')
   .select('status').eq('channel_id',CHANNEL).eq('asin',candidate.asin)
   .in('status',['claimed','sent','unconfirmed']).limit(1).maybeSingle();
  if(e)return json({ok:false,error:'offer_audit_unavailable'},503);
  if(!old){chosen=candidate;break}
 }
 if(!chosen)return json({ok:true,no_new_product:true,sent:false,mode:body.mode,
 ml_candidates_collected:mlCandidates.length,ml_new_candidates_stored:mlCaptured});
 const url='https://www.amazon.com.br/dp/'+chosen.asin+'/ref=nosim?tag='+TAG;
 if(body.mode==='preview')return json({ok:true,sent:false,mode:'preview',
  asin:chosen.asin,source_message_id:chosen.message_id,destination:'Mavuri Ofertas',
  affiliate_link:url,title:chosen.title,price_claimed:false,
 ml_candidates_collected:mlCandidates.length,ml_new_candidates_stored:mlCaptured});
 try{
  const chat=await telegram('getChat',{chat_id:CHAT});
  if(String(chat?.id)!==CHAT)return json({ok:false,error:'wrong_telegram_chat'},409);
 }catch{return json({ok:false,error:'telegram_chat_unavailable'},503)}
 const {error:insertError}=await db.from('mavuri_telegram_onepost_audit').insert({
  test_key:testKey,user_id:USER,channel_id:CHANNEL,asin:chosen.asin,status:'claimed'
 });
 if(insertError)return json({ok:false,error:'onepost_already_claimed'},409);
 const productName=chosen.title?chosen.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):null;
 const text=[
  '🛍️ <b>Achadinho Amazon | Mavuri</b>',
  '',
  '📦 <b>'+(productName||'Produto Amazon')+'</b>',
  '',
  '👉 Confira o produto, o preço e as condições diretamente na Amazon:',
  '<a href="'+url+'"><b>VER PRODUTO NA AMAZON</b></a>',
  '',
  '<i>#pub | Como associado da Amazon, ganho com compras qualificadas.</i>'
 ].join('\n');
 try{
  const result=await telegram('sendMessage',{
   chat_id:CHAT,text,parse_mode:'HTML',disable_web_page_preview:false
  });
  const messageId=String(result?.message_id||'');
  const {error:saveError}=await db.from('mavuri_telegram_onepost_audit').update({
   status:'sent',telegram_message_id:messageId,updated_at:new Date().toISOString()
  }).eq('test_key',testKey).eq('status','claimed');
  return json({ok:true,sent:true,asin:chosen.asin,
   source_message_id:chosen.message_id,telegram_message_id:messageId,
   product_title_used:chosen.title||null,
   affiliate_link:url,channel:'Mavuri Ofertas',audit_confirmed:!saveError,
 ml_candidates_collected:mlCandidates.length,ml_new_candidates_stored:mlCaptured});
 }catch{
  await db.from('mavuri_telegram_onepost_audit').update({
   status:'unconfirmed',error_code:'telegram_send_unconfirmed',updated_at:new Date().toISOString()
  }).eq('test_key',testKey).eq('status','claimed');
  return json({ok:false,error:'delivery_unconfirmed_do_not_retry',possibly_sent:true},502);
 }
});
// One-off manual layout comparison. Does not modify the recurring Amazon workflow.
import sharp from 'sharp';
const GENERAL_ID='3537630337', SOURCE_ID=546446, ORIGINAL_ID=10027, ASIN='B07NGSST3K';
const mode=process.env.TEST_MODE;
if(!['preview','publish'].includes(mode))throw Error('invalid mode');
if(process.env.GITHUB_REPOSITORY!=='mavurioficial/affiliate-engine'||process.env.GITHUB_REF!=='refs/heads/main')throw Error('unauthorized repository');
const {TelegramClient}=await import('teleproto');
const {StringSession}=await import('teleproto/sessions');
const apiId=Number(process.env.TG_API_ID), apiHash=process.env.TG_API_HASH, session=process.env.TG_SESSION_STRING;
if(!Number.isSafeInteger(apiId)||!apiHash||!session)throw Error('telegram client configuration unavailable');
const cli=new TelegramClient(new StringSession(session),apiId,apiHash,{connectionRetries:2,receiveUpdates:false});
async function getImageCandidate(m,label){
 const options=[m?.media?.photo,m?.media?.webpage?.photo,m?.media].filter(Boolean);
 for(const obj of options){
  try{
   const downloaded=await cli.downloadMedia(obj,{workers:1});
   if(!downloaded)continue;
   const buf=Buffer.isBuffer(downloaded)?downloaded:Buffer.from(downloaded);
   const metadata=await sharp(buf,{limitInputPixels:12000000}).metadata();
   if(metadata.width>150&&metadata.height>150&&buf.length<5500000){
    console.log(JSON.stringify({phase:'image_source',label,width:metadata.width,height:metadata.height,bytes:buf.length}));
    return {buf,width:metadata.width,height:metadata.height,source:label};
   }
  }catch(e){console.log(JSON.stringify({phase:'image_candidate_unusable',label,reason:String(e.message||e).slice(0,95)}));}
 }
 return null;
}
let chosen, caption, original, captionEntities;
try{
 await cli.connect();
 if(!await cli.getMe())throw Error('Telegram session not authenticated');
 const dialogs=await cli.getDialogs({limit:500});
 const general=dialogs.find(d=>String(d?.entity?.id||'')===GENERAL_ID);
 const source=dialogs.find(d=>String(d?.entity?.username||'').toLowerCase()==='grupotabugado');
 if(!general||!source)throw Error('required Telegram dialogs unavailable');
 const [generalMsg]=await cli.getMessages(general.entity,{ids:[ORIGINAL_ID]});
 const [sourceMsg]=await cli.getMessages(source.entity,{ids:[SOURCE_ID]});
 if(Number(generalMsg?.id)!==ORIGINAL_ID||Number(sourceMsg?.id)!==SOURCE_ID)throw Error('original source message not found');
 const recentTest=await cli.getMessages(general.entity,{limit:100});
 const existingTest=recentTest.filter(m=>String(m.message||'').includes('🧪 TESTE DE LAYOUT — AMAZON | MAVURI'));
 console.log(JSON.stringify({phase:'telegram_history_safety',scanned:recentTest.length,existing_test_messages:existingTest.map(m=>Number(m.id))}));
 if(existingTest.length)throw Error('test already exists in Telegram history, refusing duplicate');
 original=String(generalMsg.message||'').trim();
 if(!original.includes('/dp/'+ASIN+'/ref=nosim?tag=lucasbrasil0e-20'))throw Error('message affiliate destination mismatch');
 if(!String(sourceMsg.message||'').toLowerCase().includes('amazon') &&
    !String(sourceMsg.message||'').includes('amzn.to') && !String(sourceMsg.message||'').includes('link.amazon'))throw Error('unexpected source text');
 caption='🧪 TESTE DE LAYOUT — AMAZON | MAVURI\n\n'+original;
 const prefixLen=caption.length-original.length;
 captionEntities=(generalMsg.entities||[]).flatMap(e=>{
  const name=String(e.className||e.constructor?.name||'').replace(/^MessageEntity/,'').toLowerCase();
  const type=({bold:'bold',italic:'italic',code:'code',underline:'underline',strike:'strikethrough',strikethrough:'strikethrough',url:'url',texturl:'text_link',spoiler:'spoiler'})[name];
  const off=Number(e.offset),len=Number(e.length);
  if(!type||!Number.isInteger(off)||!Number.isInteger(len)||off<0||len<1||off+len>original.length)return [];
  const data={type,offset:off+prefixLen,length:len};
  if(type==='text_link'){
   const target=String(e.url||'');
   if(!/^https:\/\/(?:www\.)?amazon\.com\.br\//.test(target))return [];
   data.url=target;
  }
  return [data];
 });
 if(caption.length>1024)throw Error('original caption exceeds Telegram 1024 limit; no publication, needs split design');
 const sourcePic=await getImageCandidate(sourceMsg,'source-telegram');
 const generalPic=await getImageCandidate(generalMsg,'existing-amazon-preview');
 let remotePic=null;
 // Prefer a high-resolution image derived from the exact ASIN. Never search by guessed product title.
 for(const host of ['https://images-na.ssl-images-amazon.com','https://m.media-amazon.com']){
  const url=host+'/images/P/'+ASIN+'.01._SCLZZZZZZZ_SX800_.jpg';
  try{
   const res=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'user-agent':'Mozilla/5.0','accept':'image/jpeg'}});
   if(!res.ok)continue;
   const img=Buffer.from(await res.arrayBuffer());
   if(img.length>5000&&img.length<5500000){
    const meta=await sharp(img,{limitInputPixels:12000000}).metadata();
    if(meta.width>=450&&meta.height>=350){
     remotePic={buf:img,width:meta.width,height:meta.height,source:'exact-ASIN-remote'};
     console.log(JSON.stringify({phase:'image_source',label:'exact-ASIN-remote',width:meta.width,height:meta.height,bytes:img.length}));
     break;
    }
   }
  }catch(e){console.log(JSON.stringify({phase:'remote_image_unavailable',reason:String(e.message||e).slice(0,95)}));}
 }
 const available=[sourcePic,remotePic,generalPic].filter(Boolean);
 chosen=available.find(x=>x.width>=450&&x.height>=350)||available[0];
 if(!chosen)throw Error('no product photo available; no public post sent');
 console.log(JSON.stringify({phase:'preflight',mode,source_message_id:SOURCE_ID,original_message_id:ORIGINAL_ID,asin:ASIN,original_length:original.length,caption_length:caption.length,links:(original.match(/https?:\/\//g)||[]).length,selected_image:chosen.source,width:chosen.width,height:chosen.height}));
 const output=await sharp(chosen.buf,{limitInputPixels:12000000}).resize(850,850,{fit:'contain',background:'#ffffff',withoutEnlargement:false}).jpeg({quality:85,mozjpeg:true}).toBuffer();
 console.log(JSON.stringify({phase:'output_photo',format:'jpeg',width:850,height:850,bytes:output.length}));
 if(mode==='publish'){
  const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience','mavuri-telegram-amazon-onepost');
  const idres=await fetch(url,{headers:{authorization:'bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},signal:AbortSignal.timeout(12000)});
  const idbody=await idres.json();
  if(!idres.ok||!idbody.value)throw Error('OIDC unavailable');
  const res=await fetch('https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/mavuri-amazon-photo-test',{
   method:'POST',headers:{authorization:'Bearer '+idbody.value,'content-type':'application/json'},
   body:JSON.stringify({workflow_run_id:process.env.GITHUB_RUN_ID,source_message_id:SOURCE_ID,original_message_id:ORIGINAL_ID,asin:ASIN,caption,caption_entities:captionEntities,photo_b64:output.toString('base64')}),
   signal:AbortSignal.timeout(90000)});
  const body=await res.json().catch(()=>({error:'invalid-json'}));
  console.log(JSON.stringify({phase:'test_publication',http_status:res.status,ok:body.ok,posted:body.posted||false,telegram_message_id:body.telegram_message_id||null,error:body.error||null,details:String(body.details||'').slice(0,180)}));
  if(!res.ok||body.ok!==true||body.posted!==true)throw Error('test publication unconfirmed: '+(body.error||res.status));
 }
}finally{await cli.disconnect().catch(()=>{});}

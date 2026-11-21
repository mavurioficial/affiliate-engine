// PRIVATE Mavuri homologation: copy new posts from Telegram general to WAHA test group.
// No WhatsApp secrets here, no production fanout, no PC needed.
import sharp from "sharp";
const {TelegramClient}=await import("teleproto");
const {StringSession}=await import("teleproto/sessions");
const mode=process.env.MIRROR_MODE;
if(!["preview","send"].includes(mode))throw Error("MIRROR_MODE invalid");
if(process.env.GITHUB_REPOSITORY!=="mavurioficial/affiliate-engine"||
 process.env.GITHUB_REF!=="refs/heads/main")throw Error("unexpected repository");
const sourceId="3537630337",serverSource="-100"+sourceId;
const endpoint="https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/mavuri-whazap-private-mirror";
const n=Number(process.env.TG_API_ID),hash=process.env.TG_API_HASH,ss=process.env.TG_SESSION_STRING;
if(!Number.isSafeInteger(n)||!hash||!ss)throw Error("Telegram account unavailable");
const cli=new TelegramClient(new StringSession(ss),n,hash,{connectionRetries:2,receiveUpdates:false});
const stopBefore="2026-11-21T11:00:00Z";
function localParts(value){
 const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",
 year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"})
 .formatToParts(value);
 const get=t=>p.find(x=>x.type===t)?.value||"";
 return {day:get("year")+"-"+get("month")+"-"+get("day"),hour:Number(get("hour"))};
}
function classify(text){
 const links=[...text.matchAll(/https:\/\/[^\s<>"']+/gi)].map(m=>m[0].replace(/[),.;!?]+$/,""));
 let platform=null;
 for(const link of links){
  try{
   const u=new URL(link),host=u.hostname.toLowerCase();
   if((host==="www.amazon.com.br"||host==="amazon.com.br")&&
      ["lucasbrasil0e-20","mavuri0a-20"].includes(u.searchParams.get("tag"))){platform="amazon";break}
   if((host==="www.magazinevoce.com.br"||host==="magazinevoce.com.br")&&
      u.pathname.toLowerCase().startsWith("/magazinemavuri/")){platform="magalu";break}
   if(host==="s.shopee.com.br"||host==="shopee.com.br"){platform="shopee";break}
   if(host==="meli.la"||host==="merc.li"||
      ((host==="mercadolivre.com.br"||host==="www.mercadolivre.com.br")&&
      (u.searchParams.get("matt_word")==="lucasbrasildf"||u.pathname.includes("/social/lucasbrasildf")))){
    platform="mercadolivre";break
   }
  }catch{}
 }
 if(!platform)return null;
 const header=text.slice(0,165).replace(/\n/g," ");
 const isCoupon=/(?:^|\s)CUPONS?\b/iu.test(header)&&
   /(?:cupom|cupons)\s*(?:no|na|do|da|de)?\s*(?:mercado\s*livre|ml|shopee|amazon|magalu)/iu.test(header);
 return {platform,kind:isCoupon?"coupon":"offer"};
}
function candidateMedia(m){
 return [m?.media?.photo,m?.media?.webpage?.photo].filter(Boolean);
}
async function productImage(m,platform){
 for(const media of candidateMedia(m)){
  try{
   const blob=await cli.downloadMedia(media,{workers:1});
   const raw=Buffer.isBuffer(blob)?blob:Buffer.from(blob||[]);
   if(raw.length<1200||raw.length>6500000)continue;
   let pipeline=sharp(raw,{limitInputPixels:16000000}).rotate();
   const info=await pipeline.metadata();
   if((info.width||0)<110||(info.height||0)<110)continue;
   // Magalu often uses a small product on a white canvas; crop only white margins,
   // without changing the identity of the item.
   if(platform==="magalu"){
    try{
     const trimmed=await pipeline.clone().flatten({background:"#ffffff"}).trim({background:"#ffffff",threshold:12}).toBuffer();
     const trimMeta=await sharp(trimmed).metadata();
     if((trimMeta.width||0)>=45&&(trimMeta.height||0)>=75) pipeline=sharp(trimmed);
    }catch(e){console.log(JSON.stringify({phase:"magalu_trim_unavailable",message_id:Number(m.id)}))}
   }
   const jpeg=await pipeline.resize(850,850,{fit:"contain",background:"#ffffff"})
     .jpeg({quality:82,mozjpeg:true}).toBuffer();
   if(jpeg.length<5000||jpeg.length>295000)continue;
   console.log(JSON.stringify({phase:"media_ready",source_id:Number(m.id),platform,
     original_width:info.width,original_height:info.height,jpeg_bytes:jpeg.length}));
   return jpeg.toString("base64");
  }catch(e){console.log(JSON.stringify({phase:"media_unavailable",source_id:Number(m.id),error:String(e?.message||e).slice(0,70)}))}
 }
 // For the official Amazon ASIN, try the same SKU-specific fallback previously approved.
 if(platform==="amazon"){
  const text=String(m.message||"");
  const found=text.match(/https:\/\/(?:www\.)?amazon\.com\.br\/dp\/([A-Z0-9]{10})/i);
  if(found){
   try{
    const url="https://m.media-amazon.com/images/P/"+found[1].toUpperCase()+".01._SCLZZZZZZZ_SX800_.jpg";
    const response=await fetch(url,{signal:AbortSignal.timeout(9000),headers:{accept:"image/jpeg"}});
    if(response.ok){
     const raw=Buffer.from(await response.arrayBuffer());
     if(raw.length>5000&&raw.length<1500000){
      const meta=await sharp(raw).metadata();
      if((meta.width||0)>=350&&(meta.height||0)>=350){
       const img=await sharp(raw).resize(850,850,{fit:"contain",background:"#ffffff"}).jpeg({quality:82}).toBuffer();
       if(img.length<295000)return img.toString("base64");
      }
     }
    }
   }catch{}
  }
 }
 return null;
}
const oidcAudience="mavuri-whazap-test-mirror";
async function idToken(){
 const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||"");
 url.searchParams.set("audience",oidcAudience);
 const result=await fetch(url,{headers:{authorization:"Bearer "+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},signal:AbortSignal.timeout(10000)});
 const obj=await result.json();
 if(!result.ok||!obj.value)throw Error("OIDC proof unavailable");
 return obj.value;
}
const token=await idToken();
async function backend(path,method,body){
 const res=await fetch(endpoint+path,{method,headers:{authorization:"Bearer "+token,...(body?{"content-type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(100000)});
 const data=await res.json().catch(()=>({error:"invalid_response"}));
 return {code:res.status,data};
}
const state=await backend("/state","GET");
if(state.code!==200||!state.data.ok)throw Error("State check failed: "+JSON.stringify(state.data).slice(0,260));
if(!state.data.enabled){console.log(JSON.stringify({phase:"pilot_paused"}));process.exit(0)}
if(mode==="send"&&!state.data.allowed_now){
 console.log(JSON.stringify({phase:"outside_business_hours",now:state.data.current_day}));process.exit(0)
}
const cursor=Number(state.data.cursor);
if(!Number.isSafeInteger(cursor)||cursor<0)throw Error("invalid cursor");
let fresh=[],scanned=0,pages=0,done=false,stopReason="";
try{
 await cli.connect();
 if(!await cli.getMe())throw Error("Telegram account not authenticated");
 const dialogs=await cli.getDialogs({limit:500});
 const general=dialogs.find(x=>String(x?.entity?.id||"")===sourceId);
 if(!general)throw Error("Mavuri general channel unavailable");
 let offsetId=0;
 for(let pageNo=0;pageNo<22;pageNo++){
  const page=await cli.getMessages(general.entity,{limit:100,...(offsetId?{offsetId}:{})});
  pages++;
  if(!page.length){done=true;stopReason="empty";break}
  for(const message of page){
   scanned++;
   const id=Number(message.id);
   const when=new Date(message.date instanceof Date?message.date.getTime():Number(message.date)*1000);
   if(id<=cursor){done=true;stopReason="cursor";break}
   if(!Number.isFinite(when.getTime())||when.getTime()<Date.parse(stopBefore)){
    done=true;stopReason="before_start_date";break
   }
   const local=localParts(when);
   const currentDay=localParts(new Date()).day;
   if(local.day<currentDay){done=true;stopReason="before_current_day";break}
   fresh.push({message,id,when,local});
  }
  if(done||page.length<100){done=true;stopReason||="page_short";break}
  const min=Number(page[page.length-1]?.id);
  if(!Number.isSafeInteger(min)||(offsetId&&min>=offsetId))throw Error("Telegram pagination not progressing");
  offsetId=min;
 }
 if(!done)throw Error("Telegram backlog over 2200; cannot safely advance cursor");
 fresh=fresh.filter(x=>x.id>cursor).sort((a,b)=>a.id-b.id);
 console.log(JSON.stringify({phase:"scan_complete",mode,cursor,source_messages:fresh.length,scanned,pages,stopReason,
   latest_id:fresh.at(-1)?.id||cursor,current_day:localParts(new Date()).day}));
 const qualifies=fresh.filter(x=>x.local.day===localParts(new Date()).day&&x.local.hour>=8&&x.local.hour<22);
 let counted=0,reported=0;
 for(let offset=0;offset<fresh.length;offset+=8){
  const chunk=fresh.slice(offset,offset+8),records=[];
  for(const {message,id,when,local} of chunk){
   if(local.day!==localParts(new Date()).day||local.hour<8||local.hour>=22)continue;
   const text=String(message.message||"").trim();
   if(text.length>1800){reported++;console.log(JSON.stringify({phase:"too_long_to_forward",source_id:id}));continue}
   const cat=classify(text);
   if(!cat)continue;
   const out={id,posted_at:when.toISOString(),platform:cat.platform,kind:cat.kind,text};
   if(cat.kind==="offer"){
    const image=await productImage(message,cat.platform);
    if(image)out.photo_b64=image;
   }
   records.push(out);counted++;
  }
  if(mode==="preview"){
   console.log(JSON.stringify({phase:"packet_preview",first_id:chunk[0].id,last_id:chunk.at(-1).id,
     candidates:records.map(x=>({id:x.id,platform:x.platform,kind:x.kind,has_image:!!x.photo_b64,text_length:x.text.length}))}));
   continue;
  }
  const response=await backend("","POST",{
   mode:"mirror",run_id:process.env.GITHUB_RUN_ID,source_chat_id:serverSource,
   high_id:chunk.at(-1).id,items:records
  });
  console.log(JSON.stringify({phase:"packet_result",http_status:response.code,first_id:chunk[0].id,
   last_id:chunk.at(-1).id,results:response.data.results||[],sent:response.data.sent,error:response.data.error||null,
   checkpoint:response.data.checkpoint===true}));
  if(response.code!==200||response.data.checkpoint!==true)
   throw Error("Private Whazap packet not committed; review audit, do not retry blindly");
 }
 console.log(JSON.stringify({phase:"mirror_completed",mode,source_messages:fresh.length,
   eligible:qualifies.length,identified_candidates:counted,oversized_skipped:reported}));
}finally{await cli.disconnect().catch(()=>{})}

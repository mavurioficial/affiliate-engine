// Read-only verification for previously published offers/coupons on Mavuri Telegram.
import sharp from 'sharp';
const {TelegramClient}=await import('teleproto');
const {StringSession}=await import('teleproto/sessions');
const cli=new TelegramClient(new StringSession(process.env.TG_SESSION_STRING),Number(process.env.TG_API_ID),process.env.TG_API_HASH,{connectionRetries:2,receiveUpdates:false});
const wanted=[10522,10519,10490,10489,10488,10487,10486,10485,10484,10483,10482,10481,10480,10479,10478,10027,9989,9986,9608,5370,5349,5333];
try{
 await cli.connect();
 const me=await cli.getMe();if(!me)throw Error('Telegram session missing');
 const dialogs=await cli.getDialogs({limit:500});
 const channel=dialogs.find(x=>String(x?.entity?.id||'')==='3537630337');
 if(!channel)throw Error('Mavuri general channel not found');
 const msgs=await cli.getMessages(channel.entity,{ids:wanted});
 for(const m of msgs.filter(x=>x&&wanted.includes(Number(x.id)))){
  const msg=String(m.message||'');
  const linkCount=(msg.match(/https?:\/\//g)||[]).length;
  const candidatePhotos=[m?.media?.photo,m?.media?.webpage?.photo].filter(Boolean);
  let photo=null;
  if(candidatePhotos.length){
   for(const media of candidatePhotos){try{const buf=await cli.downloadMedia(media,{workers:1});const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf||'');if(!b.length)continue;const meta=await sharp(b,{limitInputPixels:12000000}).metadata();photo={width:meta.width,height:meta.height,bytes:b.length};break;}catch{}}
  }
  console.log('MAVURI_PREVIEW '+JSON.stringify({id:m.id,hasPhoto:!!photo,photo,links:linkCount,body:msg.slice(0,1400),source:m.media?.className||m.media?.constructor?.name||''}));
 }
}finally{await cli.disconnect().catch(()=>{})}

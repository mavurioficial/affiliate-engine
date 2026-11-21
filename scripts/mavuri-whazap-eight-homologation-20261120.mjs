// Eight private Whazap visual tests, copied from Mavuri Telegram originals.
// A standalone manually dispatched workflow. Does not modify the recurring publication system.
import sharp from "sharp";
const {TelegramClient}=await import("teleproto");
const {StringSession}=await import("teleproto/sessions");
const mode=process.env.TEST_MODE;
if(!["preview","publish"].includes(mode))throw Error("mode invalid");
if(process.env.GITHUB_REPOSITORY!=="mavurioficial/affiliate-engine"||process.env.GITHUB_REF!=="refs/heads/main")
 throw Error("wrong GitHub repository/ref");
const apiId=Number(process.env.TG_API_ID),hash=process.env.TG_API_HASH,session=process.env.TG_SESSION_STRING;
if(!Number.isSafeInteger(apiId)||!hash||!session)throw Error("Telegram connection not configured");
const cli=new TelegramClient(new StringSession(session),apiId,hash,{connectionRetries:2,receiveUpdates:false});
const specs=[
 {platform:"mercadolivre",kind:"offer",source:1936,expected:"https://meli.la/1z5uv72"},
 {platform:"shopee",kind:"offer",source:10519,expected:"https://s.shopee.com.br/2La02gfdER"},
 {platform:"amazon",kind:"offer",source:10027,expected:"https://www.amazon.com.br/dp/B07NGSST3K/ref=nosim?tag=lucasbrasil0e-20"},
 {platform:"magalu",kind:"offer",source:10522,expected:"https://www.magazinevoce.com.br/magazinemavuri/geladeira-refrigerador-brastemp-frost-free-duplex-385l-brm46mk/p/240972300/ed/refr/?seller_id=magazineluiza"},
 {platform:"mercadolivre",kind:"coupon",source:9986,expected:"https://www.mercadolivre.com.br/social/lucasbrasildf"},
 {platform:"shopee",kind:"coupon",source:9608,expected:"https://s.shopee.com.br/7Kyfh6zgjt"},
 {platform:"amazon",kind:"coupon",source:10489,expected:"https://www.amazon.com.br/dp/B0BTHPGVWZ/ref=nosim?tag=lucasbrasil0e-20"},
 {platform:"magalu",kind:"coupon",source:9989,expected:"https://www.magazinevoce.com.br/magazinemavuri/"},
];
const productImageMagalu="https://a-static.mlcdn.com.br/800x800/geladeira-refrigerador-brastemp-frost-free-duplex-385l-brm46mk/magazineluiza/240972300/148cc96df0b4609fd52f0321fca107bb.jpg";
async function jpegFromRaw(raw,label){
 const b=Buffer.isBuffer(raw)?raw:Buffer.from(raw||"");
 const m=await sharp(b,{limitInputPixels:12000000}).metadata();
 if((m.width||0)<140||(m.height||0)<140)throw Error("image too small "+label);
 const image=await sharp(b,{limitInputPixels:12000000}).resize(800,800,{fit:"contain",background:"#ffffff"}).jpeg({quality:82,mozjpeg:true}).toBuffer();
 if(image.length<4000||image.length>230000)throw Error("image out of limits "+label+" bytes="+image.length);
 console.log(JSON.stringify({phase:"prepared_product_image",label,width:m.width,height:m.height,output_bytes:image.length}));
 return image.toString("base64");
}
try{
 await cli.connect();
 if(!await cli.getMe())throw Error("Telegram session not authenticated");
 const dialogs=await cli.getDialogs({limit:500});
 const general=dialogs.find(d=>String(d?.entity?.id||"")==="3537630337");
 const source=dialogs.find(d=>String(d?.entity?.username||"").toLowerCase()==="grupotabugado");
 if(!general||!source)throw Error("Mavuri general or Ta Bugado not available");
 const msgs=await cli.getMessages(general.entity,{ids:specs.map(x=>x.source)});
 const indexed=new Map(msgs.filter(Boolean).map(m=>[Number(m.id),m]));
 const items=[];
 const [sourcePhotoMsg]=await cli.getMessages(source.entity,{ids:[546446]});
 if(Number(sourcePhotoMsg?.id)!==546446)throw Error("Amazon high-res reference not available");
 const sourceText=String(sourcePhotoMsg.message||"");
 if(!sourceText.toLowerCase().includes("whey")||!sourceText.includes("B07NGSST3K")&&!sourceText.includes("amazon")&&!sourceText.includes("link.amazon"))
  throw Error("Amazon reference description mismatch");
 for(let i=0;i<specs.length;i++){
  const spec=specs[i],msg=indexed.get(spec.source);
  if(!msg)throw Error("Missing exact Mavuri Telegram message "+spec.source);
  const caption=String(msg.message||"").trim();
  if(!caption.includes(spec.expected))throw Error("Original Mavuri affiliate URL mismatch for "+spec.source);
  if(caption.length<45||caption.length>950)throw Error("Caption length not allowed "+spec.source+" len "+caption.length);
  let photoB64=null;
  if(spec.kind==="offer"){
   let raw;
   if(spec.platform==="amazon"){
    raw=await cli.downloadMedia(sourcePhotoMsg.media?.photo||sourcePhotoMsg.media,{workers:1});
   }else if(spec.platform==="magalu"){
    try{
      const response=await fetch(productImageMagalu,{signal:AbortSignal.timeout(12000)});
      if(response.ok)raw=Buffer.from(await response.arrayBuffer());
      else console.log(JSON.stringify({phase:"magalu_highres_unavailable",http_status:response.status}));
    }catch(e){console.log(JSON.stringify({phase:"magalu_highres_unavailable",error:String(e?.message||e).slice(0,90)}));}
    // The original picture is always the grounded fallback if Magalu CDN blocks GitHub.
    if(!raw){
      if(!msg.media?.photo)throw Error("Original Magalu Telegram post has no photo");
      raw=await cli.downloadMedia(msg.media.photo,{workers:1});
    }
   }else{
    if(!msg.media?.photo)throw Error("Original Telegram offer lacks photo "+spec.source);
    raw=await cli.downloadMedia(msg.media.photo,{workers:1});
   }
   photoB64=await jpegFromRaw(raw,spec.platform+":"+spec.source);
  }
  items.push({platform:spec.platform,kind:spec.kind,source_message_id:spec.source,original:caption,...(photoB64?{image_base64:photoB64}:{})});
 }
 console.log(JSON.stringify({phase:"source_confirmed",items:items.map(x=>({platform:x.platform,kind:x.kind,source_message_id:x.source_message_id,caption_characters:x.original.length,has_photo:!!x.image_base64})),mode}));
 if(mode==="publish"){
  const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set("audience","mavuri-whazap-eight-homologation");
  const proof=await fetch(url,{headers:{authorization:"Bearer "+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},signal:AbortSignal.timeout(15000)});
  const result=await proof.json();
  if(!proof.ok||!result.value)throw Error("GitHub identity token unavailable");
  const send=await fetch("https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/mavuri-whazap-eight-homologation",{
   method:"POST",headers:{"authorization":"Bearer "+result.value,"content-type":"application/json"},
   body:JSON.stringify({mode,run_id:process.env.GITHUB_RUN_ID,items}),
   signal:AbortSignal.timeout(145000)
  });
  const response=await send.json().catch(()=>({error:"response_not_json"}));
  console.log(JSON.stringify({phase:"whazap_eight_results",http_status:send.status,...response}));
  if(!send.ok||!response.ok)throw Error("Batch incomplete; see safe server audit before retry");
 }
}finally{await cli.disconnect().catch(()=>{})}

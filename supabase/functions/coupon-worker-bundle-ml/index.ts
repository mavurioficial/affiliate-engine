import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const U=Deno.env.get("SUPABASE_URL")!;
const S=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const T=Deno.env.get("TELEGRAM_BOT_TOKEN")||"";
const PROFILE="https://www.mercadolivre.com.br/social/lucasbrasildf";
const ML_PARTS=[
  "https://raw.githubusercontent.com/mavurioficial/affiliate-engine/main/assets/mavuri-cupom-part0.b64",
  "https://raw.githubusercontent.com/mavurioficial/affiliate-engine/main/assets/mavuri-cupom-part1.b64"
];
const H={"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization, apikey, x-client-info, content-type","cache-control":"no-store"};
const out=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const one=(v:any)=>Array.isArray(v)?v[0]:v;
const esc=(v:unknown)=>String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const brl=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:0,maximumFractionDigits:2}):""};
const dateBR=(v:unknown)=>{if(!v)return "";const d=new Date(String(v));if(Number.isNaN(d.getTime()))return "";return d.toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit"})};
function market(c:any){return String(one(c?.marketplace)?.slug||c?.metadata?.platform||"mercadolivre").toLowerCase()}
function pub(c:any){if(!c||c.status!=="active"||c.coupon_type!=="code"||market(c)!=="mercadolivre")return false;if(!String(c.code||"").trim())return false;if(!["percent","fixed"].includes(String(c.discount_type||""))||Number(c.discount_value)<=0)return false;if(c.valid_until&&new Date(c.valid_until).getTime()<Date.now())return false;const min=c.min_purchase==null?null:Number(c.min_purchase);if(min===null||!Number.isFinite(min)||min<0)return false;if(c.discount_type==="percent"&&!(Number(c.max_discount)>0))return false;return true}
function line(c:any){const code=esc(String(c.code||"").toUpperCase());const val=c.discount_type==="percent"?`${Number(c.discount_value).toLocaleString("pt-BR")}% OFF`:`${brl(c.discount_value)} OFF`;const min=Number(c.min_purchase);const max=c.max_discount==null?null:Number(c.max_discount);const until=dateBR(c.valid_until);const scopeType=String(c.eligibility?.scope_type||c.metadata?.scope_type||"");const scopeLabel=String(c.eligibility?.scope_label||c.metadata?.scope_label||"").trim();const bits=[`🔥 ${val}`,`Compra mínima: ${brl(min)}`];if(max!=null&&Number.isFinite(max))bits.push(`Desconto máximo: ${brl(max)}`);if(until)bits.push(`Válido até ${until}`);const scope=scopeType==="category"&&scopeLabel?`🏷️ ${esc(scopeLabel)}`:scopeType==="selected_list"?"🏷️ Produtos selecionados":"";return [`🎟️ <b>${code}</b>`,scope,bits.join(" | ")].filter(Boolean).join("\n")}
function buildCaption(coupons:any[]){const rows=coupons.map(line);const link=`🔗 <a href="${PROFILE}">VER OFERTAS NO MERCADO LIVRE</a>`;const header=["🎟️ <b>CUPONS MERCADO LIVRE</b>","🔥 Cupons para aproveitar agora:",""];const footer=["",link,"","⚠️ Válidos enquanto houver disponibilidade e para produtos elegíveis."];const full=[...header,...rows,...footer].join("\n");if(full.length<=1000)return {caption:full,rest:""};let caption=header.join("\n");const remaining:string[]=[];for(const r of rows){if((caption+"\n"+r+"\n"+footer.join("\n")).length<=1000)caption+="\n"+r;else remaining.push(r)}caption+="\n"+footer.join("\n");return {caption,rest:remaining.length?["🎟️ <b>Mais cupons:</b>",...remaining,"",link,"","⚠️ Válidos enquanto houver disponibilidade e para produtos elegíveis."].join("\n"):""}}
function b64bytes(s:string){const bin=atob(s.replace(/\s+/g,"")),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a}
async function mlImage(){const rs=await Promise.all(ML_PARTS.map(u=>fetch(u,{redirect:"follow"})));for(const r of rs)if(!r.ok)throw new Error(`Imagem ML HTTP ${r.status}`);return b64bytes((await Promise.all(rs.map(r=>r.text()))).join(""))}
async function sendBundle(chat:string,coupons:any[]){const {caption,rest}=buildCaption(coupons),bytes=await mlImage(),f=new FormData();f.append("chat_id",chat);f.append("caption",caption);f.append("parse_mode","HTML");f.append("photo",new File([bytes],"mavuri-cupons-mercadolivre.jpg",{type:"image/jpeg"}));const r=await fetch(`https://api.telegram.org/bot${T}/sendPhoto`,{method:"POST",body:f});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j?.description||`Telegram HTTP ${r.status}`);let textMessageId="";if(rest){const rr=await fetch(`https://api.telegram.org/bot${T}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chat,text:rest,parse_mode:"HTML",reply_to_message_id:j.result?.message_id,disable_web_page_preview:true})});const jj=await rr.json();if(!rr.ok||!jj.ok)throw new Error(jj?.description||`Telegram texto HTTP ${rr.status}`);textMessageId=String(jj.result?.message_id||"")}return {messageId:String(j.result?.message_id||""),textMessageId,imageBytes:bytes.length,imageMedia:"data:image/jpeg;name=mavuri-cupons-mercadolivre.jpg;base64,"+btoa(Array.from(bytes,b=>String.fromCharCode(b)).join("")),continued:Boolean(rest)}}

async function queueWhapiCoupons(db:any,channelId:string,userId:string,sendResult:any,coupons:any[]){
  if(!sendResult.messageId)return;
  const {data:mirrors,error:lookupError}=await db.from("flow_channels")
    .select("id").eq("user_id",userId).eq("type","whatsapp").eq("status","connected")
    .contains("settings",{mirror_telegram_channel_id:channelId});
  if(lookupError)throw new Error(lookupError.message);
  if(!mirrors?.length)return;
  const {caption,rest}=buildCaption(coupons);
  const parts=[{kind:"image",body:caption,media:sendResult.imageMedia},...(rest?[{kind:"text",body:rest,media:null}]:[])];
  const rows=(mirrors||[]).flatMap((mirror:any)=>parts.map((part,i)=>({
    user_id:userId,channel_id:mirror.id,source:"mercadolivre",
    bundle_key:"mercadolivre:"+channelId+":"+sendResult.messageId,
    part_index:i,kind:part.kind,body:part.body,media:part.media,
    status:"queued",scheduled_for:new Date().toISOString()
  })));
  const {error}=await db.from("flow_whapi_coupon_jobs").upsert(rows,{
    onConflict:"bundle_key,channel_id,part_index",ignoreDuplicates:true
  });
  if(error)throw new Error(error.message);
}

function saoPauloDayStartIso(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const val=(t:string)=>Number(parts.find(p=>p.type===t)?.value||0);
  return new Date(Date.UTC(val("year"),val("month")-1,val("day"),3,0,0,0)).toISOString();
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
  if(req.method!=="POST")return out({error:"POST required"},405);
  if(!S||!T)return out({error:"Configuração indisponível"},500);
  const db=createClient(U,S),now=new Date(),dayStart=saoPauloDayStartIso(now);
  const q=await db.from("flow_coupon_delivery_jobs").select(`id,user_id,coupon_id,channel_id,status,attempts,scheduled_for,coupon:flow_coupons(*,marketplace:flow_marketplaces(slug,name)),channel:flow_channels(id,type,name,external_ref,status)`).eq("status","queued").lte("scheduled_for",now.toISOString()).order("scheduled_for",{ascending:true}).limit(500);
  if(q.error)return out({error:q.error.message},500);
  const candidates=(q.data||[]).filter((j:any)=>pub(one(j.coupon)));
  if(!candidates.length)return out({ok:true,worker_version:"bundle-ml-6",processed:0,sent:0,failed:0,blocked_today:0,results:[]});

  // Decide por cupom+canal: novo = imediato; mudou fingerprint = imediato;
  // conhecido sem mudança = no máximo uma vez por dia.
  const eligible:any[]=[]; let blockedToday=0;
  const seenKeys=new Set<string>();
  for(const j of candidates){
    const c:any=one(j.coupon),ch:any=one(j.channel);
    if(!ch||ch.type!=="telegram"||!ch.external_ref||!["active","connected"].includes(ch.status))continue;
    const key=`${j.coupon_id}:${j.channel_id}`;
    if(seenKeys.has(key)){
      await db.from("flow_coupon_delivery_jobs").update({status:"cancelled",error_message:"duplicado_mesmo_ciclo"}).eq("id",j.id).eq("status","queued");
      continue;
    }
    seenKeys.add(key);
    const logs=await db.from("flow_coupon_delivery_logs").select("id,metadata,created_at").eq("coupon_id",j.coupon_id).eq("channel_id",j.channel_id).eq("status","sent").gte("created_at",dayStart).order("created_at",{ascending:false}).limit(1);
    if(logs.error)return out({error:logs.error.message},500);
    const last=(logs.data||[])[0];
    const currentFp=String(c.fingerprint||"");
    const lastFp=String(last?.metadata?.coupon_fingerprint||"");
    const alreadyToday=Boolean(last);
    const changedToday=alreadyToday && currentFp && lastFp && currentFp!==lastFp;
    if(alreadyToday&&!changedToday){
      await db.from("flow_coupon_delivery_jobs").update({status:"cancelled",error_message:"ja_publicado_hoje_sem_alteracao"}).eq("id",j.id).eq("status","queued");
      blockedToday++;
      continue;
    }
    eligible.push({...j,coupon:c,channel:ch,currentFp,reason:changedToday?"changed":"new_or_daily"});
  }
  if(!eligible.length)return out({ok:true,worker_version:"bundle-ml-6",processed:0,sent:0,failed:0,blocked_today:blockedToday,results:[]});

  const groups=new Map<string,any[]>();
  for(const j of eligible){const arr=groups.get(j.channel_id)||[];arr.push(j);groups.set(j.channel_id,arr)}
  let processed=0,sent=0,failed=0,groupsSent=0;const results:any[]=[];
  for(const [channelId,jobs] of groups){
    const locked:any[]=[];
    for(const j of jobs){const a=Number(j.attempts||0)+1;const lock=await db.from("flow_coupon_delivery_jobs").update({status:"processing",attempts:a,error_message:null}).eq("id",j.id).eq("status","queued").select("id").maybeSingle();if(lock.data)locked.push({...j,attempt:a})}
    if(!locked.length)continue;
    processed+=locked.length;
    const couponMap=new Map<string,any>();for(const j of locked)couponMap.set(String(j.coupon_id),j.coupon);
    const sendCoupons=[...couponMap.values()].sort((a:any,b:any)=>String(a.code||"").localeCompare(String(b.code||"")));
    try{
      const ch=locked[0].channel;const p=await sendBundle(String(ch.external_ref),sendCoupons);
      for(const j of locked){
        await db.from("flow_coupon_delivery_logs").insert({user_id:j.user_id,delivery_job_id:j.id,coupon_id:j.coupon_id,channel_id:j.channel_id,status:"sent",external_message_id:p.messageId,metadata:{provider:"telegram",attempt:j.attempt,worker_version:"bundle-ml-6",send_mode:"coupon_due_now",coupon_fingerprint:j.currentFp||null,reason:j.reason,bundle_size:sendCoupons.length,continued:p.continued,image_bytes:p.imageBytes,affiliate_profile_url:PROFILE,day_start_sp:dayStart}});
        await db.from("flow_coupon_delivery_jobs").update({status:"sent",sent_at:new Date().toISOString(),error_message:null}).eq("id",j.id);sent++;
      }
      // Non-blocking: WhatsApp queue errors never repeat Telegram coupons.
      try{await queueWhapiCoupons(db,channelId,String(locked[0].user_id),p,sendCoupons)}
      catch(mirrorError){console.error("Whapi ML mirror queue:",mirrorError instanceof Error?mirrorError.message:String(mirrorError))}
      groupsSent++;results.push({channel_id:channelId,bundle_size:sendCoupons.length,message_id:p.messageId,continued:p.continued,codes:sendCoupons.map((c:any)=>c.code)})
    }catch(err){const m=err instanceof Error?err.message:String(err);for(const j of locked){await db.from("flow_coupon_delivery_jobs").update({status:"queued",scheduled_for:new Date(Date.now()+60000).toISOString(),error_message:m}).eq("id",j.id);failed++}}
  }
  return out({ok:true,worker_version:"bundle-ml-6",processed,sent,failed,groups_sent:groupsSent,blocked_today:blockedToday,results});
});
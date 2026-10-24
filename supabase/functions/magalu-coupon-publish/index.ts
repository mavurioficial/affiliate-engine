
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const U = Deno.env.get("SUPABASE_URL")!
const PK = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")
const SK = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")
const P = PK.default || Deno.env.get("SUPABASE_ANON_KEY") || ""
const S = SK.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const T = Deno.env.get("TELEGRAM_BOT_TOKEN") || ""
const STORE = "https://www.magazinevoce.com.br/magazinemavuri/"
const MAGALU_OFFICIAL_IMAGE="https://otikoxnfotyjgphrdudn.supabase.co/storage/v1/object/public/coupon-assets/magalu/oficial-9e7911a3427c.png"

const H = {
  "content-type":"application/json; charset=utf-8",
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"POST, OPTIONS",
  "access-control-allow-headers":"authorization, apikey, x-client-info, content-type",
  "cache-control":"no-store"
}
const out=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H})
const esc=(v:unknown)=>String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")
const brl=(v:unknown)=>Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:0,maximumFractionDigits:2})
const dateBR=(v:unknown)=>{if(!v)return "";const d=new Date(String(v));return Number.isNaN(d.getTime())?"":d.toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit"})}
async function sha(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function daySP(now=new Date()){
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now)
  const x=(t:string)=>p.find(a=>a.type===t)?.value||""
  return x("year")+x("month")+x("day")
}
function tagDestinations(tags:string[], channels:Map<string,string>){
  const s=new Set((tags||[]).map(x=>String(x).toLowerCase()))
  const ids=new Set<string>()
  const general=channels.get("Mavuri Ofertas"); if(general) ids.add(general)
  if(["tecnologia","eletronicos","informatica","celular","games"].some(x=>s.has(x))){const id=channels.get("Mavuri Tecnologia");if(id)ids.add(id)}
  if(["casa","cozinha","decoracao","limpeza","moveis","eletrodomesticos"].some(x=>s.has(x))){const id=channels.get("Mavuri Casa & Cozinha");if(id)ids.add(id)}
  if(["feminino","beleza","moda","skincare","cabelo","maquiagem"].some(x=>s.has(x))){const id=channels.get("Mavuri Mulher");if(id)ids.add(id)}
  return [...ids]
}
function line(c:any){
  const code=esc(String(c.code||"").trim().toUpperCase())
  const benefit=c.discount_type==="percent"
    ? `${Number(c.discount_value).toLocaleString("pt-BR",{maximumFractionDigits:2})}% OFF`
    : `${brl(c.discount_value)} OFF`
  const bits=[`🔥 ${benefit}`]
  if(c.min_purchase!=null) bits.push(`mín. ${brl(c.min_purchase)}`)
  if(c.max_discount!=null) bits.push(`máx. ${brl(c.max_discount)}`)
  const scope=String(c.metadata?.scope_label||c.eligibility?.scope_label||"").trim()
  if(scope) bits.push(esc(scope))
  const until=dateBR(c.valid_until); if(until) bits.push(`até ${until}`)
  return [`🎟️ <b>${code}</b>`,bits.join(" | ")].join("\n")
}
function buildCouponMessages(coupons:any[]){
  const header=[
    "💙🎟️ <b>CUPONS MAGALU</b>",
    "🔥 Cupons atualizados para aproveitar agora:",
    ""
  ]
  const footer=[
    "",
    "👉 VER OFERTAS NO MAGALU",
    STORE,
    "",
    "⚠️ Aproveite enquanto estiverem ativos. Cupons podem esgotar ou mudar sem aviso."
  ]
  const rows=coupons.map(line)
  const first=[...header]
  let idx=0
  while(idx<rows.length){
    const candidate=[...first,rows[idx],...footer].join("\n")
    if(candidate.length>980) break
    first.push(rows[idx]); idx++
  }
  const caption=[...first,...footer].join("\n")
  const extras:string[]=[]
  while(idx<rows.length){
    const chunk=["🎟️ Mais cupons Magalu:"]
    while(idx<rows.length){
      const candidate=[...chunk,rows[idx]].join("\n")
      if(candidate.length>3500) break
      chunk.push(rows[idx]); idx++
    }
    chunk.push("","👉 VER OFERTAS NO MAGALU",STORE)
    extras.push(chunk.join("\n"))
  }
  return {caption,extras}
}


async function queueWhapiMagalu(db:any,channelId:string,userId:string,telegramMessageId:string,caption:string,extras:string[],sendMode:string){
  if(!telegramMessageId)return;
  const {data:mirrors,error:lookupError}=await db.from("flow_channels")
    .select("id").eq("user_id",userId).eq("type","whatsapp").eq("status","connected")
    .contains("settings",{mirror_telegram_channel_id:channelId});
  if(lookupError)throw new Error(lookupError.message);
  if(!mirrors?.length)return;
  const parts=[
    {kind:sendMode==="photo"?"image":"text",body:caption,media:sendMode==="photo"?MAGALU_OFFICIAL_IMAGE:null},
    ...extras.map(extra=>({kind:"text",body:extra,media:null}))
  ];
  const rows=(mirrors||[]).flatMap((mirror:any)=>parts.map((part,i)=>({
    user_id:userId,channel_id:mirror.id,source:"magalu",
    bundle_key:"magalu:"+channelId+":"+telegramMessageId,
    part_index:i,kind:part.kind,body:part.body,media:part.media,
    status:"queued",scheduled_for:new Date().toISOString()
  })));
  const {error}=await db.from("flow_whapi_coupon_jobs").upsert(rows,{
    onConflict:"bundle_key,channel_id,part_index",ignoreDuplicates:true
  });
  if(error)throw new Error(error.message);
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:H})
  if(req.method!=="POST") return out({error:"POST required"},405)
  if(!S||!P||!T) return out({error:"Configuração indisponível"},500)

  const auth=req.headers.get("authorization")||""
  if(!auth) return out({error:"Usuário não autenticado."},401)
  const uc=createClient(U,P,{global:{headers:{Authorization:auth}}})
  const ur=await uc.auth.getUser()
  if(ur.error||!ur.data.user) return out({error:"Usuário não autenticado."},401)

  let payload:any={}
  try{payload=await req.json()}catch{return out({error:"JSON inválido."},400)}
  const inputs=Array.isArray(payload.coupons)?payload.coupons:[]
  if(!inputs.length) return out({ok:true,received:0,created:0,updated:0,unchanged:0,jobs:0,sent:0,failed:0})

  const db=createClient(U,S), userId=ur.data.user.id, now=new Date(), day=daySP(now)
  const state=await db.rpc("mavuri_magalu_cloud_state");
  if(state.error)return out({error:"magalu_cloud_state_unavailable"},503);
  if(state.data?.enabled&&state.data.owner_id===userId)return out({ok:true,cloud_owned:true,received:inputs.length,sent:0,jobs:0});
  const mp=await db.from("flow_marketplaces").select("id").eq("slug","magalu").eq("active",true).maybeSingle()
  if(mp.error||!mp.data) return out({error:mp.error?.message||"Marketplace Magalu não encontrado."},500)
  const acct=await db.from("flow_affiliate_accounts").select("id").eq("user_id",userId).eq("marketplace_id",mp.data.id).eq("status","connected").limit(1).maybeSingle()
  const ch=await db.from("flow_channels").select("id,name").eq("user_id",userId).eq("type","telegram").in("status",["active","connected"]).in("name",["Mavuri Ofertas","Mavuri Mulher","Mavuri Casa & Cozinha","Mavuri Tecnologia"])
  if(ch.error) return out({error:ch.error.message},500)
  const channels=new Map((ch.data||[]).map((x:any)=>[String(x.name),String(x.id)]))

  let created=0,updated=0,unchanged=0,jobs=0,sent=0,failed=0
  const dueByChannel=new Map<string,any[]>()
  const errors:any[]=[]

  for(let i=0;i<inputs.length;i++){
    try{
      const x=inputs[i]||{}
      const code=String(x.code||"").trim().toUpperCase().replace(/\s+/g,"")
      const dtype=String(x.discount_type||"").toLowerCase()
      const dval=Number(x.discount_value)
      if(!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new Error("Código inválido.")
      if(!["percent","fixed"].includes(dtype)||!(dval>0)) throw new Error("Benefício não interpretado.")
      const termsText=String(x.terms||"")
      const explicitCodeRe=new RegExp("(?:(?:USE\\s+O\\s+CUPOM)\\s*[:#-]?\\s*|(?:CUPOM)\\s*[:#-]\\s*)"+code+"(?:\\s|$|[.,;!])","i")
      if(!termsText||!explicitCodeRe.test(termsText)) throw new Error("Código não confirmado no texto oficial.")
      const min=x.min_purchase==null?null:Number(x.min_purchase)
      const max=x.max_discount==null?null:Number(x.max_discount)
      const validUntil=x.valid_until?new Date(String(x.valid_until)).toISOString():null
      if(validUntil&&new Date(validUntil).getTime()<Date.now()) continue
      const tags=Array.isArray(x.mavuri_tags)?[...new Set(x.mavuri_tags.map((v:any)=>String(v).trim().toLowerCase()).filter(Boolean))]:[]
      const eligibility=x.eligibility&&typeof x.eligibility==="object"?x.eligibility:{}
      const metadata={
        ...(x.metadata&&typeof x.metadata==="object"?x.metadata:{}),
        platform:"magalu",
        source_channel:"@parceiromagaludivulgador",
        scope_label:String(x.scope_label||eligibility.scope_label||"").trim()||null,
        publication_ready:true
      }
      const normalized={code,dtype,dval,min,max,validUntil,tags,eligibility,scope:metadata.scope_label}
      const fp=await sha(JSON.stringify(normalized))
      const sourceRef="magalu-telegram:"+code
      const existing=await db.from("flow_coupons").select("id,fingerprint").eq("user_id",userId).eq("marketplace_id",mp.data.id).eq("source_ref",sourceRef).maybeSingle()
      if(existing.error) throw new Error(existing.error.message)
      const row:any={
        user_id:userId,marketplace_id:mp.data.id,affiliate_account_id:acct.data?.id||null,
        source_type:"affiliate_channel",source_ref:sourceRef,code,coupon_type:"code",
        title:metadata.scope_label?`Cupom Magalu — ${metadata.scope_label}`:`Cupom Magalu — ${code}`,
        discount_type:dtype,discount_value:dval,min_purchase:Number.isFinite(min)?min:null,max_discount:Number.isFinite(max)?max:null,
        valid_from:x.valid_from?new Date(String(x.valid_from)).toISOString():null,valid_until:validUntil,
        status:"active",activation_affiliate_url:STORE,landing_url:STORE,terms:String(x.terms||"").slice(0,4000)||null,
        eligibility,metadata,mavuri_tags:tags,fingerprint:fp,last_seen_at:now.toISOString(),updated_at:now.toISOString()
      }
      let couponId=""
      if(existing.data){
        couponId=String(existing.data.id)
        const u=await db.from("flow_coupons").update(row).eq("id",couponId)
        if(u.error) throw new Error(u.error.message)
        if(String(existing.data.fingerprint||"")===fp) unchanged++; else updated++
      }else{
        const ins=await db.from("flow_coupons").insert({...row,first_seen_at:now.toISOString()}).select("id").single()
        if(ins.error) throw new Error(ins.error.message)
        couponId=String(ins.data.id); created++
      }

      for(const channelId of tagDestinations(tags,channels)){
        const deliveryKey=`magalu-coupon:${couponId}:${channelId}:${day}:${fp.slice(0,12)}`
        const prior=await db.from("flow_coupon_delivery_jobs").select("id,status,attempts").eq("delivery_key",deliveryKey).limit(1).maybeSingle()
        let jobId=""
        if(prior.data){
          if(String(prior.data.status)!=="failed") continue
          const retry=await db.from("flow_coupon_delivery_jobs").update({
            status:"queued",scheduled_for:now.toISOString(),error_message:null
          }).eq("id",prior.data.id).select("id").single()
          if(retry.error) throw new Error(retry.error.message)
          jobId=String(retry.data.id)
        }else{
          const insJob=await db.from("flow_coupon_delivery_jobs").insert({
            user_id:userId,coupon_id:couponId,channel_id:channelId,status:"queued",attempts:0,
            scheduled_for:now.toISOString(),delivery_key:deliveryKey
          }).select("id").single()
          if(insJob.error) throw new Error(insJob.error.message)
          jobId=String(insJob.data.id)
        }
        jobs++
        const arr=dueByChannel.get(channelId)||[]
        arr.push({job_id:jobId,coupon_id:couponId,channel_id:channelId,fp,...row})
        dueByChannel.set(channelId,arr)
      }
    }catch(e){errors.push({index:i,error:e instanceof Error?e.message:String(e)})}
  }

  for(const [channelId,items] of dueByChannel){
    const channel=(ch.data||[]).find((x:any)=>String(x.id)===channelId)
    if(!channel) continue
    const full=await db.from("flow_channels").select("external_ref").eq("id",channelId).single()
    const chat=String(full.data?.external_ref||"")
    if(!chat) continue
    const unique=[...new Map(items.map((x:any)=>[x.coupon_id,x])).values()]
    for(const x of items) await db.from("flow_coupon_delivery_jobs").update({status:"processing",attempts:1,error_message:null}).eq("id",x.job_id).eq("status","queued")
    try{
      const {caption,extras}=buildCouponMessages(unique)
      // A arte oficial é obrigatória; imagens enviadas pelo runner não a substituem.
      const imageBase64=""
      const imageMime="image/png"
      const suppliedInvalid=false
      let rr:Response
      let jj:any
      let deliveryMode="photo"
      let fallbackReason=suppliedInvalid?"invalid base64 image input; using fixed image":""

      if(imageBase64){
        const bytes=Uint8Array.from(atob(imageBase64),c=>c.charCodeAt(0))
        const form=new FormData()
        form.set("chat_id",chat)
        form.set("caption",caption)
        form.set("parse_mode","HTML")
        form.set("photo",new Blob([bytes],{type:imageMime}),"cupom-magalu.jpg")
        rr=await fetch(`https://api.telegram.org/bot${T}/sendPhoto`,{method:"POST",body:form})
        jj=await rr.json()
      }else{
        // Arte fixa do cupom Magalu hospedada no próprio Supabase,
        // seguindo o mesmo padrão das artes de ML e Shopee.
        const fixedImageUrl=MAGALU_OFFICIAL_IMAGE
        try{
          const ir=await fetch(fixedImageUrl,{headers:{accept:"image/png"}})
          if(!ir.ok) throw new Error(`imagem fixa HTTP ${ir.status}`)
          const bytes=new Uint8Array(await ir.arrayBuffer())
          const officialHash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(x=>x.toString(16).padStart(2,"0")).join("")
          if(officialHash!=="9e7911a3427c204bea702f80a37c5098a113b678b6d18693236d4fcd772b0a92") throw new Error("arte oficial: integridade inválida")
          if(bytes.length<1000 || bytes[0]!==137 || bytes[1]!==80 || bytes[2]!==78 || bytes[3]!==71) throw new Error("imagem PNG inválida no endpoint")
          const form=new FormData()
          form.set("chat_id",chat)
          form.set("caption",caption)
          form.set("parse_mode","HTML")
          form.set("photo",new Blob([bytes],{type:"image/png"}),"cupom-magalu.png")
          rr=await fetch(`https://api.telegram.org/bot${T}/sendPhoto`,{method:"POST",body:form})
          jj=await rr.json()
        }catch(imageError){
          console.error("Magalu coupon fixed image fallback:",imageError)
          deliveryMode="text"
          fallbackReason=imageError instanceof Error?imageError.message:String(imageError)
          rr=await fetch(`https://api.telegram.org/bot${T}/sendMessage`,{
            method:"POST",headers:{"content-type":"application/json"},
            body:JSON.stringify({chat_id:chat,text:caption,parse_mode:"HTML",disable_web_page_preview:true})
          })
          jj=await rr.json()
        }
      }
      // Se o Telegram rejeitar a arte (ex.: IMAGE_PROCESS_FAILED),
      // o cupom continua prioritário: publica imediatamente em texto em vez de perder a oportunidade.
      if(!rr.ok||!jj.ok){
        const photoError=String(jj?.description||`Telegram HTTP ${rr.status}`)
        console.error("Magalu coupon photo failed, fallback to text:",photoError)
        deliveryMode="text"
        fallbackReason=photoError
        rr=await fetch(`https://api.telegram.org/bot${T}/sendMessage`,{
          method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({chat_id:chat,text:caption,parse_mode:"HTML",disable_web_page_preview:true})
        })
        jj=await rr.json()
        if(!rr.ok||!jj.ok) throw new Error(jj?.description||`Telegram HTTP ${rr.status}`)
      }

      for(const extra of extras){
        const er=await fetch(`https://api.telegram.org/bot${T}/sendMessage`,{
          method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({chat_id:chat,text:extra,parse_mode:"HTML",disable_web_page_preview:true})
        })
        const ej=await er.json()
        if(!er.ok||!ej.ok) throw new Error(ej?.description||`Telegram HTTP ${er.status}`)
      }
      for(const x of items){
        await db.from("flow_coupon_delivery_logs").insert({
          user_id:userId,delivery_job_id:x.job_id,coupon_id:x.coupon_id,channel_id:x.channel_id,status:"sent",
          external_message_id:String(jj.result?.message_id||""),
          metadata:{provider:"telegram",worker:"magalu-coupon-publish",coupon_fingerprint:x.fp,bundle_size:unique.length,day_sp:day,delivery_mode:deliveryMode,image_source:imageBase64?"base64":"fixed",fallback_reason:fallbackReason||null}
        })
        await db.from("flow_coupon_delivery_jobs").update({status:"sent",sent_at:new Date().toISOString(),error_message:null}).eq("id",x.job_id)
        sent++
      }
      // Post-publication, enqueue only future coupon bundles; Telegram stays independent.
      try{await queueWhapiMagalu(db,channelId,userId,String(jj.result?.message_id||""),caption,extras,deliveryMode)}
      catch(mirrorError){console.error("Whapi Magalu mirror queue:",mirrorError instanceof Error?mirrorError.message:String(mirrorError))}
    }catch(e){
      const msg=e instanceof Error?e.message:String(e)
      for(const x of items){
        await db.from("flow_coupon_delivery_jobs").update({status:"failed",error_message:msg}).eq("id",x.job_id)
        failed++
      }
    }
  }

  return out({ok:true,received:inputs.length,created,updated,unchanged,jobs,sent,failed,groups:dueByChannel.size,errors})
})

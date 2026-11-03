import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const AUTH_HASH="3efb0f37ba962d865839b2beeffd672787e652b4059e4de53940403421cfd423";
const respond=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
async function authOk(req:Request){
 const a=req.headers.get("authorization")||"";
 if(!a.startsWith("Bearer "))return false;
 const b=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(a.slice(7))));
 return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("")===AUTH_HASH;
}
async function telegram(token:string,method:string,body?:Record<string,unknown>) {
 const response=await fetch("https://api.telegram.org/bot"+token+"/"+method,{
  method:body?"POST":"GET",
  headers:body?{"content-type":"application/json"}:undefined,
  body:body?JSON.stringify(body):undefined,
  signal:AbortSignal.timeout(12000)
 });
 const payload=await response.json();
 if(!response.ok || !payload?.ok)throw new Error("telegram_operation_failed");
 return payload.result;
}
Deno.serve(async req=>{
 if(req.method!=="POST")return respond({ok:false,error:"post_only"},405);
 if(!await authOk(req))return respond({ok:false,error:"unauthorized"},401);
 const request=await req.json().catch(()=>({}));
 if(!["status","setup"].includes(request.mode))return respond({ok:false,error:"mode"},400);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const botToken=Deno.env.get("MAVURI_TG_INTAKE_BOT_TOKEN")||"";
 const secret=Deno.env.get("MAVURI_TG_INTAKE_WEBHOOK_SECRET")||"";
 const allowedUsers=Deno.env.get("MAVURI_TG_INTAKE_ALLOWED_USER_IDS")||"";
 const allowedChannels=Deno.env.get("MAVURI_TG_INTAKE_ALLOWED_CHANNEL_IDS")||"";
 if(!url||!botToken||!/^[A-Za-z0-9_-]{32,256}$/.test(secret)||
    !allowedUsers.trim()&&!allowedChannels.trim())return respond({ok:false,error:"intake_secrets_or_allowlist_not_configured"},503);
 try{
  const bot=await telegram(botToken,"getMe");
  const botName=String(bot?.username||"");
  // Never take over the existing Mavuri publishing bot or another webhook.
  if(botName.toLowerCase()==="mavuriofertasbot")return respond({ok:false,error:"publishing_bot_must_not_be_modified"},409);
  const webhook=await telegram(botToken,"getWebhookInfo");
  const target=url.replace(/\/+$/,"")+"/functions/v1/mavuri-telegram-source-intake";
  if(webhook?.url&&webhook.url!==target)return respond({ok:false,error:"existing_other_webhook_preserved"},409);
  if(request.mode==="status")return respond({ok:true,bot_username:botName,webhook_matches:webhook?.url===target,
    webhook_unset:!webhook?.url});
  if(webhook?.url===target)return respond({ok:true,bot_username:botName,webhook_configured:true,already_set:true});
  await telegram(botToken,"setWebhook",{url:target,secret_token:secret,
    allowed_updates:["message","channel_post"],drop_pending_updates:false,max_connections:10});
  const check=await telegram(botToken,"getWebhookInfo");
  return respond({ok:check?.url===target,bot_username:botName,
    webhook_configured:check?.url===target,
    no_existing_bot_changed:true,telegram_channel_posts_require_permission:true});
 }catch{return respond({ok:false,error:"telegram_api_setup_failed"},502)}
});
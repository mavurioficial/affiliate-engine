import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.1";
import { parseTelegramRetailUpdate } from "./parse.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const SERVICE_KEY = keys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const INBOUND_SECRET = Deno.env.get("MAVURI_TG_INTAKE_WEBHOOK_SECRET") || "";
const allowedUsers = new Set(
  String(Deno.env.get("MAVURI_TG_INTAKE_ALLOWED_USER_IDS")||"")
    .split(",").map(x=>x.trim()).filter(x=>/^[0-9]{4,20}$/.test(x))
);
const allowedChannels = new Set(
  String(Deno.env.get("MAVURI_TG_INTAKE_ALLOWED_CHANNEL_IDS")||"")
    .split(",").map(x=>x.trim()).filter(x=>/^-?[0-9]{4,20}$/.test(x))
);
const response=(payload:any,status=200)=>new Response(JSON.stringify(payload),{status,
 headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

function secretMatches(received:string,expected:string) {
 const valid=(x:string)=>/^[A-Za-z0-9_-]{32,256}$/.test(x);
 if(!valid(received)||!valid(expected))return false;
 const a=new TextEncoder().encode(received),b=new TextEncoder().encode(expected);
 let diff=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a[i]||0)^(b[i]||0);
 return diff===0;
}
function isAllowedMessage(update:any) {
 const message=update?.message||update?.channel_post;
 if(!message||typeof message!=="object")return false;
 if(message.chat?.type==="private"){
   if(!message.from?.id||message.from?.is_bot)return false;
   return allowedUsers.has(String(message.from.id));
 }
 if(message.chat?.type==="channel")return allowedChannels.has(String(message.chat.id));
 return false;
}

Deno.serve(async (req:Request)=>{
 if(req.method!=="POST")return response({ok:false,error:"post_only"},405);
 if(!SUPABASE_URL||!SERVICE_KEY||!INBOUND_SECRET||(!allowedUsers.size&&!allowedChannels.size))
   return response({ok:false,error:"intake_not_configured"},503);
 if(!secretMatches(req.headers.get("x-telegram-bot-api-secret-token")||"",INBOUND_SECRET))
   return response({ok:false,error:"unauthorized"},401);
 if(Number(req.headers.get("content-length")||0)>65536)return response({ok:false,error:"too_large"},413);
 let update:any;
 try{
  const raw=await req.text();
  if(raw.length>65536)return response({ok:false,error:"too_large"},413);
  update=JSON.parse(raw);
 }catch{return response({ok:false,error:"bad_json"},400)}
 if(!Number.isSafeInteger(update?.update_id))return response({ok:false,error:"bad_telegram_update"},400);
 if(!isAllowedMessage(update))return response({ok:true,accepted:0,reason:"sender_not_allowlisted"});
 let parsed;
 try{parsed=parseTelegramRetailUpdate(update)}catch{return response({ok:false,error:"parse_failed"},422)}
 if(!parsed.candidates.length)return response({ok:true,accepted:0,reason:parsed.reason});
 const supabase=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
 let accepted=0;
 for(const candidate of parsed.candidates){
  const {error}=await supabase.rpc("mavuri_telegram_candidate_insert",{
   p_source_ref:candidate.source_ref,
   p_source_message_url:candidate.source_message_url,
   p_marketplace:candidate.marketplace,
   p_original_link:candidate.original_link,
   p_claimed_title:candidate.claimed_title,
   p_claimed_price_brl:candidate.claimed_price_brl,
   p_price_conditions:candidate.price_conditions
  });
  if(error){console.error("Mavuri Telegram intake candidate insert failed",error.code||"db_error");
   return response({ok:false,error:"candidate_persistence_failed",accepted},503);}
  accepted++;
 }
 return response({ok:true,accepted,publication_allowed:false,source:"telegram_bot_forward"});
});
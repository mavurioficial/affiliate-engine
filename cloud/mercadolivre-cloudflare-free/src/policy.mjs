// Public, hard-coded paths only. No affiliate account, cookies, products or payment.
export const TARGETS=Object.freeze([
  Object.freeze({key:"ml_home",url:"https://www.mercadolivre.com.br/"}),
  Object.freeze({key:"ml_guest_hub",url:"https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true"})
]);
export function summarize(key,status,finalUrl){
 let redirectedToLogin=false;
 try{redirectedToLogin=/\b(login|entrar|identification|auth|signin)\b/i.test(new URL(finalUrl).pathname)}catch{}
 return {target:key,status:typeof status==="number"?status:null,
   redirected_to_login:redirectedToLogin};
}
export function safeReport(results){return {ok:true,read_only:true,account_authenticated:false,
 generated_affiliate_links:0,database_writes:0,telegram_posts:0,results};}

// Cloudflare Workers Free Browser Run: 600 seconds/day across all sessions.
// Reserve 120s/day to avoid relying on every final second of the allowance.
export const FREE_BROWSER_SECONDS_PER_DAY=600;
export const SAFETY_RESERVE_SECONDS=120;
export const SCHEDULED_STARTS_PER_DAY=28; // 08:00 to 21:30, every 30 min
export function planFreeDailyCapacity(browserSeconds){
 if(!Number.isFinite(browserSeconds)||browserSeconds<=0)
   return {valid:false,safe_cycles:0,quota_seconds:FREE_BROWSER_SECONDS_PER_DAY,
     reserve_seconds:SAFETY_RESERVE_SECONDS};
 const usable=FREE_BROWSER_SECONDS_PER_DAY-SAFETY_RESERVE_SECONDS;
 const cap=Math.min(SCHEDULED_STARTS_PER_DAY,Math.floor(usable/browserSeconds));
 return {valid:true,safe_cycles:cap,quota_seconds:FREE_BROWSER_SECONDS_PER_DAY,
   reserve_seconds:SAFETY_RESERVE_SECONDS,usable_seconds:usable,
   measured_browser_seconds:Math.ceil(browserSeconds*100)/100,
   single_cycle_share_percent:Math.round(browserSeconds/FREE_BROWSER_SECONDS_PER_DAY*1000)/10};
}

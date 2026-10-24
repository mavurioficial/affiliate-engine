// Public, hard-coded paths only. No affiliate account, cookies, products or payment.
export const TARGETS=Object.freeze([
  Object.freeze({key:"ml_home",url:"https://www.mercadolivre.com.br/"}),
  Object.freeze({key:"ml_guest_hub",url:"https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true"})
]);
export function summarize(key,status,finalUrl){
 let redirectedToLogin=false;
 try{redirectedToLogin=/\\b(login|entrar|identification|auth|signin)\\b/i.test(new URL(finalUrl).pathname)}catch{}
 return {target:key,status:typeof status==="number"?status:null,
   redirected_to_login:redirectedToLogin};
}
export function safeReport(results){return {ok:true,read_only:true,account_authenticated:false,
 generated_affiliate_links:0,database_writes:0,telegram_posts:0,results};}

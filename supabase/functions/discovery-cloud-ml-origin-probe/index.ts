// Mercado Livre public-origin feasibility test. READ-ONLY and owner-authenticated.
// No Mercado Livre credentials, no cookies, no scraping, no deep links, no writes.
import {createClient} from "npm:@supabase/supabase-js@2";
const cors={"access-control-allow-origin":"https://mavurioficial.github.io",
 "access-control-allow-headers":"authorization,apikey,content-type,x-client-info",
 "access-control-allow-methods":"POST,OPTIONS",
 "content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const reply=(result:unknown,status=200)=>new Response(JSON.stringify(result),{status,headers:cors});
const targets=[
 {key:"public_home",url:"https://www.mercadolivre.com.br/"},
 {key:"public_sites_api",url:"https://api.mercadolibre.com/sites/MLB"},
 {key:"public_currency_api",url:"https://api.mercadolibre.com/currencies/BRL"},
 {key:"affiliate_hub_guest",url:"https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true"}
];
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({ok:false,reason:"post_only"},405);
 const auth=req.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer "))return reply({ok:false,reason:"owner_auth_required"},401);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");
 const key=String(keys.default||Deno.env.get("SUPABASE_ANON_KEY")||"");
 if(!url||!key)return reply({ok:false,reason:"auth_service_unavailable"},503);
 const client=createClient(url,key,{global:{headers:{Authorization:auth}},
   auth:{persistSession:false,autoRefreshToken:false}});
 const user=await client.auth.getUser();
 if(user.error||!user.data.user)return reply({ok:false,reason:"owner_auth_invalid"},401);
 const report=[];
 for(const target of targets){
  let status:number|null=null,denied=false,blocked=false,redirect=false,reason:null|string=null;
  const start=Date.now();
  try{
   const response=await fetch(target.url,{method:"GET",redirect:"manual",
     headers:{Accept:target.key.includes("api")?"application/json":"text/html"},
     signal:AbortSignal.timeout(12000)});
   status=response.status;
   denied=response.status===403;
   blocked=response.status===429;
   redirect=response.status>=300&&response.status<400;
   await response.body?.cancel().catch(()=>{});
  }catch(e){reason=e instanceof Error && e.name==="TimeoutError"?
    "timeout":"network_error";}
  report.push({target:target.key,http_status:status,denied,rate_limited:blocked,
    redirected:redirect,network_error:reason,elapsed_ms:Date.now()-start});
 }
 const publicApi=report.filter(x=>x.target==="public_sites_api"||x.target==="public_currency_api");
 const publicHome=report.find(x=>x.target==="public_home");
 return reply({ok:true,mode:"ml_public_origin_probe",read_only:true,owner_authenticated:true,
   generated_links:0,posts:0,database_writes:0,credentials_used:false,
   public_api_reachable:publicApi.some(x=>x.http_status===200),
   public_home_reachable:publicHome?.http_status===200||publicHome?.redirected===true,
   results:report});
});

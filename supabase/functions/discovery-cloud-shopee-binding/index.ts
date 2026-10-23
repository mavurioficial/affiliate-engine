// Mavuri Shopee Open API owner-confirmed account binding.
// This function updates ONLY integration settings. It NEVER touches flow_offers,
// flow_delivery_jobs, cloud control, cron, or Telegram. Keep as separate Edge function.
const ORIGIN="https://mavurioficial.github.io";
const h={"content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "access-control-allow-origin":ORIGIN,"access-control-allow-methods":"POST, OPTIONS",
  "access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
  "vary":"Origin"};
const respond=(v:Record<string,unknown>,status=200)=>
  new Response(JSON.stringify(v),{status,headers:h});
const hash=async (v:string)=>new Uint8Array(await crypto.subtle.digest("SHA-256",
  new TextEncoder().encode(v)));
const hex=(u:Uint8Array)=>Array.from(u).map(v=>v.toString(16).padStart(2,"0")).join("");
const constantEqual=(a:Uint8Array,b:Uint8Array)=>{
  if(a.length!==b.length)return false;let different=0;
  for(let i=0;i<a.length;i++)different|=a[i]^b[i];
  return different===0;
};
function baseConfig(req:Request){
  const base=String(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
  const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");
  const key=keys.default||Deno.env.get("SUPABASE_ANON_KEY")||"";
  const auth=req.headers.get("authorization")||"";
  if(!base||!key||!/^Bearer\s+\S+$/i.test(auth))
    throw Error("auth_configuration_missing");
  return {base,key,auth,headers:{apikey:key,Authorization:auth}};
}
async function ownerIdentity(c:ReturnType<typeof baseConfig>){
  const r=await fetch(c.base+"/auth/v1/user",{headers:c.headers,
    signal:AbortSignal.timeout(7000)});
  if(!r.ok)return null;
  const j=await r.json();
  return typeof j?.id==="string"?j.id:null;
}
async function getRows(c:ReturnType<typeof baseConfig>,table:string,
  p:Record<string,string>) {
  const url=new URL(c.base+"/rest/v1/"+table);
  Object.entries(p).forEach(([k,v])=>url.searchParams.set(k,v));
  const r=await fetch(url,{headers:{...c.headers,Accept:"application/json"},
    signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error("scoped_read_"+r.status);
  const items=await r.json();
  if(!Array.isArray(items))throw Error("scoped_read_invalid");
  return items;
}
async function testOfficialShopeeApi(appid:string,secret:string){
  const body=JSON.stringify({query:"{ productOfferV2(listType: 2, sortType: 2, page: 1, limit: 1) { nodes { itemId } pageInfo { hasNextPage } } }"});
  const now=Math.floor(Date.now()/1000);
  const signature=hex(await hash(appid+now+body+secret));
  const r=await fetch("https://open-api.affiliate.shopee.com.br/graphql",{
    method:"POST",headers:{"content-type":"application/json",
      Authorization:`SHA256 Credential=${appid}, Timestamp=${now}, Signature=${signature}`},
    body,signal:AbortSignal.timeout(14000)
  });
  if(!r.ok)return false;
  const json=await r.json();
  return !json?.errors&&Array.isArray(json?.data?.productOfferV2?.nodes);
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return respond({ok:false,reason:"post_only"},405);
  try{
    const c=baseConfig(req);
    const owner=await ownerIdentity(c);
    if(!owner||owner!==Deno.env.get("MAVURI_SHOPEE_CLOUD_OWNER_USER_ID"))
      return respond({ok:false,reason:"owner_only"},403);
    if(!/^(1|true|yes)$/i.test(String(Deno.env.get("MAVURI_SHOPEE_CLOUD_PREVIEW_ENABLED")||"")))
      return respond({ok:false,reason:"disabled"},403);
    const data=await req.json().catch(()=>({}));
    const supplied=String(data?.portal_app_id||"").trim();
    if(data?.intent!=="bind_shopee_open_api"||data?.confirm!==true||
      !/^[0-9]{5,24}$/.test(supplied))
      return respond({ok:false,reason:"explicit_confirmation_required"},400);
    const configured=String(Deno.env.get("SHOPEE_AFFILIATE_APP_ID")||"").trim();
    const secret=String(Deno.env.get("SHOPEE_AFFILIATE_SECRET")||"");
    if(!/^[0-9]{5,24}$/.test(configured)||!secret)
      return respond({ok:false,reason:"api_credentials_unavailable"},503);
    if(!constantEqual(await hash(supplied),await hash(configured)))
      return respond({ok:false,app_id_matches:false,reason:"app_id_mismatch"},409);
    const markets=await getRows(c,"flow_marketplaces",{select:"id",slug:"eq.shopee",limit:"2"});
    if(markets.length!==1)throw Error("shopee_marketplace_ambiguous");
    const accounts=await getRows(c,"flow_affiliate_accounts",{
      select:"id,user_id,marketplace_id,status,settings,updated_at",
      user_id:"eq."+owner,marketplace_id:"eq."+markets[0].id,
      status:"eq.connected",limit:"3"
    });
    if(accounts.length!==1)throw Error("affiliate_account_ambiguous");
    const account=accounts[0];
    if(account.user_id!==owner||account.marketplace_id!==markets[0].id||
      account.status!=="connected"||!account.id)throw Error("account_scope_failed");
    // Prove the secret works at the official Shopee GraphQL endpoint NOW.
    if(!(await testOfficialShopeeApi(configured,secret)))
      return respond({ok:false,reason:"shopee_credential_test_failed"},503);
    const current=account.settings;
    if(!current||typeof current!=="object"||Array.isArray(current))
      throw Error("invalid_account_settings");
    const expectedHash=hex(await hash(configured));
    const already=current.open_api_app_id_sha256===expectedHash &&
      current.open_api_status==="active" &&
      current.open_api_binding_source==="user_confirmed_portal_app_id";
    if(already)return respond({ok:true,bound:true,changed:false,
      publication_enabled:false,schedule_enabled:false,
      affiliate_external_id_confirmed:false});
    const settings={...current,open_api_status:"active",
      open_api_app_id_sha256:expectedHash,
      open_api_binding_source:"user_confirmed_portal_app_id",
      open_api_verified_at:new Date().toISOString()};
    // Optimistic compare-and-swap; simultaneous account changes abort the PATCH.
    const url=new URL(c.base+"/rest/v1/flow_affiliate_accounts");
    url.searchParams.set("id","eq."+account.id);
    url.searchParams.set("user_id","eq."+owner);
    url.searchParams.set("updated_at","eq."+account.updated_at);
    const patch=await fetch(url,{
      method:"PATCH",headers:{...c.headers,"content-type":"application/json",
        Prefer:"return=representation"},
      body:JSON.stringify({settings,updated_at:new Date().toISOString()}),
      signal:AbortSignal.timeout(9000)
    });
    if(!patch.ok)throw Error("account_update_"+patch.status);
    const written=await patch.json();
    if(!Array.isArray(written)||written.length!==1)throw Error("account_update_conflict");
    return respond({ok:true,bound:true,changed:true,
      publication_enabled:false,schedule_enabled:false,
      affiliate_external_id_confirmed:false});
  }catch(e){
    // Never emit sensitive account identifiers, credentials, URLs or inputs.
    const msg=e instanceof Error?e.message:"unexpected_error";
    const code=/^account_update_conflict$/.test(msg)?409:500;
    return respond({ok:false,reason:code===409?"account_changed_retry":"binding_failed"},code);
  }
});

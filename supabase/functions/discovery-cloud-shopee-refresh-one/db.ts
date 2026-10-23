// JWT owner context: never use service_role keys for this pilot.
// All Data API access remains under owner's normal RLS.
export async function authorizeOwner(req:Request){
 const base=String(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
 const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");
 const key=String(keys.default||Deno.env.get("SUPABASE_ANON_KEY")||"");
 const bearer=req.headers.get("Authorization")||"";
 if(!base||!key||!(/^Bearer\s+\S+$/i).test(bearer))throw Error("auth_required");
 const headers={apikey:key,Authorization:bearer};
 const userResp=await fetch(base+"/auth/v1/user",{
  headers,signal:AbortSignal.timeout(7000)});
 if(!userResp.ok)throw Error("auth_required");
 const user=await userResp.json();
 const owner=String(Deno.env.get("MAVURI_SHOPEE_CLOUD_OWNER_USER_ID")||"");
 if(!owner||user?.id!==owner||!(/^(1|yes|true)$/i)
 .test(String(Deno.env.get("MAVURI_SHOPEE_CLOUD_PREVIEW_ENABLED")||"")))
  throw Error("owner_disabled");
 return {base,headers,owner};
}
export type DbContext=Awaited<ReturnType<typeof authorizeOwner>>;
export async function readRows(ctx:DbContext,table:string,filters:Record<string,string>){
 const u=new URL(ctx.base+"/rest/v1/"+table);
 for(const [key,val] of Object.entries(filters))u.searchParams.set(key,val);
 const res=await fetch(u,{headers:{...ctx.headers,Accept:"application/json"},signal:AbortSignal.timeout(9000)});
 if(!res.ok)throw Error("db_read");
 const out=await res.json();
 if(!Array.isArray(out))throw Error("invalid_db_data");
 return out as Array<Record<string,any>>;
}
export async function verifyAccount(ctx:DbContext,appId:string){
 const market=await readRows(ctx,"flow_marketplaces",{
  select:"id",slug:"eq.shopee",limit:"2"});
 if(market.length!==1)throw Error("ambiguous_marketplace");
 const account=(await readRows(ctx,"flow_affiliate_accounts",{
  select:"id,user_id,marketplace_id,external_account_id,settings",
  user_id:"eq."+ctx.owner,status:"eq.connected",limit:"10"}))
  .filter(r=>r.marketplace_id===market[0].id);
 if(account.length!==1)throw Error("ambiguous_account");
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(appId));
 const sha=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
 const a=account[0];
 if(!String(a.external_account_id||"").trim()||
 a.settings?.open_api_status!=="active"||
 a.settings?.open_api_binding_source!=="user_confirmed_portal_app_id"||
 a.settings?.open_api_app_id_sha256!==sha)
  throw Error("affiliate_unverified");
 return {marketplaceId:String(market[0].id),accountId:String(a.id)};
}

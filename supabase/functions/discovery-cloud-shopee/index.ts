import {collectUniqueOffers,previewSummary,SHOPEE_V85_SPECS,SHOPEE_BALANCED_QUOTAS,selectShopeeBalancedCandidates} from "./shopee-core.mjs";

/**
 * Cloud Discovery V85 phase A — READ ONLY.
 * NO INSERTS, NO publish calls, NO Cron, NO activation of the cloud lease.
 * Default behavior is unavailable for live probes unless explicit secret flag is set.
 */
const JSON_HEADERS = {"content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "access-control-allow-origin":"https://mavurioficial.github.io",
  "access-control-allow-methods":"POST, OPTIONS",
  "access-control-allow-headers":"authorization, x-client-info, apikey, content-type",
  "vary":"Origin"};
const API_URL = "https://open-api.affiliate.shopee.com.br/graphql";
const flag = (v: string | undefined)=> /^(true|1|yes)$/i.test(String(v || ""));

function respond(body: Record<string,unknown>, status=200) {
  return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
}
async function authenticate(req: Request): Promise<string | null> {
  const bearer = req.headers.get("Authorization") || "";
  const token = /^Bearer\s+(\S+)$/i.exec(bearer)?.[1];
  if (!token) return null;
  const url = Deno.env.get("SUPABASE_URL") || "";
  const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
  const apikey = keys.default || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url || !apikey) return null;
  const response = await fetch(url + "/auth/v1/user",{
    headers: { Authorization: "Bearer " + token, apikey },
    signal:AbortSignal.timeout(7000)
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === "string" ? user.id : null;
}
function queryFor(spec: {listType:number;sortType:number},page:number,limit:number) {
  return `{ productOfferV2(listType: ${spec.listType}, sortType: ${spec.sortType}, page: ${page}, limit: ${limit}) {
    nodes {itemId productName productLink offerLink imageUrl priceMin priceMax priceDiscountRate sales ratingStar
      commissionRate sellerCommissionRate shopeeCommissionRate commission shopId shopName shopType periodStartTime periodEndTime}
    pageInfo {page limit hasNextPage} } }`;
}
async function signedShopeeQuery(query: string) {
  const appId = Deno.env.get("SHOPEE_AFFILIATE_APP_ID") || "";
  const secret = Deno.env.get("SHOPEE_AFFILIATE_SECRET") || "";
  if (!appId || !secret) throw new Error("shopee_credentials_missing");
  const body = JSON.stringify({query});
  const timestamp = Math.floor(Date.now()/1000);
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${appId}${timestamp}${body}${secret}`));
  const signature=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
  const response=await fetch(API_URL,{
    method:"POST",
    headers:{"Content-Type":"application/json",
      "Authorization":`SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`},
    body,signal:AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error("shopee_http_" + response.status);
  const data=await response.json();
  if (Array.isArray(data?.errors) && data.errors.length) throw new Error("shopee_graphql_error");
  return data?.data?.productOfferV2 || {nodes:[],pageInfo:{}};
}
async function livePreview() {
  const pools: Record<string, unknown[]> = Object.fromEntries(SHOPEE_V85_SPECS.map(spec=>[spec.label,[]]));
  const exhausted: Record<string,boolean> = Object.fromEntries(SHOPEE_V85_SPECS.map(spec=>[spec.label,false]));
  const sources=[];
  let selection=selectShopeeBalancedCandidates(pools);
  // Query one page of each source before expanding any one source:
  // quotas: top=30, commission=25, recommended=25, up to 3 pages per source.
  // Each query only reads Shopee GraphQL; no inserts, ingest, jobs or sends.
  for(let page=1;page<=3;page++) {
    for(const spec of SHOPEE_V85_SPECS) {
      if(exhausted[spec.label]) continue;
      const payload=await signedShopeeQuery(queryFor(spec,page,30));
      const nodes=Array.isArray(payload.nodes)?payload.nodes:[];
      pools[spec.label].push(...nodes);
      exhausted[spec.label]=nodes.length<30 || payload?.pageInfo?.hasNextPage===false;
      sources.push({
        list:spec.label,page,received:nodes.length,
        accumulated:pools[spec.label].length,
        has_next_page:!exhausted[spec.label]
      });
    }
    selection=selectShopeeBalancedCandidates(pools);
    const targetSatisfied=SHOPEE_V85_SPECS.every(spec =>
      (selection.primary_by_source as Record<string,number>)[spec.label]>=(SHOPEE_BALANCED_QUOTAS as Record<string,number>)[spec.label] || exhausted[spec.label]
    );
    if(selection.offers.length>=80 && targetSatisfied) break;
    if(SHOPEE_V85_SPECS.every(spec=>exhausted[spec.label])) break;
  }
  return {
    summary:previewSummary(selection.offers),
    sources,
    selected_by_source:selection.selected_by_source,
    primary_by_source:selection.primary_by_source,
    quota_by_source:SHOPEE_BALANCED_QUOTAS,
    backfill_added:selection.backfill_added
  };
}
Deno.serve(async(req: Request)=>{
  if(req.method === "OPTIONS") return new Response(null,{status:204,headers:JSON_HEADERS});
  if(req.method !== "POST") return respond({error:"post_only"},405);
  try{
    const userId=await authenticate(req);
    if(!userId) return respond({error:"unauthorized"},401);
    const input=await req.json().catch(()=>({}));
    const mode=String(input?.mode || "health");
    if(mode==="health") {
      const previewEnabled=flag(Deno.env.get("MAVURI_SHOPEE_CLOUD_PREVIEW_ENABLED"));
      const ownerConfigured=Boolean(Deno.env.get("MAVURI_SHOPEE_CLOUD_OWNER_USER_ID"));
      const ownerAuthorized=userId===Deno.env.get("MAVURI_SHOPEE_CLOUD_OWNER_USER_ID");
      const appIdConfigured=Boolean(Deno.env.get("SHOPEE_AFFILIATE_APP_ID"));
      const apiSecretConfigured=Boolean(Deno.env.get("SHOPEE_AFFILIATE_SECRET"));
      return respond({
        ok:true,stage:"shopee_read_only",cloud_publishing:false,cloud_schedule:false,
        local_runner_must_remain_active:true,
        live_preview_enabled:previewEnabled,
        preview_owner_configured:ownerConfigured,
        preview_owner_matches_session:ownerAuthorized,
        shopee_app_id_configured:appIdConfigured,
        shopee_api_secret_configured:apiSecretConfigured,
        ready_for_live_preview:previewEnabled && ownerAuthorized && appIdConfigured && apiSecretConfigured
      });
    }
    if(mode==="fixture"){
      const fixtures=[
        {itemId:"1",productName:"Liquidificador",priceMin:199,priceDiscountRate:0.2,offerLink:"https://s.shopee.com.br/a",imageUrl:"https://example.com/a.jpg"},
        {itemId:"1",productName:"Liquidificador",priceMin:199,priceDiscountRate:0.2,offerLink:"https://s.shopee.com.br/a",imageUrl:"https://example.com/a.jpg"},
        {itemId:"2",productName:"Notebook SSD",priceMin:2000,priceDiscountRate:0.08,offerLink:"https://s.shopee.com.br/b",imageUrl:"https://example.com/b.jpg"}
      ];
      return respond({ok:true,mode:"fixture",dry_run:true,cloud_publishing:false,summary:previewSummary(collectUniqueOffers(fixtures))});
    }
    if(mode!=="live_preview") return respond({error:"unsupported_mode"},400);
    // Explicitly disabled by default. Live preview cannot write or publish.
    if(!flag(Deno.env.get("MAVURI_SHOPEE_CLOUD_PREVIEW_ENABLED")))
      return respond({error:"live_preview_disabled",dry_run:true},403);
    const ownerId=String(Deno.env.get("MAVURI_SHOPEE_CLOUD_OWNER_USER_ID") || "");
    if(!ownerId || userId!==ownerId) return respond({error:"not_authorized_for_live_preview"},403);
    if(!Deno.env.get("SHOPEE_AFFILIATE_APP_ID") || !Deno.env.get("SHOPEE_AFFILIATE_SECRET"))
      return respond({error:"shopee_credentials_missing",dry_run:true},503);
    const result=await livePreview();
    console.log("[discovery-cloud-shopee] preview candidates="+result.summary.candidates+" requests="+result.sources.length+" source_counts="+JSON.stringify(result.selected_by_source));
    return respond({ok:true,mode:"live_preview",dry_run:true,cloud_publishing:false,...result});
  }catch(err) {
    const reason=err instanceof Error?err.message:"unknown";
    // Never log request headers, Shopee signatures, credentials or affiliate URLs.
    console.error("[discovery-cloud-shopee] "+String(reason).slice(0,120));
    return respond({ok:false,error:/^shopee_(credentials_missing|http_\d+|graphql_error)$/.test(reason)?reason:"preview_failed"},502);
  }
});

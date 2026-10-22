import {collectUniqueOffers,previewSummary,SHOPEE_V85_SPECS,SHOPEE_BALANCED_QUOTAS,selectShopeeBalancedCandidates,diagnoseShopeeSources} from "./shopee-core.mjs";
import {simulateShopeeCloudSelection,SHOPEE_CLOUD_POLICY} from "./shopee-policy.mjs";
import {summarizeShopeeSentHistory} from "./shopee-history.mjs";

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
    backfill_added:selection.backfill_added,
    source_diagnostics:diagnoseShopeeSources(pools,selection)
  };
}
// GET-only, user's own Supabase JWT. RLS is the authoritative permission check.
async function ownerRlsGet(req: Request, table: string, params: Record<string,string>) {
  const base=String(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
  const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");
  const apikey=keys.default||Deno.env.get("SUPABASE_ANON_KEY")||"";
  const authorization=req.headers.get("authorization")||"";
  if(!base||!apikey||!/^Bearer\s+\S+$/i.test(authorization))throw Error("history_auth_unavailable");
  const url=new URL(base+"/rest/v1/"+table);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const res=await fetch(url,{method:"GET",headers:{apikey,Authorization:authorization,Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error("history_rest_"+res.status);
  const rows=await res.json();
  if(!Array.isArray(rows))throw Error("history_not_array");
  return rows;
}
async function readShopeeHistory(req: Request) {
  const marketplaces=await ownerRlsGet(req,"flow_marketplaces",{select:"id",slug:"eq.shopee",limit:"1"});
  const id=String(marketplaces[0]?.id||"");
  if(!id)throw Error("shopee_marketplace_not_found");
  const now=new Date(),since=new Date(now.getTime()-7*24*3600000).toISOString();
  const rows=[];
  for(let page=0;page<10;page++){
    const batch=await ownerRlsGet(req,"flow_delivery_logs",{
      select:"created_at,channel_id,status,metadata,flow_offers!inner(source_ref,marketplace_id)",
      status:"eq.sent",created_at:"gte."+since,
      "flow_offers.marketplace_id":"eq."+id,
      order:"created_at.asc",limit:"500",offset:String(page*500)
    });
    rows.push(...batch);
    if(batch.length<500)break;
    if(page===9)throw Error("history_too_many_rows");
  }
  return summarizeShopeeSentHistory(rows,{since_iso:since,now_iso:now.toISOString()});
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
    if(mode==="history_preview") {
      const owner=String(Deno.env.get("MAVURI_SHOPEE_CLOUD_OWNER_USER_ID")||"");
      if(!owner||userId!==owner)return respond({error:"history_owner_only"},403);
      const summary=await readShopeeHistory(req);
      console.log("[discovery-cloud-shopee] history sent="+summary.sent_deliveries+
        " snapshots="+summary.snapshot_price_valid+
        " repeats48="+summary.same_item_channel_repeat_within_48h);
      return respond({ok:true,mode:"history_preview",dry_run:true,cloud_publishing:false,
        cloud_schedule:false,summary});
    }
    if(mode==="policy_fixture") {
      // Intentionally hard-coded fixture only. No secrets / API / DB / delivery.
      const offer=(itemid: string,discount_percentage: number)=>({
        itemid,title:"Fone bluetooth modelo "+itemid,price:90,sale_price:90,
        discount_percentage,
        affiliate_url:"https://s.shopee.com.br/fixture"+itemid,
        image_link:"https://example.com/fixture.jpg",
        global_category1:"Mobile & Gadgets",channel_ids:["fixture-geral"],
        _mavuri_api:{shop_id:"fixture-shop",commission_rate:0.12,sales:12}
      });
      const report=simulateShopeeCloudSelection({
        candidates:[offer("old",50),offer("eligible",30),offer("below",3)],
        sent_history:[{
          itemid:"old",channel_id:"fixture-geral",sent_at:"2026-10-22T12:00:00Z",
          published_price:90,status:"sent"
        }],
        pending_history:[],connected_telegram_channel_ids:["fixture-geral"],
        now_iso:"2026-10-22T18:00:00Z"
      });
      return respond({ok:true,mode:"policy_fixture",dry_run:true,cloud_publishing:false,
        policy:SHOPEE_CLOUD_POLICY,
        result:{selected_unique_offers:report.selected_unique_offers,
          projected_delivery_jobs:report.projected_delivery_jobs,
          counts:report.counts}});
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
    console.log("[discovery-cloud-shopee] preview candidates="+result.summary.candidates+" requests="+result.sources.length+" source_counts="+JSON.stringify(result.selected_by_source)+" source_diagnostics="+JSON.stringify(result.source_diagnostics));
    return respond({ok:true,mode:"live_preview",dry_run:true,cloud_publishing:false,...result});
  }catch(err) {
    const reason=err instanceof Error?err.message:"unknown";
    // Never log request headers, Shopee signatures, credentials or affiliate URLs.
    console.error("[discovery-cloud-shopee] "+String(reason).slice(0,120));
    return respond({ok:false,error:/^shopee_(credentials_missing|http_\d+|graphql_error)$/.test(reason)?reason:"preview_failed"},502);
  }
});

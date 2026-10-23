import {collectUniqueOffers,previewSummary,SHOPEE_V85_SPECS,SHOPEE_BALANCED_QUOTAS,selectShopeeBalancedCandidates,diagnoseShopeeSources} from "./shopee-core.mjs";
import {simulateShopeeCloudSelection,SHOPEE_CLOUD_POLICY} from "./shopee-policy.mjs";
import {summarizeShopeeSentHistory} from "./shopee-history.mjs";
import {simulateShopeeGeneralAudit,validateShopeeGeneralRule} from "./shopee-general-audit.mjs";
import {compareShopeeRoutingShadow,validateShopeeRoutingRules} from "./shopee-routing-shadow.mjs";
import {compareShopeeDbCategoryParity} from "./shopee-db-category-parity.mjs";
import {compareShopeeGeneralEffectiveCategoryImpact} from "./shopee-category-impact.mjs";
import {firstShopeeControlledPreflight} from "./shopee-single-preflight.mjs";
import {summarizeCommercialRefresh} from "./shopee-commercial-refresh-plan.mjs";

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
async function livePreview(includeInternalOffers=false) {
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
    source_diagnostics:diagnoseShopeeSources(pools,selection),
    ...(includeInternalOffers ? {internal_offers:selection.offers} : {})
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

// Strict owner-RLS read of real sent snapshots + pending jobs, general channel only.
// Does not open the publishing path. No IDs, URLs or prices included in responses.
async function readPagedForShopee(req: Request,table:string,filter:Record<string,string>) {
  const all=[];
  for(let page=0;page<10;page++){
    const items=await ownerRlsGet(req,table,{...filter,limit:"500",offset:String(page*500)});
    all.push(...items);
    if(items.length<500)return all;
  }
  throw Error("audit_page_limit");
}
async function readPersistedShopeeCategories(
  req: Request, marketplaceId: string, offers: Array<{itemid:string}>
) {
  // Only numeric itemIds from trusted affiliate API are allowed in a PostgREST "in" filter.
  const ids=[...new Set(offers.map(x=>String(x.itemid||"").trim()))]
    .filter(x=>/^[0-9]{1,24}$/.test(x)).slice(0,80);
  if(!ids.length)return [];
  const rows=await ownerRlsGet(req,"flow_offers",{
    select:"source_ref,mavuri_tags,metadata,captured_at",
    marketplace_id:"eq."+marketplaceId,
    source_ref:"in.("+ids.join(",")+")",
    order:"captured_at.desc",
    limit:"300"
  });
  if(rows.length===300)throw Error("audit_persisted_result_limit");
  // DO NOT return rows: they may contain private offer metadata.
  return rows;
}

async function liveGeneralAudit(req: Request) {
  const [rules,channels,marketplaces]=await Promise.all([
    ownerRlsGet(req,"flow_rules",{
      select:"name,enabled,conditions,actions",enabled:"eq.true"
    }),
    ownerRlsGet(req,"flow_channels",{
      select:"id,type,status,external_ref",type:"eq.telegram"
    }),
    ownerRlsGet(req,"flow_marketplaces",{select:"id",slug:"eq.shopee",limit:"1"})
  ]);
  const marketplaceId=String(marketplaces[0]?.id||"");
  if(!marketplaceId)throw Error("audit_shopee_marketplace_missing");
  validateShopeeGeneralRule(rules,channels); // fail closed BEFORE further API/history queries
  validateShopeeRoutingRules(rules,channels); // verify all 4 active Telegram routes
  // Fail before calling Shopee API if the live general rule has drifted.
  // Validator is called from the pure simulation even when history is empty.
  const moment=new Date(),since=new Date(moment.getTime()-48*3600000).toISOString();
  const [sentRows,pendingRows]=await Promise.all([
    readPagedForShopee(req,"flow_delivery_logs",{
      select:"created_at,channel_id,status,metadata,flow_offers!inner(source_ref,marketplace_id)",
      status:"eq.sent",created_at:"gte."+since,
      "flow_offers.marketplace_id":"eq."+marketplaceId,order:"created_at.asc"
    }),
    readPagedForShopee(req,"flow_delivery_jobs",{
      select:"channel_id,status,flow_offers!inner(source_ref,marketplace_id)",
      status:"in.(queued,processing)",
      "flow_offers.marketplace_id":"eq."+marketplaceId
    })
  ]);
  const cloudPool=await livePreview(true);
  const report=simulateShopeeGeneralAudit({
    offers:cloudPool.internal_offers,rules,channels,sentRows,pendingRows,
    now_iso:moment.toISOString()
  });
  const routingShadow=compareShopeeRoutingShadow(cloudPool.internal_offers,rules,channels);
  const persistedRows=await readPersistedShopeeCategories(req,marketplaceId,cloudPool.internal_offers||[]);
  const dbParity=compareShopeeDbCategoryParity(cloudPool.internal_offers,persistedRows,rules,channels);
  const categoryImpact=compareShopeeGeneralEffectiveCategoryImpact({
    offers:cloudPool.internal_offers||[],dbRows:persistedRows,
    rules,channels,sentRows,pendingRows,now_iso:moment.toISOString()
  });
  return {ok:true,mode:"general_audit",dry_run:true,cloud_publishing:false,
    cloud_schedule:false,source_counts:cloudPool.selected_by_source,
    source_discount_at_least_10:cloudPool.summary.discount_at_least_10,
    ...report,routing_shadow:routingShadow,db_category_parity:dbParity,db_category_impact:categoryImpact};
}

// One-off eligibility after real database classification, guarded by owner RLS.
// Intentionally no INSERT/UPDATE/RPC, no Telegram, no fan-out, no lease mutation.
async function liveSingleOfferPreflight(req: Request,userId: string) {
  const [marketplaces,accounts,rules,channels,categories]=await Promise.all([
    ownerRlsGet(req,"flow_marketplaces",{select:"id",slug:"eq.shopee",limit:"1"}),
    ownerRlsGet(req,"flow_affiliate_accounts",{
      select:"id,marketplace_id,status,external_account_id,settings",status:"eq.connected",limit:"100"}),
    ownerRlsGet(req,"flow_rules",{select:"name,enabled,conditions,actions",enabled:"eq.true"}),
    ownerRlsGet(req,"flow_channels",{
      select:"id,type,status,external_ref",type:"eq.telegram"}),
    ownerRlsGet(req,"mavuri_categories",{select:"id,slug",active:"eq.true",limit:"200"})
  ]);
  const marketplaceId=String(marketplaces[0]?.id||"");
  if(!marketplaceId)throw Error("single_preflight_marketplace_missing");
  const accountMatches=accounts.filter((a: Record<string,unknown>)=>
    a.marketplace_id===marketplaceId && a.status==="connected");
  if(accountMatches.length!==1)throw Error("single_preflight_account_not_unique");
  validateShopeeGeneralRule(rules,channels);
  validateShopeeRoutingRules(rules,channels);
  const accountId=String(accountMatches[0].id||"");
  if(!accountId)throw Error("single_preflight_account_missing");
  // A DB row marked "connected" can still be an old feed-only connection.
  // Binding a Shopee API credential to that account requires independent,
  // operator-confirmed AppID fingerprint AND a verified external identity.
  // Never infer affiliate ownership from a product's short URL alone.
  const account=accountMatches[0] as {
    external_account_id?:string|null;
    settings?:{open_api_status?:string;open_api_app_id_sha256?:string}|null
  };
  const apiAppId=String(Deno.env.get("SHOPEE_AFFILIATE_APP_ID")||"");
  const hashedAppId=apiAppId?
    Array.from(new Uint8Array(await crypto.subtle.digest(
      "SHA-256",new TextEncoder().encode(apiAppId))))
      .map(v=>v.toString(16).padStart(2,"0")).join(""):"";
  const accountBindingVerified=Boolean(hashedAppId &&
    account.external_account_id?.trim() &&
    account.settings?.open_api_status==="active" &&
    /^[0-9a-f]{64}$/.test(account.settings?.open_api_app_id_sha256||"") &&
    account.settings?.open_api_app_id_sha256===hashedAppId);

  const pool=await livePreview(true);
  const candidates=pool.internal_offers||[];
  const ids=[...new Set(candidates.map((x: Record<string,unknown>)=>String(x.itemid||"").trim()))]
    .filter(x=>/^[0-9]{1,24}$/.test(x)).slice(0,80);
  const [stored,sentRows,pendingRows]=await Promise.all([
    ids.length?ownerRlsGet(req,"flow_offers",{
      select:"user_id,marketplace_id,affiliate_account_id,source_ref,title,price,affiliate_url,image_url,mavuri_category_id,mavuri_tags,metadata",
      marketplace_id:"eq."+marketplaceId,
      source_ref:"in.("+ids.join(",")+")",limit:"300"}):Promise.resolve([]),
    readPagedForShopee(req,"flow_delivery_logs",{
      select:"created_at,channel_id,status,metadata,flow_offers!inner(source_ref,marketplace_id)",
      status:"eq.sent",
      created_at:"gte."+new Date(Date.now()-48*3600000).toISOString(),
      "flow_offers.marketplace_id":"eq."+marketplaceId
    }),
    readPagedForShopee(req,"flow_delivery_jobs",{
      select:"channel_id,status,flow_offers!inner(source_ref,marketplace_id)",
      status:"in.(queued,processing)",
      "flow_offers.marketplace_id":"eq."+marketplaceId
    })
  ]);
  if(stored.length===300)throw Error("single_preflight_ambiguous_row_limit");
  const categoryMap=new Map(categories.map((c: Record<string,unknown>)=>
    [String(c.id||""),String(c.slug||"")]));
  const validStored=stored.filter((row: Record<string,unknown>)=>
    row.user_id===userId && row.affiliate_account_id===accountId &&
    Boolean(row.mavuri_category_id) &&
    categoryMap.get(String(row.mavuri_category_id))===
      (row.metadata as {mavuri?:{category_slug?:string}}|null)?.mavuri?.category_slug);
  const unwrap=(row: Record<string,unknown>)=>{
    const v=row.flow_offers;
    return Array.isArray(v)?v[0]:v;
  };
  const sentHistory=sentRows.map((row: Record<string,unknown>)=>({
    itemid:String((unwrap(row) as Record<string,unknown>)?.source_ref||""),
    channel_id:row.channel_id,status:"sent",sent_at:row.created_at
  }));
  const pendingHistory=pendingRows.map((row: Record<string,unknown>)=>({
    itemid:String((unwrap(row) as Record<string,unknown>)?.source_ref||""),
    channel_id:row.channel_id,status:row.status
  }));
  const scope={user_id:userId,marketplace_id:marketplaceId,affiliate_account_id:accountId};
  const preflight=firstShopeeControlledPreflight({
    candidates,stored_offers:validStored,rules,channels,scope,
    sent_history:sentHistory,pending_history:pendingHistory,
    now_iso:new Date().toISOString()
  });
  // Diagnostic only; these numbers never authorize a write.
  return {...preflight,
    account_binding:{verified:accountBindingVerified,
      ready_for_write:false,reason:accountBindingVerified?
        "read_only_preflight":"open_api_account_binding_unverified"},
    commercial_refresh:
      summarizeCommercialRefresh({candidates,stored_offers:validStored,scope})};

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
    if(mode==="verify_portal_app_id") {
      // User enters ONLY the App ID copied from their authenticated Shopee
      // Open API portal. No Secret, account password or short links accepted.
      // Matching the App ID is NOT an official affiliate-account-id proof.
      // This mode intentionally makes NO DB changes and sends NO messages.
      const owner=String(Deno.env.get("MAVURI_SHOPEE_CLOUD_OWNER_USER_ID")||"");
      if(!owner||userId!==owner)return respond({error:"owner_only"},403);
      if(!flag(Deno.env.get("MAVURI_SHOPEE_CLOUD_PREVIEW_ENABLED")))
        return respond({error:"preview_disabled"},403);
      const portalId=String(input?.portal_app_id||"").trim();
      const configuredId=String(Deno.env.get("SHOPEE_AFFILIATE_APP_ID")||"").trim();
      if(!/^[0-9]{5,24}$/.test(portalId))
        return respond({ok:false,error:"invalid_app_id_format"},400);
      if(!/^[0-9]{5,24}$/.test(configuredId))
        return respond({ok:false,error:"api_app_id_unconfigured"},503);
      const encoder=new TextEncoder();
      const [a,b]=await Promise.all([
        crypto.subtle.digest("SHA-256",encoder.encode(portalId)),
        crypto.subtle.digest("SHA-256",encoder.encode(configuredId))
      ]);
      const x=new Uint8Array(a),y=new Uint8Array(b);
      let mismatch=0;
      for(let i=0;i<32;i++)mismatch|=(x[i]^y[i]);
      return respond({
        ok:true,read_only:true,no_publication:true,
        app_id_matches_configured_api:mismatch===0,
        account_binding_complete:false
      });
    }
    if(mode==="single_offer_preflight") {
      const owner=String(Deno.env.get("MAVURI_SHOPEE_CLOUD_OWNER_USER_ID")||"");
      if(!owner||userId!==owner)return respond({error:"owner_only"},403);
      if(!flag(Deno.env.get("MAVURI_SHOPEE_CLOUD_PREVIEW_ENABLED")))
        return respond({error:"preview_disabled"},403);
      return respond(await liveSingleOfferPreflight(req,userId));
    }
    if(mode==="general_audit") {
      // Explicit user session, owner verification and live-preview flag required.
      const owner=String(Deno.env.get("MAVURI_SHOPEE_CLOUD_OWNER_USER_ID")||"");
      if(!owner||userId!==owner)return respond({error:"audit_owner_only"},403);
      if(!flag(Deno.env.get("MAVURI_SHOPEE_CLOUD_PREVIEW_ENABLED")))
        return respond({error:"audit_disabled"},403);
      const report=await liveGeneralAudit(req);
      console.log("[discovery-cloud-shopee] general_audit candidates="+report.candidates_considered+
        " projected="+report.projected_unique_offers+
        " history_matched="+report.history.sent_matched+
        " pending_matched="+report.history.pending_matched+
        " db_category_comparable="+report.db_category_parity.comparable_candidates+
        " db_category_differences="+report.db_category_parity.ingest_vs_database_category_mismatches);
      console.log("[discovery-cloud-shopee] db_category_impact="+JSON.stringify({
        known:report.db_category_impact.effective_categories_available,
        unknown:report.db_category_impact.unknown_final_categories,
        manual:report.db_category_impact.manual_reviews_preserved,
        before:report.db_category_impact.initial_projected,
        after:report.db_category_impact.effective_stored_projected,
        change:report.db_category_impact.projected_difference,
        category_blocks_before:report.db_category_impact.initial_category_blocks,
        category_blocks_after:report.db_category_impact.effective_category_blocks
      }));
      console.log("[discovery-cloud-shopee] db_category_parity="+JSON.stringify({
        total:report.db_category_parity.candidates_total,
        existing:report.db_category_parity.comparable_candidates,
        unknown:report.db_category_parity.missing_in_database,
        manual:report.db_category_parity.manual_approved_or_corrected,
        changes:report.db_category_parity.category_transitions,
        route_gains:report.db_category_parity.channel_rules.newly_matched_by_stored,
        route_losses:report.db_category_parity.channel_rules.no_longer_matched_by_stored
      }));
      return respond(report);
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

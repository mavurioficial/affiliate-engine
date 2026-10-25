// Mavuri Shopee Cloud executor. SCHEDULED SERVICE ACCESS ONLY.
// Inactive by default: claim_run checks cloud_control before any source request.
// Does not bypass SQL dedup, final category, rule checks, lease or age window.
import {createClient} from "npm:@supabase/supabase-js@2";
import {newCatalogRow} from "./catalog.mjs";
import {fetchCommercialCandidates} from "./source.ts";
import {enqueueAvailableCandidates} from "./enqueue-cycle.mjs";
import {planFourChannelCycle} from "./cycle-plan.mjs";
import {simulateExistingShopeeRefresh} from "./commercial-refresh-plan.mjs";
const schedulerHash="3efb0f37ba962d865839b2beeffd672787e652b4059e4de53940403421cfd423";
const json=(x:unknown,code=200)=>new Response(JSON.stringify(x),{status:code,
 headers:{"content-type":"application/json","cache-control":"no-store"}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest(
 "SHA-256",new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const safeInt=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0?Number(n):0;
Deno.serve(async req=>{
 if(req.method!=="POST")return json({ok:false,reason:"post_only"},405);
 const authorization=req.headers.get("authorization")||"";
 if(!authorization.startsWith("Bearer ")||!(await (async()=>{
   const digest=await hash(authorization.slice(7));
   return digest===schedulerHash;
 })()))return json({ok:false,reason:"scheduler_unauthorized"},401);
 const body=await req.json().catch(()=>({}));
 const diagnostic=body?.mode==="diagnostic";
 const prepare=body?.mode==="catalog_prepare";
 const url=String(Deno.env.get("SUPABASE_URL")||"");
 const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
 const secret=String(keys.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"");
 if(!url||!secret)return json({ok:false,reason:"server_configuration_missing"},503);
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 let runId:string|null=null,jobs=0,offersQueued=0;
 try{
  const {data:claim,error:claimError}=(diagnostic||prepare)?{data:{claimed:true,limits:{shopee:8}},error:null}:await admin.rpc("mavuri_discovery_claim_run",
    {p_lease_seconds:900});
  if(claimError)throw Error("run_claim_failed");
  if(claim?.claimed!==true)return json({ok:true,claimed:false,reason:String(claim?.reason||"not_claimed"),
    scheduled_delivery:false,offers:0,jobs:0});
  if(!diagnostic&&!prepare){
   runId=String(claim.run_id||"");
   if(!/^[0-9a-f-]{36}$/i.test(runId))throw Error("run_id_invalid");
  }
  const owner=String(Deno.env.get("MAVURI_SHOPEE_CLOUD_OWNER_USER_ID")||"");
  const appid=String(Deno.env.get("SHOPEE_AFFILIATE_APP_ID")||"");
  const affiliateSecret=String(Deno.env.get("SHOPEE_AFFILIATE_SECRET")||"");
  if(!/^[0-9a-f-]{36}$/i.test(owner)||!affiliateSecret)throw Error("affiliate_env_missing");
  const {data:market,error:marketError}=await admin.from("flow_marketplaces")
    .select("id").eq("slug","shopee").limit(2);
  if(marketError||market?.length!==1)throw Error("marketplace_unverified");
  const {data:accounts,error:accError}=await admin.from("flow_affiliate_accounts")
    .select("id,user_id,marketplace_id,status,external_account_id,settings")
    .eq("user_id",owner).eq("marketplace_id",market[0].id).eq("status","connected").limit(2);
  const fingerprint=await hash(appid);
  const account=accounts?.[0];
  if(accError||accounts?.length!==1||!account?.external_account_id||
     account.settings?.open_api_status!=="active"||
     account.settings?.open_api_binding_source!=="user_confirmed_portal_app_id"||
     account.settings?.open_api_app_id_sha256!==fingerprint)
    throw Error("affiliate_identity_unverified");
  const [ch,ru,cat]=await Promise.all([
    admin.from("flow_channels").select("id,user_id,type,name,status,external_ref")
      .eq("user_id",owner).eq("type","telegram").limit(25),
    admin.from("flow_rules").select("id,name,conditions,actions,enabled")
      .eq("user_id",owner).eq("enabled",true).limit(100),
    admin.from("mavuri_categories").select("id,slug,active").eq("active",true).limit(200)
  ]);
  if(ch.error||ru.error||cat.error)throw Error("routing_configuration_failed");
  const candidates=await fetchCommercialCandidates(appid,affiliateSecret);
  if(candidates.length===0)throw Error("no_official_candidates");
  const ids=candidates.map(x=>x.id);
  let {data:stored,error:storedError}=await admin.from("flow_offers")
    .select("id,user_id,marketplace_id,affiliate_account_id,source_ref,title,price,affiliate_url,image_url,mavuri_category_id,mavuri_tags,metadata")
    .eq("user_id",owner).eq("marketplace_id",market[0].id)
    .in("source_ref",ids).limit(1000);
  if(storedError||!stored||stored.length>=1000)throw Error("persisted_offer_lookup_failed");
  const refs=new Set(stored.map(x=>String(x.source_ref)));
  const missing=candidates.filter(c=>!refs.has(c.id));
  const newRows=missing.map(c=>newCatalogRow(c,{owner,marketplace:market[0].id,account:account.id,categories:cat.data})).filter((row):row is NonNullable<typeof row>=>row!==null).slice(0,100);
  let catalogAdded=0;
  if(!diagnostic&&newRows.length){
   const {data:added,error:addError}=await admin.from("flow_offers").insert(newRows).select("id,user_id,marketplace_id,affiliate_account_id,source_ref,title,price,affiliate_url,image_url,mavuri_category_id,mavuri_tags,metadata");
   if(addError)throw Error("catalog_insert_failed");
   stored.push(...(added||[]));catalogAdded=added?.length||0;
  }
  if(prepare)return json({ok:true,mode:"catalog_prepare",publishing:false,candidates:candidates.length,missing:missing.length,catalog_added:catalogAdded});
  const offerIds=[...new Set(stored.map(x=>x.id))];
  let history:any[]=[],pending:any[]=[];
  if(offerIds.length){
   const cutoff=new Date(Date.now()-48*3600000).toISOString();
   const [h,p]=await Promise.all([
    admin.from("flow_delivery_jobs").select("offer_id,channel_id,status,sent_at")
      .eq("user_id",owner).in("offer_id",offerIds).eq("status","sent")
      .gte("sent_at",cutoff).limit(4000),
    admin.from("flow_delivery_jobs").select("offer_id,channel_id,status")
      .eq("user_id",owner).in("offer_id",offerIds).in("status",["queued","processing"]).limit(4000)
   ]);
   if(h.error||p.error||!h.data||!p.data||h.data.length>=4000||p.data.length>=4000)
     throw Error("delivery_history_incomplete");
   history=h.data;pending=p.data;
  }
  // Signed API is the commercial source of truth. Only pre-existing,
  // uniquely matched and already classified products may be refreshed.
  // The service-only SQL RPC rejects changes to approved classifications.
  const forecast=simulateExistingShopeeRefresh({candidates,
    stored,pending,owner,marketplace:market[0].id,account:account.id});
  if(diagnostic){
    const plan=planFourChannelCycle({candidates,stored:forecast.rows,categories:cat.data,channels:ch.data,rules:ru.data,history,pending,owner,marketplace:market[0].id,account:account.id,now:Date.now(),maxUnique:8});
    return json({ok:plan.ready,mode:"diagnostic",publishing:false,database_writes:0,candidates:candidates.length,new_classifiable:newRows.length,refresh:forecast.stats,plan:plan.counts});
  }
  const currentByRef=new Map(candidates.map(x=>[String(x.id),x]));
  const previousById=new Map(stored.map(x=>[String(x.id),x]));
  let refreshed=0,refreshRejected=0;
  const effectiveStored=[];
  for(const nextRow of forecast.rows){
    const previous=previousById.get(String(nextRow.id));
    if(!previous)throw Error("persisted_offer_lookup_failed");
    if(Number(previous.price)===Number(nextRow.price)&&
      String(previous.affiliate_url||"")===String(nextRow.affiliate_url||"")){
      effectiveStored.push(previous);continue;
    }
    const fresh=currentByRef.get(String(previous.source_ref||""));
    if(!fresh)throw Error("persisted_offer_lookup_failed");
    const {data:patch,error:patchError}=await admin.rpc("mavuri_shopee_cloud_refresh_existing",{
      p_run_id:runId,p_user_id:owner,p_offer_id:String(previous.id),
      p_source_ref:String(previous.source_ref),
      p_expected_old_price:previous.price,
      p_expected_old_link:previous.affiliate_url,
      p_current_price:fresh.price,
      p_current_discount:fresh.discount,
      p_current_link:fresh.url
    });
    if(patchError){refreshRejected++;effectiveStored.push(previous);continue;}
    if(patch?.accepted===true){
      if(patch?.updated===true)refreshed++;
      effectiveStored.push({...previous,price:fresh.price,
        discount_percent:fresh.discount,affiliate_url:fresh.url});
    }else{refreshRejected++;effectiveStored.push(previous);}
  }
  console.log("[shopee-executor] catalog_refresh_checked="+forecast.stats.wouldRefresh+
    " updated="+refreshed+" rejected="+refreshRejected+
    " missing="+forecast.stats.unknownProduct);
  const byId=new Map(effectiveStored.map(x=>[String(x.id),x]));
  const selectionCounts=planFourChannelCycle({candidates,stored:effectiveStored,categories:cat.data,channels:ch.data,rules:ru.data,history,pending,owner,marketplace:market[0].id,account:account.id,now:Date.now(),maxUnique:8}).counts;
  const cycle=await enqueueAvailableCandidates({candidates,stored:effectiveStored,categories:cat.data,
   channels:ch.data,rules:ru.data,history,pending,owner,
   marketplace:market[0].id,account:account.id,
   now:Date.now(),maxUnique:Math.min(8,safeInt(claim?.limits?.shopee))},async item=>{
    const record=byId.get(item.offer_id);
    if(!record)throw Error("selected_record_missing");
    const {data:enqueued,error:queueError}=await admin.rpc("mavuri_shopee_cloud_enqueue",{
      p_run_id:runId,p_user_id:owner,p_offer_id:item.offer_id,
      p_channel_ids:item.channels,p_expected_price:record.price,
      p_expected_affiliate_url:record.affiliate_url,p_expected_category_slug:item.category
    });
    if(queueError)throw Error("atomic_queue_failed");
    if(enqueued?.accepted===true){jobs+=safeInt(enqueued.jobs_created);offersQueued++;}
    return enqueued;
  });
  console.log("[shopee-executor] cycle_summary "+JSON.stringify({candidates:candidates.length,catalog_added:catalogAdded,shortfall:Math.max(0,8-cycle.offers),selection:selectionCounts,attempted:cycle.attempted,offers:cycle.offers,jobs:cycle.jobs,blocked:cycle.blocked}));
  const {data:submitted,error:submitError}=await admin.rpc("mavuri_shopee_cloud_mark_submitted",{
    p_run_id:runId,p_jobs:jobs,p_offers:offersQueued
  });
  if(submitError||submitted!==true)throw Error("run_submit_failed");
  return json({ok:true,claimed:true,mode:"cloud_cycle",offers:offersQueued,
    jobs,settlement:"worker_and_reconciler",scheduled_delivery:true});
 }catch(e){
  // Never leak API credentials, account ids, product ids or links into logs.
  const reason=e instanceof Error?e.message:"unexpected_error";
  const safe=new Set(["catalog_insert_failed","run_claim_failed","run_id_invalid","affiliate_env_missing",
    "marketplace_unverified","affiliate_identity_unverified","routing_configuration_failed",
    "no_official_candidates","persisted_offer_lookup_failed","delivery_history_incomplete",
    "cycle_plan_not_ready","selected_record_missing","atomic_queue_failed","run_submit_failed"]);
  const failure=safe.has(reason)?reason:"internal_error";
  if(runId){
    try{await admin.rpc("mavuri_discovery_finish_run",{
      p_run_id:runId,p_status:"failed",p_counts:{jobs,offers:offersQueued},
      p_error:failure
    })}catch{}
  }
  console.error("[shopee-executor] "+failure);
  return json({ok:false,reason:failure,claimed:Boolean(runId),offers:offersQueued,jobs},503);
 }
});



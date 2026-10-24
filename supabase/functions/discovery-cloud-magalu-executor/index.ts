import {collectPublicHistory,candidatesFromRows,enrichCandidates} from './collector.mjs';
const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(v=>v.toString(16).padStart(2,'0')).join('');
const expected='3efb0f37ba962d865839b2beeffd672787e652b4059e4de53940403421cfd423';
const reply=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const day=(s:string|number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply({ok:false,reason:'post_only'},405);
 const authorization=req.headers.get('authorization')||'';
 if(await digest(authorization.replace(/^Bearer /,''))!==expected)return reply({ok:false,reason:'unauthorized'},401);
 const input=await req.json().catch(()=>({}));
 if(!['audit','cloud_cycle'].includes(input.mode))return reply({ok:false,reason:'invalid_mode'},400);
 const live=input.mode==='cloud_cycle';
 const base=Deno.env.get('SUPABASE_URL')||'';
 const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
 const key=keys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const rpc=async(action:string,run:string|null=null,result:unknown={})=>{
  const r=await fetch(base+'/rest/v1/rpc/mavuri_magalu_cloud_state',{method:'POST',headers:{'content-type':'application/json',apikey:key,Authorization:'Bearer '+key},body:JSON.stringify({p_action:action,p_run:run,p_result:result}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('cloud_state_http_'+r.status);return await r.json();
 };
 const invoke=async(name:string,body:unknown,run:string)=>{
  const r=await fetch(base+'/functions/v1/'+name,{method:'POST',headers:{'content-type':'application/json',Authorization:authorization,'x-mavuri-run':run},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw Error(name+'_http_'+r.status);return await r.json();
 };
 const start=Date.now();let run:string|null=null;
 try{
  const cfg=await rpc('state');
  if(live){const claim=await rpc('claim');if(!claim.claimed)return reply({ok:true,mode:input.mode,claimed:false,reason:claim.reason});run=claim.run_id;}
  const history=await collectPublicHistory();
  if(!history.complete)throw Error('public_history_24h_incomplete');
  const parsed=candidatesFromRows(history.rows);
  const coupons=parsed.coupons.filter(c=>c.valid_until?Date.parse(c.valid_until)>Date.now():day(c.metadata.source_message_date)===day(Date.now()));
  let couponSent=0;
  // Coupons keep priority, ahead of product enrichment and ingestion.
  if(live&&coupons.length){const cp=await invoke('magalu-cloud-coupon-publish',{coupons},run!);if(cp.failed||cp.errors?.length)throw Error('coupon_cycle_failed');couponSent=Number(cp.sent||0);}
  let couponDryRunValidated=0;
  if(!live&&coupons.length){const cp=await invoke('magalu-cloud-coupon-publish',{coupons,dry_run:true},'');if(!cp.ok)throw Error('coupon_dry_run_failed');couponDryRunValidated=cp.validated;}
  const enriched=await enrichCandidates(parsed.offers);
  let selected=0,jobs=0;const rejected={...enriched.rejected};
  if(live){for(const offer of enriched.offers){if(selected>=5)break;const r=await invoke('flow-magalu-cloud-ingest',{offers:[offer],create_jobs:true},run!);if(r.errors?.length)throw Error('offer_ingest_failed');if(r.jobs_created>0){selected++;jobs+=r.jobs_created;}}}
  let dryRunValidated=0;
  if(!live&&enriched.offers.length){const r=await invoke('flow-magalu-cloud-ingest',{offers:enriched.offers,dry_run:true,create_jobs:false},'');if(r.errors?.length)throw Error('dry_run_validation_failed');dryRunValidated=r.saved?.length||0;}
  const result={ok:true,mode:input.mode,claimed:live,publishing:live,cloud_enabled:!!cfg.enabled,source_messages:history.rows.length,pages:history.pages,history_24h_complete:history.complete,source_offers:parsed.offers.length,coupons:coupons.length,coupon_sent:couponSent,products_checked:enriched.checked,verified_products:enriched.offers.length,rejected,selected_offers:selected,jobs_created:jobs,dry_run_validated:dryRunValidated,coupon_dry_run_validated:couponDryRunValidated,elapsed_ms:Date.now()-start};
  if(run)await rpc('finish',run,result);
  return reply(result);
 }catch(e){const result={ok:false,reason:String(e instanceof Error?e.message:'cycle_failed').slice(0,160),elapsed_ms:Date.now()-start};if(run)await rpc('finish',run,result).catch(()=>{});return reply(result,502);}
});


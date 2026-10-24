import {collectPublicHistory,candidatesFromRows,enrichCandidates} from './collector.mjs';
const expected='3efb0f37ba962d865839b2beeffd672787e652b4059e4de53940403421cfd423';
const reply=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply({ok:false,reason:'post_only'},405);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
 if(hash!==expected)return reply({ok:false,reason:'unauthorized'},401);
 const start=Date.now();
 const flags={publishing:false,scheduled_runs:false,database_writes:0,browser_used:false,telegram_session_used:false};
 try {
  const history=await collectPublicHistory();
  const parsed=candidatesFromRows(history.rows);
  const enriched=await enrichCandidates(parsed.offers);
  const coupons=parsed.coupons.filter(c=>!c.valid_until||Date.parse(c.valid_until)>Date.now());
  return reply({ok:true,mode:'magalu_public_preview',revision:3,...flags,pages:history.pages,messages:history.rows.length,history_24h_complete:history.complete,source_offers:parsed.offers.length,link_only:parsed.linkOnly,campaigns:parsed.campaigns,coupons:coupons.length,coupons_with_product_restrictions:coupons.filter(c=>/C[oó]digos\s*:/i.test(c.terms)).length,products_checked:enriched.checked,verified_products:enriched.offers.length,rejected:enriched.rejected,remaining:enriched.remaining,ready_for_publication:false,elapsed_ms:Date.now()-start});
 }catch(e){return reply({ok:false,mode:'magalu_public_preview',...flags,reason:String(e instanceof Error?e.message:'source_probe_failed').slice(0,100),elapsed_ms:Date.now()-start},502);}
});

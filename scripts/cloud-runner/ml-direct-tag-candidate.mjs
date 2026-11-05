// Mavuri — isolated proof-of-concept: direct-product links with existing
// Mercado Livre affiliate identification. This does NOT call the official
// generator, certify commissions or authorize automatic publication.
// Only accepts resolved, product-specific URLs on Mercado Livre.
import {pathToFileURL} from 'node:url';

const ALLOWED_HOSTS=new Set(['www.mercadolivre.com.br','mercadolivre.com.br','produto.mercadolivre.com.br']);
const ALLOWED_PRODUCT_PATHS=[
  /\/p\/MLB\d+(?:\/|$)/i,
  /\/up\/MLBU\d+(?:\/|$)/i,
  /\/MLB-\d+(?:-[^/]*)?\/?$/i
];
const KEEP_QUERY=new Set(['pdp_filters','searchVariation']);

export function buildMlDirectCandidate(rawProductUrl,tag,tool){
 if(typeof rawProductUrl!=='string'||rawProductUrl.length>2000) throw Error('invalid_product_url');
 if(!/^[A-Za-z0-9_-]{2,100}$/.test(String(tag??'')))throw Error('invalid_affiliate_tag');
 if(!/^\d{3,16}$/.test(String(tool??'')))throw Error('invalid_matt_tool');
 let u;
 try{u=new URL(rawProductUrl)}catch{throw Error('invalid_product_url')}
 if(u.protocol!=='https:'||!ALLOWED_HOSTS.has(u.hostname)||u.username||u.password||u.port)
  throw Error('unsupported_host_or_scheme');
 if(!ALLOWED_PRODUCT_PATHS.some(regex=>regex.test(u.pathname)))
  throw Error('not_resolved_product_url');
 const params=new URLSearchParams();
 for(const [key,value] of u.searchParams){
   if(!KEEP_QUERY.has(key))continue;
   if(key==='pdp_filters' && !/^item_id:MLB\d+$/i.test(value))continue;
   if(key==='searchVariation' && !/^\d+$/.test(value))continue;
   if(params.has(key))continue;
   params.set(key,value);
 }
 params.set('matt_word',tag);
 params.set('matt_tool',String(tool));
 u.search=params.toString();u.hash='';
 u.hostname='www.mercadolivre.com.br';
 return {product_url:u.origin+u.pathname+(params.has('pdp_filters')||params.has('searchVariation')?'?'+new URLSearchParams([...params].filter(([k])=>KEEP_QUERY.has(k))).toString():''),candidate_url:u.toString(),
   affiliate_tag:tag,matt_tool:String(tool),officially_generated:false,
   attribution_verified:false,publication_allowed:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [product,tag='lucasbrasildf',tool='69434586']=process.argv.slice(2);
 try{
  if(!product)throw Error('Usage: node ml-direct-tag-candidate.mjs https://.../p/MLB... [tag] [matt_tool]');
  console.log(JSON.stringify(buildMlDirectCandidate(product,tag,tool),null,2));
 }catch(e){console.error('ERROR: '+e.message);process.exitCode=1}
}

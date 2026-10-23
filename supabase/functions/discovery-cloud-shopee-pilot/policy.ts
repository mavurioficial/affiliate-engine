import {matchesRule} from "./shopee-production-rules.mjs";
import {isAffiliateLink} from "./source.ts";
export function chooseOne({
 candidates,stored,categories,rules,general,owner,marketplace,account
}:Record<string,any>){
 const count=new Map<string,number>();
 for(const row of stored)count.set(String(row.source_ref),(count.get(String(row.source_ref))||0)+1);
 const catMap=new Map(categories.map((x:any)=>[String(x.id),String(x.slug)]));
 const matchedRules=rules.filter((r:any)=>{
  const actions=r.actions||{};
  const arr=actions.channel_ids??actions.channelIds??[];
  return Array.isArray(arr)&&arr.map(String).includes(String(general.id));
 });
 if(!matchedRules.length)return null;
 for(const product of candidates){
  const rows=stored.filter((r:any)=>r.source_ref===product.id);
  if(rows.length!==1||count.get(product.id)!==1)continue;
  const r=rows[0];
  if(r.user_id!==owner||r.marketplace_id!==marketplace||
     r.affiliate_account_id!==account||
     !r.mavuri_category_id||!Array.isArray(r.mavuri_tags))continue;
  const category=catMap.get(String(r.mavuri_category_id));
  if(!category||category!==r.metadata?.mavuri?.category_slug)continue;
  const title=String(r.title||"");
  const price=Number(r.price),affiliate=String(r.affiliate_url||"");
  const image=String(r.image_url||"");
  if(!title||!Number.isFinite(price)||Math.round(price*100)!==Math.round(product.price*100)||
      affiliate!==product.url||!isAffiliateLink(affiliate)||
      !image.startsWith("https://")||product.discount<10)continue;
  const offer={title,price,discount:product.discount,
   mavuriCategory:category,mavuriTags:r.mavuri_tags};
  if(!matchedRules.some((rule:any)=>matchesRule(rule,offer)))continue;
  return {offerId:String(r.id),itemId:product.id,channelId:String(general.id)};
 }
 return null;
}

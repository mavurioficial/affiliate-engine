import assert from "node:assert/strict";
import {mapShopeeApiProduct} from "../supabase/functions/discovery-cloud-shopee/shopee-core.mjs";
import {projectShopeeSellerIdentity,shopeeSellerIdentityDiagnostics}
 from "../supabase/functions/discovery-cloud-shopee/shopee-seller-metadata.mjs";
const raw={itemId:"123456",productName:"Liquidificador de cozinha",offerLink:"https://s.shopee.com.br/affiliate",
 imageUrl:"https://example.com/a.png",priceMin:150,priceDiscountRate:0.2,shopId:"987654321",
 shopName:"Vendedor exemplo",commissionRate:0.14,sellerCommissionRate:0.1,
 shopeeCommissionRate:0.04,sales:200};
const offer=mapShopeeApiProduct(raw);
assert.equal(offer.affiliate_url,raw.offerLink);
const identity=projectShopeeSellerIdentity(offer);
assert.equal(identity.shop_id,"987654321");
assert.equal(identity.shop_name,"Vendedor exemplo");
assert.equal(identity.commission_rate,0.14);
assert.equal(identity.estimated_commission_percent,14);
assert.equal(identity.verified_catalog_family,null);
assert.equal(identity.verified_equivalence,false);
assert.equal(projectShopeeSellerIdentity({...offer,_mavuri_api:{shop_id:0}}).shop_id,null);
assert.equal(projectShopeeSellerIdentity({...offer,_mavuri_api:{shop_id:9007199254740992}}).shop_id,null);
assert.equal(projectShopeeSellerIdentity({...offer,_mavuri_api:{shop_id:"0"}}).shop_id,null);
const status=shopeeSellerIdentityDiagnostics([offer,{...offer,_mavuri_api:{shop_id:null}}]);
assert.deepEqual({n:status.count,present:status.shop_ids_present,missing:status.shop_ids_missing},
 {n:2,present:1,missing:1});
assert.equal(status.read_only,true);
assert.equal(status.requires_future_ingest_persistence,true);
assert.equal(JSON.stringify(status).includes("987654321"),false);
assert.equal(JSON.stringify(status).includes("https:"),false);
console.log("Shopee seller/commission projection tests passed without publishing.");

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const edge=readFileSync("supabase/functions/discovery-cloud-shopee-binding/index.ts","utf8");
const preflight=readFileSync("supabase/functions/discovery-cloud-shopee/index.ts","utf8");
const draft=readFileSync("docs/sql/SHOPEE_SINGLE_COMMERCIAL_REFRESH_DRAFT.sql","utf8");
for(const line of [
 'intent!=="bind_shopee_open_api"',
 "data?.confirm!==true",
 'owner!==Deno.env.get("MAVURI_SHOPEE_CLOUD_OWNER_USER_ID")',
 "constantEqual(await hash(supplied),await hash(configured))",
 "testOfficialShopeeApi(configured,secret)",
 'status:"eq.connected"',
 'markets.length!==1',
 'accounts.length!==1',
 'method:"PATCH"',
 '"updated_at","eq."+account.updated_at',
 'open_api_app_id_sha256:expectedHash',
 'open_api_binding_source:"user_confirmed_portal_app_id"',
 'open_api_verified_at:new Date().toISOString()',
 'publication_enabled:false',
 'schedule_enabled:false',
 'affiliate_external_id_confirmed:false',
 "affiliate_account_ambiguous",
 ]) assert.ok(edge.includes(line),"missing security condition: "+line);
assert.ok(edge.includes('source_ref')===false);
assert.ok(!edge.includes('console.log('));
for(const word of ["flow_delivery_jobs","flow_offers","sendMessage","sendPhoto",
 "cron.job","discovery_cloud_control","service_role","SUPABASE_SERVICE_ROLE_KEY"])
 assert.ok(!edge.includes(word),"binding endpoint must not publish or access "+word);
assert.ok(preflight.includes('open_api_binding_source==="user_confirmed_portal_app_id"'));
assert.ok(preflight.includes('open_api_app_id_sha256===hashedAppId'));
assert.ok(preflight.includes('affiliate_external_id_confirmed:'));
assert.ok(draft.includes("open_api_binding_source'='user_confirmed_portal_app_id'"));
assert.ok(!draft.includes("nullif(a.external_account_id"));
assert.ok(draft.includes("REVOKE ALL ON FUNCTION"));
assert.ok(draft.includes("TO service_role"));
console.log("Shopee API binding: owner-only, official API credential test, optimistic account-settings-only write OK");

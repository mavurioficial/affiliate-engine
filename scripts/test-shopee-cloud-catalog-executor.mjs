import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync("supabase/functions/discovery-cloud-shopee-executor/index.ts","utf8");
const rpc=s.indexOf('admin.rpc("mavuri_shopee_cloud_refresh_existing"');
const plan=s.indexOf("const plan=planFourChannelCycle");
const enqueue=s.indexOf('admin.rpc("mavuri_shopee_cloud_enqueue"');
assert.ok(rpc>0&&plan>rpc&&enqueue>plan,"refresh must complete before route planning and queueing");
assert.match(s,/simulateExistingShopeeRefresh/);
assert.match(s,/stored:effectiveStored/);
assert.match(s,/new Map\(effectiveStored.map/);
for(const name of ["p_expected_old_price","p_expected_old_link","p_current_price",
 "p_current_discount","p_current_link","p_run_id:runId"])
assert.ok(s.includes(name),"RPC caller missing CAS field "+name);
assert.match(s,/if\(patchError\)\{refreshRejected\+\+;effectiveStored.push\(previous\);continue;\}/);
assert.ok(!/admin\.from\("flow_offers"\)[\s\S]{0,60}\.update\(/.test(s),
 "no direct row writes; must use audited RPC");
console.log("Shopee executor refresh-before-routing contract passed.");

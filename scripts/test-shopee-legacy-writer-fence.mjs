import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261023170000_shopee_legacy_writer_cloud_fence.sql","utf8");
for(const s of ["NEW.delivery_key LIKE 'shopee:%'","c.enabled AND c.active_executor='cloud'","shopee_legacy_writer_disabled_during_cloud","BEFORE INSERT ON public.flow_delivery_jobs","RETURN NEW;","FROM PUBLIC,anon,authenticated"]) assert.ok(sql.includes(s),s);
assert.ok(!/INSERT INTO|DELETE FROM|TRUNCATE|cron\.schedule/i.test(sql),"the fence must never publish or schedule");
console.log("Shopee legacy writer fence: static safety contract passed.");

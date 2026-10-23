import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261023183000_shopee_cloud_job_queue_fence.sql","utf8");
for(const needle of [
 "NEW.delivery_key LIKE 'shopee-cloud:%'",
 "NEW.delivery_key NOT LIKE 'shopee-cloud:%'",
 "shopee_cloud_service_role_required","coalesce(auth.jwt()->>'role','')",
 "NOT cfg.enabled","cfg.active_executor<>'cloud'","lease_expires_at>clock_timestamp()",
 "FOR UPDATE OF o","FOR SHARE","a.settings->>'open_api_status'='active'",
 "m.slug='shopee'","c.type='telegram'","c.status='connected'",
 "Mavuri Mulher","Mavuri Tecnologia","interval '48 hours'",
 "shopee_cloud_recent_or_pending","REVOKE ALL ON FUNCTION",
 "FROM PUBLIC, anon, authenticated"
]) assert.ok(sql.includes(needle),needle);
assert.ok(!/INSERT INTO public\.flow_delivery_jobs/i.test(sql),"not a publisher");
assert.ok(!/UPDATE mavuri_internal\.discovery_cloud_control/i.test(sql),"can't activate cloud");
assert.ok(!/cron\.schedule|pg_net|https?:\/\/api\.telegram\.org/i.test(sql),"can't schedule/send");
assert.ok(!/DROP TABLE|TRUNCATE TABLE/i.test(sql),"no data destruction");
console.log("Shopee guarded queue fence: fail-closed static contract passed.");

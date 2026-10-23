import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const cfg=readFileSync("supabase/migrations/20261023190500_shopee_cloud_publish_window.sql","utf8");
const guard=readFileSync("supabase/migrations/20261023191000_shopee_cloud_window_queue_claim_gates.sql","utf8");
for (const expect of [
 "DEFAULT time '08:00'","DEFAULT time '22:00'","'America/Sao_Paulo'",
 "publish_start_local < publish_end_local",
 "(p_at AT TIME ZONE c.publish_timezone)::time < c.publish_end_local",
 "public.mavuri_shopee_cloud_delivery_allowed",
 "FROM PUBLIC, anon, authenticated",
 "TO service_role",
 "c.enabled AND c.active_executor='cloud'"
]) assert.ok(cfg.includes(expect),expect);
for(const expect of [
 "shopee_cloud_outside_publish_hours","shopee_cloud_claim_outside_publish_hours",
 "mavuri_shopee_cloud_delivery_allowed(clock_timestamp())",
 "OLD.delivery_key LIKE 'shopee-cloud:%'",
 "OLD.status='queued' AND NEW.status='processing'",
 "BEFORE UPDATE OF status",
 "REVOKE ALL ON FUNCTION"
]) assert.ok(guard.includes(expect),expect);
assert.ok(!/\bINSERT INTO\b|\bUPDATE mavuri_internal\.discovery_cloud_control\b/i.test(cfg+"\n"+guard),
 "Window safety migrations must never queue or enable publishing");
console.log("Configurable 08-22 Brasilia cloud window: static guards OK.");

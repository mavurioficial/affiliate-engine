import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261023211500_shopee_cloud_existing_offer_commercial_refresh.sql","utf8");
for(const term of ["mavuri_shopee_cloud_refresh_existing",
 "coalesce(auth.jwt()->>'role','')<>'service_role'",
 "cfg.enabled","cfg.active_executor<>'cloud'",
 "mavuri_internal.discovery_cloud_run_time_valid",
 "p_source_ref !~ '^[0-9]{1,24}$'",
 "o.price*0.30","o.price*3",
 "m.slug='shopee'","a.settings->>'open_api_status'='active'",
 "offer_in_flight","new_id IS NULL",
 "actual_category IS DISTINCT FROM o.mavuri_category_id",
 "actual_tags IS DISTINCT FROM o.mavuri_tags",
 "actual_mavuri IS DISTINCT FROM o.metadata->'mavuri'",
 "shopee_refresh_classification_change_blocked",
 "REVOKE ALL ON FUNCTION","TO service_role"])
assert.ok(sql.includes(term),term);
assert.ok(!/INSERT INTO public.flow_delivery_jobs|INSERT INTO public.flow_offers|cron\.schedule|pg_net|https:\/\/api\.telegram\.org/i.test(sql),"commercial refresh must not create jobs or publish");
assert.ok(!/SET\s+session_replication_role|DISABLE\s+TRIGGER/i.test(sql),"never bypass classification triggers");
console.log("Shopee catalog refresh is owner-, lease-, account- and category-guarded.");

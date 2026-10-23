import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync("supabase/migrations/20261023172000_shopee_cloud_atomic_enqueue.sql","utf8");
for(const term of [
 "RETURNS jsonb","SECURITY DEFINER SET search_path=''",
 "auth.jwt()->>'role'","service_role_required",
 "WHERE id=true FOR UPDATE",
 "WHERE id=p_run_id FOR UPDATE",
 "WHERE id=p_offer_id AND user_id=p_user_id FOR UPDATE",
 "discovery_cloud_run_time_valid",
 "shopee_cloud_rule_matches",
 "p_expected_affiliate_url",
 "p_expected_category_slug",
 "coalesce(offrow.discount_percent,0)<10",
 "count(DISTINCT j.offer_id)",
 "least(8,cfg.max_shopee)",
 "existing_count>=2",
 "mavuri_offer_family",
 "left(j.delivery_key,length(key_prefix))",
 "sent_at>=clock_timestamp()-interval '48 hours'",
 "RETURNING id INTO new_job_id",
 "IF new_job_id IS NULL THEN",
 "shopee_cloud_atomic_dedup_rejection",
 "REVOKE ALL ON FUNCTION",
 "TO service_role"
])assert.ok(s.includes(term),"Missing transaction gate: "+term);
assert.ok(s.includes("FOREACH destination IN ARRAY p_channel_ids LOOP"),"channel batch");
assert.ok((s.match(/FOREACH destination IN ARRAY p_channel_ids LOOP/g)||[]).length===2,"validate before inserting any");
assert.ok(s.indexOf("shopee_cloud_rule_matches")<s.indexOf("INSERT INTO public.flow_delivery_jobs"),"validate channel rules before insert");
assert.ok(!/cron\.schedule|pg_net|https:\/\/api\.telegram\.org|UPDATE mavuri_internal\.discovery_cloud_control/i.test(s),"must not send or start automation");
console.log("Mavuri Shopee atomic enqueue: fail-closed static checks passed.");

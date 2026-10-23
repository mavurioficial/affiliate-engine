import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261023200000_shopee_cloud_routing_matcher.sql","utf8");
for(const required of [
 "CREATE OR REPLACE FUNCTION mavuri_internal.shopee_cloud_rule_matches(",
 "LANGUAGE sql STABLE SECURITY INVOKER",
 "mc.active",
 "aa.status='connected'",
 "r.enabled",
 "r.conditions->>'marketplace'='shopee'",
 "known_rules)=4",
 "count(*) FROM matching_rules)=1",
 "minDiscount",
 "deniedWords",
 "deniedMavuriTags",
 "mavuriTagsAny",
 "mavuriTagsAll",
 "mavuriCategories",
 "o.metadata #>> '{mavuri,category_slug}' = mc.slug",
 "FROM PUBLIC, anon, authenticated",
 "TO service_role"
])assert.ok(sql.includes(required),"missing: "+required);
assert.ok(!/LANGUAGE plpgsql|INSERT INTO|UPDATE public\.flow_|DELETE FROM|cron\.schedule|http_post/i.test(sql),
 "matcher must be read-only with no scheduling");
console.log("Mavuri Shopee persisted-category routing matcher: safety tests passed.");

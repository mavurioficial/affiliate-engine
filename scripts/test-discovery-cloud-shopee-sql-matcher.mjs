import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("docs/sql/SHOPEE_CLOUD_RULE_MATCH_DRAFT.sql","utf8");
const tx=readFileSync("docs/sql/SHOPEE_CLOUD_ATOMIC_ENQUEUE_DRAFT.sql","utf8");
assert.match(sql,/DRAFT ONLY/);
assert.match(sql,/SECURITY INVOKER/);
assert.match(sql,/REVOKE ALL ON FUNCTION mavuri_internal\.shopee_cloud_rule_matches_draft/);
assert.match(sql,/FROM PUBLIC, anon, authenticated/);
assert.match(sql,/o\.metadata #>> '\{mavuri,category_slug\}' = mc\.slug/);
assert.match(sql,/JOIN public\.flow_affiliate_accounts aa ON aa\.id=o\.affiliate_account_id/);
assert.match(sql,/aa\.status='connected'/);
assert.match(sql,/c\.user_id=p_user_id AND c\.type='telegram'/);
assert.match(sql,/c\.external_ref IS NOT NULL/);
assert.match(sql,/r\.conditions->>'marketplace'='shopee'/);
assert.match(sql,/r\.actions->'channel_ids' @> jsonb_build_array\(c\.id::text\)/);
assert.match(sql,/FROM known_rules\)=4/);
assert.match(sql,/count\(DISTINCT name\) FROM known_rules/);
assert.match(sql,/FROM matching_rules\)=1/);
const required=[
"minDiscount","maxDiscount","minPrice","maxPrice",
"mavuriCategories","mavuriTagsAny","mavuriTagsAll",
"deniedMavuriTags","deniedWords"
];
for(const key of required)assert.ok(sql.includes(key),`missing condition ${key}`);
const forbidden=[
 /INSERT\s+INTO\s+public\.flow_delivery_jobs/i,
 /UPDATE\s+public\.flow_offers/i,
 /DELETE\s+FROM\s+public\.flow_delivery_jobs/i,
 /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+.*\s+TO\s+(anon|authenticated|PUBLIC)/i
];
for(const re of forbidden)assert.doesNotMatch(sql,re);
assert.match(tx,/FOREACH v_channel IN ARRAY p_channel_ids LOOP/);
assert.match(tx,/mavuri_internal\.shopee_cloud_rule_matches_draft\(/);
assert.match(tx,/reason','channel_rule_mismatch'/);
assert.match(tx,/reason','transactional_policy_not_implemented'/);
assert.doesNotMatch(tx,/\bINSERT\s+INTO\s+public\.flow_delivery_jobs\b/i);
console.log("Shopee post-trigger SQL matcher + transactional hard stop: static checks passed (unapplied).");

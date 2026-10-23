import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261023184500_shopee_cloud_trigger_compatibility.sql","utf8");
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.mavuri_delivery_job_before_insert\(\)/);
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.mavuri_delivery_job_fanout\(\)/);
assert.match(sql,/v_automatic := v_prefix in \('discovery','shopee','shopee-cloud','magalu','repub','amazon-collector'\)/);
assert.match(sql,/coalesce\(new\.delivery_key,''\) like 'shopee-cloud:%' then\s+return new;/);
assert.match(sql,/if new.status <> 'queued' or pg_trigger_depth\(\) > 1 then/);
assert.match(sql,/Publicacao manual deve respeitar apenas os canais escolhidos pelo operador/);
assert.ok(!/DROP TRIGGER|DROP FUNCTION|CREATE TRIGGER|INSERT INTO|TRUNCATE|DELETE FROM/i.test(sql),
 "migration must preserve trigger identities and data");
console.log("Shopee cloud trigger compatibility: static regression passed.");

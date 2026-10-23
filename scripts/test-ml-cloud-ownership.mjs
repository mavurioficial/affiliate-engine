import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const sql=readFileSync("supabase/migrations/20261023183000_mercadolivre_cloud_ownership_staged.sql","utf8");
for(const x of [
 "mavuri_internal.ml_cloud_control","enabled boolean NOT NULL DEFAULT false",
 "active_executor text NOT NULL DEFAULT 'local'",
 "max_offers integer NOT NULL DEFAULT 8",
 "'America/Sao_Paulo'",
 "m.slug='mercadolivre'",
 "NEW.delivery_key LIKE 'discovery:%'",
 "c.enabled AND c.active_executor='cloud'",
 "RAISE EXCEPTION 'ml_legacy_writer_disabled_during_cloud'",
 "REVOKE ALL ON mavuri_internal.ml_cloud_control",
 "REVOKE ALL ON FUNCTION public.mavuri_ml_legacy_writer_fence()"
])assert.ok(sql.includes(x),"ML guard missing "+x);
assert.ok(!/UPDATE mavuri_internal\.discovery_cloud_control|cron\.schedule|pg_net|https:\/\/api\.telegram\.org/i.test(sql),
 "must not alter Shopee or turn on new publishing");
const preflight="scripts/cloud-runner/ml-vm-safe-preflight.sh";
execFileSync("bash",["-n",preflight]);
const sh=readFileSync(preflight,"utf8");
for(const key of ['credentials_used":false','links_generated":0','jobs_created":0',
 "public_home_http","guest_hub_http","capacity","ram_mb"])assert.ok(sh.includes(key),key);
assert.ok(!/Authorization:|cookie|--proxy|--socks|--user-agent|--insecure/i.test(sh),
 "no login or access-control changes");
console.log("ML independent cloud ownership + safe VM egress check: all checks passed.");

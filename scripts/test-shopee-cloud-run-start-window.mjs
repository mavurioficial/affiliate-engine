import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261023193000_shopee_cloud_run_start_not_send_window.sql","utf8");
for(const term of [
 "discovery_cloud_run_time_valid(",
 "discovery_cloud_within_publish_window(p_started_at)",
 "p_at < p_lease_expires_at",
 "p_at < p_started_at + interval '30 minutes'",
 "mavuri_shopee_cloud_run_delivery_allowed(",
 "p_delivery_key text",
 "coalesce(auth.jwt()->>'role','') <> 'service_role'",
 "r.status='running'",
 "mavuri_internal.discovery_cloud_run_time_valid(",
 "NEW.delivery_key,clock_timestamp()",
 "OLD.delivery_key,clock_timestamp()",
 "outside_publish_window",
 "GRANT EXECUTE ON FUNCTION public.mavuri_shopee_cloud_run_delivery_allowed(text,timestamptz)",
 "REVOKE ALL ON FUNCTION"
])assert.ok(sql.includes(term),term);
assert.ok(!/INSERT INTO public\.flow_delivery_jobs|UPDATE mavuri_internal\.discovery_cloud_control|cron\.schedule/i.test(sql),
 "migration cannot create jobs, enable cloud, or schedule publication");
assert.ok(!sql.includes("public.mavuri_shopee_cloud_delivery_allowed(clock_timestamp())"),
 "old wall clock guard must be absent from all three callsites");
// Pure functional model of the intended database predicate.
const inWindow=(ts)=>{const hh=new Intl.DateTimeFormat("en-GB",{timeZone:"America/Sao_Paulo",
 hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(ts));return hh>="08:00"&&hh<"22:00";};
const runValid=(start,expiry,at)=>inWindow(start)&&Date.parse(start)<=Date.parse(at)&&
 Date.parse(at)<Date.parse(expiry)&&Date.parse(at)<Date.parse(start)+30*60_000;
assert.equal(runValid("2026-10-24T00:59:00Z","2026-10-24T01:14:00Z","2026-10-24T01:05:00Z"),true,
 "21:59 run may publish 22:05");
assert.equal(runValid("2026-10-24T01:00:00Z","2026-10-24T01:15:00Z","2026-10-24T01:05:00Z"),false,
 "22:00 new run rejected");
assert.equal(runValid("2026-10-23T10:59:00Z","2026-10-23T11:14:00Z","2026-10-23T11:02:00Z"),false,
 "07:59 new run rejected");
assert.equal(runValid("2026-10-23T11:00:00Z","2026-10-23T11:15:00Z","2026-10-23T11:03:00Z"),true,
 "08:00 run allowed");
assert.equal(runValid("2026-10-24T00:59:00Z","2026-10-24T01:14:00Z","2026-10-24T01:14:00Z"),false,
 "expired lease rejected");
assert.equal(runValid("2026-10-24T00:59:00Z","2026-10-24T01:59:00Z","2026-10-24T01:30:00Z"),false,
 "hard cap 30 mins even if lease artificially extended");
console.log("Shopee start-window + run lease: 6 boundary checks passed.");

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker=readFileSync("supabase/functions/flow-worker-v38-snapshot-candidate/index.ts","utf8");
const sql=readFileSync("docs/sql/FLOW_WORKER_RENDERED_SNAPSHOT_TRIGGER_DRAFT.sql","utf8");

assert.match(worker,/const renderedOfferPrice = Number\(offer\?\.price \|\| 0\)/);
assert.match(worker,/const price = renderedOfferPrice\.toLocaleString\("pt-BR", \{ style: "currency", currency: "BRL" \}\)/);
assert.match(worker,/if \(!\(imageUrl \? telegramCaption : text\)\.includes\(price\)\)/);
assert.match(worker,/rendered_offer_snapshot: \{/);
assert.match(worker,/source: "flow-worker-rendered-v1"/);
assert.match(worker,/price: renderedOfferPrice/);
assert.match(worker,/\.\.\.\(channel\.type === "telegram" \? \{/);
const built=worker.indexOf("const renderedOfferPrice =");
const sent=worker.indexOf("externalMessageId = String(telegram.result?.message_id");
const logged=worker.indexOf('from("flow_delivery_logs").insert({', sent);
const meta=worker.indexOf('rendered_offer_snapshot: {', logged);
assert.ok(built>=0&&sent>built&&logged>sent&&meta>logged,
  "price captured before Telegram send, stored after successful response");
assert.match(sql,/DRAFT ONLY, UNAPPLIED/);
assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
assert.match(sql,/public\.mavuri_delivery_log_snapshot_offer\(\)/);
assert.match(sql,/new\.status = 'sent'/);
assert.match(sql,/auth\.jwt\(\)->>'role',''\) = 'service_role'/);
assert.match(sql,/rendered_offer_snapshot,source/);
assert.match(sql,/rendered_offer_snapshot,price/);
assert.match(sql,/price_source', 'worker_rendered'/);
assert.match(sql,/price_source','database_fallback'/);
assert.match(sql,/new\.metadata := coalesce\(new\.metadata, '\{\}'::jsonb\)/);
assert.ok(sql.includes("'^[0-9]{1,14}(\\.[0-9]{1,2})?$'"),"SQL currency price requires max two fractional digits");
// The already-mutated current row is deliberately not the authority when a
// trusted Telegram worker supplies a rendered snapshot.
const simulate=(newMetadata,offerPrice,serviceRole)=>{
 const accepted=serviceRole&&newMetadata?.rendered_offer_snapshot?.source==="flow-worker-rendered-v1"
   &&/^[0-9]{1,14}(\.[0-9]{1,2})?$/.test(String(newMetadata.rendered_offer_snapshot.price))
   &&Number(newMetadata.rendered_offer_snapshot.price)>0;
 return {price:accepted?Number(newMetadata.rendered_offer_snapshot.price):offerPrice,
         price_source:accepted?"worker_rendered":"database_fallback"};
};
const message={rendered_offer_snapshot:{source:"flow-worker-rendered-v1",price:90}};
assert.deepEqual(simulate(message,110,true),{price:90,price_source:"worker_rendered"});
assert.deepEqual(simulate(message,110,false),{price:110,price_source:"database_fallback"});
assert.equal(simulate({rendered_offer_snapshot:{source:"wrong",price:90}},110,true).price,110);
assert.equal(simulate({rendered_offer_snapshot:{source:"flow-worker-rendered-v1",price:"90.001"}},110,true).price,110);
console.log("Flow Worker rendered-price candidate and SQL draft checks passed; no live DB modifications.");

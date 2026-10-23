import assert from "node:assert/strict";
import {summarizeShopeeSentHistory} from "../supabase/functions/discovery-cloud-shopee/shopee-history.mjs";
const now="2026-10-22T19:00:00Z",since="2026-10-15T19:00:00Z";
const row=(id,ch,t,price)=>({
 status:"sent", channel_id:ch, created_at:t,flow_offers:{source_ref:id},
 metadata:{offer_snapshot:{price}}
});
let out=summarizeShopeeSentHistory([
 row("x","g","2026-10-20T20:00:00Z",100),
 row("x","g","2026-10-21T20:00:00Z",90),
 row("x","g","2026-10-22T10:00:00Z",90),
 row("x","w","2026-10-21T20:00:00Z",90),
 row("y","g","2026-10-21T20:00:00Z",50),
 row("y","g","2026-10-22T01:00:00Z",null),
 row("z","g","2026-10-22T09:00:00Z",50)
],{now_iso:now,since_iso:since});
assert.equal(out.sent_deliveries,7);
assert.equal(out.distinct_products,3);
assert.equal(out.distinct_channels,2);
assert.equal(out.same_item_channel_repeat_within_48h,3);
assert.equal(out.repeat_with_price_drop_at_least_10,1);
assert.equal(out.repeat_without_proven_10pct_drop,2);
assert.equal(out.snapshot_price_missing,1);
const after48=summarizeShopeeSentHistory([
 row("x","g","2026-10-18T10:00:00Z",100),
 row("x","g","2026-10-22T10:00:00Z",90)
],{now_iso:now,since_iso:since});
assert.equal(after48.same_item_channel_repeat_within_48h,0);
const fresh=summarizeShopeeSentHistory([row("q","g","2026-10-14T19:00:00Z",100)],{now_iso:now,since_iso:since});
assert.equal(fresh.sent_deliveries,0);
assert.throws(()=>summarizeShopeeSentHistory([],{now_iso:"2026-10-22T19:00:00Z"}),/invalid_history_window/);
console.log("Shopee history real-log snapshot analyzer tests passed; read-only.");

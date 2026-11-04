import test from "node:test";
import assert from "node:assert/strict";
import {evaluateAmazonForwardedOffer as evaluate} from "../src/domain/amazon-forwarded-price-gate.mjs";

const now=new Date("2026-11-03T22:30:00-03:00");
const candidate={asin:"B09MLBPL1K",title:"Personal Papel Higiênico VIP 32 rolos",
  claimedPrice:33.52,claimed:{recurrence:true,primeFreeShipping:true}};
const common={source:"amazon_creators_api",credentialApproved:true,asin:"B09MLBPL1K",
  price:33.52,observedAt:"2026-11-03T22:29:00-03:00",purchasePlan:"recurring",
  paymentMethod:"standard",primeShippingVerified:true,shippingKnown:true,shippingPrice:0,
  inStock:true,marketplace:"BR"};
const ownLink={tag:"mavuri0a-20",linkCheckerVerified:true};

test("Personal at R$75.90 standard-price screenshot must never pass",()=>{
  const out=evaluate({candidate,observation:{...common,source:"user_screenshot",
    credentialApproved:false,price:75.90,purchasePlan:"one_time",
    primeShippingVerified:false,shippingKnown:true,shippingPrice:38.12},
    ownLink:{tag:"mavuri0a-20",linkCheckerVerified:false},now});
  for(const k of ["quote_not_official_or_not_authorized","recurring_price_not_verified",
   "prime_free_shipping_not_verified","current_price_exceeds_claimed_price",
   "own_affiliate_link_not_verified"]) assert.ok(out.blockingReasons.includes(k),k);
  assert.equal(out.publicationAllowed,false);
});
test("Omo without source claimed deal price held even with screenshot",()=>{
  const out=evaluate({candidate:{asin:"B0HD2T6BZZ",title:"Omo Todo Ciclo 4kg",claimedPrice:null},
   observation:{...common,asin:"B0HD2T6BZZ",source:"user_screenshot",
     credentialApproved:false,price:50.26},ownLink,now});
  assert.ok(out.blockingReasons.includes("claim_price_missing"));
  assert.equal(out.publicationAllowed,false);
});
test("ASIN mismatches, stale price, incomplete claim conditions fail",()=>{
  const out=evaluate({candidate,observation:{...common,asin:"B0HD2T6BZZ",
    observedAt:"2026-11-03T20:00:00-03:00",purchasePlan:"one_time"},
    ownLink,now});
  for(const k of ["asin_mismatch","quote_stale_or_undated",
    "recurring_price_not_verified"])assert.ok(out.blockingReasons.includes(k));
});
test("missing official API quote always blocks even when correct link format",()=>{
  const out=evaluate({candidate,observation:null,
    ownLink:{tag:"mavuri0a-20",linkCheckerVerified:false},now});
  assert.ok(out.blockingReasons.includes("official_quote_missing"));
  assert.equal(out.publicationAllowed,false);
});
test("matching synthetic authorized quote passes validation but not automatic publishing",()=>{
  const out=evaluate({candidate,observation:common,ownLink,now});
  assert.deepEqual(out.blockingReasons,[]);
  assert.equal(out.gatesPassed,true);
  assert.equal(out.publicationAllowed,false);
  assert.equal(out.action,"ready_for_final_publication_review");
});
test("without Prime verified free shipping, claim is blocked",()=>{
  const out=evaluate({candidate,observation:{...common,shippingKnown:false},
   ownLink,now});
  assert.ok(out.blockingReasons.includes("shipping_cost_not_verified"));
});
test("without pix verification, conditional PIX offer is blocked",()=>{
  const out=evaluate({candidate:{...candidate,claimed:{pix:true}},
    observation:{...common,paymentMethod:"standard"},ownLink,now});
  assert.ok(out.blockingReasons.includes("pix_price_not_verified"));
});

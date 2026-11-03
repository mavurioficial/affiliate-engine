import test from "node:test";
import assert from "node:assert/strict";
import { previewMlDirectLink } from "../src/domain/ml-direct-link-preview.mjs";

const args = { productUrl: "https://www.mercadolivre.com.br/p/MLB62577381",
  mattWord: "testaffiliatetag", mattTool: "12345678" };

test("generates the same structural URL as the manual navigation experiment", () => {
  const result = previewMlDirectLink(args);
  assert.equal(result.candidate_url,
    "https://www.mercadolivre.com.br/p/MLB62577381?matt_word=testaffiliatetag&matt_tool=12345678");
  assert.equal(result.catalog_id, "MLB62577381");
  assert.equal(result.publication_allowed, false);
  assert.equal(result.affiliate_attribution_verified, false);
  assert.equal(result.official_link, false);
});

test("accepts clean product slug with a known catalog id", () => {
  const result = previewMlDirectLink({...args,
    productUrl:"https://www.mercadolivre.com.br/liquidificador-2-6l/p/MLB62577381"});
  assert.equal(result.catalog_id, "MLB62577381");
});

test("does not accept meli.la, social links or unsupported domains", () => {
  for (const productUrl of [
    "https://meli.la/2KesHdW",
    "https://www.mercadolivre.com.br/social/testaffiliatetag",
    "https://evil.example.com/p/MLB62577381",
    "http://www.mercadolivre.com.br/p/MLB62577381",
    "https://www.mercadolivre.com.br.evil.example/p/MLB62577381"
  ]) assert.throws(() => previewMlDirectLink({...args,productUrl}));
});

test("never overwrites existing tracking or changes a seller-selected listing", () => {
  for(const productUrl of [
    "https://www.mercadolivre.com.br/p/MLB62577381?matt_word=other",
    "https://www.mercadolivre.com.br/p/MLB62577381?ref=opaque",
    "https://www.mercadolivre.com.br/p/MLB62577381?wid=MLB1234567890",
    "https://www.mercadolivre.com.br/p/MLB62577381?pdp_filters=item_id%3AMLB1234567890",
    "https://www.mercadolivre.com.br/p/MLB62577381#section"
  ]) assert.throws(() => previewMlDirectLink({...args,productUrl}),
    {message:"requires_clean_catalog_url"});
});

test("does not silently accept malformed account identifiers", () => {
  for (const mattWord of ["", "a", "user name", "wrong?tag"]) {
    assert.throws(()=>previewMlDirectLink({...args,mattWord}));
  }
  for (const mattTool of ["", "invalid", "123 abc", "-1"]) {
    assert.throws(()=>previewMlDirectLink({...args,mattTool}));
  }
});

test("strictly rejects seller item IDs as catalog IDs and blocks direct publication", () => {
  assert.throws(()=>previewMlDirectLink({...args,
    productUrl:"https://www.mercadolivre.com.br/items/MLB4851817702"}));
  const result=previewMlDirectLink(args);
  assert.ok(!("affiliate_url" in result));
  assert.ok(!("send" in result));
  assert.ok(Object.isFrozen(result));
});

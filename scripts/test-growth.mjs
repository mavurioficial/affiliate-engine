import assert from "node:assert/strict";
import { campaignUrl, formatPrice, generateDrafts, renderCardSvg } from "../growth/content.mjs";

const now = "2026-11-04T12:00:00.000Z";
const valid = {
  id: "produto_123",
  title: 'Fone <sem fio> & estojo',
  marketplace: "mercadolivre",
  price: 89.9,
  affiliate_url: "https://www.mercadolivre.com.br/exemplo",
  verified_at: "2026-11-04T11:00:00.000Z",
  approved: true
};

const drafts = generateDrafts([valid], { now, campaign: "novembro_2026" });
assert.equal(drafts.length, 2);
assert.equal(drafts[0].status, "needs_review");
assert.equal(drafts[0].channel, "instagram");
assert.equal(drafts[1].channel, "facebook");
assert.match(drafts[0].tracking_url, /origem=instagram/);
assert.match(drafts[0].tracking_url, /campanha=novembro_2026/);
assert.match(drafts[0].caption, /link do perfil/);
assert.match(drafts[1].caption, /https:\/\/mavurioficial\.github\.io/);
assert.match(drafts[0].card_svg, /Fone &lt;sem fio&gt; &amp; estojo/);
assert.doesNotMatch(drafts[0].card_svg, /<script>/);
assert.equal(generateDrafts([valid, valid], { now }).length, 2, "Deduplicar oferta por ID");
assert.equal(generateDrafts([{ ...valid, approved: false }], { now }).length, 0);
assert.equal(generateDrafts([{ ...valid, verified_at: "2026-11-01T11:00:00.000Z" }], { now }).length, 0);
assert.equal(generateDrafts([{ ...valid, verified_at: "2026-11-05T11:00:00.000Z" }], { now }).length, 0);
assert.equal(generateDrafts([{ ...valid, affiliate_url: "http://example.com" }], { now }).length, 0);
assert.equal(generateDrafts([{ ...valid, price: 0 }], { now }).length, 0);
assert.equal(generateDrafts([{ ...valid, marketplace: "desconhecido" }], { now }).length, 0);
assert.throws(() => generateDrafts({ offers: [valid] }, { now }), TypeError);
assert.throws(() => campaignUrl("whatsapp", "x", "y"), /não suportado/);
assert.match(formatPrice(89.9), /89,90/);
assert.match(renderCardSvg({ ...valid, marketplace: "mercadolivre" }), /MAVURI/);
console.log("Growth Engine V1: testes concluídos.");

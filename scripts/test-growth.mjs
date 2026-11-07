import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
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

// Teste do tracker sem rede, navegador real ou dependências externas.
const handlers = {};
const sent = [];
const links = [
  { classList: { contains: (name) => name === "whatsapp" }, addEventListener: (_event, cb) => { handlers.whatsapp = cb; } },
  { classList: { contains: (name) => name === "telegram" }, addEventListener: (_event, cb) => { handlers.telegram = cb; } }
];
const share = { addEventListener: (_event, cb) => { handlers.share = cb; } };
const events = [];
const windowMock = {
  location: { search: "?origem=instagram&campanha=novembro_2026&conteudo=post_01" },
  dispatchEvent: (event) => events.push(event.detail)
};
const navigatorMock = {
  sendBeacon: (url, blob) => { sent.push({ url, blob }); return true; }
};
const documentMock = {
  querySelectorAll: () => links,
  getElementById: (id) => id === "share" ? share : null
};
class FakeCustomEvent {
  constructor(_name, options) { this.detail = options.detail; }
}
runInNewContext(readFileSync(new URL("../entrar/growth.js", import.meta.url), "utf8"), {
  window: windowMock, navigator: navigatorMock, document: documentMock,
  URLSearchParams, Blob, CustomEvent: FakeCustomEvent
});
assert.equal(events.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(events[0])), {
  event: "page_view", source: "instagram", campaign: "novembro_2026",
  content: "post_01", channel: "site", page: "entrar"
});
handlers.whatsapp();
handlers.telegram();
handlers.share();
assert.deepEqual(events.map((event) => event.event), [
  "page_view", "join_click", "join_click", "share_click"
]);
assert.deepEqual(events.map((event) => event.channel), [
  "site", "whatsapp", "telegram", "site"
]);
assert.equal(sent.length, 4);
assert.match(sent[0].url, /mavuri-growth-event$/);

const landing = readFileSync(new URL("../entrar/index.html", import.meta.url), "utf8");
assert.match(landing, /<script src="\.\/growth\.js" defer><\/script>/);
assert.match(landing, /shareUrl\.searchParams\.set\("origem","compartilhamento"\)/);
assert.match(landing, /https:\/\/chat\.whatsapp\.com\/G2Q71W49Zrn10eLbXDB0UD/);

console.log("Growth Engine V1: testes concluídos.");

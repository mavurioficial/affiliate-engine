// Mavuri Growth Engine V1: rascunhos editoriais a partir de ofertas já aprovadas.
// Não publica em redes sociais nem altera o fluxo de distribuição de ofertas.

export const LANDING_URL = "https://mavurioficial.github.io/affiliate-engine/entrar/";
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const MARKETPLACES = Object.freeze({
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  amazon: "Amazon",
  magalu: "Magalu"
});

function token(value, max = 48) {
  return String(value || "").trim().toLowerCase()
    .replace(/[^a-z0-9_-]/g, "").slice(0, max);
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[char]);
}

function wrapText(value, maxChars = 30, maxLines = 4) {
  const words = String(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = kept[maxLines - 1].slice(0, maxChars - 1) + "…";
  return kept;
}

export function formatPrice(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL"
  }).format(value);
}

export function campaignUrl(source, campaign, content) {
  if (!["instagram", "facebook"].includes(source)) {
    throw new Error("Canal de aquisição não suportado.");
  }
  const url = new URL(LANDING_URL);
  url.searchParams.set("origem", source);
  url.searchParams.set("campanha", token(campaign));
  url.searchParams.set("conteudo", token(content));
  return url.toString();
}

function normalizeOffer(offer, nowMs) {
  if (!offer || offer.approved !== true) return null;
  const id = token(offer.id, 48);
  const title = String(offer.title || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const marketplace = token(offer.marketplace, 24);
  const price = Number(offer.price);
  const checkedAt = Date.parse(String(offer.verified_at || ""));
  if (!id || title.length < 5 || !MARKETPLACES[marketplace]) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(checkedAt) || checkedAt > nowMs + 5 * 60 * 1000 ||
      nowMs - checkedAt > MAX_AGE_MS) return null;
  try {
    const affiliateUrl = new URL(String(offer.affiliate_url || ""));
    if (affiliateUrl.protocol !== "https:") return null;
  } catch (_error) {
    return null;
  }
  return { id, title, marketplace, price, verified_at: new Date(checkedAt).toISOString() };
}

export function renderCardSvg(offer) {
  const lines = wrapText(offer.title);
  const titleLines = lines.map((line, index) =>
    '<text x="80" y="' + (420 + index * 77) +
    '" fill="#ffffff" font-size="56" font-weight="800">' + escapeXml(line) + "</text>"
  ).join("\n  ");
  const marketplace = MARKETPLACES[offer.marketplace];
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-label="Card de oferta Mavuri">\n' +
    '  <rect width="1080" height="1350" fill="#071b45"/>\n' +
    '  <rect x="0" y="0" width="1080" height="22" fill="#ff9b27"/>\n' +
    '  <circle cx="960" cy="120" r="280" fill="#0d3975"/>\n' +
    '  <text x="80" y="145" fill="#ffb64d" font-size="45" font-weight="800">MAVURI • ACHADINHOS</text>\n' +
    '  <text x="80" y="265" fill="#c5ddff" font-size="36">Oferta selecionada • ' + escapeXml(marketplace) + '</text>\n' +
    '  ' + titleLines + '\n' +
    '  <rect x="72" y="805" width="936" height="240" rx="38" fill="#ffffff"/>\n' +
    '  <text x="115" y="882" fill="#385273" font-size="33">Preço consultado</text>\n' +
    '  <text x="115" y="985" fill="#0757b0" font-size="79" font-weight="900">' +
    escapeXml(formatPrice(offer.price)) + '</text>\n' +
    '  <text x="80" y="1145" fill="#ffb64d" font-size="43" font-weight="800">Entre grátis no grupo Mavuri</text>\n' +
    '  <text x="80" y="1220" fill="#c5ddff" font-size="27">Preço e disponibilidade podem mudar.</text>\n' +
    '  <text x="80" y="1262" fill="#c5ddff" font-size="27">Conteúdo com ofertas de afiliados.</text>\n' +
    '</svg>\n';
}

export function generateDrafts(offers, options = {}) {
  if (!Array.isArray(offers)) throw new TypeError("A entrada deve ser um array de ofertas.");
  const nowMs = options.now ? new Date(options.now).getTime() : Date.now();
  if (!Number.isFinite(nowMs)) throw new Error("Data de referência inválida.");
  const campaign = token(options.campaign || "ofertas_curadas");
  if (!campaign) throw new Error("Campanha inválida.");

  const drafts = [];
  const seen = new Set();
  for (const raw of offers) {
    const offer = normalizeOffer(raw, nowMs);
    if (!offer || seen.has(offer.id)) continue;
    seen.add(offer.id);

    for (const channel of ["instagram", "facebook"]) {
      const url = campaignUrl(channel, campaign, offer.id);
      const headline = "🛍️ Achadinho Mavuri\n" + offer.title + "\n" +
        "💰 Preço consultado: " + formatPrice(offer.price) + "\n" +
        "🏬 " + MARKETPLACES[offer.marketplace] + "\n\n" +
        "Preço, estoque e cupons podem mudar. Links divulgados no grupo podem gerar comissão para a Mavuri.\n\n";
      const callToAction = channel === "instagram"
        ? "📲 Entre no grupo gratuito pelo link do perfil. (Configure o link do perfil antes de publicar.)"
        : "📲 Entre no grupo gratuito: " + url;
      drafts.push({
        id: offer.id + "-" + channel,
        offer_id: offer.id,
        channel,
        status: "needs_review",
        verified_at: offer.verified_at,
        tracking_url: url,
        caption: headline + callToAction,
        card_svg: renderCardSvg(offer)
      });
    }
  }
  return drafts;
}

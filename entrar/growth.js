/*
 * Mavuri Growth Engine V1 — aquisição sem cookies, fingerprinting ou dados pessoais.
 * O endpoint começa a registrar eventos somente depois do deploy da Edge Function.
 * Uma falha de telemetria nunca bloqueia o clique no convite.
 */
(function () {
  "use strict";

  const endpoint = "https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/mavuri-growth-event";
  const allowedSources = new Set([
    "direto", "instagram", "facebook", "whatsapp", "telegram",
    "seo", "parceiro", "compartilhamento", "outros"
  ]);
  const params = new URLSearchParams(window.location.search);

  function slug(value, maxLength) {
    return String(value || "").trim().toLowerCase()
      .replace(/[^a-z0-9_-]/g, "").slice(0, maxLength);
  }

  const rawSource = slug(params.get("origem") || "direto", 24);
  const source = allowedSources.has(rawSource) ? rawSource : "outros";
  const campaign = slug(params.get("campanha"), 48);
  const content = slug(params.get("conteudo"), 48);

  function track(event, channel) {
    const payload = {
      event: event,
      source: source,
      campaign: campaign,
      content: content,
      channel: channel,
      page: "entrar"
    };

    // Evento local para depuração ou integração futura, sem expor identificadores.
    window.dispatchEvent(new CustomEvent("mavuri:growth", { detail: payload }));

    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        const queued = navigator.sendBeacon(
          endpoint, new Blob([body], { type: "text/plain" })
        );
        if (queued) return;
      }
      if (window.fetch) {
        window.fetch(endpoint, {
          method: "POST",
          mode: "cors",
          keepalive: true,
          headers: { "Content-Type": "text/plain" },
          body: body
        }).catch(function () { /* Telemetria é opcional. */ });
      }
    } catch (_error) {
      // Bloqueadores de anúncios ou rede indisponível não devem afetar a navegação.
    }
  }

  document.querySelectorAll("a.channel.whatsapp, a.channel.telegram").forEach(function (link) {
    const channel = link.classList.contains("whatsapp") ? "whatsapp" : "telegram";
    link.addEventListener("click", function () { track("join_click", channel); });
  });

  const share = document.getElementById("share");
  if (share) {
    share.addEventListener("click", function () { track("share_click", "site"); });
  }

  track("page_view", "site");
}());

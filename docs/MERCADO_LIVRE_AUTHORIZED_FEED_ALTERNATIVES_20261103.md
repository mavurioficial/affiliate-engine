# Mavuri — fontes de ofertas Mercado Livre (03/11/2026)

Objetivo: fontes de ofertas novas e com dados utilizáveis, R$ 0, sem V86, PC ou scraping.

1. A documentação pública de afiliados não apresenta uma API de feed ou geração de links em massa. Resposta de suporte Mercado Livre em 2026: https://www.reclameaqui.com.br/mercado-livre/erro-403-forbidden-ao-acessar-endpoint-publico-da-api-do-mercado-livre_0wZVbd_lkhUnNjJO/
2. Notificações public_offers são de promoções ligadas a user_id vendedor, não demonstram cobrir ofertas de todos os vendedores: https://developers.mercadolivre.com.br/produto-receba-notificacoes
3. Não fazer scraping de páginas públicas Mercado Livre. Termos: https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes
4. Promobit proíbe bots de coleta/cópia sem autorização: https://www.promobit.com.br/institucional/termos/
5. Razzio e AffiMetrics oferecem feed e/ou bots próprios mas são pagos após os testes gratuitos. Não cumprem o objetivo de R$ 0 permanente.
6. Alertas Google gratuitos podem indicar novas páginas, mas não entregam estoque, preço garantido ou link comissionado: https://support.google.com/websearch/answer/4815696?hl=pt-BR
7. Mercado Livre documenta /items/bulk?ids= como substituto recomendado de /items?ids= (25/10/2026). Pode ajudar a atualizar anúncios conhecidos, não descobrir novos: https://developers.mercadolivre.com.br/pt_br/itens-e-buscas

Descoberta interna verificada: 566 links meli.la armazenados; 350 catálogos distintos no pool privado; 20 IDs de anúncios individuais explicitamente guardados nas URLs.
Nova view privada no Supabase: mavuri_internal.ml_item_bulk_refresh_candidates, com 20 anúncios, todos publication_allowed=false. Acesso anônimo negado.
Protótipo de avaliação apenas offline: scripts/ml-bulk-refresh-evaluator.mjs; testes em scripts/ml-bulk-refresh-evaluator.test.mjs.

Não foi feita chamada de /items/bulk após HTTP 429 em 03/11. Respeitar cooldown e nunca usar outro endpoint como contorno do limite.
Mesmo que /items/bulk funcione, não será fonte de novidades a cada 30 minutos: apenas recadastra dados de IDs já conhecidos.
Próximo requisito para operação contínua: obter feed estruturado de parceiro autorizado, com promoções recentes, permissão de reutilização e vínculos de afiliado verificáveis.
Nenhuma publicação, compra de serviço ou alteração em fluxos Shopee/Magalu foi realizada nesta investigação.
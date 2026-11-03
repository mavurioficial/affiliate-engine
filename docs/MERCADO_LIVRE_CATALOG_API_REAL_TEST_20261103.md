# Mavuri — execução real do piloto de catálogo (03/11/2026, 16:13 BRT)

Status: **sucesso parcial de integração**, somente leitura.

## Hipótese e execução

A Supabase Edge Function temporária `ml-catalog-probe` foi implantada e invocada uma vez pelo `pg_net`, assinada com o segredo já existente do agendador no Vault. A função não solicitou credenciais ao navegador do usuário. Tentou refresh OAuth oficial e fez consultas documentadas em `api.mercadolibre.com`.

- OAuth expirado antes do piloto: expirava em 22/10/2026.
- Refresh OAuth: **sucesso**; credencial cifrada atualizada com expiração em 04/11/2026 01:13:04Z.
- `GET /products/search`: HTTP **200**.
- Produtos de catálogo consultados: **2**.
- `GET /products/{id}`: HTTP **200** para ambos.
- `GET /products/MLB64293367/items`: HTTP **404** (sem itens acessíveis via esse recurso).
- `GET /products/MLB66044973/items`: HTTP **200**, dois anúncios normalizados.
- Anúncios de exemplo: `MLB7930832866` (R$ 1.654,00); `MLB7930895486` (R$ 1.655,00).
- Ambos: `original_price` indisponível e `verified_discount_percent = null`. **Não inventar desconto**.
- Dois anúncios encontrados por consulta de catálogo não implicam que encontraremos oito descontos comprovados por ciclo.
- Este teste mostra acesso ao **catálogo e concorrentes**, não a uma API oficial de afiliados nem um gerador de links comissionáveis.

## Efeitos e encerramento

- `affiliate_links_generated=0`
- `offer_database_writes=0`
- `delivery_jobs_created=0`
- `telegram_posts=0`
- Consulta SQL posterior confirmou **0** ofertas do ML capturadas desde o piloto.
- `ml-catalog-probe` foi imediatamente substituída pela versão **2**, stub que retorna 410 e tem `verify_jwt=true`. Confirmado por leitura da implantação.
- Nenhum cron criado; nenhuma alteração em `flow-worker`, Shopee, Magalu, regras ou canais.
- O refresh OAuth é a única alteração persistente necessária para a autenticação (feita pelo fluxo já existente de armazenamento cifrado).

## Próxima hipótese específica, documentada

Testar uma consulta limitada ao recurso oficial `GET /items/{ITEM_ID}/prices` para detectar `regular_amount` e `type=promotion` em anúncios de outros vendedores, **somente se permitidos para o OAuth da conta**.
Documentação https://developers.mercadolivre.com.br/pt_br/api-de-precos

Se o endpoint exigir conta do vendedor, parar e não tentar contornar restrição. Seguir verificando fontes oficiais de descontos e, em paralelo, atribuição/autorização dos links diretos experimentais.

Não usar `matt_word`/`matt_tool` como prova de comissão ou gerar mensagens até haver validação comercial independente.

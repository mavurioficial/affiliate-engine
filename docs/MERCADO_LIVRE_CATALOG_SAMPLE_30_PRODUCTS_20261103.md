# Mavuri — Mercado Livre: piloto de descoberta em 6 categorias
**Data:** 03/11/2026 (horário de Brasília)  
**Projeto:** Supabase `mavuri-affiliate-engine`  
**Modo:** dry-run autenticado, sem publicação

## Objetivo
Medir se a API oficial de catálogo consegue fornecer uma amostra suficiente de produtos com anúncios e desconto comercial verificável sem Chrome/runner V86, proxies ou APIs internas de afiliados.

## Execução
- 6 pesquisas de catálogo: tecnologia, cozinha, beleza, ferramentas, casa, automotivo
- 5 produtos por pesquisa: **30 produtos de catálogo únicos**
- `GET /products/search`: 6 respostas HTTP 200
- `GET /products/{id}`: 30 respostas HTTP 200
- `GET /products/{id}/items?limit=5`: 6 respostas HTTP 200, **24 HTTP 404**
- Total de chamadas HTTP oficiais: **66** (42 x HTTP 200, 24 x HTTP 404), sem 403/429
- Duração: **29.323 ms**
- Anúncios aproveitáveis na amostra: **15**, todos com preço atual
- Anúncios com `original_price` comparável e maior que o preço atual: **0**
- Anúncios com desconto nominal >= 10% comprovável: **0**
- Candidatos prontos para publicação: **0**

## Distribuição
| Categoria | Produtos de catálogo | Anúncios com preço | Descontos comparáveis |
|---|---:|---:|---:|
| Tecnologia | 5 | 2 | 0 |
| Cozinha | 5 | 2 | 0 |
| Beleza | 5 | 0 | 0 |
| Ferramentas | 5 | 6 | 0 |
| Casa | 5 | 1 | 0 |
| Automotivo | 5 | 4 | 0 |
| **Total** | **30** | **15** | **0** |

## Interpretação
A via oficial é capaz de buscar catálogo, identificar anúncios e obter preço anunciado. Não é comprovadamente um feed de promoções. O recurso de preços detalhados já retornou HTTP 403 para anúncio de outro vendedor em teste independente; **não repetir nem contornar essa negativa**. A documentação oficial anuncia a retirada progressiva dos campos de preço antigos na API /items.

Os 15 anúncios encontrados não demonstram desconto verdadeiro, comissão ou elegibilidade de publicação. Algumas listas incluem anúncios concorrentes e podem não representar o vendedor em destaque na página do catálogo.

## Segurança e encerramento
- `affiliate_links_generated=0`
- `offer_db_writes=0`
- `delivery_jobs_created=0`
- `telegram_posts=0`
- `affiliate_attribution_verified=false`
- Função temporária `ml-catalog-batch-probe` implantada, executada uma vez e substituída pela versão 2 que responde 410 e exige JWT.
- Nenhum cron novo, nenhuma modificação no `flow-worker`, Shopee, Magalu, regras ou canais.

## Próximo gate técnico
Encontrar **fonte documentada e autorizada de promoções de terceiros com preço anterior/preço atual** — preferencialmente associada ao programa de afiliados — e validar atribuição dos links sem usar tráfego artificial. Antes disso, não integrar os links experimentais ao `affiliate_url` nem agendar publicação.

Documentação:
- https://developers.mercadolivre.com.br/buscador-de-produtos
- https://developers.mercadolivre.com.br/concorrencia-em-catalogo
- https://developers.mercadolivre.com.br/pt_br/api-de-precos

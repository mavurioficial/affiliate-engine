# Mavuri — pesquisa de fontes alternativas de ofertas (03/11/2026)

## Resultado: feed RSS de terceiros funciona tecnicamente na nuvem

Fonte pública (não afiliada ao Mavuri): https://cuidabolso.com/feed.xml

Teste com Edge Function isolada `ml-alternative-feed-probe`, modo somente leitura. A função usou autenticação interna do Supabase, sem chamadas à API do Mercado Livre nem publicações.

- HTTP 200
- RSS 2.0 válido, `content-type: text/xml`
- 50 itens, cerca de 37 KB
- Datas de publicação recentes no próprio dia do teste
- 50 IDs de catálogo `MLB...` distintos extraídos dos links
- 40 URLs continham parâmetros de rastreamento de afiliado do publicador (NÃO pertencem ao Mavuri)
- Cruzamento com 350 catálogos distintos do acervo do Mavuri: somente **1 catálogo coincidente** (`MLB16016316`, Batedeira Mondial)
- Correspondência de catálogo não prova o mesmo vendedor/anúncio, preço nem comissão

A função foi substituída pela versão 3 que sempre retorna HTTP 410 e tem `verify_jwt=true`. Nenhum cron foi criado para essa fonte.

### Significado

O RSS pode servir como **pista de descoberta** de produtos, mas não fornece links afiliados próprios; a cópia/republicação automatizada de conteúdo de terceiro requer respeito à licença/termos e eventual autorização. Não copiar descrições publicitárias, não reutilizar tags de outra pessoa e não tratar preço do feed como verificação em tempo real do marketplace.

Como somente 1/50 produtos coincidiram com os 350 registros existentes, depender apenas do estoque de links antigos não sustenta volume de publicações. Validar geração oficial de links é condição para monetização.

## Fontes descartadas / limitações documentadas

1. `/products/search` e `/products/{id}/items`: funcionaram uma vez em amostra reduzida, mas a busca passou a responder HTTP 429; primeira execução do piloto na tarde do dia 03/11 também 429.
2. `/items/{item}/prices` de vendedor terceiro: HTTP 403 com OAuth da conta.
3. Site público `mercadolivre.com.br/ofertas/`: oficial e bom para consulta humana, mas Termos para Desenvolvedores proíbem scraping/coleta por robôs. Não transformar em coletor automático.
4. Pelando: havia RSS anunciado em 2022, mas os três links diretos documentados não responderam atualmente (404); não tratar como feed ativo.
5. Outros terceiros pagos oferecem feed + criação de links mediante integração por extensão/sessão, mas não cumprem o requisito de custo zero.

## Próxima ação técnica recomendada

- Antes de integrar uma nova fonte externa: confirmar permissão de consumo automatizado do RSS e licença de reutilização de dados.
- Preparar importador em modo sombra: ingestão de URLs e identificadores de produtos com a fonte claramente identificada, deduplicação por produto/anúncio e sem publicar.
- Reaproveitar apenas links `meli.la` **do próprio Mavuri** quando coincidirem com o produto/anúncio e tiverem condição atual validada.
- Para os demais produtos, continuar buscando um mecanismo oficialmente autorizado de geração de links. Sem ele, nova fonte de descoberta não significa oferta comissionável.
- Manter janela do piloto de observação existente, sem modificar Magalu/Shopee/Telegram.

### Referências

- https://www.mercadolivre.com.br/l/afiliados-siga-tendencias
- https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes
- https://developers.mercadolivre.com.br/pt_br/boas-praticas-para-usar-a-plataforma
- https://www.pelando.com.br/d/voc-j-conhecia-essas-fun-es-do-pelando-b7dd

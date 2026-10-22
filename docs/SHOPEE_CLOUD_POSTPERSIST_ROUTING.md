# Shopee Cloud — Contrato para seleção APÓS classificação persistida

## Resultado da auditoria real (22/10/2026)

A chamada autenticada `general_audit` v16 (HTTP 200) analisou 80 candidatos, comparando:
- simulação usando classificação provisória: 8 ofertas;
- simulação usando categoria final do Supabase para itens já gravados: 8 ofertas;
- 6 ofertas em comum; **2 substituídas**;
- 59 com categoria final conhecida, 21 ainda sem registro e sem categoria final;
- 23 ajustes de categoria entre as duas classificações; 2 revisões manuais preservadas;
- 5 das 8 selecionadas na segunda simulação ainda sem categoria final confirmada;
- bloqueios por diversidade: inicialmente `cozinha=1, casa=3, outros=3`; com classificação armazenada `cozinha=3, casa=3, outros=1`.

**Interpretação:** alcançar 8 candidatas em *shadow* não demonstra que seria seguro publicar 8 ofertas. A maioria das selecionadas (5) é nova e não passou pelos gatilhos SQL de classificação. A regra de canal geral não depende da categoria, mas a diversidade sim; canais de nicho dependem diretamente da categoria e tags finais.

## Bloqueador prioritário identificado em `flow-shopee-ingest` implantada

A implementação atual (auditada em 22/10) tem esta ordem:
1. `classification = classifyShopee(input)`;
2. faz UPDATE/INSERT em `flow_offers` com metadados provisórios — gatilhos SQL podem corrigir categoria, tags e proteger revisões manuais;
3. define `effective` usando **`classification.categorySlug` e `classification.tags` em memória, antes das correções persistidas**;
4. executa `matchesRule(rule,effective)`, decide destinos, faz bloqueio de 24h para mesmo item e limite 2/categoria usando também categoria provisória;
5. cria `flow_delivery_jobs`.

**Consequência:** as regras de nichos e a diversidade podem divergir da categoria/tags finais gravadas. Se o cloud simplesmente chamar o ingress atual, copiará essa diferença — **não é paridade V85 vs classificação efetiva**.

## Refatoração necessária (sem alterar produção nesta etapa)

Estratégia recomendada: **usar a classificação que já existe no Supabase como fonte única de verdade**, sem duplicar dezenas de triggers em JavaScript.

1. Manter as ofertas Shopee do cloud com o `affiliate_url` correto, `shop_id`, taxas de comissão e demais dados necessários ao preço/afiliado.
2. Na futura ingestão transacional, após o INSERT/UPDATE (e execução dos gatilhos):
   - reconsultar exatamente a linha gravada do usuário, marketplace, conta afiliada e `source_ref`;
   - ler `mavuri_category_id`, `mavuri_tags`, `metadata.mavuri.category_slug` efetivos, bem como a revisão manual preservada;
   - **se ausente/inconsistente, bloquear a autorização de publicação e registrar motivo**, sem cair silenciosamente no classificador provisório;
   - reavaliar `matchesRule` e limites de diversidade **com o estado persistido**;
   - então consultar entregas enviadas/pendentes e aplicar cooldown de 48h por canal, preço melhor >=10% comparado com snapshot de envio, bloqueio de variantes de outro vendedor por 24h (somente quando identidade real for confiável) e até 8 ofertas únicas por ciclo;
   - só criar jobs para canais Telegram conectados. Não habilitar WhatsApp.
3. Bloqueios do banco/Telegram devem ser protegidos contra concorrência e contra o runner Windows ainda ativo. O lease cloud preparado **não protege o V85 local**, portanto não criar Cron cloud agora.
4. Para `dry_run`: produtos inéditos **não** recebem classe final só por `classifyShopee`. Exibir `requires_database_classification` (a menos que exista um futuro serviço isolado que reproduza os triggers com rollback e sem efeitos colaterais). Nunca criar ofertas/jobs como efeito de diagnóstico.
5. Garantir que o valor `published_price` seja o preço renderizado e efetivamente enviado, não apenas o preço mutável no banco capturado depois do Telegram; preservar relatórios e links de afiliado.

## Plano de testes obrigatório antes de trocar a função real

- Uma oferta classificada preliminarmente como `moda`, mas corrigida no banco para `casa`, **não entra Mulher** e **entra Casa & Cozinha** se a regra permitir.
- Uma revisão manual para `beleza` permanece mesmo após reprocessamento da API e envia somente aos canais permitidos pelo estado final.
- Produto inédito sem classe final não é tratado como elegível por simulação.
- Reenvio após 12h sem preço melhor bloqueado; queda de exatamente 10% com snapshot validado permite reenvio; ausência de snapshot **não** libera exceção.
- Mesmo item em dois canais tem decisão independente. O limite 8 é de ofertas únicas, não soma de jobs.
- Comissão desempata descontos equivalentes; `affiliate_url` da conta correta é mantida.
- Nenhum job cloud duplicado se o Windows estiver ativo; rollback e custo do Cron revisados.

## Estado

Cloud Shopee v16 está **somente em diagnóstico**; `discovery_cloud_control.enabled=false`, `active_executor=local`, nenhum Cron de Discovery. O código de produção **não foi modificado nesta auditoria**. Evitar novos ciclos de shadow sem avanço no pipeline — a prioridade agora é construir/testar este pós-persistência antes do cutover.


## Implementação isolada de planejamento pós-persistência (22/10/2026)

**Adicionado na branch do PR, NÃO implantado no Supabase como publicador:**
- `supabase/functions/discovery-cloud-shopee/shopee-postpersist-plan.mjs` — função pura `planShopeeAfterPersistence` exige `stored_offers` com escopo exato de usuário, marketplace e conta afiliada; falha de modo conservador quando não encontra a linha final, quando a categoria ou tags finais estão ausentes, ou se o preço/URL afiliado da linha diferem do candidato da API.
- Aplica `matchesRule` das **quatro regras** aos dados efetivamente persistidos (categoria e tags finais), preservando revisões manuais e somente canais Telegram válidos. Permite decisões independentes por canal e limite de até 8 itens únicos, máximo de 2/categoria e 1/família ampla por ciclo.
- Janela de 48h para o mesmo item e canal, com exceção de queda de preço >=10% **somente quando `snapshot_price_verified=true`**. Enquanto o preço exatamente renderizado não for validado, exceção desativada. Jobs `queued/processing` impedem duplicação por canal.
- Janela de 24h entre vendedores apenas quando os dois registros trazem **identidade de família de catálogo comprovada** e `shop_id` distinto; títulos parecidos não são prova.
- Relatório público `summarizePostPersistPlan` agrega contagens sem nomes, links afiliados, IDs de produtos e referências dos chats. A lista interna de decisões contém IDs para testes **mas nunca deve ser logada nem retornada ao navegador**.
- Retorna `ready_to_publish=false` incondicionalmente. Ainda faltam lease compartilhado com o V85 e a rechecagem atômica de envio/fila no banco; esta etapa NÃO cria tarefas, executa queries, chama APIs ou publica nada.

**Testes**: `scripts/test-discovery-cloud-shopee-postpersist-plan.mjs` cobre categorias pós-trigger, revisão manual, produto novo bloqueado, vínculo da conta afiliada, preço/URL divergente, pendentes, cooldown de 48h, exceção de preço condicionado a snapshot confiável, equivalência entre vendedores comprovada, decisões independentes por canal, limite de diversidade e 8 ofertas únicas e segurança dos agregados. GitHub Actions run `39852671008`: suite e Deno check **SUCESSO**.

**Fase posterior antes de ativação**: integrar esse planejador a um executor transacional seguro, persistindo linhas e garantindo que as decisões usem as classificações após os gatilhos; bloquear qualquer caminho cloud de publicação até haver exclusão mútua entre Windows e nuvem, além de `shop_id` e histórico de preço renderizado confiáveis. O sistema V85 de produção não foi alterado.

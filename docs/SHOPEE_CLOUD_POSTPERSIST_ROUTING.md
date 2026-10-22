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

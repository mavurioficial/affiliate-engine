# MAVURI Discovery — migração controlada para a nuvem

Data da auditoria: 2026-10-22. Ambiente: `mavurioficial/affiliate-engine` e Supabase `otikoxnfotyjgphrdudn`.

## Estado encontrado

- **Produção atual:** Windows Discovery Runner V85 (ciclos de 30 minutos). Não desligar durante preparação.
- **Supabase Cron:** `mavuri-flow-worker` ativo a cada minuto para publicação. **Nenhum Cron de Discovery**.
- **Edge Functions de ingestão:** `flow-discovery-ingest` (Mercado Livre), `flow-shopee-ingest` e `flow-magalu-ingest`. Também existem `flow-republication-policy`, funções de cupons, classificação e worker.
- **Canais:** quatro Telegram conectados. WhatsApp com status `disabled`; não reativar nem enviar.
- **GitHub:** contém scripts de Shopee feed, fila de links e painel, mas não continha o código completo do Discovery V85. **O script V85 e seu package.json foram fornecidos pelo usuário em 2026-10-22**, examinados localmente, mas NÃO foram publicados: contêm dependências de sessões, infraestrutura local e pelo menos um token local embutido que precisa ser removido antes de qualquer versionamento.
- **Dependências confirmadas na V85:** `playwright-core`, Chrome via CDP, `MavuriChromeProfile`, sessão autenticada no Mercado Livre, sessão JWT do Mavuri no localStorage do navegador, `teleproto`/MTProto com arquivo de sessão do usuário Telegram, estado/cache local e collector Amazon em localhost. Não transportar cookies, tokens ou sessões locais para repositório público.
- **Atenção à consistência:** o código implantado de `flow-discovery-ingest` e `flow-shopee-ingest` contém janelas locais de 24 horas; `flow-republication-policy` contempla 48 horas e queda de preço mínima de 10%. `flow-magalu-ingest` contém ao menos uma condição própria de republicação de 5%. Auditar precedência antes da ativação para preservar a regra desejada de 48h / 24h por família / queda real de 10%.
- **Segurança preexistente:** `public.mavuri_category_audit` foi sinalizada pelo Supabase por estar sem RLS. Tema independente; não aplicar RLS sem analisar dependências do painel.


## Auditoria do código REAL V85 (recebido em 2026-10-22)

Fonte: arquivo local `browser-discovery-v1(20261022-165219).mjs` e `package.json`, fornecidos pelo usuário. O arquivo original **não deve ser commitado**.

| Função V85 | Dependência técnica | Plano |
| --- | --- | --- |
| `discoverMercadoLivreDiversifiedPool` | Central ML via Chrome autenticado e cookie de sessão | Adaptar/avaliar executor com navegador; não usar segredos de perfil Chrome no GitHub |
| `expandMlBestPriceVariants`, `collapseMlCatalogToCheapest` | Buscas adicionais pelo Hub + classificação local | Reaproveitar integralmente a seleção de catálogo mais barato |
| `applyBestMlCoupon` | Cupons de origem Telegram/MTProto, escopo validado e preço final | Reaproveitar sem trocar link de afiliado |
| `discoverShopeeProducts` | API Shopee GraphQL `productOfferV2` assinada por SHA256 | Pode migrar como primeira descoberta read-only |
| `ingestShopeeProducts` | Sessão JWT Mavuri recuperada do Chrome | Futuramente utilizar autenticação de serviço controlada, sem abrir login no browser |
| `readTelegramChannelMessages` | Credenciais e arquivo StringSession de usuário Telegram via `teleproto` | Arquitetura própria segura de sessão; não transferir sessão a serviços efêmeros antes de analisar risco |
| `runMagaluTargetCycle` | Mensagens MTProto + enriquecimento pelo site da loja via navegador | Segunda etapa, após Shopee |
| `processCouponCycle` | Cupons ML/Shopee, etapas de ativação, ingest e workers | Manter sem duplicar ao migrar |
| `ensureAmazonCollectorService` | Porta local e token de collector | Não é requisito para meta das 21 ofertas, mas não expor token no repo |
| `withMavuriSession` | HTML do app + JWT no localStorage | Eliminar autenticação humana do caminho de produção cloud |

Notas de negócio conferidas: ML até 8, Shopee até 8, Magalu até 5 ofertas únicas; cupons fora da meta; ML Best Price antes de gerar link afiliado; no Shopee preço antigo desconhecido **não pode ser inventado**. A V85 contém uma chamada de republicação com parâmetros `cooldown_hours:24` e `price_drop_pct:5`, mas a função `flow-republication-policy` implantada normaliza para mínimos de 48h/10%. Essa diferença precisa de testes, não de suposições.

### Resultado da primeira consulta Shopee live_preview (22/10/2026)

Supabase Edge Logs: HTTP 200; 80 candidatos distintos em 3 chamadas `productOfferV2`. Console do usuário: 74 com desconto reportado >=10%, 80 com campo `offerLink` presente; **41/80 ficaram sem hint de categoria**. Os 80 vieram de `top-performance`, páginas 1, 2 e 3; `maior-comissao` e `recomendados` não foram consultados pela primeira versão. A presença de link não verifica atribuição de afiliado, nem significa 8 ofertas aprovadas pelo Flow.

**Correção de diagnóstico implantada na versão v8 da Edge Function**:
- Seleção balanceada do pool de até 80 ofertas por origem: `top-performance` 30, `maior-comissao` 25, `recomendados` 25. Prioridade de cada origem + backfill para preencher vagas; deduplicação global por `itemId`.
- Consultas em rodadas de 1 página por origem, até 3 páginas/origem; busca páginas extras só quando necessário para preencher as cotas/faltas. Máximo 9 consultas GraphQL por prévia; nenhum envio.
- Hints de categoria conservadores para árvore de Natal, toalha de banho/rosto, materiais de limpeza, fatiadores de cozinha, bicicletas ergométricas e suplementos esportivos, respeitando padrões reconhecidos pelo `flow-shopee-ingest`. Produtos ambíguos permanecem `unclassified`.
- Retorno inclui `primary_by_source`, `selected_by_source`, `quota_by_source`, `backfill_added`, `classified` e `unclassified`.
- Testes de quota, sobreposição, deduplicação e regressão das categorias; `deno check` aprovados no PR. **Necessário rodar nova prévia real para comparar a distribuição e verificar a resposta da API das outras listas.**

### Segunda consulta Shopee cloud + investigação maior comissão (22/10/2026)

O usuário confirmou a prévia balanceada: 80 candidatos, 71 com desconto ≥10% informado, 80 com campo de link afiliado, 45 classificados e 35 sem hint. `selected_by_source`: `top-performance=55`, `maior-comissao=0`, `recomendados=25`; `backfill_added=25`; total 5 chamadas de API. Esses dados **não estabelecem a causa** da ausência de itens da lista de maior comissão.

A consulta `listType=1,sortType=5` corresponde ao V85 local; não alterar parâmetros sem diagnosticar os dados retornados. A Edge Function `discovery-cloud-shopee` **v9**, implantada em modo somente leitura, adiciona `source_diagnostics` com quantidades por fonte: recebidos, válidos, campos ausentes, itens únicos, sobreposição entre listas, desconto ≥10% e motivo para contribuição zero. Registros no Supabase incluem somente contadores agregados — sem IDs de produtos, links, credenciais ou títulos. Testes de falha (lista vazia, itens inválidos, sobreposição), mapeamento e Deno CI aprovados. A próxima consulta read-only pelo usuário permitirá determinar a causa via log da função, sem novo print.

### Política Shopee para nuvem — implementação de teste isolada (22/10/2026)

Auditoria **do `flow-shopee-ingest` implantado v8**:
- Seleciona até 8 ofertas únicas, mas a ordenação utiliza somente `discount_percentage`.
- Janela de republicação para a mesma oferta/canal é **24h** (não 48h). Consulta status `sent` e `queued/processing` por canal.
- Famílias amplas têm limite 1 por ciclo e uma janela de **1h** por canal, não a janela de 24h para variantes do mesmo produto vendidas por outros vendedores.
- `dry_run=true` não calcula `offers_selected` corretamente para itens novos: o código não cria `offerId` e interrompe antes da contagem. Portanto **não usar a resposta de produção como simulação autorizadora**.
- `flow_offers.price` muda ao atualizar ofertas e não serve como histórico. **Correção da auditoria:** um gatilho existente (`mavuri_delivery_log_snapshot_offer`) já armazena o preço em `flow_delivery_logs.metadata.offer_snapshot.price` na inserção de cada entrega `sent`. Verificar consistência antes de utilizar para liberar a exceção >=10%.
- Metadados da API (`_mavuri_api.commission_rate`, vendedor) são gerados pelo Discovery V85, mas o ingest não os persiste no campo `metadata.shopee`; atualmente a comissão não participa da seleção de ofertas.

Adicionada na branch apenas (nenhuma alteração no `flow-shopee-ingest` implantado):
`supabase/functions/discovery-cloud-shopee/shopee-policy.mjs` e suíte `scripts/test-discovery-cloud-shopee-policy.mjs`.

A política de simulação:
- Mantém desconto como critério principal; comissão **apenas desempata descontos idênticos**; vendas desempata taxa igual.
- Limita até 8 ofertas únicas, com decisão independente por canal: bloqueados **não consomem meta**, canais válidos remanescentes ainda podem ser usados.
- Impede mesmo `itemid` enviado nos últimos **48h** por canal, exceto se o **preço enviado imutável** estiver disponível e o novo preço cair **>=10%**. Na ausência desse snapshot, falha de modo conservador (não autoriza exceção).
- Impede `family_signature` idêntica divulgada em outro vendedor há menos de **24h**, por canal. A assinatura conservadora é uma aproximação derivada do título, não uma identidade comprovada de catálogo: **requer validação com dados reais** antes de produção.
- Preserva limites de categorias/família durante o ciclo; não confunde quantidade de jobs por canais com contagem de ofertas únicas.
- Exige `now_iso` explícito para evitar cálculos com relógio parado.
- Testes cobrem 48h, 24h, queda 10%, queda insuficiente, sessão com preço histórico ausente, duplicação, contagem por canal, limite 8, candidato bloqueado sem consumir vaga e ranking por comissão em descontos empatados.

`mode=policy_fixture` somente exercita amostras simuladas no Supabase e **não cria publicação**. `mode=history_preview` lê o histórico real via PostgREST sob a sessão autenticada do próprio usuário e RLS (sem service key) e responde apenas com contadores agregados. Nenhuma dessas funções substitui a seleção de produção. Ainda exigem integração de candidatos e regras com o backend, validação do snapshot no instante exato do envio e exclusão mútua Windows/nuvem.

**Fase seguinte obrigatória:** aproveitar o snapshot existente, confrontando seu valor com o texto enviado e avaliando a pequena janela entre envio Telegram e inserção do log; fortalecer a garantia de imutabilidade conforme necessário. Validar a identidade `family_signature` entre vendedores e adicionar `shop_id`/comissão na ingestão futura, apenas após revisão. Comparar as decisões do simulador com o histórico real; integrar o lease compartilhado Windows/nuvem e só então habilitar ingest para publicação.

### Histórico de publicações e preço publicado (auditoria em 22/10/2026)

**Achado:** já existe gatilho `public.mavuri_delivery_log_snapshot_offer()` em `BEFORE INSERT` de `flow_delivery_logs`, que captura automaticamente `flow_offers.price`, desconto, cupom, fingerprint e data de captura em `metadata.offer_snapshot` ao registrar entrega `sent`. O worker chama Telegram e depois grava o `sent` em `flow_delivery_logs`; o gatilho coleta o preço do banco nesse instante. Dados das 463 entregas Shopee `sent` dos últimos sete dias: **463 com snapshot de preço numérico positivo**.

**Cuidado:** o registro ocorre logo **após** o envio; uma alteração concorrente em `flow_offers` entre a montagem da mensagem e o registro do log pode causar divergência. A tabela não é formalmente imutável. Para cutover seguro, avaliar persistir o preço **exatamente renderizado** na mensagem e proteger histórico contra alterações, sem prejudicar a operação atual.

Comparação retroativa por `source_ref + channel_id`, janela de observação 7 dias, distância entre envios inferior a 48h: **132 pares**, dos quais **2** registravam queda de preço >=10% entre snapshots e **130** não registravam queda comprovada >=10%. São indicadores de possível violação da nova política (aplicada prospectivamente), não uma alteração retroativa de publicações. A janela limita a comparação do primeiro evento de cada produto/canal.

Nos últimos três dias, nenhuma das 149 ofertas Shopee cadastradas recentemente possuía `shop_id` nem `commission_rate` em `metadata.shopee`; `shop_name` estava presente em 149. A versão de ingestão atual descarta alguns campos disponíveis no retorno da API. **Não é seguro validar a regra de produto equivalente de outro vendedor usando somente nomes de loja**.

Implantado `discovery-cloud-shopee` **v11**, com modo `history_preview`:
- autentica o usuário dono via JWT Supabase e `MAVURI_SHOPEE_CLOUD_OWNER_USER_ID`;
- executa **somente GET** em `flow_marketplaces` e `flow_delivery_logs` com relação `flow_offers`, sempre com JWT do usuário e políticas RLS existentes;
- consulta até 7 dias de histórico `sent` da Shopee, paginando em até 5.000 linhas e falhando explicitamente se exceder o limite;
- retorna **apenas contadores agregados** de snapshots, produtos, canais, pares no bloqueio 48h e ocorrências com queda >=10%, nunca IDs, títulos, URLs ou segredos.
- Código novo `shopee-history.mjs` e testes `scripts/test-discovery-cloud-shopee-history.mjs`, passando no CI; **a rota precisa ser testada pelo usuário autenticado no Mavuri para confirmar PostgREST em execução real**.
- Nenhum novo Cron, update, insert ou publicação. `discovery_cloud_control.enabled=false` e origem `local`.

### Primeira função cloud implantada (sem publicação)

`discovery-cloud-shopee` V1 implantada no Supabase, com `verify_jwt=true`. Código: `supabase/functions/discovery-cloud-shopee/`.

- `health` e `fixture` podem ser consultados com JWT de usuário autenticado.
- `live_preview` exige **todos**: JWT do usuário autorizado, `MAVURI_SHOPEE_CLOUD_PREVIEW_ENABLED=true`, `MAVURI_SHOPEE_CLOUD_OWNER_USER_ID` compatível e segredos `SHOPEE_AFFILIATE_APP_ID` e `SHOPEE_AFFILIATE_SECRET` no Supabase. Esses segredos não foram configurados ou copiados nesta etapa.
- `live_preview` somente lê a API Shopee, não grava DB, não executa ingest, não agenda fila nem publica Telegram.
- `shopee-core.mjs` conserva mapeamento, dicas de categoria e desconto do V85; testes offline em `scripts/test-discovery-cloud-shopee.mjs`.
- O limite de publicação 8 continua sendo responsabilidade da função `flow-shopee-ingest` existente. **Não existe publicação na função nova**.
- Não há novo Cron, e `discovery_cloud_control.enabled=false`; Windows permanece como origem ativa.

**Lacuna para execução real:** configurar/autorizar segredo da API Shopee na nuvem, testar `live_preview` dentro dos limites da API e posteriormente adaptar ingest com controle idempotente + lease integrado também ao runner local. Não há validação ponta a ponta da produção com PC desligado.

## Alteração implementada nesta etapa

Migration aplicada ao Supabase: `20261022163851_discovery_cloud_safety_foundation`.

Ela cria, no schema privado `mavuri_internal`:
- `discovery_cloud_control`: único registro com `enabled=false`, `active_executor='local'`, intervalo 30min e metas ML=8, Shopee=8, Magalu=5.
- `discovery_cloud_runs`: histórico com lease de execução, status, contadores e erros.
- RPCs `public.mavuri_discovery_claim_run` e `public.mavuri_discovery_finish_run`, restritas ao `service_role`. O claim é atômico, serializado no banco, expira leases abandonados e rejeita sobreposições.

**IMPORTANTE:** A estrutura está inativa; não há novo cron, descoberta, coleta ou envio. A trava só cobre executores que usam explicitamente essas RPCs; o V85 local ainda não as usa.

## Arquitetura-alvo a decidir após a auditoria da V85

```
Cron a cada 30min (Supabase) OU GitHub Actions 30min
  -> claim lease + verificar habilitação
  -> coletores Mercado Livre / Shopee / Magalu
  -> validar URL afiliada e aplicar seleção (até 8 / 8 / 5; bloqueados não consomem quota)
  -> funções de ingestão existentes, via autenticação do usuário/serviço conforme contrato validado
  -> filas Telegram existentes -> mavuri-flow-worker (cada minuto)
  -> finish lease com contadores, erros e duração
```

Respeitar: 48h mesmo produto, 24h família/variação conforme regra, queda de preço real >=10% para exceção, idempotência por canal, cupons, diversidade, imagens, publicação manual sem restrições. Em nenhuma hipótese expor cookies/tokens de afiliados no repositório público.

Supabase Edge Functions têm orçamento de CPU e duração; código que precise executar Chrome autenticado persistentemente provavelmente exigirá outro executor. Avaliar GitHub Actions após verificação da V85. Oracle apenas como último recurso.

## Próximos passos obrigatórios

1. **Concluído:** arquivo V85 e `package.json` recebidos. Manter scripts originais e perfis secretos fora do repositório público.
2. **Parcial:** chamadas de descoberta, autenticação e fluxo V85 auditados. Faltam tempo máximo real de ciclo, conexão externa read-only Shopee e definição de executor ML/Magalu.
3. Integrar controle de lease e modo `dry_run` ao novo executor. Não ativar o cron enquanto o runner local não compartilhar a exclusão mútua (ou estiver efetivamente parado no instante do corte).
4. Executar testes sem escrita/sem publicação: listas de candidatos, classificação, comparação de melhores preços, links afiliados e limites; verificar logs de bloqueados sem consumo da meta.
5. Fazer canário isolado e controlado, verificando jobs já existentes e canais. Somente então realizar cutover com rollback rápido ao runner local.
6. Testar 24h+ de ciclos e as execuções de 30min, com alertas de falha, sem duplicatas e com PC desligado.

## Critérios de aceitação

- [x] Runner V85 recebido e dependências principais auditadas (preservação ponta a ponta ainda pendente)
- [x] Fundação de controle e logs criada no banco, inicialmente desativada
- [x] Metas de 8 + 8 + 5 e 30min registradas no banco
- [x] Função de preview Shopee V1 no Supabase, totalmente sem publicações e com live_preview desligado por padrão
- [ ] Executor cloud de produção com autenticação de marketplaces validada
- [ ] Simulação de 3 marketplaces sem publicações adicionais
- [ ] Exclusão mútua entre origem local e nuvem validada
- [ ] 48h/24h/queda 10% validados por canal
- [ ] Links afiliados e imagens verificados
- [ ] WhatsApp permanece sem envio
- [ ] Cron habilitado somente no corte controlado
- [ ] PC desligado, operação autônoma verificada

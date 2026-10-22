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

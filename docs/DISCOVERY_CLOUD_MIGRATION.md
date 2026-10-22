# MAVURI Discovery — migração controlada para a nuvem

Data da auditoria: 2026-10-22. Ambiente: `mavurioficial/affiliate-engine` e Supabase `otikoxnfotyjgphrdudn`.

## Estado encontrado

- **Produção atual:** Windows Discovery Runner V85 (ciclos de 30 minutos). Não desligar durante preparação.
- **Supabase Cron:** `mavuri-flow-worker` ativo a cada minuto para publicação. **Nenhum Cron de Discovery**.
- **Edge Functions de ingestão:** `flow-discovery-ingest` (Mercado Livre), `flow-shopee-ingest` e `flow-magalu-ingest`. Também existem `flow-republication-policy`, funções de cupons, classificação e worker.
- **Canais:** quatro Telegram conectados. WhatsApp com status `disabled`; não reativar nem enviar.
- **GitHub:** contém scripts de Shopee feed, fila de links e painel, mas **não contém o código completo do Discovery V85**. O repositório `mavurioficial/mavuri-api-test` também não contém a V85.
- **Dependência encontrada em cópias anteriores:** `playwright-core`, Chrome via CDP, `MavuriChromeProfile`, sessão autenticada no Mercado Livre e estado/cache local. Não assumir que a V85 tem as mesmas dependências sem analisar seu código exato.
- **Atenção à consistência:** o código implantado de `flow-discovery-ingest` e `flow-shopee-ingest` contém janelas locais de 24 horas; `flow-republication-policy` contempla 48 horas e queda de preço mínima de 10%. `flow-magalu-ingest` contém ao menos uma condição própria de republicação de 5%. Auditar precedência antes da ativação para preservar a regra desejada de 48h / 24h por família / queda real de 10%.
- **Segurança preexistente:** `public.mavuri_category_audit` foi sinalizada pelo Supabase por estar sem RLS. Tema independente; não aplicar RLS sem analisar dependências do painel.

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

1. Obter **o arquivo exato** `browser-discovery-v1.mjs` da V85 atual (ou pacote da versão em execução), seus módulos locais pertinentes e `package.json`; **não enviar** `.env`, perfil Chrome, cookies, tokens, arquivo de estado contendo segredos ou senhas.
2. Analisar chamadas externas, fluxo de autenticação e sessão, tempo máximo de ciclo, dependências Windows, geração de URL afiliada ML/Shopee/Magalu e diferenças para os códigos da nuvem. Determinar se a fonte de dados é oficial e compatível com execução em nuvem.
3. Integrar controle de lease e modo `dry_run` ao novo executor. Não ativar o cron enquanto o runner local não compartilhar a exclusão mútua (ou estiver efetivamente parado no instante do corte).
4. Executar testes sem escrita/sem publicação: listas de candidatos, classificação, comparação de melhores preços, links afiliados e limites; verificar logs de bloqueados sem consumo da meta.
5. Fazer canário isolado e controlado, verificando jobs já existentes e canais. Somente então realizar cutover com rollback rápido ao runner local.
6. Testar 24h+ de ciclos e as execuções de 30min, com alertas de falha, sem duplicatas e com PC desligado.

## Critérios de aceitação

- [ ] Runner V85 auditado e funcionalidades preservadas
- [x] Fundação de controle e logs criada no banco, inicialmente desativada
- [x] Metas de 8 + 8 + 5 e 30min registradas no banco
- [ ] Executor nuvem implementado, com autenticação de marketplace estável
- [ ] Simulação de 3 marketplaces sem publicações adicionais
- [ ] Exclusão mútua entre origem local e nuvem validada
- [ ] 48h/24h/queda 10% validados por canal
- [ ] Links afiliados e imagens verificados
- [ ] WhatsApp permanece sem envio
- [ ] Cron habilitado somente no corte controlado
- [ ] PC desligado, operação autônoma verificada

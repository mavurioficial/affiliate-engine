# Mavuri Shopee Cloud — operação de produção

**Atualização: 23/10/2026.** O executor Shopee Cloud foi habilitado para ciclos a cada 30 minutos no Supabase. A primeira execução supervisionada integral terminou `succeeded` com uma oferta enviada e confirmada no Telegram.

## Implantado e comprovado
- [x] Autenticação do agendador com o segredo já mantido no Vault do Supabase. Sonda HTTP 200 retornou `cloud_disabled` sem produzir jobs antes do corte.
- [x] `public.mavuri_shopee_cloud_enqueue`: RPC atômica restrita a `service_role`; verifica categoria final, preço, link de afiliado, regras de canais, cooldown, família e limites (8 produtos distintos; 2 por categoria).
- [x] Índice parcial único na fila (usuário, produto, canal; queued/processing).
- [x] `mavuri_shopee_legacy_writer_fence`: proíbe `shopee:` legado quando `active_executor=cloud`. Teste SQL com tentativa de INSERT invalidada por erro esperado `42501`.
- [x] Executor `discovery-cloud-shopee-executor`: usa API oficial assinada, configuração persistida, planejador dos quatro canais e RPC transacional; não envia Telegram diretamente.
- [x] Worker existente entrega pelo Telegram. Registro real `sent` e log com identificador de mensagem confirmados.
- [x] Duas chamadas concorrentes ao executor: uma foi autorizada, outra retornou `already_running`; somente um job foi criado.
- [x] Reconciliador marca ciclo como `succeeded` somente após verificar a fila concluída; ciclo supervisionado terminou com `delivered=1`, `errors=0`.
- [x] Supabase pg_cron: `mavuri-shopee-cloud-discovery` `*/30 * * * *`, `mavuri-shopee-cloud-reconcile` a cada minuto; testou-se execução do cron reconciliador.
- [x] Janela de início `08:00 <= Brasília < 22:00`; um ciclo autorizado pode finalizar depois das 22h, com lease de no máximo 30 minutos. O controle de intervalo tolera 30 segundos de variação no agendamento.
- [x] `discovery_cloud_control.enabled=true`, `active_executor=cloud`, `max_shopee=8`, `interval_minutes=30`; cron de descoberta está ativo.
- [x] Runner Windows antigo não precisa permanecer ativo e, se tentar postar Shopee, terá a escrita `shopee:` recusada.
- [x] GitHub Actions compilou o executor e validou regressões da infraestrutura cloud.

## Acompanhamento pós-ativação
- [ ] Verificar no histórico do pg_cron a primeira execução de descoberta disparada pelo horário regular (o teste supervisionado foi manual).
- [ ] Observar um ciclo com múltiplos produtos e publicação em mais de um canal. Limite de 8 é máximo, não mínimo obrigatório; o catálogo deve satisfazer todos os filtros.
- [ ] Conferir taxa de rejeição de candidatos com preço ou URL desatualizados e planejar sincronização contínua do catálogo.
- [ ] Confirmar estabilidade por vários ciclos, antes de declarar operação plenamente estabilizada.

## Reversão imediata
Se surgirem duplicidades, preço incorreto, mensagens em destinos errados ou falhas repetidas, executar `UPDATE mavuri_internal.discovery_cloud_control SET enabled=false WHERE id=true`. Não reativar o runner Windows automaticamente. O cron e o worker permanecem instalados, mas a função de disparo não gera novas publicações enquanto `enabled=false`.

**Observação:** Mercado Livre e Magalu continuam fora deste corte de publicação automática.

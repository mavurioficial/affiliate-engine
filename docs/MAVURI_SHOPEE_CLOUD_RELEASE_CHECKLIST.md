# Mavuri Shopee Cloud — Critérios de liberação

Situação em 23/10/2026: **não liberar publicações automáticas** antes da conclusão dos itens pendentes.

## Validado em produção
- [x] API Shopee e identidade afiliada autenticadas.
- [x] Primeiro envio real ao Mavuri Ofertas, com job `sent` e identificador Telegram.
- [x] Prévia da distribuição aos quatro canais usando categoria persistida.
- [x] Limite de 8 produtos únicos e 2 por categoria verificado na lógica offline.
- [x] Índice único parcial para jobs `queued/processing` por usuário/oferta/canal.
- [x] `shopee-cloud:` exige conta, controle cloud e lease válido.
- [x] Início de ciclos dentro de 08:00–22:00, timezone America/Sao_Paulo; encerramento após as 22:00 permitido dentro do lease (máximo 30 min).
- [x] O worker consulta autorização antes de pegar o job e antes de chamar o Telegram.
- [x] O fanout legado ignora jobs `shopee-cloud:`.
- [x] O coletor legado `shopee:` fica bloqueado caso a nuvem se torne executor ativo.
- [x] Testes GitHub da proteção legada aprovados: run 40014203257.

## Bloqueadores de habilitação
- [ ] RPC de inserção transacional validada em produção que reavalie preço/link, categoria final, 4 regras Shopee, cooldown por produto/canal e família, seleção de até 8 produtos/ciclo, fanout e idempotência. **Não substituir por INSERT client-side.**
- [ ] Ensaio de concorrência (duas execuções no mesmo ciclo; provar um único job por produto/canal).
- [ ] Observar uma execução real do GitHub com `event=schedule`. Até a última consulta, havia apenas eventos `push`, apesar do cron `7,37 * * * *` estar em `main`.
- [ ] Confirmar que o runner local está encerrado e provar bloqueio de sua escrita no corte cloud.
- [ ] Execução supervisionada com múltiplas ofertas e validação de logs `sent`, IDs de mensagem e canais corretos.
- [ ] Somente então alternar `discovery_cloud_control.enabled=true` e `active_executor=cloud` e instalar/habilitar agendamento de publicação de 30 min na janela.

## Plano de reversão
Se houver duplicidade, desvio de canal, preço incorreto ou falha de lease: desligar somente a publicação cloud (`enabled=false`), manter o worker de entregas históricas preservado, revisar jobs criados e não reativar o coletor local automaticamente.

A execução de auditoria das ofertas é somente leitura e independente desta chave de publicação.

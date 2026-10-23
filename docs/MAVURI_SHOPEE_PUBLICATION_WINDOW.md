# Janela de publicação Shopee Cloud — Mavuri

**Configuração inicial (23/10/2026): 08:00 até 22:00, America/Sao_Paulo, todos os dias.**

- Slots previstos: a cada 30 minutos, de 08:00 a 21:30.
- 22:00 em diante **não** cria nem inicia envios cloud. O último ciclo começa às 21:30, não às 22:00.
- A auditoria da Shopee no GitHub pode consultar ofertas fora da janela porque é somente leitura; não enfileira nem publica.
- Horários persistidos em `mavuri_internal.discovery_cloud_control.publish_start_local`, `publish_end_local`, `publish_timezone`. Para ajustar, exigir revisão e verificar `start < end`. A configuração inicial não distingue dias úteis e fins de semana.
- O serviço `flow-worker` em produção (**v40**) verifica a janela via RPC de acesso reservado ao servidor antes de assumir um job `shopee-cloud:` e imediatamente antes de chamar o Telegram. Se a janela se fechar durante o preparo, o job volta à fila para um momento posterior, sem envio.
- A fila tem proteção no banco tanto no `BEFORE INSERT` quanto na transição `queued -> processing`. Todos esses controles são exclusivos do prefixo `shopee-cloud:`; mensagens históricas, manuais, Mercado Livre, Magalu e cupons existentes não tiveram horário alterado.
- Fora do horário, nenhum envio da **nova Shopee Cloud** deve ocorrer; envios por outras plataformas/rotas deverão receber política própria na respectiva migração.
- Garantir, antes de habilitar os ciclos de publicação, lease exclusivo, execução local desligada e inserção transacional de até 8 produtos distintos. O fluxo atual continua `enabled=false`, `active_executor=local`.

**Validação:** banco testado às 07:59 (não), 08:00 (sim), 21:30 (sim), 21:59 (sim), 22:00 (não). CI Deno e teste de segurança do worker aprovados.

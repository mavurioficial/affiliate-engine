# Janela de publicação Shopee Cloud — Mavuri

**Configuração inicial (23/10/2026): 08:00 até 22:00, America/Sao_Paulo, todos os dias.**

**Regra correta: a janela controla o INÍCIO do ciclo, não a hora em que a mensagem é efetivamente enviada.**

- Novos ciclos de descoberta + validação + publicação somente podem iniciar em `[08:00,22:00)`, horário de Brasília.
- Quando o ciclo já foi autorizado, pode concluir seus envios um pouco depois das 22h ou antes das 08h, conforme o início e a duração. Exemplos: início às 21h59 e envio às 22h05 **permitidos** dentro do lease; início às 22h00 **bloqueado**.
- Segurança: o ciclo deve permanecer com status `running` e lease não expirado, com limite absoluto de até **30 minutos desde seu início**. O `mavuri_discovery_claim_run` usa lease padrão de **15 minutos** e limita um lease solicitado a no máximo 30 minutos. Se o lease expirar, o envio não é autorizado, mesmo com uma oferta pendente.
- Slots regulares pretendidos, a cada 30 minutos, de **08h00 a 21h30**. O exemplo 21h59 é um início manual/excepcional, não um horário adicional do cron.
- A rotina do GitHub de auditoria Shopee (somente leitura) pode funcionar fora da janela, porque não cria jobs nem realiza publicação.
- Os parâmetros seguem configuráveis em `mavuri_internal.discovery_cloud_control.publish_start_local`, `publish_end_local`, `publish_timezone`. Fuso: `America/Sao_Paulo`. Não assumir UTC fixo.
- O `mavuri_discovery_claim_run` confere a janela no **instante de iniciar** a execução. A função protegida `mavuri_shopee_cloud_run_delivery_allowed(delivery_key)` verifica a mesma janela usando `discovery_cloud_runs.started_at`, além de autorização do servidor, controle cloud, status da execução e lease ativo; não usa o horário atual para recusar ciclos iniciados legitimamente.
- As travas no banco protegem criação de jobs e transição `queued -> processing`. O `flow-worker` **v41** faz a validação pelo ID da execução antes de assumir o job e imediatamente antes da chamada ao Telegram. O job não é enviado se a execução foi cancelada, terminou ou expirou.
- Essas alterações são específicas do prefixo `shopee-cloud:`. Rotas antigas, Mercado Livre, Magalu e cupons continuam com o comportamento atual, até receberem política própria.

**Validações 23/10:** testes de banco 07h59, 08h00, 21h59→22h05, 22h00, lease expirado e limite de 30 minutos: todos passaram. Testes e compilação no GitHub aprovados.

**Status:** configuração atual `enabled=false`, `active_executor=local`. A auditoria de 30 minutos está agendada em GitHub Actions, **mas o agendamento de publicação cloud ainda está desligado**; faltam inserção transacional e exclusividade do executor.

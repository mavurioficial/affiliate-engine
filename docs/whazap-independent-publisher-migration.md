# Mavuri: central de aprovação e publicadores independentes
Atualizado em 21/11/2026, após virada controlada fora do horário comercial.

## Arquitetura em execução
Fontes externas preservadas (APIs/lojas e grupos externos de ofertas, inclusive Tá Bugado)
→ seleção/validação Mavuri
→ `public.mavuri_publication_events` (uma decisão única por origem)
→ `public.mavuri_publisher_deliveries` (entregas separadas `waha_test` e `telegram`)
→ publicadores WAHA / Telegram independentes.

**Nenhum novo publicador lê o canal de publicações Mavuri do Telegram.**
A captura das fontes externas do Telegram continua sendo uma entrada válida.
WhatsApp é prioritário; a falha de um publicador não bloqueia a entrega do outro.

### Alimentação do outbox
- Shopee ofertas: `mavuri_shopee_cloud_enqueue` registra evento após as
  verificações oficiais de preço, identidade, classificação, filtros,
  repetição e diversidade, mesmo com o Telegram legado inativo.
- Magalu ofertas: `flow-magalu-cloud-ingest` registra evento após
  verificação comercial; histórico compartilhado evita repetição.
- Amazon ofertas: `mavuri-telegram-amazon-mirror` registra evento com
  link de associado, imagem, família e preço antes da tentativa de Telegram;
  deduplicação por ASIN e família preservada também no outbox.
- Mercado Livre ofertas: `mavuri-telegram-ml-mirror` registra evento
  com links da própria etiqueta, mídia, família e preço, independentemente
  do status do canal geral do Telegram.
- Cupons ML/Magalu: `mavuri-independent-coupon-source` consulta os
  cupons ativos e recentemente observados, verifica validade e dados
  de afiliado. Cupons Magalu ainda pendentes não são encaminhados.
- Cupons Shopee: avisos de página geral baseados nos sinais confiáveis,
  com link próprio gerado pela API oficial, no máximo uma vez ao dia.
- Cupons Amazon: incorporados às ofertas de origem quando validados;
  candidatos externos sem validação de carrinho permanecem bloqueados.

### Publicadores
- `mavuri-waha-independent-publisher`: só grupo privado de homologação
  `120363430941128576@g.us`; valida sessão e nome do grupo.
- `mavuri-telegram-independent-publisher`: somente canal privado Mavuri
  Ofertas `-1003537630337`, validado via Bot API.
- Separação por `(event_id,destination)`; estados de envio e recibos
  de API separados. Falha ambígua fica em `unconfirmed` sem reenvio
  automático, para evitar duplicações. Falha de conexão ANTES do
  envio preserva a fila. Rate limit explícito posterga nova tentativa.
- A auditoria de leases converte envios `sending` abandonados há
  mais de 12 minutos para `unconfirmed` (revisão antes de tentar de novo).
- Cupons expirados e ofertas com mais de 24h aguardando envio são
  retidos para revisão, evitando envio automático desatualizado.
- Auditoria SQL: `mavuri_internal.mavuri_publication_parity_audit`.

### Agendamento piloto
- Começa às 08h de 21/11/2026, America/Sao_Paulo.
- Publicadores WAHA e Telegram independentes: a cada 2 minutos, 08h–22h.
- Coletor de cupons: a cada 5 minutos, 08h–22h.
- Piloto com envio liberado até o final de 24/11; precisa avaliar o
  vencimento do teste Whazap antes de prolongar.
- `mavuri_publisher_controls`: `waha_test.enabled=true`,
  `telegram.enabled=true`, destinos fixos apenas de homologação
  e canal privado; bloqueados fora do horário.
- Canal legado `flow_channels.Mavuri Ofertas.status='disabled'` **de
  propósito** para impedir que o publicador antigo duplique mensagens.
  Isso não desativa o novo publicador Telegram.
- `mavuri_whazap_test_mirror_control.enabled=false`; cron do antigo
  espelhamento removido; cron do antigo aviso de cupons Shopee removido.
- WhatsApp público/Whapi antigo continuam sem envio ativado.

### Testes concluídos antes das 8h (sem envios)
- Auditoria Shopee via Edge: 3 ofertas elegíveis, retorno 200, mesmo
  com o canal geral legado marcado como `disabled`.
- `mavuri_internal.shopee_cloud_rule_matches` retornou true em
  oferta real classificada enquanto o canal legado estava disabled.
- Diagnóstico Magalu: fonte e histórico acessíveis, produtos
  comercialmente verificados (modo auditoria, sem publicar).
- Workflow Amazon/ML modo preview concluído com sucesso após desativação
  do destino legado (incluindo 17 testes do resolvedor).
- WAHA /preflight: sessão ativa, grupo privado aprovado, HTTP 200.
- Telegram /preflight: canal privado validado, HTTP 200.
- Evento sintético temporário criou duas entregas `queued`, uma por
  destino, e foi removido; nenhuma publicação de teste fictícia enviada.
- Não havia jobs legados pendentes no canal geral no momento da virada.

**O primeiro ciclo real de cada canal ainda precisa de validação de
entrega/visualização.** HTTP 2xx é aceitação pelo provedor, não confirmação
de leitura no aparelho.

### Auditoria operacional
```sql
SELECT * FROM mavuri_internal.mavuri_publication_parity_audit
 ORDER BY day_sp DESC, platform, kind;

SELECT d.destination,d.status,e.platform,e.kind,count(*)
FROM public.mavuri_publisher_deliveries d
JOIN public.mavuri_publication_events e ON e.id=d.event_id
WHERE e.created_at >= now() - interval '24 hours'
GROUP BY d.destination,d.status,e.platform,e.kind
ORDER BY d.destination,e.platform,e.kind,d.status;

SELECT destination,enabled,target_id,start_at,end_at
FROM public.mavuri_publisher_controls;
```

### Operação e segurança
Não religar o antigo espelhamento Telegram→WhatsApp enquanto
`waha_test.enabled=true`. Não conectar ou liberar grupo/canal WhatsApp
público sem autorização separada. Não habilitar os antigos publicadores
Telegram sem desabilitar o novo, para evitar duplicações. As novas tabelas
possuem RLS e não dão acesso de dados a `anon`/`authenticated`.

## Supervisor WAHA automático — 21/11/2026, 22h03
- Edge Function `mavuri-waha-auto-recovery`: checa estado da sessão `mavuri_waha` a cada 5 minutos, inclusive fora da janela de publicações, até o vencimento configurado do piloto.
- Se o estado da API for `STOPPED`, faz exclusivamente `POST /api/sessions/mavuri_waha/start` na sessão existente; nunca faz logout, delete, reset, QR ou envia mensagens.
- Proteções: máximo de uma tentativa a cada 15 minutos e três tentativas por janela móvel de 60 minutos; claim atômico no banco impede reinicializações simultâneas.
- Estados `STARTING` aguardam, `WORKING` atualiza o heartbeat e `SCAN_QR_CODE`/estados inesperados exigem atenção manual registrada, sem iniciar sessões inadvertidamente.
- Tabelas `mavuri_waha_recovery_state` e `mavuri_waha_recovery_log` registram saúde, tentativas, sucesso e falhas; RLS ativa e sem acesso de `anon`/`authenticated`.
- Cron `mavuri-waha-session-supervisor-every-5min` executa o supervisor. `mavuri-waha-stale-queue-quarantine-every-5min` preserva, mas pausa automaticamente, entregas com mais de 60 minutos sem envio para revalidação de preços e cupons.
- Durante a indisponibilidade de 21/11, as 234 entregas antigas foram preservadas como `paused`, não apagadas. Novas entregas só são enviadas na janela 08h–22h e exclusivamente ao grupo privado autorizado.
- Autoteste em 21/11 às 22h03: endpoint em `WORKING`, resposta HTTP 200, nenhuma mensagem enviada. O cenário real `STOPPED` ainda não foi forçado em teste, para não desconectar o grupo.
- Limitação: se a conta exigir autenticação por QR, a API não consegue autorizar o telefone sozinha. O evento ficará como atenção manual, registrado no banco. Falta definir canal privado de alerta externo para notificações desse cenário.

## Recuperação somente por falha de publicação — 21/11/2026, após 22h
- O cron `mavuri-waha-session-supervisor-every-5min` foi **removido**. O sistema não consulta mais o estado WAHA periodicamente fora das tentativas de publicação.
- O cron normal `mavuri-independent-waha-publisher-2min` continua executando apenas na janela configurada. Se houver mensagens novas na fila, ele valida a conexão antes de enviá-las.
- Caso a validação produza `waha_not_connected` (ou `waha_group_lookup_failed`), o próprio publicador faz uma chamada autenticada ao endpoint `mavuri-waha-auto-recovery/check`. A rotina só tenta iniciar a sessão existente se o provedor confirmar `STOPPED`.
- Caso a API rejeite explicitamente o envio com status 409/422/503, corpo `status:STOPPED|STARTING` e `expected` contendo `WORKING`, a entrega volta para a fila com atraso, sem perder o ID, e solicita recuperação. Falhas ambíguas não são reenviadas automaticamente.
- Mantidos limites de 1 tentativa de inicialização por 15 minutos, máximo de 3 por hora e proteção contra concorrência.
- O cron `mavuri-waha-stale-queue-quarantine-every-5min` permanece: **consulta apenas o banco**, sem acessar a WAHA, para pausar publicações antigas que precisem de nova validação comercial.
- Sem mensagens novas, não há motivo para verificar a WAHA. Se a sessão cair depois das 22h, a próxima publicação elegível, na janela 08h–22h, acionará a verificação e a recuperação.
- Testes não destrutivos: supervisor `/dry-run` retornou `WORKING`, preview do publicador retornou fila vazia, e execução fora da janela retornou `disabled_or_outside_window`; sem publicação.
- O cenário real de uma nova sessão `STOPPED` ainda não foi forçado; fica pendente confirmação no próximo erro real.

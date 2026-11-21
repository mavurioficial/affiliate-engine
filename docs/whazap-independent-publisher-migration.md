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

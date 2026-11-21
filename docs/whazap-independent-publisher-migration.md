# Mavuri — publicadores independentes (WhatsApp prioritário)

## Objetivo
O motor central cria uma publicação aprovada. A publicação é consumida por
publicadores separados — WAHA e Telegram — com entregas, registros e controles
distintos. O WhatsApp não deve ler o canal de publicações Mavuri do Telegram.
Fontes externas do Telegram (ex.: Tá Bugado) continuam sendo fontes de dados,
não destinos necessários ao funcionamento da WAHA.

## Implantado (21/11/2026, fase de transição)
- `public.mavuri_publication_events`: eventos únicos por origem.
- `public.mavuri_publisher_deliveries`: fila própria, deduplicação e status.
- `public.mavuri_publisher_controls`: chave de ativação e janela do piloto.
- Trigger em `flow_delivery_jobs`: captura ofertas selecionadas antes da
  entrega Telegram; cupons Shopee em `flow_coupon_delivery_jobs`.
- Funções `mavuri-telegram-amazon-mirror` e `mavuri-telegram-ml-mirror`:
  registram eventos aprovados ANTES das tentativas de envio para o Telegram.
- Função `mavuri-independent-coupon-source`: captura cupons das tabelas de
  origem e gera seu próprio link de cupom geral Shopee pela API oficial;
  não consulta publicações dos canais Mavuri.
- Função `mavuri-waha-independent-publisher`: entrega exclusivamente ao
  grupo privado de testes, com imagem, legenda, link e auditoria próprios.
- Crons de coleta sombra (5 min) e publicador (2 min). O cron do publicador
  depende de `mavuri_publisher_controls.enabled=true`.

## Segurança operacional (estado atual)
- `mavuri_publisher_controls.waha_test.enabled = false`.
- O espelhamento anterior `mavuri_whazap_test_mirror_control.enabled = true`
  permanece ligado no piloto, para não interromper publicações durante a
  verificação de cobertura. **Não ativar ambos simultaneamente**, para não
  duplicar mensagens no WhatsApp.
- Whapi e demais destinos WhatsApp de produção permanecem desativados.
- Janela BRT 08:00-22:00; piloto expira após 24/11.
- As tabelas novas têm RLS habilitado; anon/authenticated sem acesso.

## Pendências antes da virada
1. Confirmar em ciclos reais de 21/11 que as quatro plataformas alimentam
   `mavuri_publication_events` e que os cupons esperados aparecem na fonte.
2. Desacoplar completamente a seleção de Shopee/Magalu da configuração
   `flow_channels.type='telegram'`. Atualmente os jobs dessas plataformas
   ainda usam essa configuração como destino na etapa de seleção, embora a
   saída WAHA não dependa de uma mensagem publicada no Telegram.
3. Validar fotos Magalu em alta resolução e formatação de legendas no novo
   publicador, não apenas nos testes manuais.
4. Conferir deduplicação, pausas, falhas e recuperação de entrega
   sem duplicar mensagens cujo estado seja `unconfirmed`.
5. Fazer a virada ATÔMICA somente depois de validar cobertura:
   ```sql
   BEGIN;
   UPDATE public.mavuri_whazap_test_mirror_control
   SET enabled=false,updated_at=now() WHERE id='general';
   UPDATE public.mavuri_publisher_controls
   SET enabled=true,updated_at=now() WHERE destination='waha_test';
   COMMIT;
   ```
6. Após a virada, simular indisponibilidade do publicador Telegram mantendo
   o coletor e as fontes do Mavuri operacionais. Comparar as filas e logs.
7. **Não** ativar WhatsApp público nem canal sem nova aprovação.

## Auditoria de origem (sem revelar texto/links em logs)
```sql
SELECT platform,kind,origin,count(*) as events
FROM public.mavuri_publication_events
WHERE created_at>=now()-interval '24 hours'
GROUP BY platform,kind,origin ORDER BY platform,kind;
SELECT d.destination,d.status,e.platform,e.kind,count(*)
FROM public.mavuri_publisher_deliveries d
JOIN public.mavuri_publication_events e ON e.id=d.event_id
GROUP BY d.destination,d.status,e.platform,e.kind
ORDER BY d.destination,d.status,e.platform,e.kind;
```

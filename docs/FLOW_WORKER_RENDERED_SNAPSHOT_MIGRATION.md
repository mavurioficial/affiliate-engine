# Mavuri — preço efetivamente renderizado no Telegram

**Estado em 22/10/2026:** implementação candidata criada na branch, **não implantada em produção**. PR #19 continua draft.

## Problema confirmado no código REAL em execução

O Supabase `flow-worker` **versão 38**, diferente do arquivo mais antigo de 18 kB atualmente versionado em `supabase/functions/flow-worker/index.ts`, contém o pipeline de envio efetivo. Foi extraído pelo conector Supabase para permitir modificar a **versão implantada correta**, sem tocar naquele arquivo histórico.

Fluxo atual:
1. O worker carrega `flow_offers.price` e monta a mensagem Telegram com `Number(offer.price).toLocaleString('pt-BR',...)`.
2. Envia o texto/caption ao Telegram.
3. Depois de sucesso, faz `INSERT` em `flow_delivery_logs` com `status='sent'`.
4. O gatilho `public.mavuri_delivery_log_snapshot_offer` executa `BEFORE INSERT` e **relê** `flow_offers.price` para definir `metadata.offer_snapshot.price`.

Não há garantia de que o preço relido depois do envio seja igual ao que apareceu no Telegram se a oferta mudar entre os passos 2 e 4.

Auditoria READ-ONLY dos últimos 7 dias: **479** logs Shopee sent com snapshot numérico e até duas casas; **66** preços de snapshot diferem do preço mutável da oferta no momento da consulta. Isto **não prova que houve corrida** — pode refletir mudanças legítimas após envio. Prova por que o preço atual não serve de histórico.

## Arquivos candidatos — NÃO implantados

- `supabase/functions/flow-worker-v38-snapshot-candidate/index.ts`: cópia extraída do worker v38 implantado, com **apenas três ajustes lógicos**: captura numérica de `renderedOfferPrice` antes de montar o texto; verifica se a mensagem/caption realmente inclui o preço quando enviada via Telegram; registra `metadata.rendered_offer_snapshot={source:'flow-worker-rendered-v1',price,display_price}` **depois** da resposta de sucesso.
- `docs/sql/FLOW_WORKER_RENDERED_SNAPSHOT_TRIGGER_DRAFT.sql`: preserva `rendered_offer_snapshot.price` em `metadata.offer_snapshot.price` apenas se `auth.jwt()->>'role'='service_role'` e a origem/campo numérico atenderem ao formato permitido. Marca `offer_snapshot.price_source='worker_rendered'`. Para outros produtores, continua capturando o preço do banco e adiciona `price_source='database_fallback'`.
- `scripts/test-flow-worker-rendered-price-snapshot-candidate.mjs`: garante ordem renderizar → confirmar envio → gravar log, compatibilidade de fallback e validação sintática estrutural da proposta SQL. Testes **aprovados**. Uma simulação prova que, se o banco mudou de R$ 90 para R$ 110 após renderizar, o snapshot confiável preserva R$ 90; um cliente não privilegiado não pode forçar o valor na simulação.

**Atenção:** CI de compilação completa da cópia do worker v38 sinalizou **dois erros de tipagem preexistentes** nas seleções `Object.values(secretKeys).find(...)` (linhas próximas de 372 e 440). Não são introduzidos pela captura de preço. Estão documentados como **bloqueio de build até revisão de tipos**, não como teste aprovado. A CI da branch mantém a regressão de snapshot + `deno check` da descoberta Shopee (run 39877427697 verde), mas **não afirma compilação completa do worker candidato**.

## Critérios obrigatórios para implantação futura

1. Resolver os dois erros de tipagem sem alterar o comportamento de autenticação do worker; fixar dependências e validar o bundle completo.
2. Testar em ambiente isolado o gatilho SQL com `service_role` (inclusive quando a plataforma usar secret keys modernas), chamadas legadas, snapshots inválidos e usuários autenticados comuns.
3. Revalidar toda a renderização do Telegram para texto e foto/caption. Garantir que o log com `worker_rendered` aparece somente após confirmação de envio e que o valor corresponde ao texto realmente exibido.
4. Implantar **primeiro** a função SQL retrocompatível (sem mudar a semântica dos logs antigos), **depois** a nova versão do worker. Confirmar a origem `worker_rendered` em novo log real autorizado.
5. A futura política cloud de queda >=10% somente poderá usar snapshots marcados com `price_source='worker_rendered'`. Snapshots antigos/fallback continuam utilizáveis como referência histórica, mas **não para autorizar exceção antes de 48h**.
6. Revalidar o gateway do worker, as tentativas de Telegram, o tratamento de logs, fluxo de cupons, fanout e WhatsApp desativado; preparar rollback com versões anteriores preservadas.
7. Não ativar essa mudança ao mesmo tempo que a troca de executor, nem habilitar Cron Discovery sem ter paridade dos coletores Mercado Livre/Magalu.

## Redução de escopo para os coletores

Conferido no Supabase: `flow-discovery-ingest` v31 (Mercado Livre), `flow-shopee-ingest` v12, `flow-magalu-ingest` v10, `flow-worker` v38 são **funções ativas de ingestão/envio**. Isso não significa que façam descoberta automática: o runner local V85 usa Chrome autenticado para coletar ML, Telegram MTProto para Magalu, e sessões locais para autenticar chamadas. A migração ML/Magalu deve priorizar **coletores cloud com autenticação segura**, reutilizando ingestão/worker onde possível, com correções de paridade antes de habilitar publicação.

**Produção inalterada por este trabalho. Não armazenar tokens, cookies ou arquivos MTProto em GitHub.**

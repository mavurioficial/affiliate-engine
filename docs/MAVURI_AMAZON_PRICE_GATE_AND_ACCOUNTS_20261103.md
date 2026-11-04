# Mavuri — gate de verificação de preços Amazon e troca futura de titularidade

Data da revisão: 03/11/2026 (Brasília)
Branch: `experiment/mercadolivre-direct-link-dry-run-20261103`

## O que foi implementado sem interromper a produção

1. Módulo puro `src/domain/amazon-forwarded-price-gate.mjs`: avalia um candidato Amazon contra uma cotação com origem e autorização explicitadas e exige:
   - Mesmo ASIN e produto identificado;
   - Cotação da Creators API com acesso aprovado, marketplace BR, produto em estoque;
   - Preço e horário da observação válidos, limite configurado de 30 minutos;
   - Valor anunciado pela fonte, para impedir alegações de promoção sem comparação;
   - Equivalência das condições (recorrência, pagamento Pix, frete grátis Prime);
   - Link da própria conta com tag válida e resultado de verificação da ferramenta Amazon.
   - Mesmo com gates aprovados, o módulo **jamais autoriza publicar sozinho**; devolve `ready_for_final_publication_review` para revisão da regra de distribuição.
2. Testes de unidade em `scripts/test-amazon-forwarded-price-gate.mjs`: **7 casos verificados diretamente com o código-fonte do GitHub** em ambiente JS. Incluem bloqueios do Personal com preço padrão R$75,90 contra alegação R$33,52 em recorrência, Omo sem preço de origem, ausência de API, dados antigos, exigência Pix e frete Prime.
3. Nova view `mavuri_internal.external_discovery_price_review` no Supabase, que expõe o motivo do bloqueio do preço por oferta, sem tratar prints de usuário como cotação oficial.
4. Nova view unificada `mavuri_internal.external_discovery_publish_gate_preview`, que associa a categoria/canal sugerido ao resultado da avaliação comercial, sempre em *dry-run* e com envio desativado.

Verificação no Supabase: 4 candidatos (2 Amazon, 2 ML), **0 autorizados**, **0 registros de ofertas desses candidatos em `flow_offers`**. Views privadas com `security_invoker=true` e SELECT apenas service_role, sem acesso de anon/authenticated.

### Dados reais analisados

| Mensagem | Item | Preço da fonte | Observado no print da própria conta | Conclusão |
|---|---|---:|---:|---|
| 541059 | Personal VIP, ASIN B09MLBPL1K | R$33,52 (recorrência, Prime) | R$75,90 (compra avulsa; frete R$38,12) | recorrência/preço Prime **não confirmados** — bloquear |
| 541060 | Omo Todo Ciclo 4 kg, ASIN B0HD2T6BZZ | não informado no histórico capturado | R$50,26 (Pix/NuPay) | não há preço comparável da publicação original — bloquear |

Preços observados são fotografias temporais de uma conta e entrega específicas, **não cotação apta à divulgação pública**. Não supor que a recorrência do Personal inexiste para outros assinantes.

### Limite real: Creators API

Estado registrado em `flow_affiliate_accounts`: Amazon `status=connected`, modo `sitestripe`, `creators_api_status=pending_account_approval`. O formato de link com `mavuri0a-20` está confirmado em 42 ofertas históricas, mas a API de dados de preço não está cadastrada como aprovada.

A Creators API suporta GetItems, offersV2.listings.price, availability e seller:
https://associados.amazon.com.br/creatorsapi/docs/en-us/api-reference/operations/get-items

Conforme documentação vigente, a elegibilidade de catálogo/preços por API exige requisitos como vendas qualificadas (10 nos últimos 30 dias para a PA API via Creators API) e aprovação:
https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction

Políticas brasileiras de Associados limitam as condições de exibição de preço/disponibilidade e publicidade com descontos. A coleta de preços via página pública, prints, ou grupo de terceiros não substitui acesso autorizado a esses dados:
https://associados.amazon.com.br/help/operating/policies

**Não** criar cron para consulta de preço Amazon, nem transmitir dados por bot, enquanto falta autorização/API. Não tratar link com tag como comissão aprovada por si só.

### Contas de afiliado — alteração futura para dados pessoais

O usuário mencionou a intenção de atualizar no futuro dados cadastrais que havia criado com e-mail/dados de Mavuri, para Amazon, Mercado Livre, Shopee, AliExpress etc. A intenção ainda não autoriza alteração de login, titularidade, ID, comissão, OAuth ou credenciais.

Snapshot de integração no Supabase:
- Amazon / Mercado Livre / Shopee / Magalu: conta registrada `connected`.
- Amazon: tag atual `mavuri0a-20` com vínculo a links já existentes.
- Shopee: já teve troca de conta/ID e solicitação de nova Open API ao longo de outubro. Evitar restaurar credenciais antigas.
- AliExpress: sem integração conectada verificada neste snapshot; não inventar API.

Antes de cada mudança: confirmar com a plataforma se permite edição da titularidade versus abrir nova conta; verificar liberação e documentos do novo titular, API/AppID, tags, payout e eventuais saldos; preservar históricos; testar novas credenciais isoladamente em dry-run; migrar publicação só após validação, por plataforma e com procedimento reversível.

**Não houve mudança de contas nesta entrega.**

## Continuação técnica

- Integrar o adaptador **GetItems / OffersV2** quando a conta Amazon realmente obtiver elegibilidade e credenciais aprovadas, guardadas só em secrets.
- Implementar atualização de cotação autorizada com ASIN/variante/vendedor/condições, validando à medida que chega; não transferir capturas privadas de preços para posts públicos.
- Planejar a migração cadastral das plataformas individualmente, sem alterar as que já funcionam.
- Mercado Livre permanece sem validação de link próprio oficial gerado automaticamente e sem autorização de postagem das fontes observadas.

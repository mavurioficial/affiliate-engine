# Mavuri Flow V1 — contrato de aceitação

## Objetivo

O usuário deve conseguir operar o ciclo principal de uma oferta afiliada sem conhecer detalhes técnicos:

**link de afiliado → captura → produto/oferta → regras → fila → distribuição → tracking**

## Critérios de aceite

### 1. Captura
- [ ] Usuário autenticado cola um link oficial Mercado Livre/meli.la.
- [ ] O campo preserva o link enquanto a página é renderizada novamente.
- [ ] O navegador não pede access token do Mercado Livre.
- [ ] Se a conta não estiver conectada, o Flow inicia OAuth.
- [ ] O Mavuri identifica produto, preço, preço anterior, imagem e metadados disponíveis.
- [ ] O link de afiliado original é preservado.

### 2. Persistência
- [ ] Oferta é salva em `flow_offers`.
- [ ] `marketplace_id` aponta para Mercado Livre.
- [ ] Fingerprint impede duplicação da mesma oferta.
- [ ] Se uma oferta já existir e receber um novo link de afiliado, o link pode ser atualizado.
- [ ] RLS mantém os dados isolados por usuário.

### 3. Regras
- [ ] Regra pode filtrar marketplace.
- [ ] Regra pode filtrar desconto mínimo/máximo.
- [ ] Regra pode filtrar preço mínimo/máximo.
- [ ] Regra pode filtrar categoria e vendedor.
- [ ] Regra pode usar palavras permitidas/negadas.
- [ ] Regra pode exigir cupom.
- [ ] Regra aponta explicitamente para um ou mais canais.

### 4. Distribuição
- [ ] Oferta com link afiliado e regra compatível gera job.
- [ ] Job possui `delivery_key` idempotente.
- [ ] Worker assume jobs atomicamente.
- [ ] Falhas transitórias usam retry/backoff.
- [ ] Jobs presos em processamento são recuperados.
- [ ] Falhas definitivas ficam visíveis para reprocessamento.
- [ ] Telegram usa segredo somente no backend.

### 5. Tracking
- [ ] Publicação gera tracking ID.
- [ ] Link rastreado incrementa cliques.
- [ ] Destino final vem da oferta armazenada.
- [ ] Dashboard apresenta cliques e CTR.

### 6. UX
- [ ] **Mavuri Flow** é o caminho principal da navegação.
- [ ] Dashboard aponta para o Flow como próximo passo.
- [ ] Estados de carregamento, sucesso e erro são claros.
- [ ] O usuário não precisa conhecer Supabase, tokens, jobs ou IDs para capturar uma oferta.
- [ ] A funcionalidade antiga **Buscar ofertas → Divulgação** não deve ser confundida com o fluxo principal V1.

## Gates de release

**Código:** `npm run check` e `npm test` devem passar.

**Backend:** Edge Functions, schema Flow, RLS, scheduler e tracking devem estar ativos.

**Integração:** captura Mercado Livre deve funcionar com OAuth e sem token colado no navegador.

**Operação:** worker deve processar uma oferta elegível e registrar entrega/tracking.

**UX:** a navegação e o fluxo completo devem ser verificados em navegador real antes de considerar o V1 concluído.

## Fora do gate atual

- WhatsApp como canal de produção.
- Novos marketplaces além do que já está integrado.
- Automação de regras comerciais não documentadas.
- Qualquer afirmação de autorização comercial de canal que não esteja confirmada pelo programa de afiliados.


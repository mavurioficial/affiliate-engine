# Mavuri Flow V1

## Objetivo

O Mavuri Flow é o caminho operacional principal do Affiliate Engine para transformar um link oficial de afiliado em uma oferta processada, elegível para distribuição e rastreável.

## Pipeline implementado

**Capture → Normalize → Resolve Product → Affiliate Link → Rules → Delivery → Analytics**

### 1. Capture
O operador cola o link oficial de afiliado do Mercado Livre. O Flow verifica a conexão da conta por OAuth e, quando necessário, inicia a autorização em uma janela separada.

### 2. Normalize / Resolve Product
O adapter do Mercado Livre resolve o produto e normaliza título, preço, preço anterior, imagem, seller, categoria e metadados disponíveis. Quando o link de afiliado já contém os dados do anúncio, o resolver pode aproveitá-los antes de depender de uma leitura de item autenticada.

### 3. Persist
A oferta é gravada em `flow_offers` com fingerprint para deduplicação. O `marketplace_id` aponta para o catálogo de marketplaces do Flow e RLS mantém o isolamento por usuário.

### 4. Rules
As regras podem considerar marketplace, desconto, preço, categoria, vendedor, palavras permitidas/negadas e cupom. Cada regra aponta para os canais elegíveis.

### 5. Delivery
Ofertas elegíveis geram jobs idempotentes em `flow_delivery_jobs`. O `flow-worker` faz claim atômico, recupera jobs presos, aplica retry/backoff e registra falhas.

### 6. Analytics
A publicação cria tracking no Mavuri. O endpoint `track-click` contabiliza cliques e redireciona para o destino armazenado. O dashboard mostra fila, envios, falhas, cliques e CTR.

## Estado da V1

Implementado e integrado nesta etapa:

- Supabase Flow schema + RLS;
- Mercado Livre OAuth server-side;
- captura por link afiliado;
- resolução e normalização de produto;
- persistência/deduplicação;
- regras;
- canais Telegram;
- fila e worker;
- scheduler;
- tracking e métricas;
- dashboard operacional;
- testes automatizados de domínio/fluxo.

## Limites atuais

- WhatsApp ainda não é o canal de produção desta V1.
- A geração de links de afiliado permanece atrás do adapter e deve usar o mecanismo oficial da conta.
- Autorização comercial de cada canal é uma decisão separada da capacidade técnica.
- A validação visual em navegador real ainda é um gate antes de considerar a experiência final fechada.

## Relação com funcionalidades antigas

**Buscar ofertas → Divulgação** é uma funcionalidade legada/auxiliar. Não é o pipeline principal do Mavuri Flow V1 e não deve alterar o comportamento do Flow.

# Mavuri Affiliate Engine

Plataforma operacional da Mavuri para captura, normalização, curadoria e distribuição de ofertas afiliadas.

## Mavuri Flow V1

A direção atual do produto é o **Mavuri Flow V1**. O fluxo principal é:

1. **Capturar** — o usuário cola um link oficial de afiliado do Mercado Livre.
2. **Resolver** — o Mavuri identifica o produto e recupera os dados comerciais usando a conexão OAuth da conta.
3. **Persistir** — a oferta é normalizada, recebe fingerprint e é gravada em `flow_offers`, com deduplicação.
4. **Aplicar regras** — regras de marketplace, desconto, preço, categoria, vendedor, palavras-chave e cupom determinam elegibilidade.
5. **Enfileirar** — ofertas elegíveis geram jobs idempotentes por canal.
6. **Distribuir** — o worker publica no canal configurado, hoje com adapter de Telegram.
7. **Rastrear** — os links publicados passam pelo tracking do Mavuri e registram cliques/CTR.

O caminho antigo **Buscar ofertas → Divulgação** continua disponível como funcionalidade auxiliar/legada, mas **não é o fluxo principal do produto V1**.

## Segurança e integrações

- Mercado Livre usa OAuth; o navegador não recebe nem armazena o access token da conta.
- Tokens de integração são mantidos no backend/Supabase.
- A URL de afiliado precisa ser oficial para que a oferta seja elegível para monetização.
- Canal tecnicamente configurado não significa, por si, autorização comercial do programa de afiliados.
- Telegram usa segredo do bot somente no backend.

## Validação local

Pré-requisitos:

- Node.js 20+
- npm 10+

Comandos:

```bash
npm run check
npm test
npm run build
npm run preview
```

## Estrutura

```text
src/
├── application/     casos de uso e serviços
├── domain/          regras do Offer Engine
├── integrations/    adapters Mercado Livre/afiliados
├── infrastructure/  persistência e infraestrutura
└── app/             interface e autenticação
```

O contrato de aceitação do V1 está em `docs/PRODUCT_V1_ACCEPTANCE.md`.

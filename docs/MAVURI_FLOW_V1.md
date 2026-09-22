# Mavuri Flow V1

## Objetivo

Transformar o Affiliate Engine em uma plataforma de captura, processamento, conversão e distribuição de ofertas afiliadas.

## Pipeline

Capture -> Normalize -> Resolve Product -> Affiliate Link -> Rules -> Delivery -> Analytics.

## V1 implementada nesta etapa

- Modelo persistente inicial no Supabase.
- RLS por usuário.
- Catálogo inicial de marketplaces.
- Offer Engine puro e testável.
- Serviço de persistência/listagem de ofertas.
- Branch de desenvolvimento: feat/mavuri-flow-v1.

## Próxima implementação

1. Adaptador real do Mercado Livre.
2. Tela "Nova oferta" usando Offer Engine.
3. Resolver de URLs e identificação de produto.
4. Conta de afiliado por marketplace.
5. Fila de distribuição.
6. Telegram.
7. Worker/adapter para WhatsApp, após validar a estratégia de conexão.
8. Stories e página pública de ofertas.

## Princípios

- A entidade Offer é independente do canal de origem.
- Integrações externas ficam atrás de adapters.
- Tokens e credenciais nunca são expostos ao frontend.
- Toda tabela exposta pelo Data API usa RLS.
- Processamento assíncrono deve usar filas; não bloquear a UI.

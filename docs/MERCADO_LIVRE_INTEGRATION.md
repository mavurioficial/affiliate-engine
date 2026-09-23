# Integração Mercado Livre — V1

## Objetivo

Transformar um link oficial de afiliado do Mercado Livre em uma oferta normalizada do Mavuri, preservando o link de monetização e os dados comerciais necessários para o pipeline.

## Fluxo

1. Receber URL de afiliado.
2. Validar que o domínio é Mercado Livre/meli.la.
3. Resolver o destino e identificar o produto/anúncio.
4. Quando disponível, preferir os dados da página de destino do afiliado.
5. Usar a conexão OAuth server-side para consultas autenticadas do Mercado Livre.
6. Normalizar preço, preço anterior, título, permalink, imagem, seller e categoria.
7. Calcular desconto.
8. Persistir em `flow_offers`.
9. Avaliar regras e, quando elegível, enfileirar distribuição.

## Autenticação

O Mavuri usa OAuth 2.0 e mantém as credenciais fora do frontend. A documentação do Mercado Livre orienta o uso do access token no header `Authorization: Bearer` e descreve o fluxo server-side com authorization code e refresh token. [documentação oficial de autenticação](https://developers.mercadolivre.com.br/autenticacao-e-autorizacao)

A implementação do Mavuri guarda a conexão no Supabase e pode renovar o access token server-side quando necessário.

## Afiliados

O link de afiliado recebido pelo Flow é preservado como `affiliate_url`. A camada `affiliate-link-service.js` permanece como adapter para mecanismos oficiais de geração/resolução de links.

O Mavuri não inventa uma API de deep-link. A monetização depende de um link oficial do programa e da configuração efetiva da conta.

## Limitações

- A captura não deve pedir ao operador para colar um access token.
- O navegador não deve armazenar credenciais permanentes do Mercado Livre.
- A autorização comercial de canais de distribuição deve ser tratada separadamente da capacidade técnica do adapter.
- A aplicação Mercado Livre deve permanecer compatível com as regras atuais de separação entre aplicações do Mercado Livre e Mercado Pago. [gestão de aplicações](https://developers.mercadolivre.com.br/devcenter/gerencie-seu-aplicativo)

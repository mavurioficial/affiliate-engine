# Integração Mercado Livre — V1

## Objetivo

Transformar uma URL de produto do Mercado Livre em uma oferta normalizada do Mavuri, preservando o identificador da publicação e os dados de preço/imagem necessários para o pipeline.

## Fluxo

1. Receber URL.
2. Detectar Mercado Livre.
3. Extrair o identificador MLB quando disponível.
4. Consultar o proxy existente /api/offers.
5. Quando necessário, usar busca por ID como fallback.
6. Normalizar preço, preço anterior, título, permalink, imagem, seller e categoria.
7. Calcular desconto.
8. Persistir em flow_offers.
9. Resolver link de afiliado por adapter/configuração da conta.

## Autenticação

Tokens de Mercado Livre não devem ser persistidos no frontend como credenciais permanentes. A API oficial usa OAuth 2.0 e access tokens de duração limitada, com refresh token de uso único para renovação. O desenho do Mavuri mantém a credencial fora do domínio de apresentação sempre que a integração server-side estiver disponível.

## Afiliados

A camada affiliate-link-service.js foi criada como adapter. Ela aceita URL afiliada já resolvida, template configurado em flow_affiliate_accounts.settings.link_template ou parâmetros configurados em flow_affiliate_accounts.settings.query_params.

Isso evita acoplar o Offer Engine a um formato específico de link de afiliado.

## Limitação atual

A API pública consultada do Mercado Livre documenta autenticação e recursos de catálogo/itens, mas não foi encontrada uma operação pública genérica para gerar link de afiliado equivalente a uma API de deep-link. Portanto, o Mavuri não inventa um endpoint: a geração do link permanece atrás do adapter até definirmos o mecanismo oficial da conta de afiliado.

## Próxima etapa

Adicionar a conta de afiliado real e o adapter correspondente, seguido do preview e dos workers de distribuição.

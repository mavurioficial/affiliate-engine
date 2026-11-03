# Mavuri — teste oficial de preços do anúncio (03/11/2026)

## Motivação

O primeiro piloto na API oficial de catálogo retornou `HTTP 200` para pesquisa, detalhes do catálogo e uma consulta de anúncios concorrentes, mas os dois anúncios encontrados não tinham preço regular ou desconto comprovado.

A documentação oficial do Mercado Livre indica `GET /items/{ITEM_ID}/prices` para preços detalhados, inclusive `regular_amount`:
https://developers.mercadolivre.com.br/pt_br/api-de-precos

## Teste real

Uma função Edge temporária e autenticada pelo segredo do agendador existente no Vault consultou somente o anúncio `MLB7930832866` (de outro vendedor), com o OAuth já renovado.

- `GET /items/MLB7930832866/prices` → **HTTP 403**
- Não houve resposta com `regular_amount` ou promoção.
- Não houve nova tentativa nem troca de IP, proxy, navegador ou sessão.
- O erro mostra que o endpoint não é acessível para esse anúncio com as permissões atuais; a causa precisa não está confirmada, mas pode se relacionar com restrição de proprietário/vendedor.

A função `ml-prices-probe` foi encerrada e substituída pela versão 2, um stub que retorna 410 com `verify_jwt=true`. Nenhuma tarefa de agendamento foi criada.

## Resultado consolidado

- Descoberta de produtos via API de catálogo: **comprovada em consulta pequena**.
- Descoberta de anúncios com preço atual e vínculo a vendedor: **comprovada em um catálogo**.
- Desconto oficial atual para anúncios de terceiros: **ainda não comprovado**.
- Geração de links de afiliados comissionáveis: **não comprovada**.
- Automação totalmente gratuita para 8 ofertas por 30 minutos: **não comprovada**.
- Ofertas/publicações criadas nesses testes: **0/0**.
- Produção Shopee, Magalu e flow-worker: **sem alterações**.

Próxima investigação: formas documentadas e permitidas de identificar promoções/strikeout de anúncios de terceiros, sem simular conta de vendedor; além de confirmação de atribuição dos links diretos. Não habilitar publicação ML enquanto esses gates estiverem pendentes.

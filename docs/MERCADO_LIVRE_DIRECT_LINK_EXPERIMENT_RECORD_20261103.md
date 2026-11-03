# Mavuri — validação de links diretos do Mercado Livre

## Experimento real de navegação (03/11/2026)

- Produto: Liquidificador Britânia, catálogo MLB62577381.
- Link oficial de controle: https://meli.la/2KesHdW (já guardado em flow_offers).
- Link B: URL do catálogo contendo os parâmetros matt_word e matt_tool da conta; **não é link oficialmente gerado**.
- O usuário confirmou que acessou o link B no iPhone em 03/11/2026, aproximadamente 18h32 BRT.
- Abriu corretamente o aplicativo, o produto e o indicador GANHOS 5%.
- Conclusão: APENAS navegação testada. A mensagem GANHOS 5% não prova atribuição da URL B: pode aparecer devido ao login do próprio afiliado.

## O que interpretar na próxima conferência

- Se aparecer aumento agregado nas métricas: apenas indício; outros cliques não podem ser separados e acessos próprios podem ser excluídos.
- Se não aparecer aumento: não comprova falha; pode haver filtragem de autoacessos ou atraso de atualização.
- Uma atribuição comercial consistente exige verificação em métricas reais da plataforma associadas a tráfego orgânico elegível; não gerar cliques artificiais, não simular compras, não forçar vendas.
- Manter variáveis de campanha e teste isoladas de publicações reais.
- Não chamar uma URL com matt_word/matt_tool de link oficial/comissionado antes dessa comprovação.

## Desenvolvimento entregue nesta branch

- `src/domain/ml-direct-link-preview.mjs`: gera URL de prévia somente para catálogo válido e sem outros parâmetros de rastreamento; devolve `publication_allowed:false`, `affiliate_attribution_verified:false` e NÃO fornece campo affiliate_url.
- `scripts/test-ml-direct-link-preview.mjs`: seis casos de teste offline.
- `src/domain/affiliate-account-selection.js` e `src/application/affiliate-account-service.js`: corrigem, apenas nesta branch, seleção de conta atualmente cadastrada como `connected`, quando o resolvedor anterior só aceitava `active`. Todas as contas do Flow atualmente usam status connected.
- `scripts/test-affiliate-account-selection.mjs`: três casos de teste offline.
- Testados localmente com Node 22 em cópias equivalentes: 9/9 passando. Não foi feita execução de geração em produção.
- O código de prévia não foi conectado a filas, ao resolvedor comercial, nem aos grupos Telegram.

## Critério para ativação posterior

Apenas mediante comprovação de atribuição e decisão consciente de ativação em produção. A existência de um ID de afiliado legível na URL não satisfaz essa condição. A geração não substitui a descoberta de ofertas recentes nem atualização de preços.

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

## Registro adicional — testes no celular e seleção da base (03/11/2026)

### Evidências dos acessos

- 18h32, Brasília: o usuário acessou no iPhone a URL experimental do liquidificador Britânia, catálogo `MLB62577381`, montada com `matt_word`/`matt_tool`. Abriu o aplicativo e o produto correto. O indicador "GANHOS 5%" apareceu na conta do próprio afiliado; isso **não prova atribuição do link**.
- 18h58, Brasília: a esposa do usuário abriu, em outro celular/conta, a URL experimental do kit Vonixx, catálogo `MLB35104832`. O produto correto abriu, com anúncio de R$ 149,99 do vendedor APARBS e outra opção por R$ 154,06. **Abertura em outra conta prova navegação, não comissão nem clique contabilizado**.
- Métricas capturadas às 18h55: "Hoje", 1 clique total, atualização dos dados **até 16h28**. Esse clique antecede os dois acessos experimentais no relatório; não atribuir a eles.
- Próxima comparação: verificar apenas quando o período de atualização superar 18h58; analisar a aba Redes se houver dados segmentados. Crescimento do total agregado continua inconclusivo, especialmente com acessos próprios ou familiares. Não pedir múltiplos cliques artificiais ou compras de teste.

### Seleção local realizada no Supabase, sem publicar

Consulta de leitura na view privada `mavuri_internal.ml_legacy_seed_pool` selecionou um catálogo por categoria entre automotivo, beleza, casa, cozinha, eletrônicos, ferramentas, infantil e informática — **8 produtos distintos em 8 categorias**.
Dos 350 catálogos históricos, nenhum tinha preço atualizado nas últimas 24 horas nem nos últimos 7 dias (conforme `captured_at`). Nenhum está marcado `publication_allowed=true`.
O kit Vonixx, por exemplo, havia sido registrado a R$ 123,14 em 22/10/2026, enquanto o celular exibiu R$ 149,99 em 03/11/2026 — não reutilizar preços históricos sem revalidação.

**Resultado atual do teste fim a fim:**
- Seleção e formato experimental de URL: tecnicamente demonstrados.
- Navegação em dois aparelhos/contas: demonstrada.
- Fonte automática de ofertas/preços atuais: **não demonstrada**.
- Atribuição de link experimental: **não demonstrada**.
- Publicação automática do Mercado Livre: **não ativada**.

Nenhum clique sintético, compra simulada, nova consulta à API do catálogo, escrita em filas ou mensagem aos grupos foi realizada para obter essas evidências.

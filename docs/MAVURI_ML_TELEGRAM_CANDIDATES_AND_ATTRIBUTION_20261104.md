# Mercado Livre no Telegram — captura Mavuri e teste de conversão

Revisão: 04/11/2026 · Fonte: @GRUPOTABUGADO · Status: **coleta preparada; geração de link com comissão ainda NÃO validada**

## Resultado verificado do projeto

- Já há leitura da conta pessoal Telegram no GitHub Actions e 1 publicação **Amazon** de ponta a ponta comprovada (msg 3441).
- A coleta de links Mercado Livre foi incluída no mesmo scanner `scripts/telegram-cloud-onepost.mjs`, com identificação dos domínios `meli.la`, `merc.li` e `mercadolivre.com.br`. Consulta recente, guarda no máximo 8 links ML por ciclo e não copia texto completo.
- A Edge Function Supabase `mavuri-telegram-amazon-cloud-onepost` v5 recebe `ml_candidates`, valida origem, URL e OIDC do GitHub e grava apenas os candidatos na nova tabela `public.mavuri_ml_telegram_candidates`, com RLS habilitada e sem acesso `anon` ou `authenticated`.
- O DB exige `publication_allowed=false` até que existam URL própria oficial e `affiliate_attribution_verified=true`. Não existe função de publicação ML nessa integração.
- Após implantação: **zero novos candidatos ML gravados até a consulta**, pois nenhuma execução com um novo link ML foi confirmada. Essa parte ainda precisa de validação em uma execução real.
- GitHub CI: https://github.com/mavurioficial/affiliate-engine/actions/runs/41829924061 — 10 testes passaram, incluindo detector de links ML, bloqueio de domínios parecidos e recorte por data.
- Dois exemplos antigos encaminhados pelo usuário já existem na tabela privada `mavuri_internal.external_discovery_candidates`:
  - `https://meli.la/1DhpTm8` — conjunto de assadeiras Marinex Opaline 6 peças (mensagem 541058);
  - `https://meli.la/2H56Kz8` — pré-treino Yeah Buddy Ronnie Coleman 360g.
  Ambos continuam `publication_allowed=false`, sem link oficial de comissão gerado automaticamente.

## O verdadeiro desafio de conversão

O Mercado Livre disponibiliza publicamente instruções para gerar links usando **Gerador de Links** (Portal de Afiliados) ou **Barra de Afiliados**, mas não foi documentada uma API pública de geração de Links Especiais para afiliados:

- https://www.mercadolivre.com.br/l/afiliados-gere-seus-links
- https://www.mercadolivre.com.br/l/afiliados-primeiros-passos
- https://www.mercadolivre.com.br/l/boas-praticas-links

O próprio Mercado Livre orienta usar links gerados pelas ferramentas oficiais e divulgar em canais públicos permitidos e registrados. Não devemos usar links de terceiros, editar links oficiais de maneira indiscriminada, ou prometer remuneração sem validação.

**A tentativa histórica de link longo** com `matt_word=lucasbrasildf` e `matt_tool=69434586` abriu um produto no aplicativo, mas **isso não prova atribuição de comissão**. O código já existente na branch experimental `src/domain/ml-direct-link-preview.mjs` produz apenas `unverified_direct_url` e impede publicação. Os redirecionamentos de links `meli.la` oficiais anteriores contêm `matt_word`, `matt_tool` e `ref` opaco, que variou entre produtos — não é seguro supor que `ref` possa ser inventado.

Vários fornecedores comerciais declaram métodos distintos: link direto com etiqueta ou sessão autenticada de painel para gerar link oficial. Isso é alegação de terceiros, não garantia de comissão.

## Próximos experimentos

1. Confirmar que links ML recentes capturados pelo novo scanner chegam à tabela, com ID e URL corretos. Não publicar.
2. Resolver produto de `meli.la` para URL do anúncio individual e ID MLB, caso o redirecionamento social e página estejam acessíveis, distinguindo anúncio e catálogo. Não confundir com perfil social.
3. Produzir duas URLs para **o mesmo anúncio**: uma gerada pela conta no gerador oficial e outra gerada experimentalmente a partir de `matt_word`/`matt_tool`.
4. Validar com ferramentas e relatórios do programa, sem gerar cliques artificiais nem fazer compras próprias ou de familiares. Confirmar produto, canal registrado e atribuição; somente depois permitir publicação ML.

## Estado dos demais canais, consultas ao Supabase em 04/11/2026

- Cron `mavuri-shopee-cloud-discovery`: ativo, `*/30 * * * *`; no período de 24h da consulta, 161 ofertas cadastradas e 228 entregas aos canais.
- Cron `mavuri-magalu-cloud-discovery`: ativo, `*/30 * * * *`; 5 ofertas cadastradas e 14 entregas aos canais.
- O número de entregas é maior que o de ofertas porque publica nos grupos de nicho e geral.
- Nenhum desses crons foi modificado nesta etapa.

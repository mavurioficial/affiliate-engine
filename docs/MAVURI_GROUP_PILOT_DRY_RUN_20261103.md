# Mavuri — teste de fluxo com ofertas encaminhadas do grupo Tá Bugado (03/11/2026)

## Escopo e permissões
O usuário compartilhou voluntariamente três ofertas e duas capturas de tela de mensagens do Telegram:
- [Amazon] Personal Papel Higiênico VIP, leve 32/pague 28, R$33,52 na recorrência, frete grátis para assinantes Prime, `https://link.amazon/B08aKs8yN`.
- [Mercado Livre] Marinex Conjunto de Assadeiras Opaline, 6 peças, branco, R$90,15 no Pix, `https://meli.la/1DhpTm8`.
- [Mercado Livre] Pré-treino Yeah Buddy Ronnie Coleman, sabor Frutas Vermelhas, 360g, R$58,10, `https://meli.la/2H56Kz8`.

Esses são **preços anunciados pela origem**, sem garantia de disponibilidade, vendedor ou preço atual. Imagens foram fornecidas diretamente pelo usuário; não houve automação de leitura do grupo.

As mensagens do Tá Bugado não ficaram acessíveis de forma completa via páginas públicas. Os termos do Telegram restringem coleta sistemática/reuso de conteúdos de terceiros sem a base de permissão apropriada: https://telegram.org/tos/content-licensing.
Não foi instalada sessão MTProto da conta pessoal do usuário, nem bot em grupos de terceiros.

## Descoberta e consistência
1. No Supabase, registros privados `mavuri_internal.external_discovery_candidates` foram enriquecidos com **títulos e preços anunciados** que apareciam nos prints do usuário, mantendo `price_verified_current=false`, `own_affiliate_verified=false`, `publication_allowed=false`.
2. Consulta comparativa externa: listagem Mercado Livre de Marinex Opaline mostrava R$104,40 no Pix, e não R$90,15. Fonte pública: https://lista.mercadolivre.com.br/conjunto-assadeiras-marinex?filter=state. Preços podem mudar e a listagem não prova que se trata do mesmo vendedor; não usar como cotação validada.
3. Listagem pública do pré-treino Ronnie Coleman encontrada com valor de R$58,10. Referência: https://lista.mercadolivre.com.br/loja/espartanos-oficial/_Container_bl-ssp_FLAVOR_12471647_UNITS%2APER%2APACKAGE_120-%2A . Não confundir listagem com produto/variante/vendedor verificados.

## Redirecionamento dos links
- `meli.la/1DhpTm8` e `meli.la/2H56Kz8`: primeira resposta HTTP 301 para página `www.mercadolivre.com.br/social/...` com parâmetros `ref` e afiliado; **não revelou o item/catalog ID**, nem autoriza reutilizar affiliate URL de terceiro.
- `link.amazon/B08aKs8yN`: uma única consulta de primeiro redirecionamento HTTP 302 apontou para o domínio intermediário `amzlinks.in`, não diretamente para `amazon.com.br/dp/ASIN`. Nenhum ASIN identificado. Não seguir domínios intermediários não aprovados nem reutilizar a tag de terceiros.
- A função temporária de análise foi encerrada na versão seguinte (HTTP 410, verify_jwt=true), sem cron.

## Consulta de pré-publicação
View privada: `mavuri_internal.external_discovery_dry_run` com `security_invoker=true`, acessível apenas ao `service_role`; sem acesso a `anon` ou `authenticated`.
A view roteia apenas como sugestão:
- Papel higiênico Personal => `Mavuri Casa & Cozinha`.
- Marinex => `Mavuri Casa & Cozinha`.
- Pré-treino => `Mavuri Ofertas`.

Todos apresentam os bloqueios:
`produto_id_nao_identificado`, `preco_atual_nao_validado`, `atribuicao_do_nosso_link_nao_validada`, `publicacao_bloqueada`.
Resultado verificado: **3 candidatos, 3 prévias seguras, 0 sem bloqueios, 0 mensagens enviadas**.
A view nunca insere `flow_offers` nem `flow_delivery_jobs`.

## Links próprios
- Amazon: conta `mavuri0a-20` já está no projeto e 42 ofertas Amazon anteriores têm `tag=mavuri0a-20`.
- Conferido exemplo original guardado: Colgate Slim Soft Black, ASIN `B08K4HMYHH`, `https://www.amazon.com.br/dp/B08K4HMYHH/ref=nosim?tag=mavuri0a-20`.
- Geração de links próprios Amazon pelo formato oficial é tecnicamente demonstrada **quando o ASIN está conhecido**. Fonte: https://associados.amazon.com.br/help/node/topic/GP38PJ6EUR6PFBEC
- Para o link curto Amazon fornecido, ASIN não resolvido; nenhum link específico do papel higiênico foi gerado.
- Mercado Livre: exigência de link produzido pelas ferramentas oficiais: https://www.mercadolivre.com.br/l/afiliados-direcionamento-de-visitas . Link direto experimental com `matt_word`/`matt_tool` permanece não validado para comissão. Nenhum link novo com atribuição comprovada foi gerado para as duas ofertas.

## Estado e próximos gates
O fluxo ponta a ponta **não** está implantado para grupos de terceiros:
- Leitura autônoma do grupo Tá Bugado: **não realizada**, requer acesso permitido.
- Captura das três ofertas voluntariamente encaminhadas: **sim**.
- Extração e roteamento em simulação: **sim**.
- Geração com formato da conta Amazon para ASIN conhecido: **sim**, exemplo Colgate pré-existente.
- Geração de link próprio comprovado para os 3 novos candidatos: **não**.
- Preço atual do mesmo anúncio e mesma variante: **não confirmado**.
- Publicação nos canais: **não efetuada**.

O webhook isolado `mavuri-telegram-source-intake` permanece bloqueado até criar/configurar bot de entrada dedicado. O webhook do `@MavuriOfertasBot` em `app.botdoafiliado.com` foi preservado.

## Próximo teste operacional sem PC
Criar bot de entrada exclusivo usando BotFather; salvar token e IDs permitidos nos segredos do Supabase, nunca via chat. Encaminhar uma oferta para esse bot; validar gravação e deduplicação. Bot não captura automaticamente mensagens de terceiros sem inclusão/autorização. Testar publicação somente em destino privado controlado e depois dos gates de link e preço; evitar testes em canais públicos de produção.

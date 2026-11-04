# Mavuri — teste 1 em nuvem: publicação Amazon sem preço (03/11/2026)

## Solicitação
Publicar uma única oferta do Omo Todo Ciclo 4 kg, recebida voluntariamente pelo usuário do Tá Bugado (mensagem 541060), somente no destino próprio **Mavuri Ofertas**, usando o ID Amazon `mavuri0a-20`. Não copiar texto da fonte, não divulgar preço não validado e não executar filtros de diversidade/desconto do processo automático.

## Diagnóstico do ambiente

- Canal `Mavuri Ofertas` está `connected`, Telegram ID `-1003537630337`.
- Produto ASIN `B0HD2T6BZZ` corresponde ao Omo Todo Ciclo 4 kg, conforme captura fornecida pelo usuário.
- URL própria em formato Amazon: `https://www.amazon.com.br/dp/B0HD2T6BZZ/ref=nosim?tag=mavuri0a-20`.
- Nenhuma oferta do ASIN em `public.flow_offers` e nenhuma entrega desse teste em `public.flow_delivery_jobs` (verificação pontual feita).
- `amazon-manual-publish`, endpoint existente, exige preço positivo e oferta previamente ingerida, verifica sessão autenticada do usuário, e pode enviar também a canais de nicho. **Não usar para este teste sem preço**.
- O botão "Publicar manualmente" do painel atual captura links `meli.la` do Mercado Livre, não este produto Amazon.
- Tentativa anterior de criar um publicador pontual foi encerrada na versão 3 da função `mavuri-amazon-omo-onepost-20261103`, que responde 410 com `verify_jwt=true`. Não houve envio. Componentes temporários de envio único foram removidos.

## Realizado

Foi criada em Supabase a view `mavuri_internal.omo_telegram_onepost_draft`, como objeto **somente de leitura**, com:
- Associação do ASIN e da tag Amazon existente à conta conectada;
- Destino exclusivamente Mavuri Ofertas;
- Conteúdo promocional original, **sem preço e sem desconto**;
- Divulgação `#pub | Como associado da Amazon, ganho com compras qualificadas.`;
- Marcadores `send_enabled=false`, `publication_approved=false`.

Segurança: `security_invoker=true`, schema privado, SELECT somente `service_role`; não há acesso `anon` ou `authenticated`. Checagem de segurança do Supabase não trouxe achados para a nova view. Não foi criada fila de distribuição, não há cron e não houve mensagem ao Telegram.

## Conteúdo pré-composto

🧺 Achadinho Amazon | Mavuri

Lava-Roupas em Pó Omo Todo Ciclo — Tamanho Família, 4 kg

Confira o preço, o estoque e as condições na Amazon:
https://www.amazon.com.br/dp/B0HD2T6BZZ/ref=nosim?tag=mavuri0a-20

Preços e disponibilidade podem mudar.
#pub | Como associado da Amazon, ganho com compras qualificadas.

## Resultado e bloqueio
**Nuvem confirmou geração do rascunho e destino; envio NÃO foi realizado.** Não afirmar publicação.

A chamada de verificação de um publicador pontual feita no turno anterior foi bloqueada por controles de segurança; não tentar contornar com encaminhamento indireto, invocação alternativa ou gravação em filas usando credenciais privilegiadas.

Para concluir um envio real, a opção adequada é um fluxo com **autenticação e confirmação do próprio usuário** no painel Mavuri, limitado a um destino e sem exigir preço. Isso implica uma funcionalidade do painel que não existe hoje para ofertas Amazon sem preço, ou a publicação manual pelo usuário. Não ativar sem testes isolados e proteção contra duplicação.

A leitura recorrente de fontes externas continua separada deste teste e depende de acesso/autorização apropriados.

## ATUALIZAÇÃO DE RESULTADO — envio confirmado (03/11/2026, 23h09 BRT)

**Esta atualização substitui o resultado pendente descrito acima.**

Foi criado um novo publicador **user-confirmed** separado, autenticado com a sessão Mavuri, e uma página estática de confirmação no GitHub Pages:

- Página: `entrar/piloto-amazon-telegram.html`, adicionada à branch `main`.
- Edge: `mavuri-amazon-user-confirmed-onepost`, verifica usuário autenticado, titularidade do canal, ID de afiliado da conta Amazon, destino único e confirmação explícita. O conteúdo contém `#pub` e **não anuncia preço nem desconto**.
- Auditoria idempotente: `public.mavuri_telegram_onepost_audit`, RLS habilitada e acesso apenas via `service_role`; a chave de teste impede disparos repetidos.

**Evidências:**
- Prints do usuário mostram `PUBLICAÇÃO CONFIRMADA no Telegram`, canal `Mavuri Ofertas`, mensagem `3424`, registro confirmado, e mensagem efetivamente visível no Telegram às 23h09.
- Consulta SQL do projeto ao registro específico confirmou `status='sent'`, `telegram_message_id='3424'`, `asin='B0HD2T6BZZ'`, destino `-1003537630337`, criação em `2026-11-04T02:09:27.712165Z` (23h09 BRT).
- Produto: Omo Todo Ciclo Tamanho Família, 4 kg; link contém `tag=mavuri0a-20`.
- Apenas um envio autorizado pelo usuário. **Não há automação recorrente de leitura da origem na nuvem.**

**Estado técnico comprovado:** usuário leu o Tá Bugado em execução pontual local com MTProto (não na nuvem), conversor identificou ASIN e construiu link Mavuri, e a nuvem efetuou 1 postagem após login e confirmação no painel. A leitura da origem na nuvem e qualquer captura recorrente permanecem não implementadas. O envio ao grupo não prova comissão atribuída ou preço promocional.

Próxima etapa: projetar ingestão de fontes autorizadas com revisão de direitos/permissões, mantendo guarda contra duplicidade e preço não verificado; não configurar cron de sessão pessoal em ambiente público sem rever segurança.

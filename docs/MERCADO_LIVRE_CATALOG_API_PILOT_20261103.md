# Mavuri ML — validação da API oficial de catálogo (03/11/2026)

## O que é diferente dos testes anteriores

O endpoint de busca geral `GET /sites/MLB/search` retornou HTTP 403 em testes prévios.
Este piloto usa **somente recursos de catálogo documentados pelo Mercado Livre**:
- `GET /products/search?status=active&site_id=MLB&q=...&limit=2`
- `GET /products/{catalog_id}`
- `GET /products/{catalog_id}/items?limit=5`

Documentação oficial:
- https://developers.mercadolivre.com.br/buscador-de-produtos
- https://developers.mercadolivre.com.br/concorrencia-em-catalogo

Outro projeto público documentou respostas 200 para essa sequência em setembro de 2026, mesmo com 403 em /sites/MLB/search. Isso **não prova** acesso para a conta OAuth do Mavuri.

## Estado verificado na base Mavuri

- Uma conexão OAuth Mercado Livre existe e está associada à conta conectada.
- O token de acesso venceu em 22/10/2026; existe material cifrado de refresh.
- A renovação poderá ser tentada pelo endpoint oficial no momento de um teste futuro. Não foi realizada neste preparo.
- Shopee, Magalu, flow-worker e cron jobs existentes **não foram modificados**.

## Arquivos

- `supabase/functions/ml-catalog-probe/normalize.mjs`: normalização sem network nem afiliados.
- `scripts/test-ml-catalog-probe.mjs`: 19 testes de dados sintéticos (offline).
- `supabase/functions/ml-catalog-probe/index.ts`: prova de conceito manual para consultar a API oficial, não implantada.

Executar os testes offline:

```bash
node scripts/test-ml-catalog-probe.mjs
```

## Gate para executar a função manual no futuro

1. Revisar o código e confirmar `MAVURI_OWNER_USER_ID` existente no Supabase.
2. Implantar função nova exclusivamente manual, sem agendamento e sem integrá-la a `flow-worker`.
3. Configurar `ML_CATALOG_PROBE_ENABLED=true` somente após decidir realizar o teste.
4. Invocar como proprietário autenticado com JSON `{"mode":"dry_run"}`.
5. A função usa, no máximo, uma busca e dois produtos (até cinco anúncios cada). Retorna **somente** amostras e status sanitizados.
6. Se receber 401/403, **parar**. Não trocar IP, proxy, sessão, fingerprint ou endpoint proibido.
7. Repor `ML_CATALOG_PROBE_ENABLED` para `false` após a verificação.

A função pode **renovar e rotacionar tokens OAuth**, atualizando apenas as credenciais cifradas na tabela da conexão. Não cria, atualiza nem distribui ofertas.

## Gates comerciais não atendidos

Mesmo que a API responda HTTP 200, isso NÃO valida monetização nem autoriza montar links diretos com `matt_word`/`matt_tool`. Os campos `affiliate_url` e `publish_ready` permanecem `null` e `false`, respectivamente. Para escolher itens publicáveis serão necessárias confirmação de atribuição, elegibilidade das plataformas/canais, preço corrente, categoria, diversidade e cooldown.

## Resultado até o momento

- Testes offline normalizador: **19 passaram**.
- API oficial na conta Mavuri: **não executada**.
- Links de afiliado gerados: **0**.
- Mensagens enviadas: **0**.
- Nenhuma alteração na branch main, Supabase em produção ou Telegram.

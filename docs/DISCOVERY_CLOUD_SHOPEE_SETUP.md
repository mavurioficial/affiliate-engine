# Mavuri — habilitar apenas o teste de leitura Shopee na nuvem

## O que está pronto
A Edge Function `discovery-cloud-shopee` não grava dados, não invoca funções de ingestão, não cria jobs e não publica nos canais. O fluxo de produção permanece no runner Windows. Ainda **não** existe Cron de Discovery cloud.

Código-fonte e testes: `supabase/functions/discovery-cloud-shopee/`, `scripts/test-discovery-cloud-shopee.mjs`.

## Configuração segura dos segredos

No projeto Supabase `otikoxnfotyjgphrdudn`, abra **Edge Functions > Secrets**:

https://supabase.com/dashboard/project/otikoxnfotyjgphrdudn/functions/secrets

Configure os seguintes nomes e valores, sem expor valores por chat, em commits ou em prints:

| Nome | Valor a usar |
| --- | --- |
| `SHOPEE_AFFILIATE_APP_ID` | mesmo ID já usado no `.env` do runner local |
| `SHOPEE_AFFILIATE_SECRET` | mesmo segredo usado pelo runner local |
| `MAVURI_SHOPEE_CLOUD_OWNER_USER_ID` | UUID da conta autenticada em **Authentication > Users** (não email) |
| `MAVURI_SHOPEE_CLOUD_PREVIEW_ENABLED` | `true`, **somente** quando estiver pronto para uma consulta real sem publicação |

O portal informa que Secrets ficam imediatamente disponíveis nas funções após salvar; não requer republicação da função.

**Nunca envie** o segredo Shopee, conteúdo de `.env`, perfil Chrome, cookies ou Telegram user session pelo chat ou para o repositório público.

## Operação
- `mode=health` + JWT do usuário Mavuri: devolve flags booleanas de configuração; nunca os valores dos segredos.
- `mode=fixture`: valida resposta de dados simulados, sem consultar API externa.
- `mode=live_preview` + JWT pertencente ao `MAVURI_SHOPEE_CLOUD_OWNER_USER_ID`: consulta Shopee, devolve apenas estatísticas/categorias e amostra resumida; não devolve URLs afiliadas e não escreve na fila.
- Se alguma chave ou autorização estiver ausente, a consulta real falha de forma fechada.

Nenhum desses modos migra o envio de ofertas para a nuvem. Para produção falta autenticação do ingest, lease com exclusão contra o runner Windows, validação da seleção/cooldown e implementação de ML e Magalu.

## Depois da prévia
Comparar: até 80 candidatos distintos, desconto >=10%, cobertura dos quatro canais (categorias), links afiliados válidos nos dados da API e duração. A meta de 8 ofertas Shopee permanece a cargo do Flow existente quando o ingest cloud for criado.

O usuário avisará quando renovar Whapi. Não alterar `whatsapp disabled`.

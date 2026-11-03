# Mavuri — Telegram como origem de candidatos (03/11/2026)

## Situação atual: código implantado, entrada ainda não conectada

Projeto: Supabase `mavuri-affiliate-engine` (`otikoxnfotyjgphrdudn`).
Ramo GitHub: `experiment/mercadolivre-direct-link-dry-run-20261103`.
**Nenhuma modificação nas funções de produção Shopee/Magalu e nas filas de entrega. Nenhuma postagem de teste em canais públicos.**

### Bot existente — preservar

Inspeção não destrutiva da API oficial Telegram:
- Bot publicador existente: `@MavuriOfertasBot`, autenticado.
- Webhook JÁ ativo em `app.botdoafiliado.com`.
- O Telegram oferece apenas um webhook por bot.
- Portanto, **NÃO executar setWebhook/deleteWebhook nesse bot**. Poderia quebrar integrações existentes.
- A função isolada de setup recusa explicitamente o nome `MavuriOfertasBot` e recusa sobrescrever qualquer webhook externo de um bot novo.

### Componentes criados

1. `supabase/functions/mavuri-telegram-source-intake/parse.mjs` — extrai links (inclusive entidades `text_link` ocultas), loja, preço **anunciado**, texto, recorrência, Prime, Pix, promoções leve/pague e URL da fonte, se `forward_origin` de canal público.
2. `supabase/functions/mavuri-telegram-source-intake/index.ts` — webhook exclusivo. Exige o cabeçalho `X-Telegram-Bot-Api-Secret-Token` com segredo forte e lista permitida de ID de usuário privado e/ou canais autorizados. Insere exclusivamente candidatos no banco privado usando RPC service_role; não gera links, não valida preços, não enfileira distribuição.
3. `public.mavuri_telegram_candidate_insert` (RPC, `SECURITY INVOKER`, EXECUTE somente para service_role) — idempotência pelo `source_ref`; UPSERT só atualiza `last_seen_at`.
4. Tabela `mavuri_internal.external_discovery_candidates`, já privada, RLS ativa. `publication_allowed=false` imposto por CHECK, preço e link próprios inicialmente não verificados.
5. `mavuri-telegram-source-webhook-setup` — endpoint administrativo, protegido pelo segredo do agendador, que usa o token do **novo bot** via Edge Secrets. Confere primeiro `getMe` e `getWebhookInfo`. Nunca substitui webhook de terceiros ou do bot publicador.
6. Gerador `src/domain/amazon-associate-link.mjs` de prévia, usando o formato Amazon Brasil oficial `/dp/ASIN/ref=nosim?tag=ID`. Referência: https://associados.amazon.com.br/help/node/topic/GP38PJ6EUR6PFBEC
7. `scripts/test-mavuri-telegram-source-intake.mjs` e `scripts/test-amazon-associate-link.mjs` com cenários offline.

### Testes reais

- No Supabase, 13 verificações executadas com o parser + gerador Amazon: todas passaram. Incluem 3 candidatos de exemplo (1 Amazon, 2 ML), preço R$33,52, Prime, recorrência, Pix, rejeição de domínio falso e link Amazon com ID real `mavuri0a-20`. Nenhuma escrita, publicação ou clique.
- Teste de SQL com papel `service_role` fez duas inserções repetidas e verificou **uma** linha; a transação foi revertida e confirmou zero registros de fixture persistidos.
- Permissões da RPC: anon=false, authenticated=false, service_role=true. Tabela privada com RLS ativa.
- Requisição sem credenciais ao endpoint de entrada: **HTTP 503 intake_not_configured**. Esse é o comportamento desejado antes do cadastro do bot.
- Helper de setup: **HTTP 503 intake_secrets_or_allowlist_not_configured**, sem alterar qualquer bot.
- Funções diagnósticas `mavuri-telegram-bot-inspection` e `mavuri-telegram-intake-selftest` foram fechadas com 410 e `verify_jwt=true`. Não há cron criado.

### Associação Amazon

O projeto já possui a conta `mavuri0a-20` e exemplos de links `/ref=nosim?tag=mavuri0a-20`, inclusive no acervo de outubro. O novo helper aplica regras estritas de domínio, ASIN (dez caracteres) e ID; não confunde `link.amazon` com ASIN.

Um link de Amazon corretamente formatado precisa passar pelo verificador oficial:
https://associados.amazon.com.br/help/node/topic/G6253GFSARDQENZR

O link encurtado `https://link.amazon/B08aKs8yN` **não revela o ASIN de modo seguro no próprio texto**. A resolução do produto e atualização do preço continuam pendentes. Nunca copiar a tag de outro afiliado.

### Para habilitar entrada automática por encaminhamento

**Ação do usuário no Telegram:** criar um bot de recepção exclusivo no `@BotFather` (comando `/newbot`), com nome e username próprios; não substituir `@MavuriOfertasBot`.

**Edge Secrets no projeto Supabase:**
- `MAVURI_TG_INTAKE_BOT_TOKEN`: token do **bot novo**, nunca enviar por chat, Github ou UI pública.
- `MAVURI_TG_INTAKE_WEBHOOK_SECRET`: segredo aleatório com pelo menos 32 caracteres `[A-Za-z0-9_-]`, configurado apenas no Supabase.
- `MAVURI_TG_INTAKE_ALLOWED_USER_IDS`: ID Telegram numérico de quem pode encaminhar para o novo bot (CSV de IDs).
- Opcional: `MAVURI_TG_INTAKE_ALLOWED_CHANNEL_IDS`: IDs de canais cujo responsável autorizou o bot como membro e a recepção de postagens.

**Ativação:** após configurar as Edge Secrets, chamar a função de setup com `mode=status` para validação; depois `mode=setup` usando a autenticação interna do Mavuri (agendador via Vault). Essa rotina registra **somente o novo bot** em `mavuri-telegram-source-intake` e valida retorno de `getWebhookInfo`. Não exige VM, Chrome, computador ligado ou serviço pago.

O usuário encaminha posts diretamente para o novo bot privado. O webhook verifica a autorização da conta, identifica links e armazena candidatos.

**Limitação:** um bot não pode monitorar grupos arbitrários nos quais não foi admitido. Para receber automaticamente posts de canais de terceiros, precisará ser adicionado por administradores com a permissão necessária. Mensagens voluntariamente encaminhadas ao nosso bot funcionam independentemente dessa autorização externa.

### Próximos gates para envio

1. Confirmar recebimento real pelo bot e idempotência em mensagens do usuário.
2. Resolver links curtos e identificar ASIN/ID ML por fonte permitida, sem criar cliques artificiais.
3. Validar preço e condições em tempo real.
4. Gerar link próprio, testar no verificador da Amazon / confirmar atribuição do Mercado Livre.
5. Aplicar filtros, diversidade, cooldown e canais elegíveis antes de liberar publicação.

Fonte Bot API: https://core.telegram.org/bots/api
Fonte FAQ privacidade do Telegram: https://core.telegram.org/bots/faq

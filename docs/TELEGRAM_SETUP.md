# Telegram no Mavuri Flow

O token do bot não deve ser salvo em `flow_channels.settings`, no navegador ou no Git.

## Canal

1. Cadastre o canal Telegram no Mavuri.
2. Informe apenas o Chat ID no cadastro do canal.
3. O `TELEGRAM_BOT_TOKEN` fica como secret da Edge Function.
4. Crie uma regra apontando para o canal.
5. Capture uma oferta.
6. Quando a oferta atender à regra e possuir link oficial de afiliado, o Flow cria o job.
7. O worker envia a mensagem e registra o resultado.
8. O link enviado passa pelo `track-click`, que registra o clique e redireciona para o destino armazenado.

## Token do bot

Configure `TELEGRAM_BOT_TOKEN` como secret do projeto Supabase. O worker lê o valor somente no backend.

## Processamento automático

O projeto possui o job Supabase Cron `mavuri-flow-worker`, executado a cada minuto. Ele chama o Edge Function `flow-worker` por meio do `pg_net`.

Para ativar a chamada automática, o scheduler precisa das duas secrets server-side usadas pela migration:

- `mavuri_flow_project_url`
- `mavuri_flow_supabase_secret_key`

Essas secrets ficam no Supabase Vault e nunca devem ser colocadas no frontend, no Git ou em `flow_channels.settings`.

O botão **Processar fila** continua disponível no painel para execução manual autenticada.

## Observação comercial

Suporte técnico a Telegram não significa autorização comercial do programa de afiliados. Antes de escalar distribuição monetizada, confirme as regras aplicáveis à conta e aos canais utilizados.

# Telegram no Mavuri Flow

O token do bot não deve ser salvo em flow_channels.settings, no navegador ou no Git.

Configure o segredo no projeto Supabase:

```bash
supabase secrets set TELEGRAM_BOT_TOKEN="<TOKEN_DO_BOT>" --project-ref otikoxnfotyjgphrdudn
```

Também é possível cadastrar o segredo pela área de Secrets das Edge Functions no Dashboard do Supabase.

O worker flow-worker lê esse segredo somente no backend. O canal guarda apenas o Chat ID.

## Fluxo

1. Cadastre o canal Telegram no Mavuri.
2. Crie uma regra apontando para esse canal.
3. Capture uma oferta.
4. O Flow cria o job automaticamente quando a oferta atende à regra.
5. Clique em Processar fila.
6. O worker envia a mensagem e registra o resultado.
7. O link enviado passa pelo track-click, que registra o clique e redireciona para o link afiliado/produto.


## Processamento automático do Flow

O projeto também possui um job Supabase Cron chamado `mavuri-flow-worker`, executado a cada minuto. Ele chama o Edge Function `flow-worker` por meio do `pg_net`.

Para ativar a chamada automática, é necessário cadastrar uma vez no Supabase Vault:

```sql
select vault.create_secret('https://otikoxnfotyjgphrdudn.supabase.co', 'mavuri_flow_project_url');
select vault.create_secret('<SUPABASE_SECRET_KEY>', 'mavuri_flow_supabase_secret_key');
```

A secret key é usada apenas pelo Cron → Edge Function e nunca deve ser colocada no frontend, no Git ou em `flow_channels.settings`.

O worker continua aceitando a sessão normal do usuário para o botão **Processar fila**. Quando chamado pelo Cron, ele usa a secret key server-side e processa jobs de todos os usuários.

O Cron foi desenhado para não fazer nada enquanto essas duas secrets não existirem. Depois de cadastradas, o processamento passa a ocorrer automaticamente a cada minuto.

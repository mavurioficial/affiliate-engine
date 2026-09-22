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

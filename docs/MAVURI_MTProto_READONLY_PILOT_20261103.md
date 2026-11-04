# Mavuri — piloto MTProto (conta própria) — leitura pontual

**Limite:** apenas @GRUPOTABUGADO, até 3 mensagens recentes, uma execução, leitura e contagem agregada. Sem mensagem completa, foto, autor, URL ou credencial salvo em log. Sem Supabase, cron, links próprios ou publicação. Não entra em grupos automaticamente.

## Preparação — Oracle Cloud Shell (sem PC ligado e sem administrador local)

1. Abrir https://my.telegram.org → API development tools. Criar uma aplicação pessoal e guardar API ID e API hash em lugar seguro. Não compartilhar essas credenciais com o ChatGPT.
2. Abrir o Oracle Cloud Shell do seu ambiente. Ele permite rodar o piloto pontual pelo navegador. Escolha um terminal sob seu controle.
3. No Cloud Shell, preparar ambiente virtual:

```bash
python3 -m venv ~/mavuri-tg-env
source ~/mavuri-tg-env/bin/activate
python3 -m pip install 'telethon==1.45.0'
```

4. Obter o script na branch experimental:

```bash
curl -fL 'https://raw.githubusercontent.com/mavurioficial/affiliate-engine/refs/heads/experiment/mercadolivre-direct-link-dry-run-20261103/scripts/telegram_user_access_check.py' -o ~/telegram_user_access_check.py
```

5. Executar somente quando estiver pronto:

```bash
python3 ~/telegram_user_access_check.py --group GRUPOTABUGADO --limit 3
```

O script solicita API ID/hash diretamente no terminal. No primeiro acesso, o Telegram pode pedir telefone, código enviado no aplicativo e senha 2FA. Não coloque senha, código ou sessão em mensagens, capturas, logs ou no GitHub. O arquivo de sessão local é ~/.config/mavuri/telegram-readonly/user.session com permissões restritas; essa sessão permite autenticar a conta.

**Resultado:** joined_group_read_ok se a conta consegue consultar o grupo já associado; apenas número de mensagens e contagens de links Amazon/ML. Não copia o conteúdo nem envia à base. Em caso de group_not_found_in_joined_dialogs, o script não entra no grupo.

## Segurança e limites

- Uma segunda sessão pode aparecer em Dispositivos/Sessões ativas do Telegram. Para revogar: encerre a sessão pelo aplicativo e remova o arquivo local.
- Não mover automaticamente a sessão pessoal a GitHub Actions, Supabase ou outros provedores antes de revisar o modelo de segurança.
- Não publicar ofertas nem criar cron de coleta de conteúdo de terceiro com esse script. Participação no grupo não equivale a autorização para scraping sistemático. Conferir https://telegram.org/tos/content-licensing e https://core.telegram.org/api/terms.
- A Telethon documenta o procedimento em https://docs.telethon.dev/en/stable/basic/signing-in.html e as precauções de sessão em https://docs.telethon.dev/en/stable/concepts/sessions.html.

## Próximos gates

1. Confirmar uma leitura pontual com a conta do usuário, sem exposição de credenciais.
2. Para automação recorrente, definir uma fonte/forma de acesso permitida e uma conta ou sessão adequada, sem risco à conta pessoal.
3. Resolver ASIN/ID ML, validar preços e comissão, e só então simular ou publicar em um canal privado controlado.

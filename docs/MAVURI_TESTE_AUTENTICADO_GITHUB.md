# Mavuri — primeiro teste autenticado no GitHub Actions

Este teste confere o acesso ao **Mercado Livre Hub** e a validade da sessão do **Mavuri/Supabase** num Chrome temporário do GitHub. É **somente de leitura**. Não executa V85, não acessa cupons, não envia Telegram, não cria jobs, não agenda nada e não precisa da VM Oracle.

## O que já foi confirmado

- GitHub Actions gratuito no repositório público: 4 CPUs e aproximadamente 16 GB RAM.
- Chrome headless e Playwright CDP funcionando em GitHub Actions com página `about:blank`.
- Teste sem login: Mavuri respondeu HTTP 200; o Hub Mercado Livre respondeu **HTTP 403**. Isso ainda não prova bloqueio do IP: estava sem autenticação.
- O código de exportação criptografada e o caminho de teste sem secrets têm testes automáticos de segurança.

## 1. Preparar sessão local no Windows (sem ligar o Runner)

**Nunca enviar cookies, sessão, chave ou token pelo ChatGPT, WhatsApp, Telegram, GitHub Issues, commit ou Pull Request.** Eles permitem se passar pela conta autenticada.

1. Feche o Runner V85. Não é necessário iniciá-lo; ele poderia publicar.
2. Baixe e examine `scripts/cloud-runner/prepare-auth-windows.ps1` na branch principal.
3. Execute esse script em PowerShell **sem privilégios de administrador**. Ele usa Node/npm existentes, instala `playwright-core` somente numa pasta local, abre Chrome com perfil `%LOCALAPPDATA%\MavuriChromeProfile`, porta CDP **somente local** 9222 e abre duas abas: Hub ML e painel Mavuri. Não faz ingestão nem publicação.
4. **Entre nas duas contas** nas abas abertas; quando estiver pronto, responda `EXPORTAR` na janela PowerShell.
5. O programa vai verificar os cookies ML e armazenamento local do Mavuri, filtrar outras origens e criptografar esse estado usando **AES-256-GCM**. Ele gera **dois arquivos privados** na pasta `%USERPROFILE%\MavuriCloudAuth`:
   - `MAVURI_AUTH_BUNDLE.txt`: estado criptografado, base64.
   - `MAVURI_AUTH_KEY.txt`: chave aleatória exclusiva, base64.

Esses arquivos são **ambos secretos**, ficam somente no Windows e devem ser apagados com cuidado quando as configurações forem concluídas. Não os suba a repositório nenhum. O programa aborta se ultrapassar 48 KB (limite de secret do GitHub) ou se não encontrar as duas contas.

## 2. Configurar ambiente protegido no GitHub

Abra [Settings → Environments](https://github.com/mavurioficial/affiliate-engine/settings/environments) do repositório `mavurioficial/affiliate-engine` e crie um ambiente chamado exatamente **`mavuri-auth-test`**.

Recomendações de segurança:
- Restringir o ambiente à branch **`main`** em *Deployment branches and tags*; impedir PRs e outras branches de acessarem esses secrets.
- Se a interface permitir, exigir aprovação de um revisor autorizado.
- Em **Environment secrets** (não variáveis públicas e preferencialmente não Repository secrets), cadastrar:
  - `MAVURI_AUTH_BUNDLE` → colar todo o conteúdo de `MAVURI_AUTH_BUNDLE.txt`.
  - `MAVURI_AUTH_KEY` → colar todo o conteúdo de `MAVURI_AUTH_KEY.txt`.

Nenhum desses valores deve aparecer em logs.

## 3. Executar uma vez

Abra [GitHub → Actions](https://github.com/mavurioficial/affiliate-engine/actions), escolha **Mavuri - teste autenticado (somente leitura)** e clique em **Run workflow**, usando **`main`**. O workflow *não* tem `schedule`, não é disparado por PR e usa permissões GitHub `contents:read`. 

A saída pública mostra apenas flags e códigos de resposta:
- `meli_hub_status` (200 indica que a página respondeu, mas isoladamente não garante autorização no Hub);
- `meli_login_redirection` (true indica redirecionamento evidente para login);
- `mavuri_supabase_user_confirmed` (true somente se `supabase.auth.getUser()` confirmar sessão válida sem retornar o ID);
- `shopee_preview`: quando a sessão do Mavuri estiver válida, o mesmo teste invoca **`discovery-cloud-shopee` v16 no modo `general_audit`**, que consulta ofertas reais da API Shopee e históricos pelo Supabase sem criar jobs ou enviar mensagens. Exibe apenas `ok`, quantos produtos foram analisados (`candidate_count`), quantos seriam selecionados (`projected_unique_offers`), categorias finais conhecidas/desconhecidas e código de erro genérico. Nomes, preços, links, IDs e tokens não aparecem no log.
- `no_publication=true` sempre.

Se o Hub continuar com **403** mesmo restaurando a sessão, será necessário investigar autenticação, desafio do site ou restrições contra IPs de datacenter — **não tentar contornar mecanismos de segurança**. Podemos deixar a Shopee na nuvem via API enquanto avaliamos uma VPS/browser persistente para ML.

**Importante:** um erro do Mercado Livre pode deixar o workflow com status geral vermelho **mesmo que a prévia Shopee tenha funcionado**. Confira os campos `meli_hub_status` e `shopee_preview.ok` independentemente. Se a sessão Mavuri não for validada, a prévia Shopee será pulada por segurança. O preview exige autorização de proprietário e flag previamente habilitada no Supabase; não muda nenhuma dessas configurações.

## 4. Próximo teste após autenticação aprovada

Somente se as sessões funcionarem, preparar um **dry-run real do V85 sem chamadas de ingestão/publicação em qualquer plataforma**, exercitando busca ML, Shopee e leitura Telegram com contadores agregados. Esse novo fluxo terá etapa de revisão antes de autorizar o primeiro envio de teste; WhatsApp continua desativado.

## Observações

- Cada runner GitHub é efêmero: sessões e cache não sobrevivem sem restauração segura. É por isso que este teste é o gargalo.
- O estado exportado inclui material de autenticação sensível e não deve ser compartilhado fora do GitHub Environment Secrets escolhido.
- O conjunto de testes já validou AES-GCM, filtros de domínio, recusa quando secrets faltam e ausência de chamadas de publicação.
- O Runner V85 Windows pode continuar fechado. Nenhuma modificação foi feita nas funções de publicação do Supabase.

# Mercado Livre — renovar sessão da geração de links

Objetivo: testar a geração oficial de links na nuvem sem PC ligado diariamente.
Uma renovação pontual de sessão pode ser necessária. **Ainda não existe
garantia de que o Mercado Livre aceitará a execução na nuvem.**

## Requisitos

- Windows com Google Chrome e Node.js disponíveis (sem exigir administrador).
- Acesso à conta Mercado Livre afiliada à etiqueta `lucasbrasildf`.
- Acesso de proprietário ao repositório GitHub `mavurioficial/affiliate-engine`.
- Arquivos do repositório atualizados, baixados diretamente do GitHub oficial do projeto.

## Passo 1 — gerar o par criptografado localmente

1. Abra um PowerShell na pasta raiz do repositório.
2. Instale a dependência **na pasta do projeto**, sem privilégios administrativos:

   ```powershell
   npm install --no-save --no-audit --no-fund --ignore-scripts playwright-core@1.55.0
   ```

3. Execute:

   ```powershell
   node scripts/cloud-runner/ml-session-renew.mjs capture
   ```

4. Um Chrome **temporário e separado** será aberto na página do Gerador de Links.
   Entre na sua conta normalmente, faça a autenticação adicional se solicitada
   e confirme que a etiqueta é exatamente `lucasbrasildf`.
5. Depois, volte ao PowerShell e pressione **Enter**. O código confere a etiqueta
   e gera dois arquivos em `%USERPROFILE%\MavuriCloudAuth\ml-...`:

   - `MAVURI_ML_AUTH_BUNDLE.txt` — sessão criptografada.
   - `MAVURI_ML_AUTH_KEY.txt` — chave de criptografia.

   Os arquivos **nunca** são adicionados ao Git nem enviados automaticamente.

## Passo 2 — atualizar dois secrets no GitHub

1. Repositório `mavurioficial/affiliate-engine`.
2. `Settings` → `Environments` → `mavuri-auth-test` → `Environment secrets`.
3. Adicione/atualize **apenas**:

   - `MAVURI_ML_AUTH_BUNDLE` com o conteúdo do primeiro arquivo.
   - `MAVURI_ML_AUTH_KEY` com o conteúdo do segundo arquivo.

4. **Não substitua** `MAVURI_AUTH_BUNDLE` e `MAVURI_AUTH_KEY`
   (secrets legados usados por outros testes Mavuri).
5. Depois de confirmar os dois secrets, elimine os dois arquivos locais
   conforme sua política de segurança.

**Nunca** envie os conteúdos dos arquivos, cookies, tokens, HARs ou cabeçalhos
de autenticação por chat, e-mail, commit, issue ou nos logs do GitHub.

## Passo 3 — teste isolado

Em `Actions`, escolha `Mavuri - teste isolado link afiliado ML` e clique em
`Run workflow` → `main`. O teste valida apenas um produto (Kemei),
sem enviar ao Telegram e sem alterar o banco de dados.

A aplicação do Mercado Livre pode retornar HTTP 401/403 mesmo com sessão nova.
Nesse caso, não insista com métodos de evasão de segurança; a alternativa
será buscar integração expressamente autorizada com o programa de afiliados.

## Segurança e limites

- O projeto não registra valores de cookies, senhas, headers ou URLs geradas.
- A captura usa um perfil temporário do Chrome, apagado ao final.
- Nenhum serviço precisa ficar ligado em seu computador depois da captura.
- Não foi ativada nenhuma publicação de Mercado Livre.
- A sessão pode expirar, ser revogada ou deixar de funcionar com mudanças
  no site e nas políticas do Mercado Livre.
- A exportação de sessão é sensível; trate ambos os arquivos como senhas,
  mesmo com o conteúdo criptografado.

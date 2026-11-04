@echo off
setlocal
cd /d "%~dp0"
echo ===================================================
echo MAVURI - RENOVAR LOGIN MERCADO LIVRE (TESTE)
echo ===================================================
echo.
echo Nao e necessario executar como administrador.
echo Nao envie arquivos de sessao nem credenciais pelo chat.
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao esta disponivel no PATH.
  echo Verifique sua instalacao do Node.js e tente novamente.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo ERRO: npm nao esta disponivel no PATH.
  pause
  exit /b 1
)
echo Instalando dependencia local de navegador...
call npm install --no-save --no-audit --no-fund --ignore-scripts playwright-core@1.55.0
if errorlevel 1 (
  echo ERRO na instalacao local. Nenhum arquivo de sessao foi enviado.
  pause
  exit /b 1
)
echo.
echo Um Chrome temporario vai abrir. Faca login normalmente.
echo Verifique a etiqueta lucasbrasildf. Depois pressione ENTER no terminal.
echo.
node scripts/cloud-runner/ml-session-renew.mjs capture
if errorlevel 1 (
  echo.
  echo Sessao NAO exportada. Verifique a mensagem acima.
  pause
  exit /b 1
)
echo.
echo Sessao criptografada criada. Agora atualize os dois
echo Environment Secrets MAVURI_ML_AUTH_BUNDLE e MAVURI_ML_AUTH_KEY
echo no GitHub em mavuri-auth-test.
echo Nunca envie o conteudo desses arquivos no chat.
start "" "https://github.com/mavurioficial/affiliate-engine/settings/environments"
pause
endlocal

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
rem O Mavuri usa Node portatil, que pode nao constar do PATH do Windows.
rem Detectar o Node no PATH ou no local ja utilizado pelos runners V85/V86.
set "MAVURI_NODE_DIR="
where node.exe >nul 2>&1
if not errorlevel 1 (
  for %%I in (node.exe) do set "MAVURI_NODE_DIR=%%~$PATH:I"
  if defined MAVURI_NODE_DIR for %%I in ("%MAVURI_NODE_DIR%") do set "MAVURI_NODE_DIR=%%~dpI"
)
if not defined MAVURI_NODE_DIR (
  if exist "%USERPROFILE%\Desktop\node-v24.21.0-win-x64\node-v24.21.0-win-x64\node.exe" (
    set "MAVURI_NODE_DIR=%USERPROFILE%\Desktop\node-v24.21.0-win-x64\node-v24.21.0-win-x64"
  )
)
if not defined MAVURI_NODE_DIR (
  if exist "%USERPROFILE%\Desktop\node-v24.21.0-win-x64\node.exe" (
    set "MAVURI_NODE_DIR=%USERPROFILE%\Desktop\node-v24.21.0-win-x64"
  )
)
if not defined MAVURI_NODE_DIR (
  echo ERRO: Node.js portatil nao encontrado.
  echo Caminho esperado:
  echo %USERPROFILE%\Desktop\node-v24.21.0-win-x64\node-v24.21.0-win-x64
  echo Verifique se a pasta do Node portatil continua no Desktop.
  pause
  exit /b 1
)
if not exist "%MAVURI_NODE_DIR%\node.exe" (
  echo ERRO: node.exe nao encontrado em "%MAVURI_NODE_DIR%".
  pause
  exit /b 1
)
if not exist "%MAVURI_NODE_DIR%\npm.cmd" (
  echo ERRO: npm.cmd nao encontrado em "%MAVURI_NODE_DIR%".
  pause
  exit /b 1
)
rem Alterar o PATH apenas deste processo e dos seus filhos, nunca do Windows.
set "PATH=%MAVURI_NODE_DIR%;%PATH%"
echo Node portatil localizado:
"%MAVURI_NODE_DIR%\node.exe" --version
echo.
echo Instalando dependencia local de navegador, sem acesso de administrador...
call "%MAVURI_NODE_DIR%\npm.cmd" install --no-save --no-audit --no-fund --ignore-scripts playwright-core@1.55.0
if errorlevel 1 (
  echo ERRO na instalacao local. Nenhum arquivo de sessao foi enviado.
  pause
  exit /b 1
)
echo.
echo Um Chrome temporario vai abrir. Faca login normalmente.
echo Verifique a etiqueta lucasbrasildf. Depois pressione ENTER no terminal.
echo.
"%MAVURI_NODE_DIR%\node.exe" scripts\cloud-runner\ml-session-renew.mjs capture
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

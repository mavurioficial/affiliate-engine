@echo off
setlocal
title MAVURI - Comparar Sessao Runner V86 (Sem Login)
cd /d "%~dp0"
echo ===================================================
echo MAVURI - DIAGNOSTICO DE SESSAO DO RUNNER V86
echo ===================================================
echo.
echo Este teste NAO abre Chrome, NAO faz login,
echo NAO gera links e NAO publica ofertas.
echo.
set "NODE_DIR="
for %%I in (node.exe) do set "NODE_FOUND=%%~$PATH:I"
if defined NODE_FOUND for %%I in ("%NODE_FOUND%") do set "NODE_DIR=%%~dpI"
if not defined NODE_DIR (
  if exist "%USERPROFILE%\Desktop\node-v24.21.0-win-x64\node-v24.21.0-win-x64\node.exe" (
    set "NODE_DIR=%USERPROFILE%\Desktop\node-v24.21.0-win-x64\node-v24.21.0-win-x64"
  )
)
if not defined NODE_DIR (
  if exist "%USERPROFILE%\Desktop\node-v24.21.0-win-x64\node.exe" (
    set "NODE_DIR=%USERPROFILE%\Desktop\node-v24.21.0-win-x64"
  )
)
if not defined NODE_DIR (
 echo ERRO: Node local nao encontrado. Verifique a pasta portatil do V86.
 pause
 exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
if not exist "node_modules\playwright-core\package.json" (
 echo Instalando somente o controlador Playwright local...
 call "%NODE_DIR%\npm.cmd" install --no-save --no-audit --no-fund --ignore-scripts playwright-core@1.55.0
 if errorlevel 1 (
  echo Erro instalando dependencia local. Nenhum login foi tentado.
  pause
  exit /b 1
 )
)
echo.
echo Verificando somente o Chrome JA ABERTO pelo V86 na porta 9222.
echo Nao abra outro login automatizado para executar este teste.
echo.
"%NODE_DIR%\node.exe" scripts\cloud-runner\ml-v86-session-inspect.mjs
echo.
echo Se aparecer "existing_v86_chrome_not_running_or_cdp_unavailable"
echo significa apenas que o Chrome V86 nao esta ativo.
echo Nao e necessario abrir novo navegador enquanto o ML limitar logins.
pause
endlocal

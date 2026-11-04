@echo off
setlocal
title MAVURI - Diagnostico OFFLINE do Runner instalado
echo =====================================================
echo MAVURI - VERIFICACAO DO RUNNER INSTALADO (SEM LOGIN)
echo =====================================================
echo.
echo Nao inicia Node, Chrome, Discovery, login ou publicacoes.
echo Nao le nem imprime cookies ou credenciais.
echo.
set "MAVURI_API=%USERPROFILE%\Desktop\Mavuri-Discovery-V1-Final-2026-09-25-R2\mavuri-discovery-v1-final-2026-09-25-r2\api"
set "SCRIPT=%MAVURI_API%\scripts\browser-discovery-v1.mjs"
set "WRAPPER=%MAVURI_API%\scripts\browser-discovery-runner-local.mjs"
echo API configurada: "%MAVURI_API%"
echo LOCALAPPDATA atual: "%LOCALAPPDATA%"
echo MAVURI_CHROME_PROFILE no ambiente atual: 
if defined MAVURI_CHROME_PROFILE (
 echo "%MAVURI_CHROME_PROFILE%"
) else (
 echo [nao definido]
)
echo.
if exist "%WRAPPER%" (
 echo Runner intermediario: ENCONTRADO.
) else (
 echo Runner intermediario: NAO ENCONTRADO.
)
if exist "%SCRIPT%" (
 echo Discovery real: ENCONTRADO.
 echo.
 echo Configuracoes de Chrome detectadas no arquivo instalado:
 powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=$env:SCRIPT; $f=Get-Content -LiteralPath $p -ErrorAction Stop; for($i=0;$i -lt [Math]::Min(220,$f.Count);$i++){ $line=$f[$i]; if($line -match '^(const (PORT|PROFILE_DIR|HUB_URL)|\s*String\.raw.*MavuriChromeProfile|\s*process\.env\.MAVURI_CHROME_PROFILE)'){ '{0}: {1}' -f ($i+1),$line.Trim() } }"
) else (
 echo Discovery real: NAO ENCONTRADO no caminho informado.
 echo Localize a pasta real do runner antes de prosseguir.
)
echo.
echo Perfis padrao no Windows:
set "PROFILE=%LOCALAPPDATA%\MavuriChromeProfile"
if exist "%PROFILE%\NUL" (
 echo [ENCONTRADO] "%PROFILE%"
 if exist "%PROFILE%\Local State" (echo [PRESENTE] Chrome Local State) else (echo [AUSENTE] Chrome Local State)
) else (
 echo [NAO ENCONTRADO] "%PROFILE%"
)
set "PROFILE=%USERPROFILE%\AppData\Local\MavuriChromeProfile"
if exist "%PROFILE%\NUL" (
 echo [ENCONTRADO] "%PROFILE%"
) else (
 echo [NAO ENCONTRADO] "%PROFILE%"
)
echo.
echo Processo CDP na porta 9222 (somente verifica, sem conectar):
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-NetTCPConnection -State Listen -LocalPort 9222 -ErrorAction SilentlyContinue; if($c){ 'PORTA_9222_EM_USO' } else { 'PORTA_9222_NAO_ESTÁ_EM_USO' }"
echo.
echo Verificacao concluida. Envie um print DESTA TELA.
echo.
pause
endlocal

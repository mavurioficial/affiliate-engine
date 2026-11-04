@echo off
setlocal
title MAVURI - Conferir Perfil Persistente V86 (Offline)
echo =====================================================
echo MAVURI - PERFIL PERSISTENTE DO CHROME V86
echo =====================================================
echo.
echo Este diagnostico NAO abre Chrome, NAO faz login,
echo NAO le cookies, NAO tenta gerar links e NAO publica.
echo.
set "ML_PROFILE=%LOCALAPPDATA%\MavuriChromeProfile"
if defined MAVURI_CHROME_PROFILE set "ML_PROFILE=%MAVURI_CHROME_PROFILE%"
echo Caminho verificado: "%ML_PROFILE%"
echo.
if not exist "%ML_PROFILE%\NUL" (
 echo RESULTADO: pasta do perfil V86 NAO encontrada neste caminho.
 echo Se o runner usa MAVURI_CHROME_PROFILE personalizado,
 echo execute o teste na mesma janela/ambiente do runner.
 pause
 exit /b 0
)
echo RESULTADO: pasta do perfil V86 encontrada.
if exist "%ML_PROFILE%\Local State" (
 echo Arquivo de configuracao do Chrome: PRESENTE.
) else (
 echo Arquivo de configuracao do Chrome: NAO encontrado.
)
if exist "%ML_PROFILE%\Default\Preferences" (
 echo Perfil Default do Chrome: PRESENTE.
) else (
 echo Perfil Default: nao detectado (pode haver outro perfil).
)
echo.
echo ATENCAO: perfil encontrado NAO comprova login valido.
echo Este teste nao le credenciais nem verifica a sessao online.
echo Enquanto a conta exibir limite de tentativas,
echo nao abra outro Chrome automatizado.
echo.
pause
endlocal

@echo off
setlocal
title MAVURI - RENOVACAO ML SUSPENSA
echo ===================================================
echo MAVURI - RENOVACAO DE LOGIN MERCADO LIVRE
echo ===================================================
echo.
echo SUSPENSO POR SEGURANCA: O MERCADO LIVRE EXIBIU
echo "VOCE ALCANCOU O LIMITE DE TENTATIVAS"
echo NO LOGIN ABERTO PELO NAVEGADOR AUTOMATIZADO.
echo.
echo Este arquivo NAO abrira o Chrome, NAO tentara
echo login e NAO enviara nenhuma requisicao.
echo.
echo Acesse sua conta normalmente, no navegador habitual
echo ou aplicativo do Mercado Livre, apenas quando o
echo proprio servico liberar novas tentativas.
echo.
echo O Mavuri mantem seus ciclos Shopee/Magalu/Amazon
echo separados. A geracao automatica ML ainda esta
echo em avaliacao e nao foi habilitada.
echo.
echo Mais informacoes: docs\mercadolivre-renovar-sessao.md
echo.
pause
endlocal
exit /b 2

#Requires -Version 5.1
# Mavuri: exporta sessao AUTENTICADA sem executar Discovery.
# Nao publica ofertas, nao altera Supabase nem liga o V85.
$ErrorActionPreference = "Stop"
Write-Host "Mavuri - teste de autenticacao para GitHub Actions"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js nao encontrado. Use o Node instalado para o Runner V85."
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw "npm nao encontrado."
}
$workspace = Join-Path $env:USERPROFILE "MavuriAuthTeste"
New-Item -ItemType Directory -Force -Path $workspace | Out-Null
Set-Location $workspace
$source = "https://raw.githubusercontent.com/mavurioficial/affiliate-engine/main/scripts/cloud-runner/auth-state.mjs"
Invoke-WebRequest -Uri $source -OutFile (Join-Path $workspace "auth-state.mjs") -UseBasicParsing
$packageFile = Join-Path $workspace "package.json"
if (-not (Test-Path $packageFile)) {
  Set-Content -Path $packageFile -Value '{"private":true,"type":"module"}' -Encoding ASCII
}
Write-Host "Instalando apenas o controlador Playwright, sem scripts de instalacao..."
& npm.cmd install --no-save --no-audit --no-fund --ignore-scripts playwright-core@1.55.0
if ($LASTEXITCODE -ne 0) { throw "Falha ao preparar o Playwright" }
$chromeCandidates = @(
  (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
  (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
)
$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw "Chrome nao localizado. Abra manualmente o perfil Mavuri na porta 9222." }
$profile = Join-Path $env:LOCALAPPDATA "MavuriChromeProfile"
Write-Host "Abrindo Chrome no perfil Mavuri, sem iniciar o V85..."
$browserArgs = @(
  '--remote-debugging-port=9222',
  ('--user-data-dir="' + $profile + '"'),
  'https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user',
  'https://mavurioficial.github.io/affiliate-engine/entrar/'
)
Start-Process -FilePath $chrome -ArgumentList $browserArgs
Write-Host ""
Write-Host "Confirme que esta LOGADO no Hub Mercado Livre e no Mavuri nas duas abas."
Write-Host "Se o Chrome reutilizou uma janela sem CDP, feche o Chrome do perfil Mavuri e execute novamente."
$confirm = Read-Host "Quando os dois logins estiverem prontos, digite EXPORTAR e pressione Enter"
if ($confirm -cne "EXPORTAR") { throw "Cancelado. Nenhuma sessao foi exportada." }
Write-Host "Lendo e criptografando localmente a sessao dos dois sites..."
node (Join-Path $workspace "auth-state.mjs") capture
if ($LASTEXITCODE -ne 0) { throw "Exportacao nao concluida. Verifique logins e Chrome CDP." }
Write-Host ""
Write-Host "Arquivos privados na pasta MavuriCloudAuth do seu usuario Windows."
Write-Host "Copie o CONTEUDO de cada arquivo apenas para os Environment Secrets do GitHub (mavuri-auth-test)."
Write-Host "Nao envie arquivos, chaves, cookies ou tokens ao ChatGPT, Telegram ou repositorio publico."

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNode = (Get-Command node -ErrorAction Stop).Source
Get-Command docker -ErrorAction Stop | Out-Null
if (-not (Test-Path -LiteralPath 'node_modules\next')) {
    & pnpm.cmd install
    if ($LASTEXITCODE -ne 0) { throw "L’installation des dépendances a échoué." }
}
& $taskNode 'scripts/docker-setup.mjs'
if ($LASTEXITCODE -ne 0) { throw "La configuration locale n’a pas pu être préparée." }
& docker compose --env-file .env.docker up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Vérifie que Docker Desktop est démarré.' }
& $taskNode 'scripts/migrate.mjs'
if ($LASTEXITCODE -ne 0) { throw 'La migration a échoué ; les données sont conservées.' }
& $taskNode 'node_modules/tsx/dist/cli.mjs' '--env-file=.env.local' 'scripts/seed.ts'
if ($LASTEXITCODE -ne 0) { throw "Les exemples n’ont pas pu être chargés." }
New-Item -ItemType Directory -Force -Path '.local-runtime' | Out-Null
$taskWorkerScript = Join-Path $PSScriptRoot 'node_modules/tsx/dist/cli.mjs'
$taskWorkerArguments = @("`"$taskWorkerScript`"", '--env-file=.env.local', 'scripts/worker.ts')
$taskWorker = Start-Process -FilePath $taskNode -ArgumentList $taskWorkerArguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput '.local-runtime/worker.log' -RedirectStandardError '.local-runtime/worker-error.log'
Write-Host 'Blood on the Tanguy Tower : http://127.0.0.1:3000'
Write-Host 'Boîte mail : http://127.0.0.1:54324 — Base : http://127.0.0.1:55433'
Write-Host 'Compte organisateur de test : camille@cercle.test'
try { & $taskNode 'node_modules/next/dist/bin/next' dev --hostname 127.0.0.1 --port 3000 }
finally { if (-not $taskWorker.HasExited) { $taskWorker.Kill() } }

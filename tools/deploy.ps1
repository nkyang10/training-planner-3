# Deploy the live POC3 calendar + gateway on Windows.
#
# Stops the process that currently owns the web/gateway ports, starts `pnpm dev` with the live environment, and waits
# for both HTTP surfaces. The auth secret, model API key and SQLite file are read from the repository's data directory;
# the script refuses to stop a process that does not look like this app.
param(
    [int]$WebPort = 8093,
    [int]$GatewayPort = 8092,
    [string]$Database = 'sqlite:data/poc3-auth.sqlite',
    [string]$SecretFile = 'data/poc3-auth.secret',
    [string]$ModelKeyFile = 'data/poc3-model.secret',
    [string]$ModelBaseUrl = 'http://192.168.1.202:8102/v1',
    [string]$ModelName = 'dgx/general',
    [int]$MaxAttempts = 2,
    [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$secretPath = Join-Path $root $SecretFile
if (-not (Test-Path $secretPath)) {
    throw "Auth secret not found: $secretPath"
}
$secret = (Get-Content -Raw $secretPath).Trim()
if ($secret.Length -lt 16) {
    throw "Auth secret looks too short: $secretPath"
}

$modelKey = ([string]$env:POC3_MODEL_API_KEY).Trim()
if ($modelKey.Length -eq 0) {
    $modelKeyPath = Join-Path $root $ModelKeyFile
    if (-not (Test-Path $modelKeyPath)) {
        throw "Model API key not found: set POC3_MODEL_API_KEY or create $ModelKeyFile (the coach gateway needs it)."
    }
    $modelKey = (Get-Content -Raw $modelKeyPath).Trim()
}
if ($modelKey.Length -lt 8) {
    throw "Model API key looks too short: $ModelKeyFile"
}

$dbPath = $Database -replace '^sqlite:', ''
if (-not (Test-Path (Join-Path $root $dbPath))) {
    throw "Database not found: $dbPath"
}

$ports = @($WebPort, $GatewayPort)
$outLog = Join-Path $root 'data/poc3-live.out.log'
$errLog = Join-Path $root 'data/poc3-live.err.log'
$deployLog = Join-Path $root 'data/poc3-deploy.log'
$pidFile = Join-Path $root 'data/poc3-live.pid'

function Get-ListeningProcessIds {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction SilentlyContinue
    if ($null -eq $connections) { return @() }
    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}

# A live process counts as ours when its command line names this app, or — when the command line cannot be read
# (detached launchers such as Task Scheduler query Win32_Process from a context that returns it empty) — when
# the pid recorded at the last deploy sits in its ancestry. Anything else is refused.
function Test-IsThisApp {
    param([int]$ProcessId)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $false }
    $commandLine = [string]$process.CommandLine
    if ($commandLine -match 'src[\\/]index\.ts') { return $true }
    $recorded = 0
    if (Test-Path $pidFile) {
        $raw = (Get-Content -Raw $pidFile -ErrorAction SilentlyContinue)
        if ($raw) { [int]::TryParse($raw.Trim(), [ref]$recorded) | Out-Null }
    }
    if ($recorded -le 0) { return $false }
    $cursor = $process
    for ($depth = 0; $depth -lt 12 -and $null -ne $cursor; $depth++) {
        if ([int]$cursor.ProcessId -eq $recorded) { return $true }
        $parentId = [int]$cursor.ParentProcessId
        if ($parentId -le 0) { break }
        $cursor = Get-CimInstance Win32_Process -Filter "ProcessId = $parentId" -ErrorAction SilentlyContinue
    }
    return $false
}

$oldIds = @(Get-ListeningProcessIds)
foreach ($processId in $oldIds) {
    if (-not (Test-IsThisApp $processId)) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
        $commandLine = [string]$process.CommandLine
        throw "Port $WebPort/$GatewayPort is held by an unrelated process $processId ($commandLine); refusing to stop it."
    }
    Write-Host "Stopping old POC3 process $processId..."
    & taskkill.exe /PID $processId /T /F | Out-Null
}

$deadline = (Get-Date).AddSeconds(20)
while ((Get-ListeningProcessIds).Count -gt 0 -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
}
if ((Get-ListeningProcessIds).Count -gt 0) {
    throw "Ports $WebPort/$GatewayPort are still held after stopping the old process."
}

Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue

$env:POC3_AUTH_SECRET = $secret
$env:POC3_DB = $Database
$env:POC3_GATEWAY_PORT = [string]$GatewayPort
$env:POC3_GATEWAY_URL = "http://127.0.0.1:$GatewayPort"
$env:POC3_WEB_PORT = [string]$WebPort
$env:POC3_MODEL_BASE_URL = $ModelBaseUrl
$env:POC3_MODEL_API_KEY = $modelKey
$env:POC3_MODEL_NAME = $ModelName
$env:POC3_MAX_ATTEMPTS = [string]$MaxAttempts

$startedAt = Get-Date
$process = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/d', '/s', '/c', 'pnpm.cmd dev' `
    -WorkingDirectory $root `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

$process.Id | Set-Content -Path $pidFile -Encoding ASCII
Add-Content -Path $deployLog -Value ("{0} deploy web={1} gateway={2} db={3} pid={4} modelKey=set" -f `
    $startedAt.ToString('o'), $WebPort, $GatewayPort, $Database, $process.Id)

function Wait-HttpOk([string]$url, [int]$timeoutSeconds) {
    $end = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $end) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                return $response
            }
        } catch {
            # The server is still starting; retry until the deadline.
        }
        Start-Sleep -Milliseconds 300
    }
    throw "Timed out waiting for $url"
}

try {
    $gateway = Wait-HttpOk "http://127.0.0.1:$GatewayPort/health" $TimeoutSeconds
    $login = Wait-HttpOk "http://127.0.0.1:$WebPort/login" $TimeoutSeconds
    $css = Wait-HttpOk "http://127.0.0.1:$WebPort/static/app.css" $TimeoutSeconds

    $cssText = [string]$css.Content
    if ($cssText -notmatch '\.cal-pill\.record' -or $cssText -notmatch '\.cal-meta' -or $cssText -notmatch '\.cal-pair-run' -or $cssText -notmatch '\.peek-program') {
        throw 'The deployed stylesheet does not contain the calendar item row styles or the integrated program section.'
    }
    if ($cssText -notmatch '\.state-card' -or $cssText -notmatch '\.state-form' -or $cssText -notmatch '\.state-refresh') {
        throw 'The deployed stylesheet does not contain the coaching-state styles.'
    }
    if ($cssText -notmatch '\.account-menu' -or $cssText -notmatch '\.account-item') {
        throw 'The deployed stylesheet does not contain the account-menu styles.'
    }
    if ($cssText -notmatch '\.muscle-plugin-tabs' -or $cssText -notmatch '\.muscle-viewer\.compact' -or $cssText -notmatch '\.muscle-editor') {
        throw 'The deployed stylesheet does not contain the muscle plugin styles.'
    }
    if ($cssText -notmatch '\.coach-dock' -or $cssText -notmatch '\.coach-tabs' -or $cssText -notmatch 'body\.coach-open') {
        throw 'The deployed stylesheet does not contain the coach dock and tab styles.'
    }
    $loginText = [string]$login.Content
    if ($loginText -notmatch 'app\.css\?v=26') {
        throw 'The deployed login page does not reference app.css?v=26.'
    }

    $gatewayText = [string]$gateway.Content
    Write-Host "Deploy OK: gateway $($gateway.StatusCode) ($gatewayText), calendar $($login.StatusCode), pid $($process.Id)."
    Write-Host "  http://127.0.0.1:$WebPort/login"
    Write-Host "  http://127.0.0.1:$GatewayPort/health"
    Write-Host "  logs: data/poc3-live.out.log, data/poc3-live.err.log"
    exit 0
} catch {
    Write-Host "Deploy FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '--- data/poc3-live.err.log ---'
    if (Test-Path $errLog) { Get-Content $errLog -Tail 40 }
    Write-Host '--- data/poc3-live.out.log ---'
    if (Test-Path $outLog) { Get-Content $outLog -Tail 40 }
    exit 1
}

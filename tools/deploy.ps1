# Deploy the live Milebook calendar + gateway on Windows.
#
# Stops the process that currently owns the web/gateway ports, starts `pnpm dev` with the live environment, and waits
# for both HTTP surfaces. The auth secret, model API key and SQLite file are read from the repository's data directory;
# the script refuses to stop a process that does not look like this app. On the first deploy after the POC3 -> Milebook
# rename, legacy poc3-* data files are moved to their milebook-* names once the old process has released them.
param(
    [int]$WebPort = 8093,
    [int]$GatewayPort = 8092,
    [string]$Database = 'sqlite:data/milebook-auth.sqlite',
    [string]$SecretFile = 'data/milebook-auth.secret',
    [string]$ModelKeyFile = 'data/milebook-model.secret',
    [string]$ModelBaseUrl = 'http://192.168.1.202:8102/v1',
    [string]$ModelName = 'dgx/general',
    [int]$MaxAttempts = 2,
    [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Legacy renames, applied only when the destination is absent: legacy source => new destination.
$renames = @{}

$secretPath = Join-Path $root $SecretFile
$secretLegacy = Join-Path $root 'data/poc3-auth.secret'
if (-not (Test-Path $secretPath)) {
    if (-not (Test-Path $secretLegacy)) {
        throw "Auth secret not found: $secretPath (legacy $secretLegacy)"
    }
    $renames[$secretLegacy] = $secretPath
}
$secretSource = if (Test-Path $secretPath) { $secretPath } else { $secretLegacy }
$secret = (Get-Content -Raw $secretSource).Trim()
if ($secret.Length -lt 16) {
    throw "Auth secret looks too short: $secretSource"
}

$modelKey = ([string]$env:MILEBOOK_MODEL_API_KEY).Trim()
if ($modelKey.Length -eq 0) {
    $modelKeyPath = Join-Path $root $ModelKeyFile
    $modelKeyLegacy = Join-Path $root 'data/poc3-model.secret'
    if (-not (Test-Path $modelKeyPath)) {
        if (-not (Test-Path $modelKeyLegacy)) {
            throw "Model API key not found: set MILEBOOK_MODEL_API_KEY or create $ModelKeyFile (the coach gateway needs it)."
        }
        $renames[$modelKeyLegacy] = $modelKeyPath
        $modelKey = (Get-Content -Raw $modelKeyLegacy).Trim()
    } else {
        $modelKey = (Get-Content -Raw $modelKeyPath).Trim()
    }
}
if ($modelKey.Length -lt 8) {
    throw "Model API key looks too short: $ModelKeyFile"
}

$dbPath = $Database -replace '^sqlite:', ''
$dbFile = Join-Path $root $dbPath
if (-not (Test-Path $dbFile)) {
    $dbLegacy = Join-Path $root 'data/poc3-auth.sqlite'
    if (-not (Test-Path $dbLegacy)) {
        throw "Database not found: $dbPath"
    }
    $renames[$dbLegacy] = $dbFile
}

$ports = @($WebPort, $GatewayPort)
$outLog = Join-Path $root 'data/milebook-live.out.log'
$errLog = Join-Path $root 'data/milebook-live.err.log'
$deployLog = Join-Path $root 'data/milebook-deploy.log'
$pidFile = Join-Path $root 'data/milebook-live.pid'

function Get-ListeningProcessIds {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction SilentlyContinue
    if ($null -eq $connections) { return @() }
    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}

# A live process counts as ours when its command line names this app, or — when the command line cannot be read
# (detached launchers such as Task Scheduler query Win32_Process from a context that returns it empty) — when
# the pid recorded at the last deploy sits in its ancestry. The legacy poc3-live.pid is also consulted, so the
# first fully-rebranded deploy can still recognize a process recorded under the old name. Anything else is refused.
function Test-IsThisApp {
    param([int]$ProcessId)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $false }
    $commandLine = [string]$process.CommandLine
    if ($commandLine -match 'src[\\/]index\.ts') { return $true }
    $recorded = 0
    foreach ($pidCandidate in @($pidFile, (Join-Path $root 'data/poc3-live.pid'))) {
        if (-not (Test-Path $pidCandidate)) { continue }
        $raw = (Get-Content -Raw $pidCandidate -ErrorAction SilentlyContinue)
        if ($raw) { [int]::TryParse($raw.Trim(), [ref]$recorded) | Out-Null }
        if ($recorded -gt 0) { break }
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
    Write-Host "Stopping old Milebook process $processId..."
    & taskkill.exe /PID $processId /T /F | Out-Null
}

$deadline = (Get-Date).AddSeconds(20)
while ((Get-ListeningProcessIds).Count -gt 0 -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
}
if ((Get-ListeningProcessIds).Count -gt 0) {
    throw "Ports $WebPort/$GatewayPort are still held after stopping the old process."
}

# The old process has released the SQLite file: move the legacy data files into their milebook names.
foreach ($source in @($renames.Keys)) {
    $target = $renames[$source]
    if ((Test-Path $source) -and -not (Test-Path $target)) {
        Move-Item -LiteralPath $source -Destination $target
        Write-Host "Renamed legacy $source -> $target"
    }
}
if (-not (Test-Path $secretPath)) { throw "Auth secret not found: $secretPath (after legacy rename)" }
if (-not (Test-Path $dbFile)) { throw "Database not found: $dbPath (after legacy rename)" }

Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue

$env:MILEBOOK_AUTH_SECRET = $secret
$env:MILEBOOK_DB = $Database
$env:MILEBOOK_GATEWAY_PORT = [string]$GatewayPort
$env:MILEBOOK_GATEWAY_URL = "http://127.0.0.1:$GatewayPort"
$env:MILEBOOK_WEB_PORT = [string]$WebPort
$env:MILEBOOK_MODEL_BASE_URL = $ModelBaseUrl
$env:MILEBOOK_MODEL_API_KEY = $modelKey
$env:MILEBOOK_MODEL_NAME = $ModelName
$env:MILEBOOK_MAX_ATTEMPTS = [string]$MaxAttempts

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
    if ($cssText -notmatch '\.seg-tabs' -or $cssText -notmatch '\.seg-panel' -or $cssText -notmatch '\.activity-columns' -or $cssText -notmatch '\.muscle-layout' -or $cssText -notmatch '\.history-load-chip' -or $cssText -notmatch 'body\.coach-open \.activity-columns') {
        throw 'The deployed stylesheet does not contain the pass-2/P1 page regroup styles.'
    }
    if ($cssText -notmatch '\.cal-key' -or $cssText -notmatch '\.entry-context' -or $cssText -notmatch '\.calendar-head') {
        throw 'The deployed stylesheet does not contain the entry-page key, context and header styles.'
    }
    $loginText = [string]$login.Content
    if ($loginText -notmatch 'app\.css\?v=29') {
        throw 'The deployed login page does not reference app.css?v=29.'
    }
    if ($loginText -notmatch 'Milebook') {
        throw 'The deployed login page does not carry the Milebook brand.'
    }

    $gatewayText = [string]$gateway.Content
    Write-Host "Deploy OK: gateway $($gateway.StatusCode) ($gatewayText), calendar $($login.StatusCode), pid $($process.Id)."
    Write-Host "  http://127.0.0.1:$WebPort/login"
    Write-Host "  http://127.0.0.1:$GatewayPort/health"
    Write-Host "  logs: data/milebook-live.out.log, data/milebook-live.err.log"
    exit 0
} catch {
    Write-Host "Deploy FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '--- data/milebook-live.err.log ---'
    if (Test-Path $errLog) { Get-Content $errLog -Tail 40 }
    Write-Host '--- data/milebook-live.out.log ---'
    if (Test-Path $outLog) { Get-Content $outLog -Tail 40 }
    exit 1
}

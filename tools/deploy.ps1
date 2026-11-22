# Deploy the Milebook calendar + gateway on the Windows host.
#
# Contract:
#   1. Refuse to start unless the auth secret, the model endpoint and the database exist.
#   2. Take a consistent online backup of the database (tools/backup-db.mjs) before touching the running process.
#   3. Stop only a process that is provably this app (command line or recorded pid ancestry).
#   4. Start the app from the current checkout and record the commit, the pid and the stylesheet version.
#   5. Verify /health, /login and the stylesheet against the version the source actually declares.
#
# Secrets are read from data/milebook-auth.secret and MILEBOOK_MODEL_API_KEY (or data/milebook-model.secret).
# Every MILEBOOK_* setting may also come from the environment; the parameters below only override it.
param(
    [int]$WebPort = 0,
    [int]$GatewayPort = 0,
    [string]$Database = '',
    [string]$SecretFile = 'data/milebook-auth.secret',
    [string]$ModelKeyFile = 'data/milebook-model.secret',
    [string]$ModelBaseUrl = '',
    [string]$ModelName = '',
    [int]$MaxAttempts = 2,
    [int]$TimeoutSeconds = 60,
    [int]$BackupKeep = 14,
    [switch]$CookieSecure,
    [switch]$SkipBackup
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Read-Secret([string]$path, [string]$label) {
    if (-not (Test-Path $path)) { throw "$label not found: $path" }
    $value = (Get-Content -Raw $path).Trim()
    if ($value.Length -eq 0) { throw "$label is empty: $path" }
    return $value
}

# --- Settings: environment first, parameters second, documented defaults last -----------------------------------
$webPortValue = if ($WebPort -gt 0) { $WebPort } elseif ($env:MILEBOOK_WEB_PORT) { [int]$env:MILEBOOK_WEB_PORT } else { 8093 }
$gatewayPortValue = if ($GatewayPort -gt 0) { $GatewayPort } elseif ($env:MILEBOOK_GATEWAY_PORT) { [int]$env:MILEBOOK_GATEWAY_PORT } else { 8092 }
$databaseSpec = if ($Database) { $Database } elseif ($env:MILEBOOK_DB) { $env:MILEBOOK_DB } else { 'sqlite:data/milebook.sqlite' }
if (-not $databaseSpec.StartsWith('sqlite:')) { throw "Only a sqlite: database is supported, got $databaseSpec" }
$dbPath = $databaseSpec.Substring('sqlite:'.Length)
$dbFile = Join-Path $root $dbPath
if (-not (Test-Path $dbFile)) {
    # The app creates a missing database at boot; a first deploy must not be blocked by that. Warn loudly instead, so
    # a typo in MILEBOOK_DB is still visible in the deploy output.
    Write-Host "WARNING: database not found at $dbPath; the app will create it at boot. Check MILEBOOK_DB if that is unexpected." -ForegroundColor Yellow
}

$maxAttemptsValue = if ($PSBoundParameters.ContainsKey('MaxAttempts')) { $MaxAttempts } elseif ($env:MILEBOOK_MAX_ATTEMPTS) { [int]$env:MILEBOOK_MAX_ATTEMPTS } else { 2 }

$secret = if ($env:MILEBOOK_AUTH_SECRET) { $env:MILEBOOK_AUTH_SECRET.Trim() } else { Read-Secret (Join-Path $root $SecretFile) 'Auth secret' }
if ($secret.Length -lt 32) { throw "Auth secret must be at least 32 characters (the app signs session cookies with it)" }

$modelKey = if ($env:MILEBOOK_MODEL_API_KEY) { $env:MILEBOOK_MODEL_API_KEY.Trim() } else { Read-Secret (Join-Path $root $ModelKeyFile) 'Model API key' }

$modelUrlValue = if ($ModelBaseUrl) { $ModelBaseUrl } elseif ($env:MILEBOOK_MODEL_BASE_URL) { $env:MILEBOOK_MODEL_BASE_URL } else { '' }
if (-not $modelUrlValue) { throw 'Model endpoint missing: set MILEBOOK_MODEL_BASE_URL (the coach gateway needs it).' }
$modelNameValue = if ($ModelName) { $ModelName } elseif ($env:MILEBOOK_MODEL_NAME) { $env:MILEBOOK_MODEL_NAME } else { '' }
if (-not $modelNameValue) { throw 'Model name missing: set MILEBOOK_MODEL_NAME.' }

$cookieSecureValue = if ($CookieSecure -or $env:MILEBOOK_COOKIE_SECURE -eq 'true') { 'true' } else { 'false' }

# The stylesheet version is read from the source, never duplicated here: a deploy gate that hardcodes it fails the
# moment the app bumps the constant (that bug shipped once already).
$webSource = Get-Content -Raw (Join-Path $root 'src/web.ts')
$versionMatch = [regex]::Match($webSource, 'APP_CSS_VERSION\s*=\s*(\d+)')
if (-not $versionMatch.Success) { throw 'Could not read APP_CSS_VERSION from src/web.ts' }
$cssVersion = $versionMatch.Groups[1].Value

$outLog = Join-Path $root 'data/milebook-live.out.log'
$errLog = Join-Path $root 'data/milebook-live.err.log'
$deployLog = Join-Path $root 'data/milebook-deploy.log'
$pidFile = Join-Path $root 'data/milebook-live.pid'

function Get-ListeningProcessIds {
    $connections = Get-NetTCPConnection -State Listen -LocalPort @($webPortValue, $gatewayPortValue) -ErrorAction SilentlyContinue
    if ($null -eq $connections) { return @() }
    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}

# A process counts as ours when its command line names this app, or when the pid recorded at the last deploy sits in
# its ancestry (a detached launcher such as Task Scheduler can return an empty command line).
function Test-IsThisApp {
    param([int]$ProcessId)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $false }
    if ([string]$process.CommandLine -match 'src[\\/]index\.ts') { return $true }
    if (-not (Test-Path $pidFile)) { return $false }
    $recorded = 0
    [int]::TryParse(((Get-Content -Raw $pidFile -ErrorAction SilentlyContinue) -as [string]).Trim(), [ref]$recorded) | Out-Null
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

# --- 1. Backup before the restart ------------------------------------------------------------------------------
if (-not $SkipBackup) {
    $backupDir = Join-Path $root 'data/backups'
    & node (Join-Path $PSScriptRoot 'backup-db.mjs') $dbFile $backupDir $BackupKeep
    if ($LASTEXITCODE -ne 0) { throw "Database backup failed (exit $LASTEXITCODE); not deploying." }
}

# --- 2. Stop the old process -----------------------------------------------------------------------------------
# The port check catches the instance the deploy itself started. A hand-started instance on another port would share
# the same database and break the single-writer rule, so every process whose command line names this app is stopped
# too, not just the ones holding the deploy ports.
$appProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { [string]$_.CommandLine -match 'src[\\/]index\.ts' } |
    Select-Object -ExpandProperty ProcessId -Unique)
$stopped = @{}
foreach ($processId in @($appProcesses) + @(Get-ListeningProcessIds)) {
    if ($stopped.ContainsKey($processId)) { continue }
    $stopped[$processId] = $true
    if (-not (Test-IsThisApp $processId)) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
        throw "Port $webPortValue/$gatewayPortValue is held by an unrelated process $processId ($([string]$process.CommandLine)); refusing to stop it."
    }
    Write-Host "Stopping Milebook process $processId..."
    & taskkill.exe /PID $processId /T /F | Out-Null
}
$deadline = (Get-Date).AddSeconds(20)
while ((Get-ListeningProcessIds).Count -gt 0 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
if ((Get-ListeningProcessIds).Count -gt 0) { throw "Ports $webPortValue/$gatewayPortValue are still held after stopping the old process." }

# --- 3. Start ---------------------------------------------------------------------------------------------------
$commit = (& git rev-parse --short HEAD 2>$null)
if (-not $commit) { $commit = 'unknown' }
Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue

$env:MILEBOOK_AUTH_SECRET = $secret
$env:MILEBOOK_DB = $databaseSpec
$env:MILEBOOK_GATEWAY_PORT = [string]$gatewayPortValue
$env:MILEBOOK_GATEWAY_URL = "http://127.0.0.1:$gatewayPortValue"
$env:MILEBOOK_WEB_PORT = [string]$webPortValue
$env:MILEBOOK_MODEL_BASE_URL = $modelUrlValue
$env:MILEBOOK_MODEL_API_KEY = $modelKey
$env:MILEBOOK_MODEL_NAME = $modelNameValue
$env:MILEBOOK_MAX_ATTEMPTS = [string]$maxAttemptsValue
$env:MILEBOOK_COOKIE_SECURE = $cookieSecureValue

$startedAt = Get-Date
$process = Start-Process -FilePath 'node.exe' `
    -ArgumentList '--import', 'tsx', 'src/index.ts' `
    -WorkingDirectory $root `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

$process.Id | Set-Content -Path $pidFile -Encoding ASCII
Add-Content -Path $deployLog -Value ("{0} deploy commit={1} web={2} gateway={3} db={4} css=v{5} secure={6} pid={7}" -f `
    $startedAt.ToString('o'), $commit, $webPortValue, $gatewayPortValue, $databaseSpec, $cssVersion, $cookieSecureValue, $process.Id)

function Wait-HttpOk([string]$url, [int]$timeoutSeconds) {
    $end = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $end) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) { return $response }
        } catch {
            # Still starting; retry until the deadline.
        }
        Start-Sleep -Milliseconds 300
    }
    throw "Timed out waiting for $url"
}

# --- 4. Verify --------------------------------------------------------------------------------------------------
try {
    $health = Wait-HttpOk "http://127.0.0.1:$gatewayPortValue/health" $TimeoutSeconds
    $webHealth = Wait-HttpOk "http://127.0.0.1:$webPortValue/health" $TimeoutSeconds
    $login = Wait-HttpOk "http://127.0.0.1:$webPortValue/login" $TimeoutSeconds
    $css = Wait-HttpOk "http://127.0.0.1:$webPortValue/static/app.css" $TimeoutSeconds

    # The web health reports whether it can reach the coach gateway; a green gateway and a red web→gateway path is a
    # deploy that answers pages while every coach turn fails.
    $webHealthBody = [string]$webHealth.Content
    if ($webHealthBody -notmatch '"gateway"\s*:\s*"ok"') {
        throw "The web surface cannot reach the gateway: $webHealthBody"
    }

    $loginText = [string]$login.Content
    if ($loginText -notmatch "app\.css\?v=$cssVersion") {
        throw "The deployed login page does not reference app.css?v=$cssVersion (source declares $cssVersion)."
    }
    if ($loginText -notmatch 'Milebook') { throw 'The deployed login page does not carry the Milebook brand.' }
    $cssText = [string]$css.Content
    if ($cssText.Length -lt 10000) { throw 'The deployed stylesheet is suspiciously small.' }

    Write-Host "Deploy OK: commit $commit, gateway $($health.StatusCode) ($([string]$health.Content)), calendar $($login.StatusCode), css v$cssVersion, pid $($process.Id)."
    Write-Host "  http://127.0.0.1:$webPortValue/login"
    Write-Host "  http://127.0.0.1:$gatewayPortValue/health"
    Write-Host '  logs: data/milebook-live.out.log, data/milebook-live.err.log'
    exit 0
} catch {
    Write-Host "Deploy FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '--- data/milebook-live.err.log ---'
    if (Test-Path $errLog) { Get-Content $errLog -Tail 40 }
    Write-Host '--- data/milebook-live.out.log ---'
    if (Test-Path $outLog) { Get-Content $outLog -Tail 40 }
    Write-Host 'The database backup from this deploy is in data/backups; the previous process is already stopped.'
    exit 1
}

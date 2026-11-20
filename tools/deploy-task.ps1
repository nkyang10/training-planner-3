# Task Scheduler entry point for the live deploy.
#
# The scheduled task runs this wrapper instead of tools/deploy.ps1 directly: it starts the deploy as a child
# powershell with its console captured to data/milebook-deploy-task.log / .err.log (so a refusal to continue is
# readable), waits for it, and propagates its exit code. The live app itself is started by deploy.ps1's own
# Start-Process, so its process tree belongs to Task Scheduler and survives whichever shell launched the deploy.
$deployRoot = Split-Path -Parent $PSScriptRoot
$deploy = Join-Path $PSScriptRoot "deploy.ps1"
$outLog = Join-Path $deployRoot "data\milebook-deploy-task.log"
$errLog = Join-Path $deployRoot "data\milebook-deploy-task.err.log"
$child = Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $deploy `
    -WorkingDirectory $deployRoot `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru
$child.WaitForExit()
exit $child.ExitCode

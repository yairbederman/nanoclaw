# run-beedo.ps1 — Waits for Docker, then runs NanoClaw (Beedo).
# Never gives up: infinite retry with exponential backoff.
# Sends WhatsApp notification after repeated fast failures.

Set-Location "C:\Users\YAIR\nanoclaw"

# Start Docker Desktop if not already running
$dockerProc = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $dockerProc) {
    Write-Host "[run-beedo] Docker not running, launching Docker Desktop..."
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
}

# Wait for Docker Desktop to be ready
Write-Host "[run-beedo] Waiting for Docker..."
while ($true) {
    $result = & docker info 2>&1
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 5
}
Write-Host "[run-beedo] Docker ready."

$env:NODE_ENV = "production"
# Docker credential helper fails in non-interactive Windows sessions (Session 0).
# Use a clean config with explicit anonymous auth for public registries.
$env:DOCKER_CONFIG = "C:\temp\dockercfg"
if (-not (Test-Path $env:DOCKER_CONFIG)) {
    New-Item -ItemType Directory -Path $env:DOCKER_CONFIG -Force | Out-Null
    [System.IO.File]::WriteAllText("$env:DOCKER_CONFIG\config.json", '{"auths":{"https://index.docker.io/v1/":{},"ghcr.io":{}}}', [System.Text.UTF8Encoding]::new($false))
}
$backoff = 10
$maxBackoff = 300
$consecutiveQuickFailures = 0
$notificationSent = $false
$attempt = 0

while ($true) {
    $attempt++
    Write-Host "[run-beedo] Starting Beedo (attempt $attempt, backoff ${backoff}s)..."

    # Rotate logs if over 50MB
    $logFile = "C:\Users\YAIR\nanoclaw\logs\nanoclaw.log"
    $errLogFile = "C:\Users\YAIR\nanoclaw\logs\nanoclaw.error.log"
    if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 50MB)) {
        Move-Item $logFile "$logFile.old" -Force
    }
    if ((Test-Path $errLogFile) -and ((Get-Item $errLogFile).Length -gt 50MB)) {
        Move-Item $errLogFile "$errLogFile.old" -Force
    }

    $startTime = Get-Date

    # Use cmd /c for redirect — PowerShell >> writes UTF-16LE, cmd >> preserves UTF-8
    cmd /c "`"C:\Program Files\nodejs\node.exe`" `"C:\Users\YAIR\nanoclaw\dist\index.js`" >> `"C:\Users\YAIR\nanoclaw\logs\nanoclaw.log`" 2>> `"C:\Users\YAIR\nanoclaw\logs\nanoclaw.error.log`""

    $exitCode = $LASTEXITCODE
    $runDuration = ((Get-Date) - $startTime).TotalSeconds
    Write-Host "[run-beedo] Beedo exited with code $exitCode after $([math]::Round($runDuration))s."

    if ($runDuration -gt 60) {
        # Process ran long enough — it was healthy then crashed. Reset backoff.
        $backoff = 10
        $consecutiveQuickFailures = 0
        $notificationSent = $false
    } else {
        # Quick failure — likely startup issue. Increase backoff.
        $consecutiveQuickFailures++
        $backoff = [Math]::Min($backoff * 2, $maxBackoff)
    }

    if ($consecutiveQuickFailures -ge 5 -and -not $notificationSent) {
        Write-Host "[run-beedo] $consecutiveQuickFailures consecutive quick failures. Sending notification..."
        $msg = "Beedo is struggling. $consecutiveQuickFailures consecutive startup failures (exit code $exitCode). Still retrying."
        cmd /c "`"C:\Program Files\nodejs\node.exe`" `"C:\Users\YAIR\nanoclaw\notify-whatsapp.mjs`" `"$msg`" >> `"C:\Users\YAIR\nanoclaw\logs\nanoclaw.log`" 2>> `"C:\Users\YAIR\nanoclaw\logs\nanoclaw.error.log`""
        $notificationSent = $true
    }

    Write-Host "[run-beedo] Retrying in ${backoff}s..."
    Start-Sleep -Seconds $backoff
}

# register-task.ps1 — Register NanoClaw as a boot-time scheduled task.
# Right-click -> "Run with PowerShell" as Administrator.

$taskName = "Beedo (NanoClaw)"
$xmlPath  = "C:\Users\YAIR\nanoclaw\nanoclaw-task.xml"

# Remove existing task if present
schtasks /delete /tn $taskName /f 2>$null

# Register — will prompt for Windows password
schtasks /create /tn $taskName /xml $xmlPath /ru YAIR

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[OK] Task '$taskName' registered. NanoClaw will start automatically at boot." -ForegroundColor Green
} else {
    Write-Host "`n[FAIL] Registration failed. Make sure you're running as Administrator." -ForegroundColor Red
}

Read-Host "`nPress Enter to close"

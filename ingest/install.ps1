# Installs (or updates) botlocker-ingest, which sends your Deadlock match salts to BotLocker and deadlock-api.com
#   irm https://github.com/TangerieOrg/BotLocker/releases/latest/download/install.ps1 | iex
# Uninstall:
#   & ([scriptblock]::Create((irm https://github.com/TangerieOrg/BotLocker/releases/latest/download/install.ps1))) -Uninstall
param([switch]$Uninstall)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$AppName = "botlocker-ingest"
$Repo = "TangerieOrg/BotLocker"
$InstallDir = "$env:LOCALAPPDATA\$AppName"
$ExePath = "$InstallDir\$AppName.exe"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

function Remove-Existing {
    $task = Get-ScheduledTask -TaskName $AppName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $AppName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $AppName -Confirm:$false -ErrorAction SilentlyContinue
    }
    Remove-ItemProperty -Path $RunKey -Name $AppName -ErrorAction SilentlyContinue
    Stop-Process -Name $AppName -Force -ErrorAction SilentlyContinue
    # Give Windows a moment to release the exe
    Start-Sleep -Seconds 1
}

if ($Uninstall) {
    Remove-Existing
    Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Uninstalled $AppName" -ForegroundColor Green
    return
}

Write-Host "Installing $AppName..." -ForegroundColor Cyan

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = $AppName }
$asset = $release.assets | Where-Object { $_.name -eq "$AppName.exe" } | Select-Object -First 1
if (-not $asset) { throw "No $AppName.exe in the latest release ($($release.tag_name))" }

Remove-Existing
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

Write-Host "Downloading $($release.tag_name) ($([math]::Round($asset.size / 1MB))MB)..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $ExePath -UseBasicParsing
if ((Get-Item $ExePath).Length -ne $asset.size) {
    Remove-Item $ExePath -Force
    throw "Download was incomplete, try again"
}
Unblock-File -Path $ExePath

# Logon task for just this user, it restarts the watcher if it ever crashes
try {
    $action = New-ScheduledTaskAction -Execute $ExePath -WorkingDirectory $InstallDir
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit 0 `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -RestartCount 5 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -Hidden
    Register-ScheduledTask -TaskName $AppName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
        -Description "Sends Deadlock match salts from the Steam cache to BotLocker and deadlock-api.com" | Out-Null
    Start-ScheduledTask -TaskName $AppName
    Write-Host "Registered scheduled task '$AppName' (runs at logon)"
} catch {
    # Some machines don't let non-admins register tasks, a Run key does the same job
    Write-Host "Couldn't register a scheduled task ($($_.Exception.Message)), using a startup entry instead" -ForegroundColor Yellow
    Set-ItemProperty -Path $RunKey -Name $AppName -Value "`"$ExePath`""
    Start-Process -FilePath $ExePath -WorkingDirectory $InstallDir
}

Write-Host "Installed $AppName $($release.tag_name), it's running now and will start with Windows" -ForegroundColor Green
Write-Host "Log: $InstallDir\ingest.log"

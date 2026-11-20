Add-Type -AssemblyName System.Windows.Forms

$ServerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ServerDir
$TrayPidFile = Join-Path $ServerDir "tray.pid"
$TrayScript = Join-Path $ServerDir "tray.ps1"

$isRunning = $false
if (Test-Path $TrayPidFile) {
  $tid = [int](Get-Content $TrayPidFile -ErrorAction SilentlyContinue)
  if ($tid -and (Get-Process -Id $tid -ErrorAction SilentlyContinue)) { $isRunning = $true }
}

if ($isRunning) {
  try {
    $ev = [System.Threading.EventWaitHandle]::OpenExisting("Local\CoilballServerAppShow")
    $ev.Set() | Out-Null
    $ev.Dispose()
  } catch {}
} else {
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$TrayScript`"" -WorkingDirectory $RootDir -WindowStyle Hidden
}

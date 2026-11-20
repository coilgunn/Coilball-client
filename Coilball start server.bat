@echo off
cd /d "%~dp0"
start "" /min powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0server\launcher.ps1"
exit /b 0

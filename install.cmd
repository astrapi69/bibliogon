@echo off
REM Bibliogon Windows double-click wrapper.
REM Invokes install.ps1 via PowerShell with -ExecutionPolicy Bypass
REM so corporate Windows with Group-Policy-locked ExecutionPolicy
REM still runs the installer. The user does NOT need to run
REM Set-ExecutionPolicy themselves.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*

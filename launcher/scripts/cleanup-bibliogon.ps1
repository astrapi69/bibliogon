<#
.SYNOPSIS
    Standalone Bibliogon teardown for Windows.

.DESCRIPTION
    Mirrors the launcher's reusable uninstall
    (bibliogon_launcher.cleanup.uninstall_bibliogon) but works even when
    the Python launcher is not installed. Stops and removes the Bibliogon
    Docker stack, removes its images, deletes its data volumes (with
    confirmation), and removes the per-user config directories and
    desktop shortcuts.

.PARAMETER Port
    Optional port (default 7880) used only for the final free-port
    report so you can confirm nothing is still listening.

.EXAMPLE
    .\cleanup-bibliogon.ps1
    .\cleanup-bibliogon.ps1 -Port 7900
#>

param(
    [int]$Port = 7880
)

$ErrorActionPreference = "Continue"
$Project = "bibliogon"

function Test-Docker {
    return [bool](Get-Command docker -ErrorAction SilentlyContinue)
}

Write-Host "Bibliogon cleanup"
Write-Host "================="

if (Test-Docker) {
    Write-Host "Stopping the Bibliogon stack..."
    docker compose -p $Project down 2>$null

    Write-Host "Removing leftover Bibliogon containers..."
    $containers = docker ps -aq --filter "label=com.docker.compose.project=$Project" 2>$null
    if ($containers) { docker rm -f $containers 2>$null | Out-Null }

    Write-Host "Removing Bibliogon images..."
    $images = docker images -q --filter "reference=*bibliogon*" 2>$null
    if ($images) { docker image rm -f $images 2>$null | Out-Null }

    $volumes = docker volume ls -q --filter "name=bibliogon" 2>$null
    if ($volumes) {
        Write-Host ""
        Write-Host "WARNING: the following Docker volumes hold your book data and will be DELETED:"
        $volumes | ForEach-Object { Write-Host "  - $_" }
        $answer = Read-Host "Delete these volumes? [y/N]"
        if ($answer -match '^[yY]') {
            docker volume rm $volumes 2>$null | Out-Null
            Write-Host "Volumes removed."
        } else {
            Write-Host "Kept volumes."
        }
    }
} else {
    Write-Host "Docker not found on PATH; skipping container/image/volume cleanup."
}

Write-Host "Removing per-user config directories..."
$dirs = @(
    (Join-Path $env:USERPROFILE ".bibliogon"),
    (Join-Path $env:APPDATA "bibliogon"),
    (Join-Path $env:APPDATA "Bibliogon")
)
foreach ($dir in $dirs) {
    if (Test-Path $dir) { Remove-Item -Recurse -Force $dir; Write-Host "  removed $dir" }
}

Write-Host "Removing desktop shortcuts..."
$shortcuts = @(
    (Join-Path $env:USERPROFILE "Desktop\Bibliogon.lnk"),
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Bibliogon.lnk")
)
foreach ($shortcut in $shortcuts) {
    if (Test-Path $shortcut) { Remove-Item -Force $shortcut; Write-Host "  removed $shortcut" }
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    Write-Host "Note: port $Port is still in use by another process."
} else {
    Write-Host "Port $Port is free."
}

Write-Host ""
Write-Host "Cleanup complete."

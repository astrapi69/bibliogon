# Bibliogon Windows installer (PowerShell mirror of install.sh).
# Downloads and starts the book authoring platform.
#
# Usage (in PowerShell):
#   irm https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.ps1 | iex
#
# Or download and run, with the install.cmd wrapper if your
# ExecutionPolicy is Restricted (typical for corporate Windows
# locked down by Group Policy):
#   .\install.cmd
#
# This file is generated from install.ps1.template at release time.
# Edit the template, run `make sync-versions`, do not edit install.ps1
# directly.

$ErrorActionPreference = "Stop"

$Version = if ($env:BIBLIOGON_VERSION) { $env:BIBLIOGON_VERSION } else { "v0.44.0" }
$Repo = "astrapi69/bibliogon"
$InstallDir = if ($env:BIBLIOGON_DIR) { $env:BIBLIOGON_DIR } else { Join-Path $HOME "bibliogon" }

Write-Host ""
Write-Host "  Bibliogon $Version" -ForegroundColor Blue
Write-Host "  Open-source book authoring platform"
Write-Host ""

# --- Check Docker ---
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Docker is not installed." -ForegroundColor Red
    Write-Host "Install Docker Desktop: https://docs.docker.com/desktop/install/windows-install/"
    exit 1
}

try { docker info 2>&1 | Out-Null } catch {
    Write-Host "Error: Docker is not running. Start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Docker is not running. Start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}

docker compose version 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Docker Compose is not available." -ForegroundColor Red
    exit 1
}
Write-Host "Docker and Docker Compose found." -ForegroundColor Green

# --- Download ---
# Mirrors install.sh: existing install? back up .env, blow away the dir, re-clone.
$BackupEnv = $null
if (Test-Path (Join-Path $InstallDir ".git")) {
    Write-Host "Bibliogon is already installed in $InstallDir" -ForegroundColor Yellow
    Write-Host "Updating to $Version..."
    $envPath = Join-Path $InstallDir ".env"
    if (Test-Path $envPath) {
        $BackupEnv = [System.IO.Path]::GetTempFileName()
        Copy-Item $envPath $BackupEnv -Force
        Write-Host "Backed up .env configuration." -ForegroundColor Green
    }
    Remove-Item -Recurse -Force $InstallDir
}

Write-Host "Downloading Bibliogon $Version..." -ForegroundColor Blue
if (Get-Command git -ErrorAction SilentlyContinue) {
    git clone --depth 1 --branch $Version "https://github.com/$Repo.git" $InstallDir 2>$null
    if ($LASTEXITCODE -ne 0) {
        git clone --depth 1 "https://github.com/$Repo.git" $InstallDir
    }
} else {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    $TarUrl = "https://github.com/$Repo/archive/refs/tags/$Version.tar.gz"
    $tmp = New-TemporaryFile
    try { Invoke-WebRequest -Uri $TarUrl -OutFile $tmp -ErrorAction Stop } catch {
        $TarUrl = "https://github.com/$Repo/archive/refs/heads/main.tar.gz"
        Invoke-WebRequest -Uri $TarUrl -OutFile $tmp
    }
    tar -xzf $tmp -C $InstallDir --strip-components=1
    Remove-Item $tmp -Force
}

if ($BackupEnv -and (Test-Path $BackupEnv)) {
    Move-Item $BackupEnv (Join-Path $InstallDir ".env") -Force
    Write-Host "Restored .env configuration." -ForegroundColor Green
}

Set-Location $InstallDir

# --- Create .env if missing ---
if (-not (Test-Path ".env")) {
    Write-Host "Creating configuration..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = -join ($bytes | ForEach-Object { "{0:x2}" -f $_ })
    (Get-Content ".env") -replace "change-me-to-a-random-secret", $secret | Set-Content ".env"
    Write-Host "Configuration created." -ForegroundColor Green
}

# --- Read port from .env ---
$port = (Select-String -Path ".env" -Pattern "^BIBLIOGON_PORT=" | Select-Object -First 1).Line -replace "^BIBLIOGON_PORT=", ""
if (-not $port) { $port = "7880" }

# --- Build and start ---
Write-Host ""
Write-Host "Building and starting Bibliogon (this may take a few minutes the first time)..." -ForegroundColor Blue
docker compose -f docker-compose.prod.yml up --build -d

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Bibliogon is running!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Open: http://localhost:$port" -ForegroundColor Blue
Write-Host "  Installed in: $InstallDir"
Write-Host ""
Write-Host "  Stop:      cd `"$InstallDir`" ; docker compose -f docker-compose.prod.yml down" -ForegroundColor Yellow
Write-Host "  Start:     cd `"$InstallDir`" ; docker compose -f docker-compose.prod.yml up -d" -ForegroundColor Yellow
Write-Host "  Uninstall: cd `"$InstallDir`" ; docker compose -f docker-compose.prod.yml down ; cd .. ; Remove-Item -Recurse -Force `"$InstallDir`"" -ForegroundColor Yellow
Write-Host ""

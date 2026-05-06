# Installing Docker Desktop for Bibliogon

Bibliogon runs in Docker, a containerization platform. You need to install Docker Desktop before starting the Bibliogon launcher.

## Why Docker?

Bibliogon's backend is a Python application with several dependencies (database, plugin runtimes, export pipeline). Docker bundles them into a single isolated container so you do not have to install Python, SQLite, Pandoc, or any of these manually. Docker Desktop is maintained by Docker Inc. and is widely used.

## Is Docker safe to install?

Short answer: yes. Docker is well-established software from a known vendor; the only safety rule is to download it from the right place.

- **Docker comes from Docker Inc.** Download only from [docker.com](https://www.docker.com/products/docker-desktop/). Avoid third-party download sites.
- **Established since 2013.** Docker has been around for over a decade, is part of standard developer toolchains, and is used by millions of developers and companies worldwide.
- **The installer is signed.** On Windows and macOS, Docker's installers are signed by Docker Inc.; the operating system verifies the signature before running them, so you know the file is genuine and has not been tampered with.
- **On Windows, Docker Desktop uses WSL 2.** WSL 2 is a Microsoft technology that runs a lightweight Linux kernel; nothing exotic.
- **On macOS, Docker Desktop uses Hypervisor.framework.** That is Apple's built-in virtualization, used by Docker the same way it is used by other developer tools.
- **Telemetry is optional.** Docker Desktop sends some usage statistics by default. You can disable this in **Docker Desktop Settings > General > Send usage statistics**.
- **Bibliogon's own containers are open-source.** Your book data lives in a Docker volume on your computer; nothing is sent anywhere unless you explicitly export or back up.

If you would like to read more, the official [Docker security overview](https://docs.docker.com/security/) covers Docker's own threat model and isolation guarantees.

## Requirements

- Windows 10/11 64-bit, macOS 12 (Monterey) or newer, or a recent Linux distribution
- ~4 GB RAM available
- ~5 GB disk space (Docker itself plus Bibliogon's containers)
- Administrator / sudo access for the install

## Windows

1. Download Docker Desktop from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/).
2. Run the installer. Accept the default settings when prompted; the WSL 2 backend is recommended.
3. Restart the computer if the installer asks you to.
4. Launch Docker Desktop from the Start menu. Wait until the whale icon in the system tray turns from amber to blue (~30-60 seconds).
5. Now you can start the Bibliogon launcher.

If you see "WSL 2 installation is incomplete", open PowerShell as administrator and run `wsl --install`, then restart.

## macOS

1. Download Docker Desktop from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/). Pick the Intel or Apple Silicon variant matching your Mac (in doubt: Apple menu > About This Mac).
2. Open the `.dmg` file and drag Docker into the Applications folder.
3. Launch Docker from Applications. macOS will ask for your password to install helper services.
4. Wait until the whale icon in the menu bar turns from amber to blue (~30-60 seconds).
5. Now you can start the Bibliogon launcher.

## Linux

Docker Desktop is available for Linux, but most Linux users prefer Docker Engine plus Docker Compose installed via the distribution's package manager. For Ubuntu / Debian:

```bash
sudo apt update
sudo apt install docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# Log out and back in for the group change to take effect.
```

For other distributions, see the official [Docker Engine installation guide](https://docs.docker.com/engine/install/).

## Troubleshooting

- **"Docker is not running" after installation.** Launch Docker Desktop manually; it does not auto-start by default on most systems.
- **Container build fails with "no space left on device".** Open Docker Desktop > Settings > Resources > Disk image size. Increase to at least 60 GB if the default is lower.
- **Antivirus warns about the Docker installer.** Verify you downloaded from [docker.com](https://www.docker.com/) (not a clone site) and check the file's digital signature in Properties > Digital Signatures (Windows) before running.

## Next steps

After Docker is installed and running, return to the Bibliogon launcher and click "Got it, continue". Bibliogon detects Docker, downloads itself, and starts.

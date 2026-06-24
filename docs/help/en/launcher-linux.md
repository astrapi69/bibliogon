# Linux Launcher

The Linux launcher is a `bibliogon-launcher-linux` ELF binary that starts Bibliogon with a click: no `docker compose` commands, no terminal session kept open. Docker still runs the actual app; the launcher just starts and stops it for you.

> **What the launcher does for you.** The launcher manages the Docker stack for a copy of the Bibliogon repository that is already on your computer: it builds the images from your local copy and starts and stops the app for you. It does **not** download Bibliogon itself. You need two things on disk first: Docker, and the Bibliogon source (a `git clone` of the repository, or its source ZIP unpacked - the default location is `~/bibliogon`). Docker you install yourself; Docker's licensing terms prohibit silent third-party installation. See the [Installation overview](installation.md) for the cross-platform picture.

## System requirements

- A recent 64-bit Linux distribution (Ubuntu 22.04+, Fedora 38+, Debian 12+, Arch, or equivalent). The binary is built on `ubuntu-22.04`, so glibc 2.35 or newer is required. Older distributions are not supported.
- Docker Engine or Docker Desktop, with your user in the `docker` group.
- The Tk runtime (`python3-tk` on Debian/Ubuntu, `tk` on Arch, `python3-tkinter` on Fedora) if the bundled Tk in the PyInstaller binary complains. Most distributions already have this; reports of missing Tk have not surfaced so far.

## One-time setup

### 1. Install Docker

See the [Bibliogon Docker installation guide](install/docker-desktop.md) for the full picture plus a "Is Docker safe to install?" section. On Linux, two routes are common:

- **Docker Engine** (native, recommended for servers and minimal desktops): [docs.docker.com/engine/install](https://docs.docker.com/engine/install/). After install, add your user to the `docker` group and log out/back in:

  ```bash
  sudo usermod -aG docker "$USER"
  ```

- **Docker Desktop for Linux**: [docs.docker.com/desktop/install/linux-install](https://docs.docker.com/desktop/install/linux-install/). More convenient, but heavier.

Verify Docker is reachable without `sudo`:

```bash
docker info
```

### 2. Download the launcher

From the Bibliogon releases page, download two files attached to the release:

- `bibliogon-launcher-linux`
- `bibliogon-launcher-linux.sha256`

Save them anywhere; `~/Downloads` is fine.

### 3. Verify the download (optional but recommended)

The launcher is not signed. To confirm the binary you downloaded is the exact file published, open a terminal where you saved it and run:

```bash
sha256sum bibliogon-launcher-linux
cat bibliogon-launcher-linux.sha256
```

The hash from `sha256sum` should match the hex string in the `.sha256` file. If it does not, do not run the binary and report it on [GitHub Issues](https://github.com/astrapi69/bibliogon/issues).

### 4. Make the launcher executable

```bash
chmod +x bibliogon-launcher-linux
```

Optionally move it somewhere on your `PATH` (for example `~/bin` or `~/.local/bin`) if you want to call it from any directory.

## First launch

Run the launcher from a terminal:

```bash
./bibliogon-launcher-linux
```

Or, if your desktop environment supports launching executables from a file manager, right-click the file and choose "Run" or "Open" (GNOME Files users: enable "Executable Text Files: Ask what to do" in Preferences).

### What happens on first launch

The launcher's first job is to detect what is already in place.

1. **Docker check.** The launcher confirms Docker is installed and reachable without `sudo`. If Docker is missing, a dialog with the install URL appears and the launcher exits. If Docker is installed but not running (or the user is not yet in the `docker` group), a dialog asks you to start Docker and click Retry; the launcher tries up to three times.
2. **Bibliogon repository check.** The launcher needs your local copy of the Bibliogon repository - the folder that contains `docker-compose.prod.yml`. It looks for it via the `BIBLIOGON_DIR` environment variable, the repo root when you run the launcher from a source checkout, or the default location `~/bibliogon`.
   - **Already built**: if the Bibliogon containers already exist from an earlier run, the launcher proceeds straight to step 3.
   - **Not built yet**: when no containers exist, the launcher window shows an **Install** button. Clicking it builds the Docker images from your local copy (`docker compose build`; the first build takes 3-5 minutes), writes the host port into `.env`, and then starts the stack. If the repository cannot be found, the build fails with "Compose file not found" - place the Bibliogon source at `~/bibliogon`, set `BIBLIOGON_DIR`, or run the launcher from inside the repository folder.
3. **Start.** A small "Starting Bibliogon..." window appears while Docker brings up the containers.
4. **Browser.** When Bibliogon is ready, your default browser opens at `http://localhost:7880` (or whatever port is configured in `.env`).
5. **Status window.** The small window switches to "Bibliogon is running on localhost:7880" with a **Stop Bibliogon** button.

## Stopping Bibliogon

Click **Stop Bibliogon** in the launcher window, or just close it. The launcher runs `docker compose down` and exits. Docker keeps running in the background; only the Bibliogon containers stop.

## Running a second time

Run the launcher again. If Bibliogon is already running (for example because you minimised the launcher window and forgot), the launcher detects the running instance and just opens the browser at the correct URL without starting a second copy.

## Troubleshooting

**"Docker is not running" or "permission denied" on docker.sock**
Check that Docker is reachable without `sudo`:

```bash
docker info
```

If that fails with a permission error, you are not in the `docker` group yet. After `sudo usermod -aG docker "$USER"` you have to log out of your session completely (not just close the terminal) and log back in. On Wayland, a full reboot is sometimes the only way to get the group change picked up.

**"Bibliogon install not found"**
The launcher cannot find `docker-compose.prod.yml` at the default or configured path. Click OK, then pick the folder where you cloned or unzipped Bibliogon. That folder typically contains `README.md`, `Makefile`, and the `docker-compose.prod.yml` file.

**"Port 7880 is in use"**
Another program is already using the Bibliogon port. Options: stop the other program, or edit `.env` in your Bibliogon folder and set `BIBLIOGON_PORT` to a different value (for example `7881`), then start the launcher again.

**"Bibliogon did not start in time"**
The first start of a fresh install needs to build Docker images, which can take several minutes. Click Retry to wait another 60 seconds. If it still fails, check the last log lines in the dialog and run:

```bash
docker compose -f ~/bibliogon/docker-compose.prod.yml logs --tail=100
```

**"./bibliogon-launcher-linux: cannot execute: required file not found"**
The binary needs glibc 2.35 or newer. You are on an older distribution. Upgrade the distribution, or install Bibliogon via `install.sh` from the repository instead of the launcher.

**"error while loading shared libraries: libtk..."**
Tk is not installed. Install the Tk package for your distribution (`python3-tk` on Debian/Ubuntu, `tk` on Arch, `python3-tkinter` on Fedora). An AppImage that bundles Tk is tracked as D-03a and depends on how often this issue surfaces.

**Activity log**
Every launch writes to `~/.config/bibliogon/install.log` (1 MB rotation, 1 backup). Attach this file to bug reports. See the [Activity log](#activity-log) section for details.

## Activity log

Every launcher action (install, uninstall, Docker operations, errors) is written to:

```
~/.config/bibliogon/install.log
```

The log rotates at 1 MB with one backup (`install.log.1`). When reporting an issue on GitHub, attach the current log file or paste the last 50-100 lines; it usually shows exactly what failed.

## Uninstalling

See [Uninstall](uninstall.md) for the launcher UI path and the `uninstall.sh` script fallback.

Short version: click **Uninstall** inside the launcher window and confirm. The launcher removes the installation directory and its own manifest. Docker volumes (your book data) are preserved by default; add them explicitly if you want a complete wipe.

## Related pages

- [Installation overview](installation.md)
- [Windows Launcher](launcher-windows.md)
- [macOS Launcher](launcher-macos.md)
- [Uninstall](uninstall.md)
- [Troubleshooting](troubleshooting.md) (general app issues after it is running)

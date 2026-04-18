# Linux Launcher

The Linux launcher is a `bibliogon-launcher-linux` ELF binary that starts Bibliogon with a click: no `docker compose` commands, no terminal session kept open. Docker still runs the actual app; the launcher just starts and stops it for you.

> **Heads-up: the launcher is not an installer.** It assumes Bibliogon is already on your disk. If you download only the launcher on a fresh machine, it tells you to install Bibliogon first and exits. See [Installation overview](installation.md) for the full picture.

## System requirements

- A recent 64-bit Linux distribution (Ubuntu 22.04+, Fedora 38+, Debian 12+, Arch, or equivalent). The binary is built on `ubuntu-22.04`, so glibc 2.35 or newer is required. Older distributions are not supported.
- Docker Engine or Docker Desktop, with your user in the `docker` group.
- The Tk runtime (`python3-tk` on Debian/Ubuntu, `tk` on Arch, `python3-tkinter` on Fedora) if the bundled Tk in the PyInstaller binary complains. Most distributions already have this; reports of missing Tk have not surfaced so far.

## One-time setup

### 1. Install Docker

Pick one:

- **Docker Engine** (native, recommended for servers and minimal desktops): [docs.docker.com/engine/install](https://docs.docker.com/engine/install/). After install, add your user to the `docker` group and log out/back in:

  ```bash
  sudo usermod -aG docker "$USER"
  ```

- **Docker Desktop for Linux**: [docs.docker.com/desktop/install/linux-install](https://docs.docker.com/desktop/install/linux-install/). More convenient, but heavier.

Verify Docker is reachable without `sudo`:

```bash
docker info
```

### 2. Install Bibliogon itself

Clone or download the Bibliogon repository to a folder on your machine. The launcher looks first in `~/bibliogon`. Any other location works; the launcher asks you to pick the folder on first run and remembers it.

If you do not use Git, download the source ZIP from [the Bibliogon releases page](https://github.com/astrapi69/bibliogon/releases/latest) and extract it to `~/bibliogon`.

### 3. Download the launcher

From the Bibliogon releases page, download two files attached to the release:

- `bibliogon-launcher-linux`
- `bibliogon-launcher-linux.sha256`

Save them anywhere; `~/Downloads` is fine.

### 4. Verify the download (optional but recommended)

The launcher is not signed. To confirm the binary you downloaded is the exact file published, open a terminal where you saved it and run:

```bash
sha256sum bibliogon-launcher-linux
cat bibliogon-launcher-linux.sha256
```

The hash from `sha256sum` should match the hex string in the `.sha256` file. If it does not, do not run the binary and report it on [GitHub Issues](https://github.com/astrapi69/bibliogon/issues).

### 5. Make the launcher executable

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

1. The launcher checks that Docker is installed and reachable. If not, a dialog tells you to start Docker (or log out/back in after the `docker` group change) and click Retry.
2. If Bibliogon is not at `~/bibliogon`, the launcher asks you to pick the folder where you installed it (the folder that contains `docker-compose.prod.yml`). Your choice is remembered in `~/.config/bibliogon/install.json`, so the next start skips this step.
3. A small "Starting Bibliogon..." window appears while Docker brings up the containers.
4. When Bibliogon is ready, your default browser opens at `http://localhost:7880` (or whatever port is configured in your `.env` file).
5. The small window switches to "Bibliogon is running on localhost:7880" with a **Stop Bibliogon** button.

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

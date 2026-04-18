# macOS Launcher

The macOS launcher is a `Bibliogon.app` bundle that starts Bibliogon with a double-click: no terminal, no `docker compose` commands. Docker Desktop still runs the actual app; the launcher just starts and stops it for you.

**This initial release is arm64 only.** Apple-silicon Macs (M1, M2, M3, M4 and later) are supported. Intel Macs are not covered by this binary; use `install.sh` from the terminal instead.

> **Heads-up: the launcher is not an installer.** It assumes Bibliogon is already on your disk. If you download only the launcher on a fresh machine, it tells you to install Bibliogon first and exits. See [Installation overview](installation.md) for the full picture.

## One-time setup

### 1. Install Docker Desktop

Download and install Docker Desktop for Mac (Apple silicon) from [docs.docker.com/desktop/install/mac-install](https://docs.docker.com/desktop/install/mac-install/). Start it after install and wait until the whale icon in the menu bar reports the engine is running.

### 2. Install Bibliogon itself

Clone or download the Bibliogon repository to a folder on your machine. The launcher looks first in `~/bibliogon`. Any other location works; the launcher asks you to pick the folder on first run and remembers it.

If you do not use Git, download the source ZIP from [the Bibliogon releases page](https://github.com/astrapi69/bibliogon/releases/latest) and extract it to `~/bibliogon`.

### 3. Download the launcher

From the Bibliogon releases page, download two files attached to the release:

- `bibliogon-launcher-macos.zip`
- `bibliogon-launcher-macos.zip.sha256`

Save them anywhere; `~/Downloads` is fine.

### 4. Verify the download (optional but recommended)

The launcher is not signed with an Apple Developer ID (see [Why is there a security warning?](#why-is-there-a-security-warning) below). To confirm the ZIP you downloaded is the exact file published, open Terminal where you saved it and run:

```bash
shasum -a 256 bibliogon-launcher-macos.zip
cat bibliogon-launcher-macos.zip.sha256
```

The hash printed by `shasum` should match the hex string in the `.sha256` file. If it does not, do not open the ZIP and report it on [GitHub Issues](https://github.com/astrapi69/bibliogon/issues).

### 5. Unzip and move the app

Unzip `bibliogon-launcher-macos.zip`. The archive contains `Bibliogon.app`. Move it to `/Applications` if you want it reachable from Launchpad, or keep it in `~/Downloads`.

## First launch

The first launch is the one that triggers Gatekeeper. After that, double-clicking the app works normally.

### The Gatekeeper prompt

Because the launcher is unsigned, macOS shows:

> **"Bibliogon" cannot be opened because the developer cannot be verified.**

To approve the launcher on first run:

1. **Right-click** (or Control-click) `Bibliogon.app` in Finder.
2. Choose **Open** from the context menu.
3. A dialog now offers an **Open** button (the double-click dialog does not). Click **Open**.

macOS remembers the approval for this exact binary. Double-clicking works normally on subsequent launches.

If the "Open" option is missing (some macOS versions), the terminal fallback removes the quarantine attribute:

```bash
xattr -d com.apple.quarantine /path/to/Bibliogon.app
```

### What happens after you click Open

1. The launcher checks that Docker Desktop is installed and running. If Docker is not running, a dialog asks you to start it and click Retry.
2. If Bibliogon is not at `~/bibliogon`, the launcher asks you to pick the folder where you installed it (the folder that contains `docker-compose.prod.yml`). Your choice is remembered in `~/Library/Application Support/bibliogon/install.json`, so the next start skips this step.
3. A small "Starting Bibliogon..." window appears while Docker brings up the containers.
4. When Bibliogon is ready, your default browser opens at `http://localhost:7880` (or whatever port is configured in your `.env` file).
5. The small window switches to "Bibliogon is running on localhost:7880" with a **Stop Bibliogon** button.

## Stopping Bibliogon

Click **Stop Bibliogon** in the launcher window, or just quit the app. The launcher runs `docker compose down` and exits. Docker Desktop keeps running; only the Bibliogon containers stop.

## Running a second time

Double-click `Bibliogon.app` again. If Bibliogon is already running (for example because you minimised the launcher window and forgot), the launcher detects the running instance and just opens the browser at the correct URL without starting a second copy.

## Troubleshooting

**"Docker Desktop is not running"**
Open Docker Desktop from Applications or Launchpad. Wait until the whale icon in the menu bar is steady (not animating). Then click Retry in the launcher dialog.

**"Bibliogon install not found"**
The launcher cannot find `docker-compose.prod.yml` at the default or configured path. Click OK, then pick the folder where you cloned or unzipped Bibliogon. That folder typically contains `README.md`, `Makefile`, and the `docker-compose.prod.yml` file.

**"Port 7880 is in use"**
Another program is already using the Bibliogon port. Options: stop the other program, or edit `.env` in your Bibliogon folder and set `BIBLIOGON_PORT` to a different value (for example `7881`), then start the launcher again.

**"Bibliogon did not start in time"**
The first start of a fresh install needs to build Docker images, which can take several minutes. Click Retry to wait another 60 seconds. If it still fails, check the last log lines in the dialog and open Docker Desktop's container view to see what happened.

**"This app was moved to the Trash after opening"**
This can happen if Gatekeeper was not bypassed correctly. Restore the app from Trash, then follow the right-click -> Open flow in the [Gatekeeper section](#the-gatekeeper-prompt) above.

**Activity log**
Every launch writes to `~/Library/Application Support/bibliogon/install.log` (1 MB rotation, 1 backup). Attach this file to bug reports. See the [Activity log](#activity-log) section for details.

## Activity log

Every launcher action (install, uninstall, Docker operations, errors) is written to:

```
~/Library/Application Support/bibliogon/install.log
```

The log rotates at 1 MB with one backup (`install.log.1`). When reporting an issue on GitHub, attach the current log file or paste the last 50-100 lines; it usually shows exactly what failed.

## Why is there a security warning?

macOS shows the "developer cannot be verified" warning for any executable that is not signed and notarised with an Apple Developer ID. A Developer ID costs $99/year and notarisation requires ongoing maintenance. For the current user base we publish the launcher unsigned and supply a SHA256 checksum so you can verify the download independently.

We plan to revisit code-signing when Bibliogon has a user base that justifies the cost and maintenance burden. Until then, the right-click -> Open path is the intended flow. The source code for the launcher is in `launcher/` in the Bibliogon repository; you are welcome to inspect or build it yourself.

## Uninstalling

See [Uninstall](uninstall.md) for the launcher UI path and the `uninstall.sh` script fallback.

Short version: click **Uninstall** inside the launcher window and confirm. The launcher removes the installation directory and its own manifest. Docker volumes (your book data) are preserved by default; add them explicitly if you want a complete wipe.

## Related pages

- [Installation overview](installation.md)
- [Windows Launcher](launcher-windows.md)
- [Linux Launcher](launcher-linux.md)
- [Uninstall](uninstall.md)
- [Troubleshooting](troubleshooting.md) (general app issues after it is running)

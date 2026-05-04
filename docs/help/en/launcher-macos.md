# macOS Launcher

The macOS launcher is a `Bibliogon.app` bundle that starts Bibliogon with a double-click: no terminal, no `docker compose` commands. Docker Desktop still runs the actual app; the launcher just starts and stops it for you.

**This initial release is arm64 only.** Apple-silicon Macs (M1, M2, M3, M4 and later) are supported. Intel Macs are not covered by this binary; use `install.sh` from the terminal instead.

> **What the launcher does for you.** On first run, the launcher detects whether Bibliogon is already on disk. If it is not, the launcher offers to download and set up Bibliogon for you (see "First launch" below). The only thing you have to install yourself is Docker Desktop; Docker's licensing terms prohibit silent third-party installation. See the [Installation overview](installation.md) for the cross-platform picture.

## One-time setup

### 1. Install Docker Desktop

Download and install Docker Desktop for Mac (Apple silicon) from [docs.docker.com/desktop/install/mac-install](https://docs.docker.com/desktop/install/mac-install/). Start it after install and wait until the whale icon in the menu bar reports the engine is running.

If you skip this step, the launcher detects the missing Docker on startup and shows a dialog with a direct link to the download page, then exits. You can run the launcher again after installing Docker.

### 2. Download the launcher

From the Bibliogon releases page, download two files attached to the release:

- `bibliogon-launcher-macos.zip`
- `bibliogon-launcher-macos.zip.sha256`

Save them anywhere; `~/Downloads` is fine.

### 3. Verify the download (optional but recommended)

The launcher is not signed with an Apple Developer ID (see [Why is there a security warning?](#why-is-there-a-security-warning) below). To confirm the ZIP you downloaded is the exact file published, open Terminal where you saved it and run:

```bash
shasum -a 256 bibliogon-launcher-macos.zip
cat bibliogon-launcher-macos.zip.sha256
```

The hash printed by `shasum` should match the hex string in the `.sha256` file. If it does not, do not open the ZIP and report it on [GitHub Issues](https://github.com/astrapi69/bibliogon/issues).

### 4. Unzip and move the app

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

The launcher's first job is to detect what is already in place.

1. **Docker check.** The launcher confirms Docker Desktop is installed and running. If Docker Desktop is missing, a dialog with the install URL appears and the launcher exits. If Docker is installed but not running, a dialog asks you to start Docker Desktop and click Retry; the launcher tries up to three times.
2. **Bibliogon check.** The launcher looks for an existing Bibliogon install via its manifest (`~/Library/Application Support/bibliogon/install.json`) or, on a clean machine, checks the default location `~/bibliogon`.
   - **Already installed**: the launcher proceeds straight to step 3.
   - **Not installed**: a welcome dialog appears: "Bibliogon is not installed on this computer yet". Three buttons: **Install** (the launcher downloads the latest release ZIP, extracts to a folder you pick, generates a fresh `.env`, and builds the Docker images - first build takes 3-5 minutes), **Open install guide** (opens the docs in your browser), or **Close**.
3. **Start.** A small "Starting Bibliogon..." window appears while Docker brings up the containers.
4. **Browser.** When Bibliogon is ready, your default browser opens at `http://localhost:7880` (or whatever port is configured in `.env`).
5. **Status window.** The small window switches to "Bibliogon is running on localhost:7880" with a **Stop Bibliogon** button.

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

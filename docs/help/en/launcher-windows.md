# Windows Launcher

The Windows launcher is a small `bibliogon-launcher.exe` that starts Bibliogon with a double-click: no terminal, no `docker compose` commands. Docker Desktop still runs the actual app; the launcher just starts and stops it for you.

> **What the launcher does for you.** On first run, the launcher detects whether Bibliogon is already on disk. If it is not, the launcher offers to download and set up Bibliogon for you (see "First launch" below). The only thing you have to install yourself is Docker Desktop; Docker's licensing terms prohibit silent third-party installation. See the [Installation overview](installation.md) for the cross-platform picture.

For macOS or Linux, see [macOS Launcher](launcher-macos.md) / [Linux Launcher](launcher-linux.md).

## One-time setup

### 1. Install Docker Desktop

Download and install Docker Desktop from [docs.docker.com/desktop/install/windows-install](https://docs.docker.com/desktop/install/windows-install/). After installation, start Docker Desktop and wait for it to report that the engine is running.

If you skip this step, the launcher detects the missing Docker on startup and shows a dialog with a direct link to the download page, then exits. You can run the launcher again after installing Docker.

### 2. Download the launcher

From the Bibliogon releases page, download two files attached to the release:

- `bibliogon-launcher.exe`
- `bibliogon-launcher.exe.sha256`

Save them to any folder; the Desktop or `Downloads` are both fine.

### 3. Verify the download (optional but recommended)

Bibliogon does not yet sign the launcher (see [Why is there a security warning?](#why-is-there-a-security-warning) below). To confirm the file you downloaded is the exact file published, open PowerShell where you saved the launcher and run:

```powershell
Get-FileHash -Algorithm SHA256 .\bibliogon-launcher.exe
Get-Content .\bibliogon-launcher.exe.sha256
```

The hash printed by `Get-FileHash` should match the hex string in the `.sha256` file. If it does not, do not run the file and report it on [GitHub Issues](https://github.com/astrapi69/bibliogon/issues).

## First launch

Double-click `bibliogon-launcher.exe`.

### The SmartScreen warning

Windows will likely show a blue dialog: **"Windows protected your PC"** with the message "Microsoft Defender SmartScreen prevented an unrecognized app from starting". This is expected for unsigned software and does not mean the launcher is malicious.

To proceed:

1. Click **More info** (a link inside the dialog).
2. The dialog expands and shows the app name and publisher. Click the **Run anyway** button that appears.

See [Why is there a security warning?](#why-is-there-a-security-warning) below for the reasoning.

### What happens after you click Run anyway

The launcher's first job is to detect what is already in place.

1. **Docker check.** The launcher confirms Docker Desktop is installed and running. If Docker Desktop is missing, a dialog with the install URL appears and the launcher exits. If Docker is installed but not running, a dialog asks you to start Docker Desktop and click Retry; the launcher tries up to three times.
2. **Bibliogon check.** The launcher looks for an existing Bibliogon install via its manifest (`%APPDATA%\bibliogon\install.json`) or, on a clean machine, checks the default location `%USERPROFILE%\bibliogon`.
   - **Already installed**: the launcher proceeds straight to step 3.
   - **Not installed**: a welcome dialog appears: "Bibliogon is not installed on this computer yet". Three buttons: **Install** (the launcher downloads the latest release ZIP, extracts to a folder you pick, generates a fresh `.env`, and builds the Docker images - first build takes 3-5 minutes), **Open install guide** (opens the docs in your browser), or **Close**.
3. **Start.** A small "Starting Bibliogon..." window appears while Docker brings up the containers.
4. **Browser.** When Bibliogon is ready, your default browser opens at `http://localhost:7880` (or whatever port is configured in `.env`).
5. **Status window.** The small window switches to "Bibliogon is running on localhost:7880" with a **Stop Bibliogon** button.

## Stopping Bibliogon

Click **Stop Bibliogon** in the launcher window, or just close the window. The launcher runs `docker compose down` and exits. Docker Desktop keeps running; only the Bibliogon containers stop.

## Running a second time

Double-click the launcher again. If Bibliogon is already running (for example because you minimized the launcher window and forgot), the launcher detects the running instance and just opens the browser at the correct URL without starting a second copy.

## Troubleshooting

**"Docker Desktop is not running"**
Open Docker Desktop from the Start menu. Wait until the whale icon in the taskbar is steady (not animating). Then click Retry in the launcher dialog.

**"Bibliogon install not found"**
The launcher cannot find `docker-compose.prod.yml` at the default or configured path. Click OK, then pick the folder where you cloned or unzipped Bibliogon. That folder typically contains `README.md`, `Makefile`, and the `docker-compose.prod.yml` file.

**"Port 7880 is in use"**
Another program is already using the Bibliogon port. Options: stop the other program, or edit `.env` in your Bibliogon folder and set `BIBLIOGON_PORT` to a different value (for example `7881`), then start the launcher again.

**"Bibliogon did not start in time"**
The first start of a fresh install needs to build Docker images, which can take several minutes. Click Retry to wait another 60 seconds. If it still fails, check the last log lines in the dialog and open Docker Desktop's container view to see what happened.

**Activity log**
Every launch writes to `%APPDATA%\bibliogon\install.log` (1 MB rotation, 1 backup). The legacy path `%APPDATA%\Bibliogon\launcher.log` is still written for backward compatibility. Attach the current log file to bug reports.

## Why is there a security warning?

Windows shows the "unrecognized app" warning for any executable that is not signed with a paid Microsoft-recognized code-signing certificate. Certificates cost several hundred dollars per year and require ongoing maintenance. For the current user base we publish the launcher unsigned and supply a SHA256 checksum so you can verify the download independently.

We plan to revisit code-signing when Bibliogon has a user base that justifies the cost and the maintenance burden. Until then, the "More info" -> "Run anyway" path is the intended flow. The source code for the launcher is in `launcher/` in the Bibliogon repository; you are welcome to inspect or build it yourself.

## Uninstalling

See [Uninstall](uninstall.md) for the launcher UI path and the `uninstall.sh` script fallback.

Short version: click **Uninstall** inside the launcher window and confirm. The launcher removes the installation directory and its own manifest. Docker volumes (your book data) are preserved by default; add them explicitly if you want a complete wipe.

If you only want to remove the launcher binary itself and keep Bibliogon installed, delete `bibliogon-launcher.exe` and optionally the config directory at `%APPDATA%\bibliogon\`.

## Related pages

- [Installation overview](installation.md)
- [macOS Launcher](launcher-macos.md)
- [Linux Launcher](launcher-linux.md)
- [Uninstall](uninstall.md)
- [Troubleshooting](troubleshooting.md) (general app issues after it is running)

# Windows Launcher

The Windows launcher is a small `bibliogon-launcher.exe` that starts Bibliogon with a double-click: no terminal, no `docker compose` commands. Docker Desktop still runs the actual app; the launcher just starts and stops it for you.

> **What the launcher does for you.** The launcher manages the Docker stack for a copy of the Bibliogon repository that is already on your computer: it builds the images from your local copy and starts and stops the app for you. It does **not** download Bibliogon itself. You need two things on disk first: Docker Desktop, and the Bibliogon source (a `git clone` of the repository, or its source ZIP unpacked - the default location is `%USERPROFILE%\bibliogon`). Docker Desktop you install yourself; Docker's licensing terms prohibit silent third-party installation. See the [Installation overview](installation.md) for the cross-platform picture.

For macOS or Linux, see [macOS Launcher](launcher-macos.md) / [Linux Launcher](launcher-linux.md).

## One-time setup

### 1. Install Docker Desktop

See the [Bibliogon Docker installation guide](install/docker-desktop.md) for the full Windows walkthrough plus a "Is Docker safe to install?" section. After installation, start Docker Desktop and wait until the whale icon in the system tray turns from amber to blue.

If you skip this step, the launcher detects the missing Docker on startup and shows a three-button dialog (open the Docker download page, open the Bibliogon Docker guide, or quit). You can run the launcher again after installing Docker.

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
2. **Bibliogon repository check.** The launcher needs your local copy of the Bibliogon repository - the folder that contains `docker-compose.prod.yml`. It looks for it via the `BIBLIOGON_DIR` environment variable, the repo root when you run the launcher from a source checkout, or the default location `%USERPROFILE%\bibliogon`.
   - **Already built**: if the Bibliogon containers already exist from an earlier run, the launcher proceeds straight to step 3.
   - **Not built yet**: when no containers exist, the launcher window shows an **Install** button. Clicking it builds the Docker images from your local copy (`docker compose build`; the first build takes 3-5 minutes), writes the host port into `.env`, and then starts the stack. During install a progress window shows each step (prepare configuration, build images, start) so you can see it is working. If the repository cannot be found, the build fails with "Compose file not found" - place the Bibliogon source at `%USERPROFILE%\bibliogon`, set `BIBLIOGON_DIR`, or run the launcher from inside the repository folder.
3. **Start.** A small status window appears with a checklist (Docker Desktop detected, starting containers, waiting for Bibliogon) while Docker brings up the containers.
4. **Browser.** When Bibliogon is ready, your default browser opens at `http://localhost:7880` (or whatever port is configured in `.env`). If port 7880 is already in use by another program, the launcher automatically picks the next free port, saves it to `.env`, and tells you the new address.
5. **Status window.** The small window switches to "Bibliogon is running on localhost:7880" with a **Stop Bibliogon** button.

## Stopping Bibliogon

Click **Stop Bibliogon** in the launcher window, or just close the window. The launcher runs `docker compose down` and exits. Docker Desktop keeps running; only the Bibliogon containers stop.

## Running a second time

Double-click the launcher again. If Bibliogon is already running (for example because you minimized the launcher window and forgot), the launcher detects the running instance and shows a management dialog instead of starting a second copy:

- **Open in browser** - open `http://localhost:7880` for the running instance.
- **Stop** - run `docker compose down` and stop the containers; the installation is kept.
- **Uninstall** - confirm, then fully remove Bibliogon (see Uninstalling below).
- **Close** - close the launcher and leave the containers running.

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

Short version: click **Uninstall** in the management dialog (or the main launcher window) and confirm. The launcher then removes everything: the Docker containers, images, and volumes (**your book data is deleted** - export your books first if you want to keep them), the installation directory, desktop shortcuts, the install manifest, and the per-user config directories (`%USERPROFILE%\.bibliogon` and `%APPDATA%\bibliogon`). The same teardown is available headless via `bibliogon-launcher.exe --uninstall`. An interrupted uninstall resumes automatically on the next launch.

If you only want to remove the launcher binary itself and keep Bibliogon installed, delete `bibliogon-launcher.exe` instead of running the Uninstall flow.

## Related pages

- [Installation overview](installation.md)
- [macOS Launcher](launcher-macos.md)
- [Linux Launcher](launcher-linux.md)
- [Uninstall](uninstall.md)
- [Troubleshooting](troubleshooting.md) (general app issues after it is running)

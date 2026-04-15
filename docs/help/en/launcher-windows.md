# Windows Launcher

The Windows launcher is a small `bibliogon-launcher.exe` that starts Bibliogon with a double-click: no terminal, no `docker compose` commands. Docker Desktop still runs the actual app; the launcher just starts and stops it for you.

## One-time setup

### 1. Install Docker Desktop

Download and install Docker Desktop from [docs.docker.com/desktop/install/windows-install](https://docs.docker.com/desktop/install/windows-install/). After installation, start Docker Desktop and wait for it to report that the engine is running.

### 2. Install Bibliogon itself

Clone or download the Bibliogon repository to a folder on your machine. The recommended location is `%USERPROFILE%\bibliogon` (for example `C:\Users\yourname\bibliogon`) because the launcher looks there first. Other locations work; the launcher will ask you to pick the folder the first time it runs.

If you do not use Git, download the source ZIP from [the Bibliogon releases page](https://github.com/astrapi69/bibliogon/releases/latest) and extract it to `%USERPROFILE%\bibliogon`.

### 3. Download the launcher

From the Bibliogon releases page, download two files attached to the release:

- `bibliogon-launcher.exe`
- `bibliogon-launcher.exe.sha256`

Save them to any folder; the Desktop or `Downloads` are both fine.

### 4. Verify the download (optional but recommended)

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

1. The launcher checks that Docker Desktop is installed and running. If Docker is not running, a dialog asks you to start it and click Retry.
2. If Bibliogon is not at `%USERPROFILE%\bibliogon`, the launcher asks you to pick the folder where you installed it (the folder that contains `docker-compose.prod.yml`). Your choice is remembered in `%APPDATA%\Bibliogon\launcher.json`, so the next start skips this step.
3. A small "Starting Bibliogon..." window appears while Docker brings up the containers.
4. When Bibliogon is ready, your default browser opens at `http://localhost:7880` (or whatever port is configured in your `.env` file).
5. The small window switches to "Bibliogon is running on localhost:7880" with a **Stop Bibliogon** button.

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

**Launcher log**  
Every launch writes `%APPDATA%\Bibliogon\launcher.log`. Attach it to bug reports.

## Why is there a security warning?

Windows shows the "unrecognized app" warning for any executable that is not signed with a paid Microsoft-recognized code-signing certificate. Certificates cost several hundred dollars per year and require ongoing maintenance. For the current user base we publish the launcher unsigned and supply a SHA256 checksum so you can verify the download independently.

We plan to revisit code-signing when Bibliogon has a user base that justifies the cost and the maintenance burden. Until then, the "More info" -> "Run anyway" path is the intended flow. The source code for the launcher is in `launcher/` in the Bibliogon repository; you are welcome to inspect or build it yourself.

## Uninstalling the launcher

Delete `bibliogon-launcher.exe` from wherever you saved it. Optionally, delete `%APPDATA%\Bibliogon\` to remove the remembered repo path, the lockfile, and the log. Docker Desktop and the Bibliogon folder itself are not affected; uninstall those separately if you also want them gone.

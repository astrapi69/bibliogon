# Uninstalling Bibliogon

There are two ways to uninstall Bibliogon, depending on how you installed it.

## Path A: Launcher (Windows)

If you installed Bibliogon using the launcher (.exe):

1. Open the Bibliogon launcher
2. Click **Uninstall**
3. Confirm when prompted

The launcher removes the installation directory and its own manifest. Docker volumes (your book data) are preserved by default.

To also remove Docker volumes and images, run the commands in the "What gets removed" section below.

## Path B: Script (all platforms)

If you installed via `install.sh` or want a complete removal including Docker resources:

```bash
cd ~/bibliogon
bash uninstall.sh
```

The script asks for confirmation before removing anything. Type `yes` to proceed.

## What gets removed

The uninstall script removes:

| Component | Location | Command |
|-----------|----------|---------|
| Docker containers | Running stack | `docker compose -f docker-compose.prod.yml down` |
| Docker volumes | Book data, database | `docker volume ls --filter name=bibliogon -q \| xargs docker volume rm` |
| Docker images | Backend + frontend images | `docker images --filter reference='*bibliogon*' -q \| xargs docker image rm` |
| Launcher manifest | Platform config dir | See below |
| Installation directory | `~/bibliogon` (default) | `rm -rf ~/bibliogon` |

Launcher manifest locations:
- Windows: `%APPDATA%\bibliogon\install.json`
- macOS: `~/Library/Application Support/bibliogon/install.json`
- Linux: `~/.config/bibliogon/install.json`

## Keeping your data

If you want to keep your books before uninstalling:

1. Open Bibliogon in the browser
2. Go to the Dashboard
3. Use **Backup** to export each book as a `.bgb` file
4. Save the `.bgb` files somewhere safe
5. Then uninstall

After reinstalling, use **Restore** to import the `.bgb` files back.

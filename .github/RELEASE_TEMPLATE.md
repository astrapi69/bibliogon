# Bibliogon vX.Y.Z

> **Static reference template.** Copy the relevant sections into
> `changelog/releases/vX.Y.Z.md` before invoking
> `gh release create --notes-file ...` (release-workflow.md Step 8).
> No automation reads this file; it exists so every release reuses
> the same prerequisites + verification block instead of being
> rewritten from memory.

## Before you install

Bibliogon runs in Docker. You need Docker Desktop installed and running before starting the launcher.

- [Docker installation guide (English)](https://github.com/astrapi69/bibliogon/blob/main/docs/help/en/install/docker-desktop.md) - includes a "Is Docker safe to install?" section
- [Docker-Installationsanleitung (Deutsch)](https://github.com/astrapi69/bibliogon/blob/main/docs/help/de/install/docker-desktop.md) - mit Abschnitt "Ist Docker sicher zu installieren?"

The launcher detects Docker, downloads Bibliogon automatically, and opens it in your browser. The first launch takes 5-10 minutes (Docker images build, ~2 GB disk space).

## Download

| Platform | File |
|----------|------|
| Windows | `bibliogon-launcher.exe` |
| macOS (Apple silicon) | `bibliogon-launcher-macos.zip` |
| Linux | `bibliogon-launcher-linux` (ELF binary) |

Each platform also ships a `*.sha256` checksum next to the binary.

## Verifying downloads

```bash
# macOS / Linux
shasum -a 256 bibliogon-launcher-<platform>
cat bibliogon-launcher-<platform>.sha256
```

```powershell
# Windows
Get-FileHash -Algorithm SHA256 .\bibliogon-launcher.exe
Get-Content .\bibliogon-launcher.exe.sha256
```

The hashes must match.

If your operating system warns about an unsigned binary, see the [Bibliogon installation overview](https://github.com/astrapi69/bibliogon/blob/main/docs/help/en/installation.md).

## What's new

<!-- Paste the per-version changelog excerpt here. Keep the
"Before you install", "Download", and "Verifying downloads"
sections above unchanged across releases; only the changelog
varies. -->

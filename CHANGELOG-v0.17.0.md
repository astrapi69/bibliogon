## [0.17.0] - 2026-04-17

Distribution is now one-click on Windows, macOS, and Linux. The Bibliogon launcher handles install, uninstall, Docker lifecycle, and update notifications without any terminal step.

### Added
- **One-click launcher install and uninstall** across all three platforms (D-01, D-02, D-03). Folder picker, ZIP download, extraction, `docker compose up --build`, health check, browser open on install; confirmation, `compose down`, volume + image cleanup, directory removal on uninstall. No terminal required.
- **Pending cleanup retry.** If uninstall is interrupted, the next launcher start silently retries each unfinished step via `cleanup.json`.
- **Activity log with 1 MB rotation.** `install.log` in the platformdirs config dir records every launcher event.
- **Auto-update check (D-04)** with three-button notification (Open release page / Dismiss / Don't check for updates). Background thread, silent on any failure.
- **Settings dialog** with opt-out toggle. Persists to `settings.json`; fail-open on any corruption.
- **macOS CI workflow (`launcher-macos.yml`)** — arm64 `.app` bundle, unsigned (requires Gatekeeper bypass on first launch).
- **Linux CI workflow (`launcher-linux.yml`)** — 13 MB ELF binary via PyInstaller.
- **`uninstall.sh`** — POSIX sh fallback for CLI-based uninstall.
- **Distribution smoke test template** covering install.sh, all three launcher platforms, install/uninstall + cleanup retry + activity log, and `uninstall.sh`.

### Fixed
- **install.sh VERSION pin** was hardcoded to `v0.7.0`. Fresh installs cloned the wrong code. Now pinned to the current release tag and updated during release prep.
- **install.sh shallow clone update path** failed on Windows Git Bash. Replaced with delete-and-re-clone, preserving `.env`.
- **Launcher lockfile NoneType crash** on Windows (`tasklist` returning `stdout=None`). Guard added plus fail-open wrapper.

### Changed
- **manuscripta 0.8 → 0.9.0**, forcing:
  - **DEP-08 resolved:** Pillow 11 → 12 (manuscripta requires `>=12.0`)
  - **DEP-06 resolved:** pandas 2.3 → 3.0 (transitive, manuscripta requires `>=3.0`)

### Deferred
- D-03a AppImage, D-05 Full Windows installer (user-demand triggers)
- DEP-01 React 19, DEP-02 TipTap 3, DEP-03 react-router-dom 7, DEP-04 Vite 8 + TypeScript 6, DEP-05 elevenlabs 2.x, DEP-07 lucide-react 1.x (dedicated sessions)

### Pending manual smoke tests
- [#2 Windows launcher](https://github.com/astrapi69/bibliogon/issues/2)
- [#3 macOS `.app` bundle](https://github.com/astrapi69/bibliogon/issues/3)
- [#4 Linux binary](https://github.com/astrapi69/bibliogon/issues/4)

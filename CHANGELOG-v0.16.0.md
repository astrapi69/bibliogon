## [0.16.0] - 2026-04-16

Audiobook export is now robust against cancellation and live-updates during generation. Dependency currency restored across the stack.

### Added
- **Audiobook incremental persistence:** each chapter MP3 is written to persistent storage immediately after generation. Cancelling a 30-chapter export at chapter 27 preserves all 27 completed chapters.
- **Per-chapter audio status in book metadata:** the audiobook tab shows every chapter with audio state (generated with duration/play/download, or "Nicht generiert").
- **Four-mode regeneration dialog:** chapter classification (current/outdated/missing) with four radio choices for re-export.
- **Real-time metadata updates via WebSocket:** metadata view updates live as chapters generate.
- **Themed audiobook player:** custom player with progress scrub, speed control, volume, keyboard shortcuts, auto-advance. Replaces bare HTML5 audio.
- **D-01 Windows Simple Launcher:** code, CI, install guide ready. Smoke test in v0.17.0.

### Fixed
- **Docker build for fresh installations:** all 9 plugins now copied via glob.
- **Audiobook overwrite dialog:** browser confirm replaced with AppDialog.
- **Launcher first-run UX:** "never installed" vs "installation moved" distinction.

### Changed
- **Dependency sweep:** Node 22 LTS, Python 3.12 Docker, FastAPI 0.135, Pydantic 2.13, pytest 9, and more.
- **Release workflow:** dependency currency check (Step 4b) before every release.
- **Deferred major bumps:** DEP-01 through DEP-08 tracked in ROADMAP.

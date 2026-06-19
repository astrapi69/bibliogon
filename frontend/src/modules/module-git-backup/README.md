# module-git-backup

Frontend counterpart of **`bibliogon-plugin-git-sync`** (backup/push half).

- **Offline status:** Not possible (desktop-only).
- **Reason:** committing/pushing a book to a Git remote needs a real `git`
  binary plus filesystem access; a browser provides neither.
- **Implemented:** nothing browser-side. The module exists to keep the
  plugin-parity map complete and to host the gate rationale.
- **Gating:** `FEATURES.GIT_BACKUP` → `disabled` in Dexie mode (reason
  `requires_desktop_app`). The surface stays visible and explained, never
  silently hidden (policy #78).

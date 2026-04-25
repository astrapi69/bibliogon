# Bibliogon v0.21.0

Git-based backup is the headline feature: per-book git repos, remote push/pull with encrypted PATs, SSH key generation, 3-way merge with per-file conflict resolution, and Markdown side-files for readable diffs. Closes all four SI-01..04 ROADMAP items. Plus two new AI editor modes, a Settings refactor, CSS zoom fixes, and a full security sweep across the stack.

## Added

### Git-based backup (SI-01..04, full 5-phase plan shipped)

- **Phase 1 — local git per book.** `POST /api/books/{id}/git/init` creates `.git` under `uploads/{book_id}/` and records a first commit; `/git/commit` writes current book state (TipTap JSON per chapter plus `config/metadata.yaml`) and commits with a user-supplied message; `/git/log` returns history; `/git/status` reports clean/dirty + HEAD. Frontend `GitBackupDialog` in a new sidebar entry. Layout matches [write-book-template](https://github.com/astrapi69/write-book-template) conventions.
- **Phase 2 — remote push/pull (HTTPS+PAT).** `/git/remote` (POST/GET/DELETE), `/git/push`, `/git/pull`, `/git/sync-status`. PAT encrypted at rest via `credential_store` (Fernet), never returned in API responses, injected via one-shot URL reset around each push/fetch so the token never lands in `.git/config`. Sync badge in the dialog + sidebar dot for SI-04 remote-ahead/diverged states.
- **SI-01 Accept Remote / Accept Local.** Dedicated in-dialog resolution panel on push rejection: Merge, Force push (with native confirm), or Cancel.
- **Phase 3 — SI-03 SSH key generation.** `POST /api/ssh/generate` produces an Ed25519 keypair in OpenSSH format via the existing `cryptography` dep (no paramiko). Private key 0600 under `config/ssh/id_ed25519`. Settings > Allgemein has a generate / copy / delete flow. `git_backup` auto-wires `GIT_SSH_COMMAND` with `IdentitiesOnly=yes` + `StrictHostKeyChecking=accept-new` for SSH URLs.
- **Phase 4 — SI-02 conflict analysis + per-file resolution.** `/git/conflict/analyze` classifies diverged state as simple (disjoint files) or complex (overlap). `/git/merge` attempts a 3-way merge (auto-commits simple, leaves in-progress on complex). `/git/conflict/resolve` accepts `{path: "mine"|"theirs"}` per file and commits the merge. `/git/conflict/abort` rolls back. Two-mode in-dialog UI: merge/force choice → per-file radio picker.
- **Phase 5 — Markdown side-files.** Every commit writes a `.md` next to each chapter `.json` via the export plugin's `tiptap_to_markdown`. JSON stays canonical; Markdown is advisory for readable `git log` / `git diff`.
- **Help docs.** `docs/help/{de,en}/git-backup/{basics,remote,ssh}.md` register under a new "Git-Sicherung" nav entry.

### AI editor modes

- **`fix_issue` AI mode for quality findings.** From the Quality tab, clicking a metric jumps to the first matching finding; StyleCheck decorations paint every finding so context is visible.
- **Quality-tab navigate-to-first-issue.** Per-chapter metrics clickable — jump the editor to the chapter + finding in one click.

## Changed

- **Settings: KI-Assistent is its own tab** between Allgemein and Autor. AI provider config moved out of Allgemein; partial PATCH saves only the `ai` section. New i18n key `ui.settings.tab_ai` in 8 languages.
- **Reactive word/character count in editor status bar** via `useEditorState` instead of inline `editor.storage` reads. Partial fix for issue #12.
- **Unified Radix tab-list CSS class.** `.radix-tabs-list` now has `overflow-x: auto; white-space: nowrap;` baked in.

## Fixed

- **Main page overflowed viewport at 150% CSS zoom** (issue #11).
- **Chapter sidebar dropdown escaped viewport at 125/150% CSS zoom** (issue #10).
- **Scroll regression on non-editor pages** (followup to the #11 fix).

## Security

- **Backend CVE sweep.** 13 CVEs cleared via `aiohttp` 3.13.3 → 3.13.5, `pygments` 2.19.2 → 2.20.0, `starlette` 0.46.2 → 1.0.0. `pip-audit` post-upgrade: 0 vulnerabilities.
- **`pip-audit` added as backend dev dependency.**
- **Frontend SEC-01 tracked.** 4 high-severity vulns in the `vite-plugin-pwa` dev-dep chain. All dev-only (0 in production bundle); deferred until `workbox-build` releases a version that lifts the `@rollup/plugin-terser ^0.4.3` cap.

## Chore

- **Node.js 22 → 24 LTS** across `.nvmrc`, `engines`, Dockerfile, CI workflows.
- **GitPython 3.1.46 added** to backend (BSD). `git` binary now in the backend Docker image.

## Tests

- Backend 638 → 707 (+69, including 56 new git-backup + SSH)
- Plugins 409 (unchanged)
- Frontend Vitest 405 → 427 (+22 for the quality-tab + fix_issue modes)
- Playwright smoke 169 passed / 1 skipped (git-backup smoke coverage deferred to v0.21.1)

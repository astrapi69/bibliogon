# module-git-sync

Frontend partial counterpart of **`bibliogon-plugin-git-sync`** (import half).

- **Offline status:** Partial — needs network, not a backend.
- **Implemented:** browser import from a public/private GitHub repo via the
  GitHub REST API: `parseGitHubUrl`, `listGitHubContents`, `downloadGitHubFile`,
  `runGitHubImport`, plus an optional PAT held in localStorage
  (`get/setGitHubToken`).
- **Backed by:** `src/import/{githubImport,githubToken}.ts` (re-exported).
- **Gating:** `FEATURES.GITHUB_IMPORT` → `disabled` when `navigator.onLine ===
  false` (reason `requires_network`).
- **Missing / desktop-only:** the full write-book-template **Git sync/push**
  workflow (a real `git` working copy with commit/pull/diff) needs a git binary
  and is desktop-only (`FEATURES.GIT_SYNC`). See `module-git-backup` for the
  backup/push half.

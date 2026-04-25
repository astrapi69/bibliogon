# Session Journal - 2026-04-25 (v0.23.0)

Plugin-git-sync minor release. PGS-02..05 all four phases shipped
end-to-end across the same session, with a structural changelog
reorg slipped in just before the release cut.

## 1. PGS-02 Commit to Repo

- Sessions 1+2: backend persistence (`git_sync_mapping.py` lifts
  the staged clone to `uploads/git-sync/{book_id}/repo`),
  `git_sync_commit.py` re-scaffolds via plugin-export's
  `scaffold_project` + creates one commit, GitPython-driven
  push using ambient git credentials with stable
  `PushFailedError.reason` slugs mapped to 401/409/502.
- Frontend `GitSyncDialog` renders mapping snapshot + dirty
  warning + commit form. Sidebar button conditionally
  rendered when the book has a mapping.
- 8-language i18n + ChapterSidebar wiring.
- 12 backend tests + 9 Vitest tests.

## 2. PGS-03 Smart-Merge

- Three-way diff service via `git ls-tree` + `git show`
  (no working-tree checkout). Identity = `(section,
  slug-of-title)`. 8 classifications + same-edit-not-a-conflict
  + blank-line-tolerant normalize.
- `apply_resolutions` mutates the DB and bumps
  `last_imported_commit_sha`.
- `GitSyncDiffDialog` lists actionable rows with smart
  per-classification defaults; reachable from GitSyncDialog
  via "Auf Aenderungen vom Repo pruefen".
- 22 backend tests + 6 Vitest tests.

## 3. PGS-04 Multi-language Branch Linking

- Migration `e8f9a0b1c2d3` adds `books.translation_group_id`.
- `derive_language` resolves `main-XX` -> XX; bare `main` ->
  `metadata.yaml.language`. Locale tags rejected.
- Multi-branch importer clones once, imports per branch with
  per-book persisted clones + own `GitSyncMapping`,
  auto-links via shared group id.
- Frontend `TranslationLinks` row in metadata editor +
  link-picker dialog for manual grouping.
- 29 backend tests + 6 Vitest tests.

## 4. PGS-05 Core-Git Bridge

- `git_sync_lock.py` per-book `threading.Lock` + 30s timeout.
- `unified_commit` fans out to core git first, plugin-git-sync
  second; per-subsystem failures land in the response payload
  (`status: ok | skipped | nothing_to_commit | failed`).
- `GitSyncDialog` shows banner + "Commit ueberall" button when
  both subsystems active. Per-subsystem result list under the
  form; toast tier follows the per-subsystem outcome.
- 10 backend tests + 4 Vitest tests.

## 5. Changelog directory reorg (slipped in pre-release)

User asked to slip a structural cleanup in before the v0.23.0
cut. Audit found 13 `CHANGELOG-vX.Y.Z.md` files at the repo
root (one per historical release) plus the canonical
`docs/CHANGELOG.md`. No per-plugin markdown changelogs.

Moved the 12 historical per-release files (v0.13.0 through
v0.22.1) to `changelog/releases/`, dropping the now-redundant
`CHANGELOG-` prefix. The active in-flight v0.23.0 notes
landed at the new path directly. `release-workflow.md` had
4 references to `CHANGELOG-v0.X.0.md` - all repointed.

`docs/CHANGELOG.md` stayed put as the canonical aggregated
history. The active release commit lands under the new tree
from this release onward.

## 6. v0.23.0 release cut

Per release-workflow.md:
- 17 commits since v0.22.1 (PGS-02..05 + reorg + format catchups).
- CHANGELOG entry covers PGS-01..05 rollout + forwarded
  v0.22.1 work (multi-book BGB, sticky-footer pattern,
  EnhancedTextarea, WizardErrorBoundary, three-option author
  picker).
- Versions bumped: backend/pyproject.toml, frontend/package.json,
  frontend/package-lock.json, backend/app/main.py,
  install.sh, CLAUDE.md.
- `make test`: backend 1069, frontend 621. mypy clean.
  pre-commit clean.
- Tag pushed; GitHub release published at
  https://github.com/astrapi69/bibliogon/releases/tag/v0.23.0
- Notes-file: `changelog/releases/v0.23.0.md`.

## Stats

- 17 commits in v0.22.1..v0.23.0.
- Backend: 1059 -> 1069 (+10 since session 1 of PGS-05; +72
  total since v0.22.0 baseline of 997).
- Frontend: 595 -> 621 (+26 across PGS-02..05 dialogs).
- 5 new Alembic migrations across the v0.22.1 + v0.23.0 cycle
  (b5c6d7e8f9a0, c6d7e8f9a0b1, c8d9e0f1a2b3, d7e8f9a0b1c2,
  e8f9a0b1c2d3). All idempotent.
- 8 i18n languages updated for every new dialog.

## Lessons recorded

No new `lessons-learned.md` entries this cycle. CI vs local
ruff drift continues to bite (pre-commit ruff-format wants
single-line collapse, local ruff format leaves multi-line);
already documented.

## Known limitation deferred to follow-up

PAT-via-UI for git push. Both core git and plugin-git-sync
push currently rely on ambient OS credentials (SSH agent or
system git credential helper). Bibliogon-side credential-store
integration is the next git-sync follow-up; spans both
subsystems and warrants its own session.

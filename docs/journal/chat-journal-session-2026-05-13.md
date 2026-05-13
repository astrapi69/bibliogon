# Chat journal — 2026-05-13

v0.31.0 pre-release verification + Phase 1-4 release cut. Single
extended session (afternoon). The session executed the user-
authored "Option A modified" plan landed earlier in the day.

## 1. Three-deliverable pre-release verification (12:33)

- Original prompt: "we implement many new features and i wanted
  before we release to verify that we have no errors so are our
  whole tests like unit, integration e2e and so on full? We want
  to deliver first quality product to the user and want that
  everything is ux/ui conform."
- Optimized prompt: scope the verification into Deliverable 1
  (coverage audit since v0.30.0), Deliverable 2 (full test
  suite verification), Deliverable 3 (UX/UI consistency check).
  STOP gate after all three; user reviews before any code.
- Goal: pre-release verification.
- Result: three audit reports written to
  `docs/audits/pre-release-{coverage,verification,ux}-2026-05-12.md`.
  - **D2 verification**: 2530 unit/integration tests green; all
    static checks (ruff, mypy, tsc, pre-commit, docs-discipline,
    sync-versions, plugin-lock-paired) green; 16/196 Playwright
    smoke failures classified into 4 groups (Group A Docker
    path-isolation, Group B plugin-install path, Group C AI
    provider env, Group D singletons).
  - **D1 coverage**: 1 A-tier gap (bulk-delete E2E missing) + 4
    B-tier (3 missing smoke specs + 2 drift gates).
  - **D3 UX/UI**: 0 BLOCKERS, 6 IMPROVEMENTS (PASSTHRU i18n,
    mkdocs orphans, undefined CSS vars, hardcoded hex colors,
    missing aria-label, inline styles).
- Commit: n/a (audits filed at end of cycle as 32b0393).

## 2. User decision — "Option A modified" (~15:30)

- Original prompt: extensive user-authored release plan listing
  8 BLOCKER items (A-H), PASSTHRU i18n acceptance per launcher
  precedent, deferred backlog items, and a 4-phase execution
  plan.
- Optimized prompt: as-written; this is a high-quality user-
  authored release plan, no optimization needed.
- Goal: execute the release cleanly with all BLOCKERs fixed,
  PASSTHRU i18n shipped with `_meta.review_status` markers, and
  the rest deferred to backlog.
- Result: plan acknowledged; Phase 1 started.

## 3. Phase 1: mechanical BLOCKER fixes (15:30 — 16:30)

Six commits, each a single-purpose mechanical fix.

- **DRIFT-1** (`00f795f`): `plugins/bibliogon-plugin-medium-import/
  bibliogon_medium_import/__init__.py` swapped hardcoded
  `__version__ = "1.0.0"` for the `importlib.metadata.version(...)`
  pattern already used by `plugin-git-sync`.
- **DRIFT-2** (`690d30f`): `make sync-mkdocs-nav` regenerated
  `mkdocs.yml` for the AI Templates section.
- **CSS theme tokens** (`6112612`): `--surface-2`, `--danger-bg`
  in all 12 palette × dark-mode blocks; `--success`, `--warning`
  in the two base contexts. Closes the 9-component fall-through-
  to-hex regression.
- **BulkAiFillDock hex → tokens** (`e888d12`): 3 hardcoded hex
  literals replaced with `var(--success, …)` / `var(--warning, …)`.
- **MediumImportPage aria-label** (`8611172`): added `aria-label`
  + `data-testid` to the Home icon button per coding-standards
  + ai-workflow rules.
- **i18n review_status markers** (`2d73f1a`): 6 catalogs (es / fr
  / el / pt / tr / ja) gain top-level `_meta:` blocks for the
  three v0.31.0 namespaces. `_load` strips `_meta` from parity
  flatten / raw paths; new `test_review_status_marker_shape`
  enforces shape + forbids on en / de. Companion
  `backend/config/i18n/REVIEW_STATUS.md` mirrors the launcher
  precedent.
- **Backlog filing** (`3bef42d`): `I18N-NATIVE-REVIEW-V031-01`
  P3 tracker for the native-speaker pass.

Verification: 1609 backend pytest + 929 Vitest passed,
`make sync-versions-check` clean, `make verify-docs-discipline`
clean, frontend build clean.

## 4. Phase 2: path-isolation fix (16:30 — 17:00)

One squashed commit (`a341b57`) covering both Phase 2 sub-items
because they share the migration mechanism + test fixture.

- `backup_history.py`: `BackupHistory.__init__` defaults `path=None`,
  resolves lazily via `get_data_dir() / "backup_history.json"`.
- `plugin_install.py`: new `get_installed_plugins_dir()` helper
  resolves `get_data_dir() / "plugins" / "installed"`.
- `settings.py`: switches the available-plugin listing to the
  same helper.
- `data_dir_migration.py`: two new legacy entries
  (`backend/config/backup_history.json`, `backend/plugins/installed`)
  + test fixture monkeypatches the new constants.

Manual verification: restarted `bibliogon-backend-1` Docker
container; `curl /api/backup/export` HTTP 500 → HTTP 200; plugin
install dir resolves to `/app/data/plugins/installed`.
Playwright Group A specs went 6 RED → GREEN (backup-roundtrip
× 3, articles-backup-roundtrip × 2, history × 1 partial).

**Surfaced finding**: production Docker was NEVER affected —
the `chown -R bibliogon` in `backend/Dockerfile` makes `/app/`
fully writable by the container's user. The "data-loss class"
urgency framing in the D2 audit was overstated by one
environment-class. Phase 2 fix stays (defense-in-depth +
filesystem-isolation rule) but the urgency tier is "correct
architectural cleanup", not "production blocker".

Two P3 backlog items filed (`392fd0b`):
- `PROD-WRITES-ARCHITECTURE-01`: the broader 10+ `_base_dir /
  "config" / "app.yaml"` writes in `settings.py` + plugin
  install/uninstall — same dev-docker UID quirk class.
- `BACKUP-HISTORY-SINGLETON-01`: three modules instantiate
  their own `BackupHistory()` at import time; GET
  `/api/backup/history` reads its router's in-memory list which
  is never refreshed from disk after construction.

## 5. Phase 3: A1 bulk-delete E2E spec (17:00 — 17:15)

- One commit (`0d2c3a7`): `e2e/smoke/bulk-delete.spec.ts` with 3
  tests pinning the data-destructive guards:
  1. **count=1 fallthrough**: dropdown trigger disabled; menu
     content stays hidden.
  2. **soft-delete + Undo**: trash list shows 2 entries → Undo
     toast clicked → trash empty + books restored.
  3. **type-to-confirm gate**: confirm disabled when empty,
     stays disabled + error appears on wrong count, enables on
     correct count, books gone + trash empty after confirm.

Books used over Articles because the surface is structurally
identical (same TypeToConfirmDialog + same notify.bulkAction
toast) and Books carry the larger UX shell.

Verification: 3/3 pass against the live dev environment;
full smoke suite re-run: 188/199 pass (11 failures all pre-
classified non-blockers from before today's work).

## 6. Phase 4: release cut

Six commits + one tag.

- `48936c8` — CHANGELOG + per-release notes (`changelog/releases/
  v0.31.0.md`).
- `17f46ac` — `chore(release): bump version to v0.31.0` after
  hand-edit on `backend/pyproject.toml` + `make sync-versions`
  propagation to 18 files.
- `32b0393` — three pre-release audit reports filed under
  `docs/audits/`.
- Tag `v0.31.0` + push to `origin/main` + GitHub release:
  https://github.com/astrapi69/bibliogon/releases/tag/v0.31.0

Pre-tag verification (mandatory per release-workflow.md):
- `make test`: 1609 backend + 929 Vitest passed
- `ruff check app/`: clean
- `mypy app/`: clean (96 files)
- `tsc --noEmit`: clean
- `pre-commit run --all-files`: clean
- `make verify-docs-discipline`: clean
- `make sync-versions-check`: clean
- `scripts/verify_version_pins.sh 0.31.0`: clean
- `npm run build`: clean (1.06 MB / 295 KB gzip)
- `launcher/ poetry run pyinstaller bibliogon-launcher.spec
  --clean --noconfirm`: clean

External Bibliogon-owned deps verified current at release time:
manuscripta ^0.9.0 (latest 0.9.0), pluginforge ^0.5.0 (latest
0.5.0).

## Summary

- **9 new commits** for the v0.31.0 cycle (DRIFT-1, DRIFT-2,
  CSS theme tokens, BulkAiFillDock hex, MediumImportPage
  aria-label, i18n review_status, backlog item, path-isolation
  fix, A1 E2E spec) on top of the 157 commits since v0.30.0.
- **6 release commits** (P3 backlog filings, CHANGELOG, version
  bump, audit docs).
- **3 P3 backlog items filed**: `I18N-NATIVE-REVIEW-V031-01`,
  `PROD-WRITES-ARCHITECTURE-01`, `BACKUP-HISTORY-SINGLETON-01`.
- **One new lessons-learned entry**: "Audit findings need
  production-vs-dev environment classification before
  urgency-tier" (user-suggested at session close).
- **v0.31.0 released**:
  https://github.com/astrapi69/bibliogon/releases/tag/v0.31.0

# Bibliogon v0.19.1

Maintenance release. Two user-visible fixes (i18n labels, backup resource leak), launcher release-workflow unblocked, and a substantial code-hygiene sweep (ruff + mypy + pre-commit wired into CI, 14 pre-existing mypy errors closed, whole-tree formatter pass). No schema changes, no API breakage.

## Fixed

- **Front Matter / Back Matter labels translated.** The two section headers in the BookEditor chapter sidebar were hardcoded English strings. Now pulled from `ui.editor.front_matter` / `back_matter` in all 8 i18n YAMLs.
- **Backup: zip file handle leak in `smart_import`.** The zip handle was not closed on all code paths, keeping the file locked on Windows and leaking file descriptors on long-running backends. Added explicit `close()` in a `finally` block.
- **Launcher release workflows granted `contents: write`.** `softprops/action-gh-release@v2` was failing with "Resource not accessible by integration" on tag pushes because the default `GITHUB_TOKEN` is read-only. All three launcher workflows (Linux, macOS, Windows) now declare `permissions: contents: write` at top level.

## Changed

- **Dependency bump: react-router-dom to ^7.14** (DEP-03). No migration needed; backward-compatible minor within the v7 line.
- **Launcher install/uninstall workflow unblocked.** With the permissions fix in place, tagged releases now publish the prebuilt launcher binaries (Linux ELF, macOS arm64 .app ZIP, Windows .exe) plus SHA256 checksums as GitHub release assets.

## Internal

- **ruff configured and applied** across the backend (`chore(deps)` backend). Conservative rule set plus whole-tree auto-fix sweep.
- **mypy errors closed.** 14 pre-existing `[no-any-return]` and `[import-untyped]` errors fixed without loosening the type-checker config.
- **pre-commit installed and enforced.** Whole-tree formatter sweep landed as a single commit; every subsequent commit must pass the hook stack.
- **CI jobs for pre-commit + ruff + mypy.** `.github/workflows/ci.yml` now runs the same checks that pre-commit runs locally.
- **release-workflow Step 5 uses `poetry run`** for `ruff check` and `mypy` calls (docs fix, not behavior change).

## Tests

- **Licensing: full unit coverage** for `app.licensing` (payload, signatures, expiry edges, wildcard plugin `*`).
- **Backup: direct unit tests** for archive, asset, and markdown utility modules.
- **Backup: persistence + HTTP route coverage** for `backup_history`.
- **Async event-loop hygiene** in backend tests — `asyncio.run()` replaces manual loop construction.
- **Frontend sanitizer test** no longer sets an iframe `src` (silences happy-dom fetch warning).

## Docs

- **Exploration docs** for AI review extension architecture and the children's-book plugin (architecture finalized, implementation deferred).
- **Audit docs** — backup_history + backup utils coverage gaps closed; polish audit 2026-04-18 captured with remaining open items; commit-pending placeholders replaced with real hashes.
- **Roadmap** — conflict-dialog "Save as new chapter" TODO promoted to PS-13.
- **Session journals** backfilled for April 1–12; gitignore aligned with ai-workflow.md so journals are actually committed.
- **DEP-09 note** — Vite 8 still blocked on vite-plugin-pwa compat.

## Known pending post-release

Playwright smoke suite: 135 passed / 31 failed. Three-sample triage (content-safety, dashboard-filters, editor-formatting Ctrl+Z) classified all three as test-infrastructure drift or latent test-code bugs that predate v0.19.1 — no user-visible regressions identified. Full triage of the remaining 28 failures tracked in GitHub issue #9, mandatory before v0.20.0. `make test` (backend 598 + Vitest 397 + tsc + ruff + mypy + pre-commit) remains the authoritative release gate and is all green.

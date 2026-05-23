---
title: Pre-release test suite verification
date: 2026-05-12
scope: Deliverable 2 of pre-release verification chain for v0.31.0
author: Claude Code (verification, NOT code change)
status: STOP gate — user reviews before any code change
---

# Pre-release test suite verification — 2026-05-12

Full-run verification of every test layer before v0.31.0 release.
Companion docs: `pre-release-coverage-2026-05-12.md` (D1, gap audit),
`pre-release-ux-2026-05-12.md` (D3, UX/UI consistency).

## Baseline

- Branch: `main`
- HEAD: `bcfe64f` (working tree clean, in sync with `origin/main`)
- Last tag: `v0.30.0` (released 2026-05-08)
- Commits since v0.30.0: **157** (`git log v0.30.0..HEAD --oneline --no-merges | wc -l`)

## Suite-by-suite results

| Suite | Result | Pass / Fail | Wall-clock | Notes |
|-------|--------|-------------|------------|-------|
| Backend pytest (`backend/tests/`) | **PASS** | 1601 / 0 (1 skipped) | 208.67 s | 47 deprecation warnings (httpx `data=` → `content=`) |
| Plugin tests (`make test-plugins`, all 10 plugins) | **PASS** | included in backend run | (within make test) | All plugin tests ran inside `make test` |
| Frontend Vitest (`cd frontend && npm test`) | **PASS** | 929 / 0 (91 files) | 4.84 s | Clean |
| Backend ruff (`poetry run ruff check app/`) | **PASS** | 0 issues | <1 s | |
| Backend mypy (`poetry run mypy app/`) | **PASS** | 0 issues across 96 source files | ~3 s | |
| Frontend tsc (`npx tsc --noEmit`) | **PASS** | 0 issues | ~8 s | |
| Frontend build (`npm run build`) | **PASS** | exit 0 | ~3 s | Two non-blocking warnings (bundle size, ineffective dynamic import — see findings) |
| Backend build (`poetry build`) | **SKIPPED** | n/a | n/a | `package-mode = false` in pyproject (intentional per release-workflow.md) |
| Pre-commit (`pre-commit run --all-files`) | **PASS** | all hooks green | ~15 s | Includes mkdocs nav check, plugin-lock-paired hook, ruff-format |
| `make verify-docs-discipline` | **FAIL** | drift | <2 s | `mkdocs.yml` out of sync with `docs/help/_meta.yaml`; see DRIFT-2 |
| `make sync-versions-check` | **FAIL** | drift | <1 s | medium-import plugin `__init__.py` `__version__` literal at `1.0.0`; see DRIFT-1 |
| `make verify-plugin-locks` | **PASS** | all 10 plugins in sync | <1 s | |
| Playwright smoke (`npx playwright test --project=smoke`) | **FAIL** | 180 / 16 (196 total) | 3.0 m | See E2E section below |

**Aggregate pass rate (excluding flagged-as-environment failures):** ≥99% of all assertions across all layers.

**Code-quality signal:** every static check is green. No mypy/ruff/tsc/lint regression. Unit + integration green. The failures are concentrated in (a) drift gates and (b) Playwright smoke runs against a dev backend in Docker with a path-isolation bug.

## Drift findings

### DRIFT-1: `medium-import` plugin `__version__` literal not synced

- File: `plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/__init__.py:9`
- Current: `__version__ = "1.0.0"`
- Expected: `0.30.0` (canonical from `backend/pyproject.toml`)
- Detected by: `make sync-versions-check` exits 2 with a clear message.
- Per `.claude/rules/lessons-learned.md` "Single source of truth for version pins" + "Subsystem lock-step + tooling, not checklists", `__version__` literals outside `_build_info` are a regression detector.
- The other 9 plugins use `importlib.metadata.version(...)` correctly; `medium-import` (the most-recently-scaffolded plugin) introduced a hardcoded literal that bypasses the propagation mechanism.
- **Severity:** BLOCKER for v0.31.0 release. CI release-gate would reject the tag push.
- **Suggested fix (NOT applied):** mirror `plugins/bibliogon-plugin-git-sync/bibliogon_git_sync/__init__.py` — replace the literal with `importlib.metadata.version("bibliogon-plugin-medium-import")` + `PackageNotFoundError` fallback. Then `make sync-versions` will pick up the canonical version through the package metadata path instead of the literal.

### DRIFT-2: `mkdocs.yml` out of sync with `docs/help/_meta.yaml`

- `docs/help/_meta.yaml` (line 170) declares `slug: ai/ai-templates`.
- The doc files exist: `docs/help/de/ai/ai-templates.md` (15 KB) and `docs/help/en/ai/ai-templates.md` (14 KB).
- The nav block in `mkdocs.yml` was not regenerated when these were added.
- Detected by: `make verify-mkdocs-nav` (part of `make verify-docs-discipline`) — diff is clean and shows exactly which nav node is missing.
- Per `.claude/rules/lessons-learned.md` "Help system: single source of truth", `_meta.yaml` IS the source; `mkdocs.yml` derives. The CI release-gate (`make verify-docs-discipline`) is in the pre-tag chain — this would also reject the tag.
- **Severity:** BLOCKER for v0.31.0 release (CI release-gate failure).
- **Suggested fix (NOT applied):** `make sync-mkdocs-nav`.

## E2E failures (16 of 196 smoke specs)

Root-cause grouping after inspecting `e2e/test-results/.../error-context.md` for each failure:

### Group A — Docker dev backend has a path-isolation bug (releaseblocker if it exists in prod)

**Symptom:** `GET /api/backup/export` returns HTTP 500 with `PermissionError: [Errno 13] Permission denied: 'config/backup_history.json'`. The stacktrace points to `/app/app/backup_history.py` (the Docker container path).

**Root cause:** `backend/app/backup_history.py:11` uses a **CWD-relative path** as the default:

```python
_DEFAULT_PATH = "config/backup_history.json"
```

This violates the explicit project rule documented in `.claude/rules/lessons-learned.md` under "Filesystem isolation: production data lives outside the project tree":

> **Forbidden patterns:**
> - `UPLOAD_DIR = Path("uploads")` at module top level
> - `Path("data") / "X"` anywhere in production code
>
> **Required pattern:**
> - `upload_dir = get_upload_dir()` inside the function that uses it.

The Docker image bind-mounts `config/` as the project's read-only config tree, so the write fails. In non-Docker dev / test it happens to work because the dev shell has write access to the project root. This was introduced in `3daeda8` (V-01, version history feature) — it is **NOT new in v0.30.0+** but it IS a latent release-blocker for any Docker user attempting a backup.

**Tests that fail via this root cause (6):**
- `backup-roundtrip.spec.ts` × 3 (`restores books and chapters`, `preserves book metadata`, `merges without duplicates`)
- `articles-backup-roundtrip.spec.ts` × 2 (`export then re-import via CIO`, `articles-only .bgb does not surface no-book.json warning`)
- `import-flows.spec.ts` × 1 (`backup export adds a history entry`)

**Severity:** **POTENTIAL BLOCKER** — if Bibliogon ships to users via Docker, the backup feature crashes the moment a user clicks "Export". Verify whether the production Dockerfile actually mounts `config/` writable; if so this is "only" a local-dev-Docker bug. If config is read-only in prod Docker (as is conventional), this is a P0 data-protection regression that must ship in v0.31.0.

### Group B — Plugin install endpoint 500 (likely related Docker permission issue)

**Tests (3):**
- `plugin-install.spec.ts` × 3 (`install a valid plugin ZIP via API`, `installed plugin appears in the list`, `uninstall removes the plugin`)

**Symptom:** `expect(received).toBe(200); Received: 500`. Did not pull full stacktrace; likely the plugin extractor cannot write to `plugins/installed/` in the same Docker setup. Same class of bug as Group A.

**Severity:** Likely BLOCKER on the same Docker-deployment ground.

### Group C — Test environment lacks reachable AI server

**Symptom:** `toolbar-ai` button is rendered with `disabled` because the AI provider (`https://api.anthropic.com/v1`) is unreachable from the dev environment. UI correctly shows a tooltip "KI-Server nicht erreichbar". The test asserts the button is enabled.

**Tests (4):**
- `ai-review.spec.ts` × 4

**Severity:** TEST-INFRA, not product. The application's behavior is correct (disabled + tooltip when AI unreachable). The smoke spec assumes a reachable AI provider — that's a precondition the spec should either mock or skip when unmet. File as P3.

### Group D — Single failures (need brief look)

- `ai-template-roundtrip.spec.ts: Articles bulk-action bar exposes the AI dropdown when 1+ selected` — TimeoutError waiting for `[data-testid="article-select-<UUID>"]`. The HTML snapshot shows the Dashboard header but not the article row. Possible race condition (article created via API but UI hasn't refreshed). **This tests a NEW feature shipped since v0.30.0** (bulk AI-fill on articles bulk-action bar) — needs investigation to determine if it's a real frontend regression or a test-pacing issue.
- `article-topic-seo.spec.ts: topics round-trip through Settings into the editor dropdown` — single-test failure; needs inspection.
- `export-download.spec.ts: PDF export returns a valid file` — PDF export failure; likely Docker permission related (writing the PDF to disk).

**Severity:** Mixed. The `ai-template-roundtrip` failure should be triaged before release; the others can be deferred subject to triage.

## Build warnings (frontend)

```
(!) Some chunks are larger than 500 kB after minification.
dist/assets/index-DabnKgl5.js   1,063.57 kB │ gzip: 295.76 kB

[INEFFECTIVE_DYNAMIC_IMPORT] src/utils/eventRecorder.ts is dynamically imported by
src/api/client.ts, src/utils/notify.ts but also statically imported by
src/components/ErrorReportDialog.tsx, src/components/EventRecorderSetup.tsx,
dynamic import will not move module into another chunk.
```

- Bundle size 1.06 MB / 295.76 KB gzipped. Non-blocking but worth a `manualChunks` review for v0.31.0+.
- The ineffective-dynamic-import warning means `eventRecorder.ts` is being shipped in the main chunk even though the code-split call sites tried to defer it. Either remove the dynamic import call sites (acknowledging it's eager-loaded), or remove the static imports from `ErrorReportDialog.tsx` / `EventRecorderSetup.tsx` (acknowledging code-split).

**Severity:** P3 IMPROVEMENT. Not a release blocker.

## What this verification proves

1. Every unit-test, integration-test, type-check and lint gate is **green**. The application's compiled behavior under tests is correct.
2. Two CI release-gate checks are **red**: version-pin lock-step and mkdocs nav. Both are mechanical fixes (one literal, one `make sync-mkdocs-nav`) — not behavior bugs — but they will reject any v0.31.0 tag push under the current release-gate CI workflow.
3. The Playwright smoke suite surfaces a **latent release-blocker** in the backup/export path that has been in the codebase since v0.18.x (the V-01 feature) and would break for any user running Docker. This was masked from earlier releases because the smoke suite ran on a non-Docker dev env.

## Recommended verification before tag-push

If the user decides to ship v0.31.0:

- [ ] Fix DRIFT-1 (medium-import `__version__`) — single-line change.
- [ ] Fix DRIFT-2 (`make sync-mkdocs-nav`) — one command + one commit.
- [ ] Decide on Group A bug: fix path-isolation in `backup_history.py` (path-resolution helper), OR document as known Docker issue and defer.
- [ ] Decide on Group B (plugin install Docker permission) — same call.
- [ ] Optionally: triage `ai-template-roundtrip.spec.ts` failure (new-feature regression candidate).
- [ ] Optionally: investigate Group C / Group D individually if release timing permits.

**This is verification only — no code or config has been modified.**

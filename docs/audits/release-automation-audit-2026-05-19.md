# Release-Workflow Automation Audit — 2026-05-19

**Status:** Audit complete. STOP gate active: no automation code until user confirms D1–D5 + scope selection.

**Scope:** version-string propagation + release-workflow automation. Read-only audit; current state of all tooling cross-referenced against the v0.34.0 + v0.34.1 release cuts I just performed.

**TL;DR:** Bibliogon already has the Maven-property pattern conceptually — `backend/pyproject.toml` is the canonical single-source-of-truth, `make sync-versions` is the propagation mechanism, and `make sync-versions-check` + `scripts/verify_version_pins.sh` are the verification gates. Coverage is ~70% of mechanical work today. Real gaps are: (a) aggregate Makefile targets for the manual-but-scriptable steps (state capture, dep-currency check, test-gate composition, tag-push, release-publish); (b) `frontend/package-lock.json` top-level `version` field lags `package.json` (sync-versions doesn't touch the lock); (c) no discovery mechanism for NEW version-string references introduced by future features. Recommendation: a small Makefile-target extension + one sync-versions fix + one optional pre-commit hook. NOT a Maven-property rewrite — the architecture already matches the pattern.

---

## Track A — Current version-string locations

Comprehensive grep across `*.toml | *.json | *.py | *.ts | *.tsx | *.sh | *.ps1 | *.spec | Makefile | *.yaml`, excluding lockfiles + node_modules + dist + .venv + .git + per-release-notes + journal/audit/help docs.

### Tier 1 — Canonical single-source-of-truth (HAND-EDIT ONLY)

| File | Field | Notes |
|---|---|---|
| `backend/pyproject.toml` | `version = "..."` | Per release-workflow.md "ONE canonical pyproject"; hand-edited at line 3 |

### Tier 2 — Auto-propagated by `make sync-versions` (DO NOT EDIT)

Confirmed by running sync-versions in this session: 16 file edits + 2 installer regenerations:

| File | Mechanism |
|---|---|
| `frontend/package.json` | JSON edit at top-level `version` |
| `launcher/pyproject.toml` | TOML edit at `tool.poetry.version` |
| `launcher/bibliogon_launcher/__init__.py` | `__version__ = "..."` literal substitution (kept literal for frozen-binary compat) |
| `launcher/bibliogon-launcher.spec` | CFBundleVersion + CFBundleShortVersionString plist entries (both same value) |
| `plugins/*/pyproject.toml` × 10 | Lock-step bumps (per-plugin independent versions deferred to a future Core-vs-Third-Party decision) |
| `install.sh` | Regenerated from `install.sh.template` + `backend/pyproject.toml` via `scripts/generate_install_sh.sh` |
| `install.ps1` | Regenerated from `install.ps1.template` (same mechanism) |

### Tier 3 — Build-time / runtime derivation (NO LITERAL TO MAINTAIN)

| Site | Mechanism | Fallback on failure |
|---|---|---|
| `backend/app/__init__.py:__version__` | `tomllib.load(backend/pyproject.toml)["tool"]["poetry"]["version"]` at import | sentinel string + `logger.warning` |
| `frontend` `__APP_VERSION__` | Vite `define` at build, reads `package.json` | TypeScript `declare const __APP_VERSION__: string;` in `vite-env.d.ts` |
| `launcher/bibliogon_launcher/installer.py:BIBLIOGON_TARGET_VERSION` | PyInstaller spec writes `_build_info.py` (gitignored); dev fallback reads pyproject | `"0.0.0+unknown"` with logger.warning |
| `plugins/bibliogon-plugin-git-sync/bibliogon_git_sync/__init__.py:__version__` | `importlib.metadata.version("bibliogon-plugin-git-sync")` | `PackageNotFoundError` fallback |

Verified: `git check-ignore launcher/bibliogon_launcher/_build_info.py` returns exit 0 (correctly gitignored).

### Tier 4 — Manual content (LLM/human-drafted per release; the canonical version literal is fine; the surrounding prose is the work)

| File | Field | Type of work |
|---|---|---|
| `CLAUDE.md` | "Version: X.X.X (...)" prose summary line | Composing the ~100-commit summary |
| `docs/CHANGELOG.md` | `## [X.X.X] - YYYY-MM-DD` header + Added/Changed/Fixed bullet body | Composing the release narrative |
| `changelog/releases/vX.X.X.md` | Full per-release notes file | Composing the user-facing announcement |
| `docs/journal/chat-journal-session-YYYY-MM-DD.md` | Release-flow record | Composing the session retrospective |

### Tier 5 — UNTRACKED / DRIFT (no automation today)

| File | Current state | Concern |
|---|---|---|
| `frontend/package-lock.json` | Top-level `"version": "0.34.0"` at lines 3 + 9 — STALE | npm doesn't sync this when `package.json` is edited externally; only `npm install` re-syncs. `make sync-versions-check` doesn't catch it because it ignores lockfiles. |
| `.claude/settings.local.json` | Contains `0.34.0` literal in some test/cache state | Out of release-workflow scope (local-only settings) |

---

## Track B — Existing tooling deep-dive

### `make sync-versions` (canonical → 16 files)

Implementation: `scripts/sync_versions.py` (10821 bytes, stdlib-only Python).

- **Reads:** `backend/pyproject.toml` `[tool.poetry.version]` via `tomllib.load`.
- **Writes:** the 16 Tier-2 locations + regenerates `install.sh` / `install.ps1`.
- **Modes:** default (apply), `--dry-run`, `--check` (exit 1 on drift).
- **Idempotent:** running twice produces no diff after first run.
- **NOT bare-update:** does NOT mutate Tier-3 (runtime-derivation) sites; does NOT mutate Tier-4 (manual content) sites.
- **Coverage gap:** does NOT touch `frontend/package-lock.json` top-level `version`.

### `make sync-versions-check` (CI gate)

Implementation: `scripts/sync_versions.py --check`. Exits 1 if any subsystem version drifts from canonical. Used by `release-gate.yml` workflow on tag-push.

### `scripts/verify_version_pins.sh <VERSION>` (pre-tag validator)

7256 bytes. Two responsibilities:

1. **Lock-step check:** runs `sync_versions.py --check` to confirm all subsystems match `<VERSION>`.
2. **Regression detectors:** greps for hardcoded version literals in the "DO NOT EDIT" tier, fails if any reappear:
   - Python `__version__ = "..."` outside `_build_info` (excluded because gitignored)
   - Any reintroduction of the removed `COMPATIBLE_VERSION` symbol
   - Frontend `APP_VERSION = "..."` literals in `frontend/src/` (caught by Vite `__APP_VERSION__` pattern)
   - `install.sh` template sync (re-runs `scripts/generate_install_sh.sh --check`)

### `make verify-plugin-locks` (plugin-lock-drift gate)

For each `plugins/bibliogon-plugin-*/`, runs `poetry install --dry-run --no-interaction --no-ansi` and greps for "changed significantly". Catches the v0.30.0-style hotfix where the backend lock + per-plugin locks drifted independently after a shared-dep pin bump.

### `make verify-docs-discipline` (mandatory docs gate)

Aggregates `verify-mkdocs-nav` + `check-mkdocs-orphans`. Pre-tag chain since v0.30.0+.

### Makefile inventory of release-related targets

```
test, test-backend, test-plugins, test-frontend            # test suites
sync-versions, sync-versions-dry, sync-versions-check       # version propagation
lock-all-plugins, verify-plugin-locks                       # plugin-lock discipline
sync-mkdocs-nav, verify-mkdocs-nav, check-mkdocs-orphans,
verify-docs-discipline                                      # docs discipline
test-e2e, test-e2e-ui                                       # e2e (separate from `test`)
check-blockers                                              # upstream-blocker ping
```

**NOT in Makefile (manual today):**
- State-capture sequence (last tag, commits since, files-changed, current versions)
- Dependency-currency check across all surfaces (`poetry show --outdated` × backend + launcher + 11 plugins + `npm outdated`)
- Test-gate composition (the Step 5 mandatory chain: `make test` + `tsc --noEmit` + `npm run test` + ruff + mypy + pre-commit + verify-docs-discipline + launcher PyInstaller build smoke)
- Build-gate composition (`poetry build` if package-mode + `npm run build`)
- Tag + push sequence (`git tag -a` + `git push main` + `git push tag`)
- GitHub Release publication (`gh release create --notes-file ...`)
- Smoke-suite invocation against running app (`npx playwright test --project=smoke`)

### Existing scripts/ tooling

```
sync_versions.py          version propagation (Tier 1 → Tier 2)
verify_version_pins.sh    pre-tag validator
generate_install_sh.sh    install.sh template renderer
archive_completed_task.py ROADMAP/backlog archival
check_help_meta_completeness.py
check_mkdocs_orphans.sh
check_plugin_lock_paired.py
check-blockers.sh         upstream-blocker ping
audit_module_state.py
audit_notify_error_calls.py
audit_theme_tokens.py
```

No `release.sh` orchestrator exists. The release-workflow.md Step 1–11 sequence is a checklist that Claude executes by hand each release.

### `.github/RELEASE_TEMPLATE.md`

Static prerequisites template (Download / Verifying / "Before you install" sections). Per its own header: "Static reference template. Copy the relevant sections into `changelog/releases/vX.Y.Z.md`. No automation reads this file."

No release-journal template exists; the journal entry is composed freshly each session.

### CI workflows

- `release-gate.yml` — runs on tag-push; gates artifact attachment on `sync-versions-check` + `verify_version_pins.sh`.
- `launcher-{linux,macos,windows}.yml` — build the launcher binaries on `release: created`. Each rebuilds `_build_info.py` from canonical at build time (Tier-3 derivation).

---

## Track C — Maven-property pattern feasibility

**Finding: Bibliogon already implements the Maven-property pattern.** The architectural goal — one canonical source + propagation to all references — is exactly what `sync_versions.py` does. The only delta versus Maven is mechanical: Maven substitutes property variables at build time, Bibliogon substitutes literals via the sync script.

| Maven concept | Bibliogon equivalent |
|---|---|
| `${project.version}` property | `backend/pyproject.toml` `[tool.poetry.version]` |
| Build-time substitution of all `${project.version}` refs | `make sync-versions` literal-substitutes 16 files |
| Verification (`mvn dependency:tree`) | `make sync-versions-check` + `scripts/verify_version_pins.sh` |
| Runtime-readable version (`Implementation-Version` in JAR manifest) | `backend/app/__init__.py:_read_version()` via tomllib at import; `__APP_VERSION__` via Vite define; etc. |

**Where Maven would be cleaner:** template-files with `@@VERSION@@` placeholders that all 16 derived files reference. `install.sh.template` already uses this pattern (`@@BIBLIOGON_VERSION@@`). Could be extended to every file — but the cost (10+ template files, regenerate-on-every-edit) outweighs the benefit when sync-versions already works.

**Recommendation: do NOT migrate to a different propagation mechanism.** The current architecture is the Maven-property pattern in a different syntactic skin; rewriting would be churn for churn's sake. **The gaps to fix are bookkeeping (which files sync-versions touches) and orchestration (Makefile aggregates for the manual steps).**

### Three propagation-mechanism options (for reference)

| Option | Concept | Currently used for |
|---|---|---|
| **A — Template + literal substitution** | `*.template` files with `@@VAR@@` placeholders; script regenerates target on bump | `install.sh`, `install.ps1` |
| **B — Direct literal substitution** | Script edits literal at known location (`__version__ = "X.X.X"` line, CFBundleVersion field, etc.) | Most plugin + launcher files |
| **C — Runtime derivation** | Code reads version from canonical at import/build time | `backend/app/__init__.py`, `frontend __APP_VERSION__`, launcher `_build_info.py` |

All three coexist intentionally. Option A is for files curl-piped over the network where there's no chance to run a build step (install.sh from raw GitHub). Option B is for build-tool config files that must contain a string literal (pyproject.toml, package.json). Option C is the most elegant but requires the consuming code to be able to import or build — install.sh can't.

---

## Track D — Discovery mechanism for future version-references

**Today's coverage:**

- `verify_version_pins.sh` has regression detectors that catch hardcoded literals in the existing "DO NOT EDIT" tier (Python `__version__`, frontend `APP_VERSION`, install.sh template sync).
- But these are **closed-set** detectors — they only check the locations sync_versions.py KNOWS about. A NEW file added by a future feature with a `version = "0.34.0"` literal would slip past every gate.

**Concrete blind spots found in this audit:**

1. `frontend/package-lock.json` top-level `version` field — npm's own lock metadata. Lags `package.json` between sync-versions runs. Not caught by any existing check. Verified lag in current tree: package.json says 0.34.1, lock says 0.34.0.
2. `.claude/settings.local.json` — contains a stale 0.34.0 reference (Claude Code local cache). Out of scope but illustrates the closed-set problem.

**Three options for closing the open-set:**

| Option | Mechanism | Cost | Coverage |
|---|---|---|---|
| **D-a — Grep-warn in `verify_version_pins.sh`** | Extend the script to grep every source file for X.Y.Z literals; print anything outside the known-target list as a WARNING (not a failure) | ~30 LOC bash | Visible at release time |
| **D-b — Pre-commit hook** | New hook fails if a staged change introduces an X.Y.Z literal AND the containing file isn't in `sync_versions.py`'s `collect_targets()` allowlist | ~50 LOC bash | Catches at commit time; harder to override |
| **D-c — Release-prep grep target** | New `make release-discover` target that prints all version-literal locations the script doesn't know about; advisory output | ~20 LOC Makefile | Visible only when explicitly invoked |

**Recommendation: D-a + D-c (combined).** Pre-commit (D-b) is too aggressive — it fires on every commit and would block legitimate edits (e.g. a test fixture using `"2.0.0"` as a hardcoded plugin version per `backend/tests/test_settings_api.py:279`). Grep-warn at release time (D-a in verify-version-pins) + an on-demand discovery target (D-c) gives the same visibility without the friction.

---

## Sub-decisions D1–D5 (pending user confirmation)

### D1 — Single-source-of-truth choice

**Recommended: keep `backend/pyproject.toml` `[tool.poetry.version]`.**

It's the existing canonical; tooling depends on it; the entire derivation chain assumes it. Switching to a separate `VERSION` file would require rewriting:
- `scripts/sync_versions.py` (reads pyproject)
- `backend/app/__init__.py:_read_version()` (reads pyproject)
- `launcher/bibliogon_launcher/installer.py` dev-fallback (reads pyproject)
- `scripts/verify_version_pins.sh` (validates against pyproject)
- 5 references in release-workflow.md

For zero functional benefit. **Confirm: keep `backend/pyproject.toml`.**

### D2 — Propagation mechanism

**Recommended: keep the existing hybrid** (template substitution for `install.{sh,ps1}`, literal substitution for build-tool config files, runtime derivation where consumers can build/import). Already covers Tier 2 + Tier 3 cleanly.

**Open question for user:** should the existing CHANGELOG/per-release-notes/CLAUDE.md/journal Tier 4 work get template-based scaffolding? Concretely:
- `docs/CHANGELOG.template.md` with `@@VERSION@@` + `@@DATE@@` placeholders + a section-skeleton (Added/Changed/Fixed/Deferred)? Renders to a partial CHANGELOG entry that the author fills in.
- `changelog/releases/template.md` — same idea for per-release notes.

**My view:** the prose-composition is the work for Tier 4. Template-scaffolding saves ~5 mins of boilerplate per release but doesn't reduce the LLM/author cognitive load. **Confirm: skip Tier 4 scaffolding for now; revisit if release frequency increases.**

### D3 — Discovery-mechanism for future references

**Recommended: D-a + D-c** (warn-grep in verify-version-pins + on-demand discovery Makefile target). Skip pre-commit (D-b) for the reasons in Track D.

### D4 — CI verification scope expansion

**Current:** `release-gate.yml` runs `sync-versions-check` + `verify_version_pins.sh` on tag-push.

**Gap:** does NOT run `verify-plugin-locks`, does NOT run the launcher PyInstaller build smoke, does NOT run `make verify-docs-discipline`. These run locally per the release-workflow.md final-checklist but a forgotten step is silently shipped.

**Recommended: extend `release-gate.yml`** to run the full pre-tag chain. Caveat: launcher PyInstaller build adds ~3-5 min runtime to the gate.

**Open question for user:** worth the CI minutes? Or rely on the local pre-push hook (already installed)?

### D5 — Backward-compat with existing tools

**Recommended: extend, don't replace.** New Makefile targets compose existing tools. `make sync-versions` stays as the canonical propagation. `verify_version_pins.sh` stays as the pre-tag validator. Add aggregate targets that call them in sequence.

**No breaking changes to existing release-workflow.md flow.** New `make release-state` etc. are convenience wrappers; the hand-driven path stays valid.

---

## Proposed implementation scope

### Scope 1 — Aggregate Makefile targets (recommended core)

Add 6 new Makefile targets that compose existing tooling into release-cycle aggregates:

| Target | Calls |
|---|---|
| `make release-state` | git tag list + `git log <last_tag>..HEAD` + `git diff --stat` + version grep summary |
| `make release-outdated` | `poetry show --outdated` × backend + launcher; `npm outdated` × frontend; tabular summary |
| `make release-test` | `make test` + frontend tsc + ruff + mypy + pre-commit + verify-docs-discipline + verify-plugin-locks + launcher PyInstaller build smoke |
| `make release-build` | conditional `poetry build` (if package-mode) + `npm run build` |
| `make release-tag VERSION=X.Y.Z` | `verify_version_pins.sh $(VERSION)` + `git tag -a v$(VERSION)` + `git push origin main` + `git push origin v$(VERSION)` |
| `make release-publish VERSION=X.Y.Z` | `gh release create v$(VERSION) --notes-file changelog/releases/v$(VERSION).md` |

**Estimate:** ~80 LOC Makefile, 1 commit. No new scripts needed.

### Scope 2 — package-lock.json sync (fix Tier-5 drift)

Extend `scripts/sync_versions.py` to also write `frontend/package-lock.json` top-level `version` field (lines 3 + 9). Surgical JSON edit; no `npm install` invocation (which would risk transitive changes).

**Estimate:** ~25 LOC Python, 1 commit.

### Scope 3 — Discovery mechanism (Track D-a + D-c)

- Extend `scripts/verify_version_pins.sh` with a final WARN-only grep over `*.py | *.ts | *.tsx | *.toml | *.json | *.sh | *.ps1 | *.yaml | *.md` (excluding the closed-set known-target list + Tier 4 manual files + lock files + node_modules / .venv / dist).
- New `make release-discover` target that runs the same grep with verbose output for release prep.

**Estimate:** ~50 LOC bash, 1 commit.

### Scope 4 — `release-gate.yml` CI expansion (per D4 outcome)

Extend the workflow to run `verify-plugin-locks` + `verify-docs-discipline` + launcher PyInstaller build smoke at tag-push.

**Estimate:** ~30 LOC YAML, 1 commit. Costs ~3-5 CI min per gate run.

### Total scope estimate

- Scope 1 (recommended core): 1 commit
- Scope 2 (recommended fix): 1 commit
- Scope 3 (recommended hardening): 1 commit
- Scope 4 (conditional on D4): 1 commit

**Total: 3–4 commits.** Well under the 5-commit stop-condition. Split-session not needed.

---

## STOP gate — what I need from user before any code

**Confirm or correct each:**

- **D1 — Source-of-truth:** keep `backend/pyproject.toml`? (recommended yes)
- **D2 — Propagation:** keep existing hybrid + skip Tier 4 template scaffolding? (recommended yes — skip)
- **D3 — Discovery mechanism:** D-a + D-c (warn-grep in verify-pins + `make release-discover`)? (recommended yes)
- **D4 — CI expansion:** extend `release-gate.yml` to run verify-plugin-locks + verify-docs-discipline + launcher build at tag-push? (recommended yes — but costs ~3-5 CI min per gate run)
- **D5 — Backward-compat:** extend rather than replace existing tooling? (recommended yes)

**Scope selection:**

- Scope 1 (aggregate Makefile targets): YES / NO / smaller subset
- Scope 2 (package-lock.json fix): YES / NO
- Scope 3 (discovery mechanism): YES / NO
- Scope 4 (CI expansion): YES (paired with D4=yes) / NO

**Coordination:**

- Run AFTER Session 6 PDF Export close (current user preference per yesterday)?
- Run BEFORE Session 6 (would benefit Session 6 by making the v0.35.0 cut smoother)?
- Run AS its own session NOW (deferring Session 6 to next sitting)?

**Stop-condition check:**

- Existing tooling already covers 70% — proposing minimal-gap-fix per Track B finding. **NOT** a Maven-property rewrite (Bibliogon already implements that pattern conceptually).
- Audit revealed two inconsistencies: stale `frontend/package-lock.json` version + closed-set discovery. Fix-inconsistencies-first vs script-around: Scope 2 fixes the lock-file drift; Scope 3 closes the discovery gap. **Recommended: fix both.**
- Scope ≤ 5 commits ✓. No split needed.

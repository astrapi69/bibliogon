# Release automation

How Bibliogon's release-cycle mechanics work: version propagation, pre-tag verification, aggregate Makefile targets, and the CI gate. The companion human-side flow lives at [.claude/rules/release-workflow.md](../../.claude/rules/release-workflow.md); this document is the architecture + tooling reference.

**TL;DR:** `backend/pyproject.toml` is the canonical single-source-of-truth. `make sync-versions` propagates to 17 derived files. `scripts/verify_version_pins.sh` is the pre-tag validation chain. Six aggregate `make release-*` targets cover the Step 1 / 4b / 5 / 6 / 7 / 8 mechanics. The `release-gate.yml` CI workflow re-runs the same checks on every tag push.

---

## Architecture

Bibliogon implements the Maven-property pattern in a multi-language repo: one canonical version source, automated propagation to every reference.

### Tier 1 — Canonical source (hand-edit only)

| File | Field | Mechanism |
|---|---|---|
| `backend/pyproject.toml` | `version = "..."` | Hand-edited at line 3, ONCE per release |

### Tier 2 — Auto-propagated by `make sync-versions`

17 files updated by `scripts/sync_versions.py` in one invocation:

| File | Mechanism |
|---|---|
| `frontend/package.json` | JSON edit at top-level `version` |
| `frontend/package-lock.json` | Surgical regex on the FIRST TWO `"version":` lines (top-level + `packages[""]`) |
| `launcher/pyproject.toml` | TOML edit at `tool.poetry.version` |
| `launcher/bibliogon_launcher/__init__.py` | `__version__ = "..."` literal substitution |
| `launcher/bibliogon-launcher.spec` | `CFBundleVersion` + `CFBundleShortVersionString` (both same value) |
| `plugins/*/pyproject.toml` × 10 | Lock-step (plugin-independent versioning deferred per CLAUDE.md note) |
| `install.sh` | Regenerated from `install.sh.template` via `scripts/generate_install_sh.sh` |
| `install.ps1` | Regenerated from `install.ps1.template` (same mechanism) |

### Tier 3 — Runtime-derived (no literal to maintain)

| Site | Mechanism | Fallback |
|---|---|---|
| `backend/app/__init__.py:__version__` | `tomllib.load(backend/pyproject.toml)["tool"]["poetry"]["version"]` at import | sentinel string |
| `frontend __APP_VERSION__` | Vite `define` build-time literal from `package.json` | n/a (build-time fail) |
| `launcher/bibliogon_launcher/installer.py:BIBLIOGON_TARGET_VERSION` | PyInstaller spec writes `_build_info.py` at build time (gitignored); dev fallback reads pyproject | `"0.0.0+unknown"` |
| `plugins/bibliogon-plugin-git-sync/__init__.py:__version__` | `importlib.metadata.version("bibliogon-plugin-git-sync")` | `PackageNotFoundError` fallback |

### Tier 4 — Manual content (LLM/human-drafted per release)

These intentionally contain a hand-typed version literal as part of the release narrative; not in scope for `sync-versions`:

- `CLAUDE.md` "Version: X.X.X (...)" prose summary
- `docs/CHANGELOG.md` `## [X.X.X] - YYYY-MM-DD` section header + body
- `changelog/releases/vX.Y.Z.md` per-release notes
- `docs/journal/chat-journal-session-YYYY-MM-DD.md` release session entry

---

## Tooling

### `make sync-versions` — propagation

```bash
make sync-versions            # apply
make sync-versions-dry        # show what would change
make sync-versions-check      # exit 1 on drift (CI gate)
```

Implementation: [`scripts/sync_versions.py`](../../scripts/sync_versions.py) (stdlib-only). Reads `backend/pyproject.toml`, writes the 17 Tier-2 files. Idempotent. Modes: `apply` (default), `--dry-run`, `--check`.

### `scripts/verify_version_pins.sh <VERSION>` — pre-tag validation

```bash
bash scripts/verify_version_pins.sh 0.35.0
```

Validates:

1. Canonical pin matches `<VERSION>`.
2. `install.sh` is in sync with `install.sh.template`.
3. **Regression detectors** for hardcoded literals in the "DO NOT EDIT" tier (`__version__`, `APP_VERSION`, `COMPATIBLE_VERSION` reintroduction, etc.). Fail loudly if any closed-set drift is detected.
4. Subsystem lock-step (`sync-versions --check`).
5. **Open-set discovery** (advisory) via `scripts/discover_version_literals.sh`. Surfaces version literals in unexpected files.

### `scripts/discover_version_literals.sh` — open-set discovery

Greps for version-assignment patterns (`version = "..."`, `"version": "..."`, `__version__ = "..."`, etc.) across the repo, excludes the known-target set (Tier 1/2 propagated + Tier 4 manual + per-plugin static + sentinel fallbacks + test fixtures + MkDocs site output). Anything left is a discovery candidate — either:

- A new file that should be added to `sync_versions.py`'s `collect_targets()`, OR
- A legitimate one-off literal that should be added to `KNOWN_FILES` in the discovery script

Exit code always 0 (advisory). Wired into `verify_version_pins.sh` as a non-fatal WARN.

### `make verify-plugin-locks` — plugin-lock drift gate

For each `plugins/bibliogon-plugin-*/`, runs `poetry install --dry-run --no-interaction --no-ansi` and greps for "changed significantly". Catches the v0.30.0-style hotfix where the backend's combined lock + per-plugin locks drift independently after a shared-dep pin bump. Reference incident: [.claude/rules/lessons-learned.md "Two installation paths diverge"](../../.claude/rules/lessons-learned.md).

### `make verify-docs-discipline` — docs gate

Aggregates `verify-mkdocs-nav` (single-source-of-truth check against `docs/help/_meta.yaml`) + `check-mkdocs-orphans` (adversarial grep on `mkdocs build --strict` output for orphan pages). Mandatory since v0.30.0+ MKDOCS-DISCIPLINE-01.

---

## Aggregate `make release-*` targets

Six targets compose existing tooling for the mechanical steps of `release-workflow.md`:

| Target | release-workflow.md Step | What it does |
|---|---|---|
| `make release-state` | Step 1 | Print latest tag + commits since + diff stat + current canonical version |
| `make release-outdated` | Step 4b | `poetry show --outdated` × backend + launcher; `npm outdated` × frontend |
| `make release-test` | Step 5 | `make test` + frontend tsc + backend ruff + mypy + pre-commit + `verify-docs-discipline` + `verify-plugin-locks` + launcher PyInstaller build smoke |
| `make release-build` | Step 6 | Conditional backend `poetry build` (skipped iff `package-mode=false`) + frontend `npm run build` |
| `make release-tag VERSION=X.Y.Z` | Step 7 | `verify_version_pins.sh $(VERSION)` + `git tag -a` + push main + push tag |
| `make release-publish VERSION=X.Y.Z` | Step 8 | `gh release create v$(VERSION) --notes-file changelog/releases/v$(VERSION).md` |
| `make release-discover` | Step 4 supplement | Run the open-set version-literal discovery script with verbose output |

**Not automated (LLM/human value-add):**
- Step 2 SemVer classification
- Step 3 CHANGELOG draft + per-release notes composition
- Step 11 CLAUDE.md + journal post-release docs

**Not in scope:**
- Playwright `--project=smoke` (needs running app; runs separately)
- Docker push (skip in current release flow)

---

## CI gate: `release-gate.yml`

Runs on every `v*` tag push + manual `workflow_dispatch`. Two parallel jobs:

### `verify-versions`

- Tag-vs-canonical match (refs/tags/vX.Y.Z must equal `backend/pyproject.toml`'s version)
- `scripts/verify_version_pins.sh <VERSION>` (full validation chain)
- `python3 scripts/sync_versions.py --check` (subsystem lock-step)

### `verify-build-infra`

- `make verify-plugin-locks` (plugin-lock drift)
- `make verify-docs-discipline` (mkdocs nav + orphans)
- Launcher PyInstaller build smoke (catches spec errors that only surface at build time)

Either job's failure blocks downstream artifact attachment (the launcher-{linux,macos,windows}.yml workflows re-run the version checks before uploading binaries to the GitHub Release).

**Cost:** ~3-5 CI min per gate run.

**Coverage relative to release-workflow.md Step 5:** verify-plugin-locks + verify-docs-discipline + launcher build are now CI-gated. `make test`, Vitest, frontend tsc, ruff, mypy, pre-commit, and Playwright smoke remain LOCAL pre-tag checks (the local pre-push hook runs pre-commit on tag push).

---

## Adding a new propagated file

When a future feature introduces a new file that needs to track the canonical version:

1. **Pick the propagation mechanism** by tier:
   - Tier 2 (auto-propagated literal): add handler + entry to `sync_versions.py`
   - Tier 3 (runtime-derived): add `tomllib.load(pyproject)` or `importlib.metadata.version()` import; document the fallback
   - Tier 4 (manual content): no automation needed; the author maintains the literal

2. **For Tier 2:**
   - Add a new handler function in `scripts/sync_versions.py` (mirror the existing `update_*` helpers)
   - Register the handler in the `HANDLERS` dict + the `collect_targets()` list
   - Add the file path to `KNOWN_FILES` in `scripts/discover_version_literals.sh` (so it doesn't show up as an unknown-literal warning)
   - Add a pytest case to `backend/tests/test_sync_versions.py`

3. **Add a regression detector** to `scripts/verify_version_pins.sh` if the new file has a "DO NOT EDIT" tier where a contributor might be tempted to hand-edit (e.g. a generated artifact that should derive from elsewhere).

4. **Update this document's Tier 2 table** with the new file + mechanism.

---

## Adding a new version-string location discovered in the wild

When `make release-discover` (or the verify-pins WARN section) surfaces an unexpected file:

1. **Decide:** is it a sync-target (should be auto-propagated) or a legitimate one-off (test fixture, sample data, separate sub-project)?

2. **If sync-target:** follow "Adding a new propagated file" above.

3. **If legitimate one-off:** add the file path to `KNOWN_FILES` in `scripts/discover_version_literals.sh` with a brief comment explaining why it's intentional. Re-run `make release-discover` to confirm it drops off the list.

---

## Audit history

The release-automation architecture was formalised in the [2026-05-19 audit](../audits/release-automation-audit-2026-05-19.md). At audit time the propagation pattern existed but had three documented gaps:

- `frontend/package-lock.json` top-level `version` field not synced
- No open-set discovery for future references
- CI gate did not run `verify-plugin-locks` / `verify-docs-discipline` / launcher build

All three closed in the same release cycle. Future audits should re-run `make release-discover` against the working tree as part of release prep — anything new there is a candidate for one of the two adding-a-new-X recipes above.

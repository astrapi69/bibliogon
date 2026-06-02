# Release workflow

The permanent workflow for Bibliogon releases. Claude Code reads
this file automatically when a release is due.

Prompt triggers: "release new version", "new release", "deploy new version"

---

## Ground rules

- Do not skip manual steps: the checklist at the end is mandatory
- Every release is a logical boundary: do not release in the middle of a feature
- Tests must be green: red tests block the release, no exceptions
- The CHANGELOG is for humans: do not paste raw commit messages, summarize meaningfully
- Version bump follows SemVer, even in the 0.x phase

---

## Pre-Release Gate: Aster E2E Confirmation

Before `make release-tag`:

1. Aster runs: `cd e2e && npx playwright test --project=smoke`
2. Aster confirms: 0 failures in chat
3. If ANY failure: CC fixes, Aster re-runs, repeat until green
4. Only then: CC may run `make release-tag`

CC must NOT push the tag autonomously. The tag is the irreversible step.
Aster's confirmation is a mandatory STOP-gate. This overrides any
session instruction to "push the tag autonomously" — the local
`make release-test` gate (backend + Vitest + lint + type + launcher
build) is necessary but NOT sufficient, because it cannot exercise
the real browser. Passing unit/component tests do not prove a UI
flow works end-to-end (see lessons-learned "Coverage Illusion").

---

## Aggregate Makefile targets (reduce manual-step surface)

Since the 2026-05-19 release-automation audit, six aggregate targets cover the mechanical steps of this workflow. Use them where applicable; the hand-driven commands below each Step block stay valid for cases where targets don't fit.

| Target | Replaces |
|---|---|
| `make release-state` | Step 1 manual git tag/log/diff invocations |
| `make release-outdated` | Step 4b manual `poetry show --outdated` × 3 surfaces + `npm outdated` |
| `make release-test` | Step 5 mandatory chain (make test + tsc + ruff + mypy + pre-commit + verify-docs-discipline + verify-plugin-locks + launcher build smoke). NOT Playwright smoke (needs running app) |
| `make release-build` | Step 6 conditional `poetry build` + `npm run build` |
| `make release-tag VERSION=X.Y.Z` | Step 7 `verify_version_pins.sh` + `git tag -a` + push main + push tag |
| `make release-publish VERSION=X.Y.Z` | Step 8 `gh release create` with notes file |
| `make release-discover` | Discovery scan for version literals outside the sync-versions target list (advisory) |

What stays MANUAL: Step 2 SemVer classification, Step 3 CHANGELOG draft + per-release notes composition, Step 11 CLAUDE.md prose + journal entry. These need LLM/human judgment per release; automation provides no value.

Reference: [docs/development/release-automation.md](../../docs/development/release-automation.md) for the full SSoT architecture + tooling reference.

---

## Step 1: Capture the current state

Before doing anything, show the current state:

```bash
# Latest release tag
git tag --sort=-creatordate | head -5

# Commits since the last tag (tag determined dynamically)
LAST_TAG=$(git describe --tags --abbrev=0)
git log ${LAST_TAG}..HEAD --oneline --no-merges

# Statistics
git diff ${LAST_TAG}..HEAD --stat | tail -1

# Current versions
grep -H "version" backend/pyproject.toml frontend/package.json 2>/dev/null | head -5
```

Show the user the summary and wait for confirmation before the
release continues.

---

## Step 2: Version bump per SemVer

Analyze the commits to decide:

| Commit type | Bump |
|-------------|------|
| `BREAKING CHANGE` in the body or `!` after the type | Major (v1.0.0) |
| `feat:` | Minor (v0.X.0) |
| `fix:`, `perf:`, `refactor:` without breaking changes | Patch (v0.X.Y) |
| Only `docs:`, `chore:`, `test:` | Patch (v0.X.Y) |

In the 0.x phase a major bump is rare. Breaking changes usually
lead to a minor bump with a breaking-changes section in the CHANGELOG.

Propose the new version with rationale. Wait for user OK or
correction.

---

## Step 3: Generate CHANGELOG.md

Build a clean CHANGELOG entry from the commits. Do not paste raw,
group and summarize.

Groups in this order:
- **Breaking Changes** (only when needed, at the top)
- **Added** (feat:)
- **Changed** (refactor:, perf:)
- **Deprecated**
- **Removed**
- **Fixed** (fix:)
- **Security**

Format rules:
- Past tense or present, consistent within the entry
- Take the scope from the commit when it helps (e.g. "Audiobook plugin: ...")
- Collapse multiple commits touching the same feature
- Drop or briefly mention internal refactorings without user impact

Example structure:

```markdown
## [0.10.0] - 2026-04-XX

### Added
- Feature description, user-relevant

### Fixed
- Bug description so the user can tell what improved

### Changed
- Important changes to existing features
```

Also produce a separate file `changelog/releases/v0.X.0.md`
containing only the new entry, for the GitHub release notes.

Commit:
```
docs: changelog for v0.X.0
```

---

## Step 4: Bump version

Bibliogon ships in lock-step. ALL components carry the same
version string at every release. Only ONE file is hand-edited;
everything else is propagated by tooling.

### Hand-edit (the ONLY editable version source)

- [ ] `backend/pyproject.toml`: `version`

That is the entire human-side checklist. Do not touch any other
version field; do not touch `frontend/package.json`'s version,
do not touch any `plugins/*/pyproject.toml`, do not touch the
launcher spec or `__init__.py`. The tool does it.

### Propagate to all subsystems

```bash
make sync-versions
```

This single command updates:
- `frontend/package.json`
- `launcher/pyproject.toml`
- `launcher/bibliogon_launcher/__init__.py` (`__version__` literal)
- `launcher/bibliogon-launcher.spec` (CFBundleVersion +
  CFBundleShortVersionString, both same value)
- All 10 `plugins/*/pyproject.toml`
- `install.sh` (regenerated from `install.sh.template` via
  `scripts/generate_install_sh.sh`)

### Verify

```bash
make sync-versions-check
scripts/verify_version_pins.sh <new-version>
```

`make sync-versions-check` exits non-zero if any subsystem
drifts from canonical. `verify_version_pins.sh` runs the same
check plus regression detectors for hardcoded literals in the
"DO NOT EDIT" tier (Python `__version__ = "..."` outside
`_build_info`, any reintroduction of the removed
`COMPATIBLE_VERSION` symbol, frontend `APP_VERSION = "..."`
literals, `install.sh` template sync). Both must succeed
before tagging.

CI runs the same checks at `release-gate.yml` (on tag push) and
again as the first step of every launcher build job (on
`release: created`). Artifact attachment is blocked if either
fails - this is hard enforcement, not advisory.

### Tag and push

```bash
git add -A
git commit -m "chore(release): bump version to v<new-version>"
git tag v<new-version>
git push origin main --tags
```

### What derives from what (DO NOT EDIT)

| Derived location | Source | Mechanism |
|---|---|---|
| `backend/app/__init__.py:__version__` | `backend/pyproject.toml` | tomllib parse at module import |
| `install.sh` | `install.sh.template` + `backend/pyproject.toml` | release-time substitution via `scripts/generate_install_sh.sh` (called by `sync-versions`) |
| `launcher/bibliogon_launcher/installer.py:BIBLIOGON_TARGET_VERSION` | `backend/pyproject.toml` | PyInstaller build-time injection via `bibliogon-launcher.spec` writing `_build_info.py` |
| `launcher/bibliogon_launcher/__init__.py:__version__` | `backend/pyproject.toml` | `make sync-versions` literal substitution (literal kept for frozen-binary compatibility) |
| `launcher/bibliogon-launcher.spec` CFBundle plist fields | `backend/pyproject.toml` | `make sync-versions` literal substitution |
| `launcher/pyproject.toml:version` | `backend/pyproject.toml` | `make sync-versions` |
| `plugins/*/pyproject.toml:version` | `backend/pyproject.toml` | `make sync-versions` (lock-step; per-plugin independent versions deferred to a future Core-vs-Third-Party decision) |
| `plugins/bibliogon-plugin-git-sync/bibliogon_git_sync/__init__.py:__version__` | own pyproject | `importlib.metadata.version` |
| `frontend/src/components/*` `__APP_VERSION__` | `frontend/package.json` | Vite `define` build-time literal |

If a hardcoded version literal appears anywhere in the "DO NOT
EDIT" list, the derivation is broken. Fix the derivation, do not
edit the literal. The verify script's regression detectors catch
new literals.

### Conditional documentation updates (manual, only when needed)

- [ ] `docs/CONCEPT.md` (if the version is mentioned in prose)
- [ ] `README.md` (if the version is mentioned in prose)

### External Bibliogon-owned dependencies

Two libraries that the Bibliogon project also maintains are
pinned via the standard Poetry mechanism, NOT under
`make sync-versions` automation. They have independent release
lifecycles:

- `manuscripta` (book-rendering pipeline)
- `pluginforge` (plugin framework)

At each Bibliogon release, manually verify both:

- [ ] `manuscripta` pin in `backend/pyproject.toml` and every
      `plugins/*/pyproject.toml` matches the latest released
      `manuscripta` on PyPI (or whichever version you intend
      to ship with this Bibliogon release)
- [ ] `pluginforge` pin in `backend/pyproject.toml` and every
      `plugins/*/pyproject.toml` matches the latest released
      `pluginforge`

Quick check:

```bash
pip index versions manuscripta
pip index versions pluginforge
grep -rn "manuscripta\|pluginforge" \
  backend/pyproject.toml plugins/*/pyproject.toml \
  | grep "version\|\^"
```

The current deferral from `make sync-versions` rests on an
assumption of low drift (verified 2026-05-04: both pinned at
their latest PyPI release). If you find these drifting more
than once between Bibliogon releases, bring them under
`sync-versions` automation. Concrete repeated drift overrides
the deferral.

### Other release-time considerations

The `make sync-versions` step covers all Bibliogon-internal
versions. The external-dep block above is the only manual
checkpoint at release time.

---

## Step 4b: Dependency currency check

Before running the test suite, check for outdated dependencies:

```bash
cd backend && poetry show --outdated
cd launcher && poetry show --outdated
cd frontend && npm outdated
```

Apply routine bumps (patch + minor within the same major) as part
of the release. Major bumps with breaking changes get their own
dedicated session, not bundled into a release.

See ``lessons-learned.md`` "Release-cycle dependency review" for
the stability filter and red-flag rules.

---

## Step 5: Tests

Full test suite. **Every command in this list is MANDATORY.**
The 2026-05-04 v0.26.0 → v0.26.3 hotfix chain (four mechanical
point releases for a chmod bit, a PyInstaller spec NameError,
a mypy `[no-any-return]`, and a ruff-format nit) happened
because the local pre-tag verification was skipped in favor of
running only `make test`. Each hotfix was caught by a CI gate
that the local sweep would have caught first. Do not skip.

```bash
# Backend + all plugins
make test

# Frontend unit tests + type check
cd frontend && npx tsc --noEmit && npm run test

# Smoke tests (fast Playwright suite)
npx playwright test --project=smoke

# Linting and type checking (MANDATORY)
cd backend && poetry run ruff check app/ && poetry run mypy app/

# Pre-commit hooks on all files (MANDATORY - catches ruff-format
# nits, trailing whitespace, end-of-file fixes). The pre-push git
# hook installed by `make install-hooks` enforces this on every
# tag push (CI-PRECOMMIT-HOOK-01), but running it explicitly here
# is still mandatory because the hook fails the push, not the tag
# creation - skipping the pre-tag step makes a half-tagged repo.
cd backend && poetry run pre-commit run --all-files

# Docs discipline (MANDATORY since v0.30.0+ MKDOCS-DISCIPLINE-01).
# Two checks aggregated by `make verify-docs-discipline`:
#   1. verify-mkdocs-nav: mkdocs.yml is in sync with
#      docs/help/_meta.yaml (single source of truth for help-page
#      nav). Drift is the failure mode that produced the v0.30.0
#      docs+i18n drift audit findings.
#   2. check-mkdocs-orphans: adversarial grep on `mkdocs build
#      --strict` output for the INFO-level "not included in the
#      'nav' configuration" message that --strict ignores by
#      default. The two pages that sat orphan for two release
#      cycles (articles/bulk-export, install/docker-desktop)
#      would now be caught here.
make verify-docs-discipline

# Launcher build smoke (MANDATORY for any release that touches
# launcher/ or its embedded version - catches PyInstaller spec
# errors that only surface when the spec is exec'd by
# pyinstaller, NOT when it is imported as Python).
cd launcher && poetry run pyinstaller bibliogon-launcher.spec --clean --noconfirm
```

ALL must be green. On a red test:
1. Abort the release
2. Analyze and fix the problem
3. Only then restart the release from step 1

---

## Step 6: Verify the build

```bash
# Backend
cd backend && poetry build

# Frontend
cd frontend && npm run build

# Docker (if active)
docker build -t bibliogon:test .
```

On a build error: stop, report, fix, restart.

---

## Step 7: Git tag and push

```bash
git tag -a v0.X.0 -m "Release v0.X.0"
git push origin main
git push origin v0.X.0
```

---

## Step 8: Create the GitHub Release

Before invoking `gh release create`, build the per-release notes
file by combining the static prerequisites template with the
version-specific changelog:

1. Open `.github/RELEASE_TEMPLATE.md`. Copy the "Before you
   install", "Download", and "Verifying downloads" sections into
   `changelog/releases/v0.X.0.md` if not already present.
2. Replace the trailing `## What's new` placeholder with the
   per-version changelog excerpt produced in Step 3.

The template is a static reference; nothing reads it
automatically. The reason it exists at all is to stop every
release from rewriting the prerequisites block (Docker required,
guide URLs, hash-verify commands) from memory and producing
inconsistent or incomplete release pages.

Then with the gh CLI (preferred):
```bash
gh release create v0.X.0 \
  --title "Bibliogon v0.X.0" \
  --notes-file changelog/releases/v0.X.0.md
```

If the gh CLI is not available: print instructions for manual
creation on GitHub:
- URL: https://github.com/astrapi69/bibliogon/releases/new
- Tag: select v0.X.0
- Title: Bibliogon v0.X.0
- Notes: paste the contents of changelog/releases/v0.X.0.md
- Click "Publish release"

---

## Step 9: Tag and push the Docker image

If Docker images are published:

```bash
docker build -t bibliogon:v0.X.0 -t bibliogon:latest .
docker push bibliogon:v0.X.0
docker push bibliogon:latest
```

If not active: skip this step and note it in the release log.

---

## Step 10: Deploy the documentation site

When the help system with MkDocs is set up:

- A GitHub Action triggers automatically on push to main
- No manual step
- Verify: https://astrapi69.github.io/bibliogon/ shows the new content
- Check the action status: `gh run list --workflow=docs.yml --limit=1`

On a failed deploy: pull the error from the action logs and fix it,
but the release is still out.

---

## Step 11: Post-release documentation

- `docs/journal/chat-journal-session-{today}.md`:
  release entry with version, date, main changes, deploy time
- `ROADMAP.md`:
  mark every item included in the release as `[x]`
- `CLAUDE.md`:
  update on new endpoints or architectural changes
- `.claude/rules/lessons-learned.md`:
  if anything noteworthy happened during the release (new pitfall,
  workflow improvement), document it

Commit:
```
docs: post-release documentation v0.X.0
```

```bash
git push origin main
```

---

## Final checklist

This checklist MUST be fully checked off before the release counts
as "done". Missing items block the release.

- [ ] Reviewed the commits since the last tag
- [ ] Version number picked per SemVer and confirmed by the user
- [ ] CHANGELOG.md with the new entry committed
- [ ] changelog/releases/v0.X.0.md created for the GitHub release
- [ ] Version updated in all pyproject.toml and package.json
- [ ] Version updated in __version__ and other Python modules
- [ ] manuscripta and other Bibliogon deps at the current version
- [ ] `make test` green
- [ ] Frontend `tsc --noEmit` clean
- [ ] `npm run test` (Vitest) green
- [ ] `npx playwright test --project=smoke` green
- [ ] `ruff check` clean
- [ ] `mypy app/` clean (MANDATORY since v0.26.x; not "if active")
- [ ] `poetry run pre-commit run --all-files` clean (MANDATORY)
- [ ] `make verify-docs-discipline` clean (MANDATORY since v0.30.0+: aggregates `verify-mkdocs-nav` + `check-mkdocs-orphans`; addresses the v0.30.0 docs+i18n drift audit findings)
- [ ] Backend `poetry build` successful (skipped iff `package-mode = false`)
- [ ] Frontend `npm run build` successful
- [ ] `cd launcher && poetry run pyinstaller bibliogon-launcher.spec --clean --noconfirm` succeeds (MANDATORY for any release touching launcher/ or its embedded version)
- [ ] Docker build successful (if active)
- [ ] Git tag created and pushed
- [ ] GitHub release published
- [ ] Docker image pushed (if active)
- [ ] MkDocs site deployed and verified
- [ ] Chat journal release entry
- [ ] ROADMAP done items marked
- [ ] CLAUDE.md updated (if needed)
- [ ] Post-release commit pushed

---

## Troubleshooting

### Tests fail right before the release

Do not break out of the workflow. Abort the release, fix the test,
commit, restart from step 1. No workarounds like "disable the test
for this release".

### Build broken because of dependencies

`poetry lock --no-update` and `npm install` in both projects, then
rebuild. On persistent errors: abort the release, solve the problem
in its own commit.

### GitHub Action for the docs failed

The release tag stays valid. The docs deploy is a separate problem
that can be fixed after the release. Note it in the chat journal.

### Docker push fails

Check the login: `docker login`. Check the tag: `docker images | grep bibliogon`.
On a registry problem: the release is still valid; retry the push
when the registry is available again.

### Wrong version number after a tag push

```bash
git tag -d v0.X.0
git push origin :refs/tags/v0.X.0
```

Then a new tag with the correct number. CAUTION: only if the tag
has not yet been published as a GitHub release and nobody has
already pulled it.

---

## Versioning convention

Bibliogon follows Semantic Versioning 2.0.0:

- **Major (X.0.0)**: breaking changes in the API or fundamental
  architectural changes. Rare in the 0.x phase.
- **Minor (0.X.0)**: new features, backward-compatible. Small
  breaking changes are acceptable in 0.x, but must be called out
  prominently in the CHANGELOG.
- **Patch (0.X.Y)**: bug fixes, backward-compatible.

Pre-release tags (`-alpha`, `-beta`, `-rc`) are currently not used.
Releases are always stable.

---

## Note for Claude Code

This workflow is a guide, not a rigid script. If the user explicitly
asks for a deviation (e.g. "skip Docker this time"), accept it and
document in the chat journal WHY it was deviated from.

But: checklist items that touch safety (tests green, build successful,
correct version) must NEVER be skipped, not even on instruction.
Better to postpone the release than to ship broken software.

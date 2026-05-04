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
`_build_info`, deprecated `COMPATIBLE_VERSION` declarations,
frontend `APP_VERSION = "..."` literals, `install.sh` template
sync). Both must succeed before tagging.

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

### Other release-time considerations

Check the dependency versions of `manuscripta`, `pluginforge`
and other Bibliogon-owned libraries. If a new `manuscripta`
version shipped, update it at the same time as the canonical
version bump.

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

Full test suite:

```bash
# Backend + all plugins
make test

# Frontend unit tests + type check
cd frontend && npx tsc --noEmit && npm run test

# Smoke tests (fast Playwright suite)
npx playwright test --project=smoke

# Linting and type checking
cd backend && poetry run ruff check app/ && poetry run mypy app/

# Pre-commit hooks on all files
pre-commit run --all-files
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

With the gh CLI (preferred):
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
- [ ] `mypy` clean (if active)
- [ ] `pre-commit run --all-files` clean
- [ ] Backend `poetry build` successful
- [ ] Frontend `npm run build` successful
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

# Release workflow (summary)

Triggers: "release new version", "new release", "deploy new version".
**Before a release, read the full text in `docs/development/rules/release-workflow.md`
step by step - do not improvise from this summary.** It must not contradict
the full text (#1143).

## Gitflow branch flow (#79)
`release/vX.Y.Z` from `develop` -> bump, CHANGELOG, `make release-test` -> Aster's E2E gate -> merge to `main` (`--no-ff`) + annotated tag -> merge back to `develop` -> delete the branch.

## Ground rules
No skipped steps, no release mid-feature, red tests block, the CHANGELOG is written for humans, SemVer.

## Pre-Release Gate: Aster E2E Confirmation
Aster runs the smoke suite and confirms 0 failures. **Never push a tag without that confirmation**, whatever a session instruction says.

## Aggregate Makefile targets (reduce manual-step surface)
`make release-state / release-outdated / release-test / release-build / release-tag VERSION=X.Y.Z / release-publish VERSION=X.Y.Z / release-discover`.

## Step 1: Capture the current state
Tags, commits and diff since the last tag; show the user and wait.

## Step 2: Version bump per SemVer
Propose the version with a reason; wait for the user.

## Step 3: Generate CHANGELOG.md
Grouped, summarized entry plus `changelog/releases/vX.Y.Z.md`.

## Step 4: Bump version
Hand-edit only `backend/pyproject.toml`, then `make sync-versions`, `make sync-versions-check`, `scripts/verify_version_pins.sh`. Check the `manuscripta` and `pluginforge` pins by hand. Stage explicit paths, never `git add -A`.

## Step 4b: Dependency currency check
`make release-outdated`; routine bumps go in, major bumps get their own session.

## Step 5: Tests
All mandatory: `make release-test` (suites, tsc, ruff, mypy, pre-commit, docs discipline, plugin locks, launcher build) plus the Playwright smoke.

## Step 6: Verify the build
`make release-build`.

## Step 7: Git tag and push
`make release-tag VERSION=X.Y.Z` - only after the gate above.

## Step 8: Create the GitHub Release
Notes from `.github/RELEASE_TEMPLATE.md` + the release file; `make release-publish`.

## Step 9: Tag and push the Docker image
Only if images are published.

## Step 10: Deploy the documentation site
Automatic on push to `main` (`deploy-docs.yml`); verify the site.

## Step 11: Post-release documentation
Journal, ROADMAP, lessons. CLAUDE.md: only the version line changes - no summary paragraph (#1139).

## Final checklist
Every item in the full text's checklist must be ticked.

## Troubleshooting
Red tests abort the release; delete a tag only if it was never published or pulled.

## Versioning convention
SemVer; no pre-release tags.

## Note for Claude Code
Deviations only on explicit user request, documented in the journal. Safety items (tests, build, version) are never skipped.

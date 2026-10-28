# Lessons learned: Dependencies, versions, CI and release

Dependency bumps, version pins, lockfiles, GitHub Actions, launcher, release policy.

Index of every entry: `.claude/rules/lessons-learned.md`. Moved here from that file unchanged (#1141).

## Commit ordering for breaking-change dependency upgrades

- Pin the version bump BEFORE migrating call sites when the new code uses imports that only exist in the new release. Backward-compatible exports in the new version (e.g. v0.8.0 keeping `compile_book` and `OUTPUT_FILE` for one cycle) keep the intermediate state green. Doing it the other way - migrate first, bump pin last - leaves the migration commit red against the still-installed old version and breaks the "each commit green individually" rule.
- Path-installed plugins do not auto-refresh when their `pyproject.toml` changes. After bumping a transitive dependency in a plugin (e.g. `manuscripta` in `plugins/bibliogon-plugin-export/pyproject.toml`), run `poetry lock` AND `poetry install` in the BACKEND directory too - the backend's `poetry.lock` caches the resolved deps of the plugin's old pin until you regenerate.

## CI vs local environment drift

Two patterns cause "passes locally, fails in CI" in Poetry-managed projects:

1. `poetry install` does not remove dependencies that vanished from pyproject.toml. Stale `.dist-info` directories in long-tenured local venvs keep importing modules that the lockfile no longer references. CI starts fresh and immediately fails. Mitigation: run `poetry install --sync` periodically, especially before assuming "local green = CI green".

2. Path-dependency declarations in pyproject.toml must include every plugin or sub-package whose code is exercised by tests. Plugin discovery via `importlib.metadata.entry_points()` only sees what's actually installed, not what exists on disk. When creating a new plugin, the path-dep declaration in backend/pyproject.toml is mandatory, not optional.

Detection: if local tests pass but CI fails on routes returning 404, suspect missing path-deps before suspecting code bugs.

## Dependency currency in active development

In active development projects, dependency versions should be kept current from day one. Shipping with end-of-life or deprecation-imminent versions creates technical debt immediately.

Rules:
- Only stable releases, no beta/RC/alpha versions ever in production code
- "Latest stable" means most recent version that has proven stable (minimum 2 weeks since release)
- For LTS products (Node.js), prefer Active LTS over Current
- Review dependencies at each release cycle: run `poetry show --outdated` and `npm outdated` before cutting any release
- Major version bumps get their own commit with migration notes
- Routine minor/patch bumps can be batched by category

Red flags for outdated dependencies:
- Deprecation warnings in build output
- End-of-life announcements in package READMEs
- Security advisories against installed versions
- Upstream pins blocking other upgrades (e.g. manuscripta ^0.8.0 blocking Pillow 12)

Upstream blockers: when an external dependency (e.g. manuscripta) pins a transitive dep (e.g. pillow <12), the bump is deferred until the upstream releases a compatible version. Document the blocker in the commit that updates what it can, so the next sweep picks it up.

## Release-cycle dependency review

Before cutting any release, run dependency currency check:
- `poetry show --outdated` in backend and each plugin
- `poetry show --outdated` in launcher
- `npm outdated` in frontend

Apply routine bumps (patch + minor + low-risk minor) as part of release prep. Defer major bumps to dedicated sessions with their own testing cycle.

Never ship with:
- End-of-life versions
- Deprecation-imminent versions (forced migration within 6 months)
- Versions with known unpatched P0 bugs

Stability filter:
- Latest stable only, never beta/RC/alpha
- Minimum 2 weeks since release for new major versions
- For LTS products (Node.js), prefer Active LTS over Current

## install.sh VERSION drift

- `install.sh` pinned `VERSION="v0.7.0"` as the default, but Dockerfile and docker-compose.prod.yml evolved significantly after that tag. The v0.7.0 compose used `build: ./backend` (backend-only context), while current uses `context: .` (repo root). Plugins live at `<repo>/plugins/` which is entirely outside the v0.7.0 build context, so `poetry install` inside the container could never find them.
- The fix for the original Docker bug (commit 59cf3d6) was verified by building from the local working tree, not by running install.sh end-to-end. The local build used the current compose/Dockerfile; install.sh used the ancient tagged version. The verification test was wrong because it didn't test the actual user flow.
- Rule: when fixing an install/deployment script, always test THE SCRIPT, not just the artifacts it references. `docker build -f Dockerfile .` is not the same test as `./install.sh` because the script may select a different version of the files.
- install.sh now pins to the latest release tag (updated as part of the release workflow, Step 4). Users can override with `BIBLIOGON_VERSION=vX.Y.Z` for older versions.
- Corollary: install scripts are a special class of code where the test must simulate the actual distribution path. CI that tests scripts should run them the way users run them, not the way developers run them. `docker build -f Dockerfile .` from a working tree is not the same test as `curl ... | bash` which downloads, checks out a tag, and then builds.
- 2026-05-04 SSoT refactor: install.sh became a generated artifact built from `install.sh.template` + `backend/pyproject.toml` via `scripts/generate_install_sh.sh`. The committed install.sh stays in git because users curl-pipe it directly from the raw GitHub URL; it cannot be a build-time artifact hidden behind .gitignore. Treat it like generated docs: edit the template, regenerate at release time, commit both. `verify_version_pins.sh` runs `--check` to catch drift between template and committed output.

## Single source of truth for version pins

Every duplicated version constant is a stale-pin bug waiting to happen. The 2026-05-04 audit chain found seven such pins across launcher, frontend, install.sh, and one plugin - three were already stale (8 versions, 13 versions, and 3 versions behind the canonical pyproject.toml / package.json). Each had drifted because the release workflow listed them as bullets to manually update, with no enforcement.

Architecture goal (Java/Maven precedent): ONE version per subsystem in a canonical packaging file; everything else derives.

**Canonical sources (hand-edited at release):**
- `backend/pyproject.toml` for the Python subsystem
- `frontend/package.json` for the JS subsystem
- Each `plugins/<name>/pyproject.toml` for its own plugin (plugins have independent versions)

**Derivation patterns by language and runtime:**

| Subsystem | Pattern | Why |
|-----------|---------|-----|
| Python (publishable distribution) | `importlib.metadata.version("<dist-name>")` with `PackageNotFoundError` fallback | Standard. Reads packaging metadata; cannot drift. |
| Python (`package-mode = false`, e.g. backend app) | `tomllib.load(open("pyproject.toml", "rb"))["tool"]["poetry"]["version"]` | importlib.metadata is unavailable when Poetry doesn't register a distribution. tomllib is stdlib in 3.11+. |
| Bash installer (chicken-and-egg before clone) | Generate the script at release time from a template; substitute placeholder from canonical pyproject. Commit the generated artifact. | Runtime parse impossible because pyproject doesn't exist when curl-pipe runs. GitHub-API-at-runtime is non-deterministic and brittle. |
| Frozen binary (PyInstaller) | Build-time injection: spec script writes a generated `_build_info.py`, gitignored, that the binary embeds. Dev fallback reads pyproject directly. | importlib.metadata is unreliable inside PyInstaller's frozen tree. |
| Frontend (Vite) | `define` block reads package.json at build, exposes `__APP_VERSION__` literal. TypeScript declares `declare const __APP_VERSION__: string;` in `vite-env.d.ts`. | Build-time literal substitution. Zero runtime cost, zero bundle overhead. |

**Always include a fallback sentinel** (e.g. `"0.0.0+unknown"` with a `logger.warning`) when the derivation can fail at runtime (file missing, distribution not registered). Silent fall-through to a hardcoded number masks environmental problems.

**Always include regression detectors** in `verify_version_pins.sh`: grep patterns that fail the check if a hardcoded literal reappears in the "DO NOT EDIT" tier. Workflow checklists alone are not enforcement; a script that exits non-zero on regression is.

**Never** add a hardcoded version constant "for convenience" (e.g. for use in a GitHub-Issue body template, a footer string, or an OpenAPI metadata field). Always reference the derived single source.

## Single-source-of-truth for cross-cutting concerns: closed-set vs open-set discovery

The version-pin SSoT pattern above generalises: any cross-cutting concern (i18n keys across catalogs, plugin manifests cross-referencing the backend hookspec API, asset paths referenced from multiple components, etc.) reduces human-error during synchronisation IF AND ONLY IF the propagation mechanism is paired with a discovery mechanism for NEW references introduced by future features.

The 2026-05-19 release-automation audit (`docs/audits/release-automation-audit-2026-05-19.md`) made the pattern explicit. Bibliogon's release-cycle automation is the canonical example.

### Two distinct failure modes

**1. Closed-set drift — files we KNOW need updating, but didn't.** The original version-pin SSoT pattern above addresses this: `sync_versions.py`'s `collect_targets()` enumerates the known propagation targets; `verify_version_pins.sh` checks them. Adding a new propagated file means adding it to BOTH lists.

**2. Open-set drift — files we DID NOT KNOW needed updating.** A future feature adds a file with a hardcoded version literal in a new shape (e.g. a generated artifact, a config snippet, an embedded constant) and there's no enforcement that it gets added to `collect_targets()`. The closed-set verifier passes; the new file silently drifts on every release.

### Concrete Bibliogon example: `frontend/package-lock.json` top-level version

For multiple release cycles before the 2026-05-19 audit, `frontend/package-lock.json` carried a stale top-level `"version": "..."` field. `sync_versions.py` edited `package.json` but not the lock. Only `npm install` re-synced the lock. The drift was invisible to:

- `make sync-versions-check` — doesn't enumerate the lock
- `verify_version_pins.sh` regression detectors — didn't grep package-lock
- The author at release time — package.json LOOKED right; the lock was hidden in 11,000 lines

The audit caught it at v0.34.1; the closed-set fix added the lock to `collect_targets()`; the open-set fix added `scripts/discover_version_literals.sh` which would have surfaced the drift on the very next `make release-discover` invocation.

### Two enforcement mechanisms (use both)

For any cross-cutting concern with a SSoT pattern, ship BOTH:

**Closed-set enforcement (mandatory):**
- A propagation script (`sync_*`) that writes the known derived locations
- A verifier (`verify_*`) that diffs the derived state against canonical and exits non-zero on drift
- A `collect_targets()` (or equivalent) function listing the known derived files
- Regression detectors in the verifier that fail if a hardcoded literal reappears in the "DO NOT EDIT" tier

**Open-set discovery (advisory):**
- A discovery script that greps for the cross-cutting pattern across the repo, excludes the known-target set + legitimate one-off literals, and reports any survivors
- Hooked into the verifier as a non-fatal WARN at the end of the chain (advisory, not a gate — false positives are real and shouldn't block tags)
- Hooked into a release-prep Makefile target (`make release-discover` in Bibliogon) for on-demand inspection
- Survivor handling: either add the file to `collect_targets()` (it's a new sync target) or add to `KNOWN_FILES` in the discovery script (it's a legitimate one-off)

### When this pattern applies

This is not just for version pins. The pattern generalises to:

- **i18n keys**: `backend/config/i18n/*.yaml` × 8 catalogs. A `verify_i18n_keys.py` script could check key-parity + discovery-grep for hardcoded user-facing strings outside the catalog system.
- **Plugin manifest cross-references**: hookspecs in `backend/app/hookspecs.py` vs plugin `get_frontend_manifest()` returns. Drift here would be `i18n` slot names that don't exist on the backend.
- **Asset path references**: `book.cover_image` references that need URL rewriting on import/export — known callsites can be enumerated; new callsites need open-set discovery.
- **Feature-flag tests**: every `Book.audiobook_overwrite_existing`-style flag needs at least one test that flips it and asserts an observable behavioral difference (per the existing "End-to-end behavior tests are not 'kwarg passes through' tests" lessons-learned rule). The discovery mechanism: grep for `audiobook_overwrite_existing` callsites; verify each consumer has a paired test.

### When NOT to apply this pattern

If the cross-cutting concern is fundamentally LLM/human-narrative (CHANGELOG entries, release notes, prose summaries, journal entries), automation provides no value. The author is composing per-instance content — Tier 4 in the version-pin tier model. The SSoT pattern is for the MECHANICAL propagation of a single canonical value, not for the narrative around it.

### Maintenance discipline

When adding a new propagated file:
1. Add to the propagator's `collect_targets()`
2. Add to the closed-set verifier's regression detectors if applicable
3. Add to the open-set discovery script's `KNOWN_FILES` (so it doesn't show up as a discovery warning)
4. Add a test asserting the new propagation handler works
5. Update the docs that explain the SSoT tooling (e.g. `docs/development/release-automation.md`)

When `make release-discover` (or the verifier's open-set WARN) surfaces an unknown file: triage as either new-sync-target (recipe above) or legitimate-one-off (add to `KNOWN_FILES`). Don't ignore the warning — that defeats the open-set discipline's purpose.

## Hotfix cluster tag policy

When a release tag fails CI for a mechanical reason (chmod bit
missing, formatter nit, type-check escape, build-time spec error)
and a fix lands quickly via point-release bumps, the failed tag
stays in the repository as historical record - it does not get
deleted. Reasons:

- The v0.26.0 release-gate run, even though it failed, is part
  of the release audit trail (run ID `25328065614`).
- Deleting a published tag is a force-push class operation per
  CLAUDE.md security rules; allowed only when nobody pulled the
  tag and no GitHub Release was published. The latter is
  satisfied for failed-gate tags but the former requires
  asserting nobody fetched in the meantime.
- Each tag's commit reflects the state at the moment of the
  bump. Future bisects can use them.
- The shipped tag's `changelog/releases/v0.X.Y.md` file
  documents the hotfix history (see v0.26.3.md "Hotfix
  history" section as the template).

Current cluster preserved as-is: `v0.26.0` (release-gate failed
on chmod), `v0.26.1` (launcher builds failed on PyInstaller
spec `__file__`, CI failed on mypy), `v0.26.2` (CI failed on
ruff-format), `v0.26.3` (all green; the shippable tag).

Do delete a tag only when it was pushed in the last few minutes
and the user explicitly confirms no one could have pulled. The
default is keep + document.

## Subsystem lock-step + tooling, not checklists

Per-subsystem SSoT (one canonical pyproject per Python subsystem, one canonical package.json for the JS subsystem) was the first half of the fix. The second half is **lock-step propagation by tooling, not by human attention**. A 7-row checklist that says "edit every file" fails every time someone forgets a row; the 2026-05-04 audit chain found three pins that had drifted by 8, 13, and 3 versions respectively across multiple releases.

Architecture, post-2026-05-04 lock-step:

- **One canonical version per language subsystem** (backend/pyproject.toml, frontend/package.json). Hand-edited at release time.
- **`make sync-versions`** (`scripts/sync_versions.py`) propagates the canonical to every other version-bearing field: launcher pyproject + spec plist + `__init__.py` literal, all plugin pyprojects, frontend package.json (when needed), `install.sh` regen via the existing template helper. The tool is the only thing that touches those files.
- **`make sync-versions-check`** + `verify_version_pins.sh` enforce lock-step in a tight loop. The verify script also runs the subsystem-lock-step check inline.
- **CI gate** (`.github/workflows/release-gate.yml` on tag-push, plus the same checks inlined as the first step of every launcher build job's `release: created` path). Artifact attachment is blocked on drift. Tag pushes cannot be retroactively undone, but the gate failure surfaces the drift loudly and prevents downstream artifact publication.

Rules for working in this codebase:

- **Do not hand-edit any version field except `backend/pyproject.toml`.** Even the assistant doing the work follows this rule. If the assistant bypasses the tool and edits a downstream pyproject directly, the tool's value is zero from day one. Run `make sync-versions` and let the diff speak.
- **Each release commit's diff for non-canonical version fields must be reproducible by re-running `make sync-versions` from a clean checkout.** That's the bisect contract: any historical commit can be re-derived from `backend/pyproject.toml` + the tool.
- **A new subsystem with its own version field**: add it to `scripts/sync_versions.py`'s `collect_targets()` AND the regression detector in `verify_version_pins.sh` AND the CI gate. Three artifacts per new pin; never one or two.
- **The `--check` mode of every sync/verify script must be idempotent**: running it twice in a row produces the same answer, never writes, never depends on environment state beyond the repo. CI relies on that property.

## Two installation paths diverge: `make test` vs per-plugin CI

Bibliogon's plugins are installed two different ways depending on context:

- **`make test` path:** the backend's combined `poetry.lock` resolves every plugin as a path-dep (`bibliogon-plugin-{name} = {path = "../plugins/...", develop = true}`). One `poetry install` from `backend/` brings every plugin's external deps in via the backend's lock.
- **CI plugin-matrix path:** `.github/workflows/ci.yml` and `.github/workflows/coverage.yml` run `poetry install --no-interaction --no-ansi` **inside each plugin directory** against THAT plugin's own `poetry.lock`. The backend lock is irrelevant here.

When a shared external dep (e.g. fastapi) bumps in every pyproject (backend + 10 plugins), the backend lock and the per-plugin locks drift independently. If only the backend lock gets regenerated:

- `make test` is green (the backend lock satisfies all path-deps; the per-plugin locks are not consulted).
- CI is red (the per-plugin `poetry install --no-interaction` aborts with `pyproject.toml changed significantly since poetry.lock was last generated`).

This shape bit during the v0.30.0 release: the pre-v0.30.0 dep sweep bumped fastapi `^0.135.0 → ^0.136.0` in 11 pyproject.toml files, but `poetry lock` was only run in `backend/`. Local `make test` passed; CI was red on main from `be4b6f3` until hotfix `3232fad` re-locked all 10 plugin lockfiles.

**Generalization:** any time there are two installation paths for the same code, BOTH must be tested at gate time. The backend's combined lock and the per-plugin locks are different gates; verifying one does not verify the other. The pre-v0.30.0 retro called this out at the meta level ("verify the gate before trusting it"); this is the concrete recurrence.

**Mitigation pattern (now enforced):**

- `make lock-all-plugins` (Makefile target shipped in PLUGIN-LOCKFILE-DRIFT-01 commit `1b43aec`): iterates `plugins/bibliogon-plugin-*/` and runs `poetry lock` in each. Use after any shared-dep pin bump.
- `make verify-plugin-locks` (Makefile target shipped in the same commit): runs `poetry install --dry-run --no-interaction --no-ansi` per plugin and greps for "changed significantly". Exits 1 with a remediation hint on drift; manual diagnostic, NOT in the pre-tag chain (the pre-commit hook below + the CI per-plugin matrix already cover the right times).
- Pre-commit hook `plugin-lock-paired-with-pyproject` (shipped in commit `8f6fcea`): scoped via `files: ^plugins/bibliogon-plugin-[^/]+/pyproject\.toml$`, fails when a staged plugin pyproject lacks a paired staged `poetry.lock`. Catches the operational mistake at commit time. Verified by 6 hook self-check tests in `backend/tests/test_plugin_lock_drift_hook.py` (commit `e31c4fd`), all green at 0.22 s.
- Discovery channel without these gates: CI red on main, AFTER a release tag has already been cut. The retro's commitment to "discrete pre-release dep sweep commits" pays off (rollback granularity stays intact), but the better gate is to catch the drift before push, not from the GitHub Actions red badge.

## `poetry update` vs `poetry lock` semantics

Surfaced during the 2026-05-12 dep-update audit Phase 3.
The ``make lock-all-plugins`` target runs ``poetry lock``
per plugin. ``poetry lock`` validates that existing
resolutions still satisfy current pyproject constraints —
it does NOT refresh transitives to their latest within the
allowed range. ``poetry update`` does that.

So:

- **``poetry lock``** = "re-resolve from pyproject specs."
  Only meaningful after a pyproject pin changed. No-op when
  nothing in pyproject changed (the existing lock is still
  a valid resolution).
- **``poetry update <pkg>``** = "move this package (and its
  transitives) to the latest within range." Touches the
  lock; pyproject is unchanged unless the new version
  exceeds the caret.
- **``poetry update`` (bare)** = "move EVERY package within
  every range." Maximally aggressive; pulls every patch +
  every minor + every transitive-of-transitive. Risky:
  one low-risk direct bump can pull a high-risk transitive
  via the upstream's relaxed bounds (see next rule below).

The ``make lock-all-plugins`` target serves the "pyproject
changed" case (e.g. after a shared-dep pin bump propagated
to every plugin via ``sync-versions``). It is NOT a "pull
patch transitives" tool. Use ``poetry update <allowlist>``
per plugin for that purpose.

Concrete rule: when "the lockfile didn't change after
``make lock-all-plugins``", check whether any pyproject
changed. If none, the no-op is correct. If patch
transitives are still wanted, switch to a per-plugin
``poetry update`` with an explicit allowlist.

## Transitive deps can surface high-risk packages from low-risk direct bumps

Surfaced during the 2026-05-12 dep-update audit Phase 3,
on a single test plugin run before going wider.

Bare ``poetry update`` on ``bibliogon-plugin-help`` (one of
11 plugins, used as a pre-flight test) pulled:

- ✅ ``pydantic 2.12.5 -> 2.13.4`` (low-risk patch)
- ✅ ``idna``, ``packaging``, ``coverage``, ``pygments``
  (audit-low-risk batch)
- ⚠️ ``fastapi 0.135.3 -> 0.136.1`` (the plugin pins
  ``^0.136.0``, so 0.136.1 is in-range; backend is at
  0.136.0)
- 🚨 ``starlette 0.46.2 -> 1.0.0`` — explicitly
  audit-deferred as high-risk

Cause: FastAPI 0.136.1 relaxed its upper bound on
starlette. A transitive walk through this relaxed bound
pulled starlette 1.0, the package the audit had
specifically deferred. The plugin's lock was reverted
immediately (``git checkout`` + ``poetry install``
downgraded back to 0.46.2).

The general shape: **low-risk direct bumps can pull
high-risk packages transitively when the upstream
relaxes a bound.** Even an audit that correctly
categorised packages by direct risk can miss this if
the audit didn't model transitive cascades.

Concrete rule for any bulk-bump pass:

1. **Pre-flight a single instance before bulk-applying.**
   One test plugin / one test environment, never blind
   bulk. The 2026-05-12 audit caught the starlette
   surfacing on plugin #1 of 11; revert was cheap.
2. **Prefer ``poetry update <allowlist>`` over bare
   ``poetry update``.** The allowlist constrains which
   packages can move; transitives only move if their
   own version constraint demands it. Example for the
   plugin-Pydantic alignment use case:
   ``poetry update pydantic pydantic-core`` (NOT
   ``poetry update``).
3. **If the audit deferred a package as high-risk, add
   a regression check.** Grep for the package name in
   the resulting lock-diff before committing; if it
   appears in the diff despite not being in your
   allowlist, surface and revert.
4. **The "two installation paths" rule still applies.**
   A backend-only lock-resolution test is not enough;
   a transitive surfacing in a plugin lock would only
   appear when you actually run that plugin's
   ``poetry install``. Per-plugin CI catches this; a
   one-time pre-flight runs faster.

## External GitHub Action major-version drift

Standard GitHub Actions (`actions/checkout`, `actions/setup-*`,
`actions/upload-artifact`, `actions/cache`, the pages trio, plus
common third-parties like `softprops/action-gh-release`) release new
majors periodically — usually triggered by Node runtime
deprecations or other GitHub-platform shifts. An audit finding "all
standard actions are at their current majors" is correct AT THE
TIME but stales within weeks-to-months after a deprecation
announcement.

Concrete trigger from the 2026-05-14 sweep: GitHub deprecated the
Node 20 runtime on 2025-09-19 (forced default 2026-06-02, removed
2026-09-16). Within 6 months, EVERY standard action listed above
released a new major moving to Node 24. The previous CI-hygiene
audit's `actions/checkout@v4` etc. was accurate at audit time but
the warnings re-appeared in CI within weeks.

The original test-infrastructure audit categorized "all standard
actions at current majors" as **no action needed** — accurate at the
moment, no longer accurate weeks later. Re-classify as a periodic
check, not a one-time verification.

### Periodic CI-hygiene check (every ~quarter, or after any GitHub
runtime/platform deprecation announcement)

1. List every pinned action:
   ```
   grep -rE 'uses: [a-zA-Z][a-zA-Z0-9-]+/[a-zA-Z][a-zA-Z0-9-]+@v[0-9]+' \
     .github/workflows/ | sort -u
   ```
2. For each, check the latest released major against the pin via
   `gh release list --repo <owner>/<repo> --limit 5`.
3. **For each candidate version, read the action.yml runtime
   declaration directly** (not the release-note prose). This is
   the authoritative source for "does this action actually run
   on Node N?":
   ```
   gh api "repos/<owner>/<repo>/contents/action.yml?ref=<tag>" \
     --jq '.content' | base64 -d | grep '^[[:space:]]*using:'
   ```
   Returns e.g. `using: 'node24'` (or `node20`, or `composite`).
   This is the field GitHub Actions reads to pick the runtime.
4. Cross-reference the release notes via
   `gh api repos/<owner>/<repo>/releases/tags/v<N>.0.0 --jq .body`
   for breaking-change context, but treat the notes as
   advisory — see "Release-notes-vs-action.yml trap" below.
5. Pin to the **lowest** new major that satisfies the deprecation
   target AND declares the target Node version in its
   action.yml. The latest major often bundles additional
   unrelated breaking changes — taking the minimum-Node-N major
   lets you adopt those changes deliberately later, not by
   accident.
6. One commit per action class for traceable bisect; push as a
   batch.

### Release-notes-vs-action.yml trap

Release notes describe **intent and feature changes**. action.yml
declares the **actual runtime**. The two can diverge across a
major version when an action adds preliminary Node 24 support
without flipping the default. Always trust action.yml for audit
purposes.

Concrete examples from the 2026-05-14 sweep that caught this:

- **`actions/upload-artifact@v5.0.0`** — release notes said
  *"preliminary support for Node.js 24"* and the bump from v4
  was marked **BREAKING CHANGE**. Both signals pointed at "v5 is
  the Node-24 baseline". But `action.yml` at v5 declared
  `runs.using: 'node20'`. v6 was the actual transition (declared
  `node24`).
- **`actions/configure-pages@v5.0.0`** — release notes talked
  about Next.js breaking changes without mentioning the Node
  runtime at all, leading to inference (from sibling pages
  actions on Node 24) that v5 was Node-24. But `action.yml`
  declared `node20`. v6 added Node 24.

The trap is amplified by the `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`
env-var: if it's already in place, runtime tests look green
because the env-var coerces Node 24 regardless of the action.yml
declaration. The action.yml read is the only honest signal.

### Composite-action transitivity

Some actions declare `runs.using: composite` (e.g.
`actions/upload-pages-artifact@v5`). Composite actions don't run
on any Node runtime directly — they wrap calls to other actions.
For those, the audit must read the composite's internal `uses:`
references and check THOSE actions' runtimes:

```
gh api "repos/<owner>/<repo>/contents/action.yml?ref=<tag>" \
  --jq '.content' | base64 -d | grep 'uses:'
```

Example: `actions/upload-pages-artifact@v5` internally calls
`actions/upload-artifact@v7`, which declares `node24`. So
upload-pages-artifact@v5 is effectively on Node 24 via its
internal dependency — no bump needed at our level even though
its own action.yml says `composite`.

### Difference between "external action" warnings

Two distinct sources of "external" warnings in CI:

- **In-repo action pins**: workflow files reference outdated
  majors. Fixable in `.github/workflows/`. This rule covers them.
- **GitHub-managed services**: e.g. the Dependabot scheduled
  service that's configured under *Settings → Code security →
  Dependabot*, not in workflow files. Annotations from those jobs
  are GitHub's responsibility, NOT the repo maintainer's. Don't
  conflate the two — always grep the codebase to confirm a warning
  has a local source before assuming a fix is locally
  implementable.

### Defensive env-var as a safety net

`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"` in each workflow's
`env:` block coerces any JavaScript-runtime action declaring Node
20 to run on Node 24. After all our standard-action pins are at
Node-24-native majors, this env-var becomes a **safety net** for
future additions (especially third-party actions that may lag) —
not an active correction. Keep it in the workflow heads; it costs
nothing and prevents reintroduction of the warning when a future
contributor adds an old-major action by habit.

## A pushed SHA can silently fail to trigger CI — re-trigger, don't wait

Filed 2026-06-20 (`5ed87b42`, `5d7680f7`). On rare occasions GitHub Actions does
not dispatch the configured workflows for a freshly pushed commit (a
dispatch glitch on that SHA): no run appears, the PR sits with no checks, and
there is nothing to "wait for". This looks like a slow queue but never resolves.

Recognition + remedy:

- **Recognition:** `gh pr checks <n>` reports no checks (not "pending"); `gh run
  list --branch <branch> --limit 3` shows no run for the head SHA after a couple
  of minutes, while other branches' pushes trigger normally.
- **Remedy:** push a new SHA to re-trigger — an empty commit
  (`git commit --allow-empty -m "chore: re-trigger CI (dispatch glitch on prior
  SHA)"`) or a trivial amend-and-force on a feature branch. Do NOT keep waiting;
  the prior SHA will never get a run.
- **Do not** confuse this with the "piping a gate through `| tail` masks its exit
  code" false-green — that one HAS a run that failed; this one has NO run at all.

Pairs with "Operational gaps masquerade as wired infrastructure": a workflow
that is correctly wired can still no-op on a given SHA; verify a run actually
exists, don't assume the push implies a run.

## Library-first beats a custom launcher: thin wrapper + config over re-implementation

Filed 2026-06-24 (launcher migration, `6266d28c` → docker-app-launcher 0.7.0).
Bibliogon's desktop launcher was a hand-written PyInstaller app (the dialog
chain, the Docker-first flow, the CLI verbs, i18n, the persistent window). It
was replaced by the published `docker-app-launcher` PyPI package — the same
library adaptive-learner uses — with Bibliogon supplying ONLY:

1. `launcher/launcher.json` — declarative config (app slug, compose file,
   ports, health-check path, icon paths, locale, log rotation).
2. `launcher/bibliogon_launcher/__main__.py` — a thin three-responsibility
   wrapper: resolve the repo dir holding the compose stack, report the app
   version on `--version`, then delegate every other flag to
   `docker_app_launcher.__main__.main`.

All behaviour lives in the library; the app owns config + a wrapper, not logic.
The win is the same "use what already exists" principle as the TipTap-extension
and Recurring-Component rules, applied at the dependency layer
(see `.claude/rules/library-first.md`). Concrete payoffs: bug fixes + new verbs
(`--cleanup`, single-instance lock, locale auto-detect, rotating logging) arrive
via a version bump instead of a rewrite; the wrapper is ~60 lines and testable
without a frozen binary.

When evaluating "build a launcher / installer / updater / tray app": check for a
maintained library that already does it and shape the app as config + a thin
adapter. The reference is `docs/LAUNCHER-SPEC.md` (the config reference) +
`launcher/bibliogon_launcher/__main__.py` (the wrapper). The one caveat is the
version-pin discipline: `app_version` in `launcher.json` is a
`make sync-versions` target, not a hand-edit.

## A library "extra" can multiply frozen-binary size — opt out unless the feature earns it

Filed 2026-06-24 (launcher tray-extra decision). `docker-app-launcher` ships an
optional `tray` extra (minimize-to-tray via `pystray` + a GTK backend). On Linux
it pulls heavyweight system libraries and **inflates the frozen PyInstaller
binary ~6x** (the measured build went from ~21 MB to ~139 MB). Bibliogon ships
**without** the extra: the window's close button closes the launcher, which is
adequate for the current need. `tray_icon_path` stays in `launcher.json` so the
feature still works for anyone who installs the extra manually
(`pip install pystray`) — opting out costs the user nothing.

Rule: an optional dependency / library extra that a frozen/bundled artifact
embeds must be justified against its size cost, not adopted because it's
available. A ~6x binary inflation for a minimize-to-tray convenience is a bad
trade for a download users fetch from GitHub Releases. Keep the config field so
the feature degrades to opt-in rather than disappearing. Same cost-vs-value
discipline as the "Bulk-operation limits should be per-operation cost-profile"
rule, applied to bundle size.

## A "cleanup" verb whose scan can reach the live data dir must be left unconfigured

Filed 2026-06-24 (launcher `cleanup_search_paths` decision). `LauncherConfig`
exposes `cleanup_search_paths` + `legacy_names`: the `--cleanup` verb scans each
search path for `legacy_names` subdirectories and offers them for deletion.
Bibliogon deliberately leaves both **empty**. The reason is a data-safety trap:
the cleanup scan's skip-list does NOT include the live data dir, so a path like
`~/.local/share` with `legacy_names: ["bibliogon"]` would offer the user's
actual book-data directory (`~/.local/share/bibliogon`) for deletion. The
convenience (sweeping stale leftover dirs) is not worth the risk of pointing a
delete-offer at production data. Container/image cleanup via `compose_project`
is unaffected and stays enabled.

Generalises: before enabling a config-driven "scan a directory and offer matches
for deletion" feature, prove the scan cannot reach live user data — a missing
entry in the tool's skip-list turns a convenience into a data-loss vector. This
is the same family as the `.bibliogon-production` marker tripwire and the
"Filesystem isolation: production data lives outside the project tree" rule:
when a path-walking operation can delete, the burden is on proving it can't touch
what matters. See `docs/LAUNCHER-SPEC.md` for the documented rationale.

## `poetry install` plus a prefix cache key is a growing environment, not a reproducible one

Filed 2026-10-09 (#980), generalised from #952.

Two facts that are each harmless and together are not:

- **`poetry install` never removes** a package that has left the lock. It
  installs what is missing and leaves everything else alone. `poetry sync`
  (Poetry 2.x; `install --sync` before that) is the one that prunes.
- **Every Poetry venv cache here restores by key PREFIX.** The exact key
  hashes the lock, so it misses whenever the lock changes - and then
  `restore-keys` hands the job the newest venv built from an OLDER lock.

So the environment a cached job works in is "everything any previous run ever
installed", of which the lockfile describes a subset. A test can pass because
the restored venv still carries a package the lock no longer declares, and a
user installing from that lock would not have it. For the E2E workflows it is
the app itself booting in that environment, not just the tests.

Seven cache blocks across six workflows had this shape. Two of them -
`ci.yml`'s test job and its lint job - share the same key, so an ad-hoc
`pytest-testmon` installed by one is present in the other.

**The fix is `poetry sync`, not a different cache key.** The key already
hashes the lock; dropping the prefix would trade a correctness problem for a
cold install on every lock change. Sync gives both: on a cold venv it is
identical to install, on a restored one it prunes.

**Where it actually bites is local.** CI venvs are at least rebuilt when the
lock changes; a developer's venv is not. The container that found #952 still
carried `pypdf` 6.18.1 with three advisories from a lock that had stopped
naming pypdf more than four months earlier - and `pip-audit` reported it as a
project vulnerability, which it was not. `make verify-venv-lock` answers that
question in a second.

**The guard reads Poetry's own answer.** `poetry sync --dry-run` reports
exactly the operations needed to make the environment equal the lock; no
operation means no drift. Parsing that beats reconstructing the package set
from the lock by hand, which would need its own markers, extras and
path-dependency handling. Two things must be exempt: the virtualenv seeds
(`pip`, `setuptools`, `wheel` - the weekly security scan upgrades pip on
purpose), and anything installed ad-hoc on purpose, which has to be NAMED
(`--allow pytest-testmon`) rather than silently tolerated.

**Corollary for diagnosis.** When a dependency scanner reports a package no
pyproject pins and no lock carries, suspect the environment before the
repository. #976 attributed exactly this to a cache that `security-scan.yml`
does not have - that workflow builds a fresh venv every run. The sync there is
still right, the reason was wrong, and the shape is worth remembering: the one
workflow that audits an environment was the one that never cached it.

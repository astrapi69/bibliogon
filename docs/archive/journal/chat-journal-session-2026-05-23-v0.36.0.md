# v0.36.0 Release Session — 2026-05-23

## 1. Release v0.36.0 (14:30)

- Original prompt: `Release v0.36.0 per release-workflow.md` (step-by-step paste-ready instructions covering state verification, dep checks, version bump, CHANGELOG, tag/push, GitHub release, post-release docs).
- Goal: cut v0.36.0 from `main` HEAD (`08971ee` at session start).
- Result: tagged `v0.36.0` from commit `2cd76aa`; GitHub release published at https://github.com/astrapi69/bibliogon/releases/tag/v0.36.0.

### Steps actually executed

1. **State verification** (`make release-state`): HEAD `08971ee`, clean working tree, 230 commits + 331 files since v0.35.1.
2. **Path correction**: surfaced that `docs/release-workflow.md` doesn't exist; canonical workflow lives at `.claude/rules/release-workflow.md`. Aggregate Makefile targets (`release-state` / `release-outdated` / `release-test` / `release-build` / `release-tag` / `release-publish`) cover most of the prompt's steps.
3. **Dep currency** (`make release-outdated`): documented; no bumps per "2-week soak rule" direction. Held majors: TipTap 2→3 (DEP-02, upstream-blocked), elevenlabs 0.2→2.x (DEP-05, paid-API-access-blocked), mypy 1.x→2.x (MYPY-V2-MIGRATION-01). manuscripta + pluginforge at PyPI latest.
4. **npm audit `--audit-level=high`**: 2 moderate findings (brace-expansion, ws), zero high / critical. Did not block.
5. **Canonical version bump**: hand-edited `backend/pyproject.toml` 0.35.1 → 0.36.0. `make sync-versions` propagated to 18 files (frontend package.json + package-lock, launcher pyproject + spec + `__init__`, all 11 plugins' pyproject.toml, install.sh + install.ps1). `make sync-versions-check` + `scripts/verify_version_pins.sh 0.36.0` both clean.
6. **CHANGELOG**: composed `docs/CHANGELOG.md [0.36.0]` section and `changelog/releases/v0.36.0.md` per-release notes file with the prerequisites template + Download/Verify/Action-required/What's-new sections. Covered all three strategic streams (plugin-comics, KDP Wizard, PluginForge adoption) + 17 additional surfaces + 10 lessons-learned filings + deferred items.
7. **Mandatory test gate** (`make release-test`): pytest 2214+1 / Vitest 1986 / tsc / ruff / mypy / pre-commit 15 hooks / verify-docs-discipline / verify-plugin-locks / launcher PyInstaller smoke — all green.
8. **Build** (`make release-build`): backend wheel + frontend Vite build green.
9. **Tag + push** (`make release-tag VERSION=0.36.0`): commit `2cd76aa` for release artifacts + tag `v0.36.0` pushed. Pre-push hooks all clean.
10. **GitHub release** (`make release-publish VERSION=0.36.0`): published at https://github.com/astrapi69/bibliogon/releases/tag/v0.36.0.
11. **Post-release docs**: backlog.md `Current version: v0.36.0`, ROADMAP.md `Latest release: v0.36.0`, CLAUDE.md headline rewritten with the new version + 3-stream summary.

### Interleaved task: backlog filing

Mid-release (during CHANGELOG composition), user issued an inline directive to file `ACCESSIBILITY-AUDIT-WCAG-AA-01` (P3, WCAG 2.1 AA) as a single backlog commit pushed autonomously. Multi-Tool-Coordination explicit-paths discipline applied: staged ONLY `docs/backlog.md` to avoid absorbing the in-flight version-bump artifacts. Committed as `59d55e3`; pushed; resumed release work without contamination.

### Pre-Inspection finding

The prompt's Step 2 wording mentioned `cat docs/release-workflow.md` — that file doesn't exist. Canonical location is `.claude/rules/release-workflow.md` (already loaded in session context). Surfaced the path mismatch before proceeding per the prompt's stop-condition language for "release-workflow.md contains steps not covered by this prompt".

### Final commit summary

- `59d55e3` docs(backlog): file ACCESSIBILITY-AUDIT-WCAG-AA-01 (P3, WCAG 2.1 AA)
- `2cd76aa` chore(release): bump version to v0.36.0
- `v0.36.0` tag (annotated)

Plus post-release commit (this entry + CLAUDE.md + headers) to follow.

### Verification

All gates passed during `make release-test`:

| Gate | Result |
|---|---|
| Backend pytest | 2214 passed + 1 skipped |
| Plugin pytest | (covered by aggregate) |
| Frontend Vitest | 1986 passed (155 files) |
| i18n parity | 75 / 75 |
| tsc --noEmit | clean |
| ruff check | clean |
| mypy app/ | clean (105 source files) |
| pre-commit (all 15 hooks) | clean |
| verify-docs-discipline | clean |
| verify-plugin-locks | clean |
| Launcher PyInstaller build smoke | green |
| npm audit --audit-level=high | 0 findings |

### Session summary

1 release cut + 1 backlog filing + post-release docs. 3 commits + 1 tag. ~30 min wall-clock total session time (most of which was the 189s `make release-test` pytest run).

The 230-commit accumulation since v0.35.1 reflects the cycle's "three parallel strategic streams" pattern: each stream shipped through multiple sessions across the cycle (plugin-comics Sessions 1+2, KDP-Publishing-Wizard Phases 1+2, PluginForge v0.7.0+v0.8.0+v0.10.0 adoptions) rather than as a single sprint. The aggregate-target tooling (`release-test`, `release-build`, etc.) absorbed all the mechanical workflow steps without surprises.

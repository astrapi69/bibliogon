# Next Session Resume Prompt

Fresh CC session. Resume work per
[session-handoff-2026-05-28-next-resume.md](
session-handoff-2026-05-28-next-resume.md).

## Step 1: State Verification

```
git status
git log origin/main --oneline -10
```

Expected: clean tree, HEAD at `10db8e6c`.

Confirm test baselines hold (or trust the carry-forward from
the handover doc unless the verification ran more than a few
hours ago):

```
cd backend && poetry run pytest --collect-only -q --ignore=mutants | tail -3
cd ../frontend && npx vitest run | tail -5
cd ../plugins/bibliogon-plugin-export && poetry run pytest --collect-only -q | tail -3
```

Expected baselines from the 2026-05-28 19:42 UTC verification:
backend 2334 collected · frontend Vitest 2308 passed across 178
files · plugin-export 331 collected · plugin-comics 19 · i18n
parity + structure 75 passed.

## Step 2: Read Handover

```
cat docs/journal/session-handoff-2026-05-28-next-resume.md
```

The handover contains the full Phase 1 close-out, the Phase 2
scope, the adjudicated decisions, the active disciplines, and
the recommended C1 starting point.

## Step 3: Direction

**Picture-Book Layout Expansion Phase 2** — 4 multi-image
layouts under the M1 storage strategy (JSON in
`layout_config`).

All 8 Pre-Inspection adjudications are already settled:

- M1 storage (`layout_config[layout].secondary_image_asset_id`
  or `image_asset_ids: [...]`).
- Tier-Property for all Phase 2 text regions.
- LayoutPicker `bild_mit_text` + new `mehrere_bilder` category
  surface.
- Mirror discipline: every PageCanvas branch needs a paired
  walker branch.
- Editor↔PDF regression pin per layout.

Read the Phase 1 close-out doc's "Adjudicated answers consumed"
table for the per-question detail:

```
sed -n '/^## Adjudicated/,/^## /p' \
  docs/journal/picture-book-layout-expansion-phase1-closeout-2026-05-28.md
```

**Proceed Phase 2 C1**: the M1 utility commit
(`readSecondaryImageAssetId` + `writeSecondaryImageAssetId` in
both TS and Python, with Vitest + pytest pins). C2-C5 add the
per-layout enum + rendering + walker + LayoutConfig bodies per
layout; C6 i18n; C7 smoke; C8 close-out. Estimated 8-10
commits.

## Step 4: Apply Active Disciplines

Per the handover's "Critical Constraints + Active Disciplines"
section. The high-recency subset most likely to fire in Phase
2 work:

- Mirror discipline (TS + Python).
- Walker is source of truth on PDF emission.
- Editor↔PDF regression pin per layout.
- German typographic quotes in YAML.
- Run vitest from `frontend/`.
- Pre-Coding-Reality-Check.
- Mocked-API contract drift across test files.
- Explicit-paths-only `git add`.
- Plain `git status` before every commit.
- Half-wired feature lifecycle.

Full rule text at `.claude/rules/lessons-learned.md`.

## Step 5: Execute

Push autonomously after atomic-green commits. Surface to the
user only on:

- Stop-Conditions hit (schema-change requirement beyond
  enum extension; scope >20 commits; M2 storage decision
  becomes necessary mid-Phase-2).
- Substantial architecture decisions not covered by the Phase
  1 adjudication.
- Completion (Phase 2 close-out).

## Push Convention

CC pushes autonomously after every atomic-green commit. The
established cadence from Phase 1 was push-after-each of C1
through C7 (and the 3 mid-stream bug fixes). Continue that
cadence for Phase 2.

## End-of-Session

Session-end-report per established convention: a journal entry
at `docs/journal/picture-book-layout-expansion-phase2-closeout-YYYY-MM-DD.md`
recording:

- Commit-by-commit scope.
- Cumulative test deltas.
- Adjudicated answers consumed (none new for Phase 2).
- Two priority bugs surfaced + fixed mid-phase (if any).
- What did NOT ship (Phase 3 + any deferred scope).
- Push state confirmation.

User-Direction-Override always supersedes this entire prompt.

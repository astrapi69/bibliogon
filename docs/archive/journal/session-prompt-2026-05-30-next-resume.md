# Next Session Resume Prompt

Fresh CC session. Resume work per
`docs/journal/session-handoff-2026-05-30-next-resume.md`.

## Step 1: State Verification

```
git status
git log origin/main --oneline -8
```

Expected HEAD: `fd9e7633`. Clean tree, parity with origin/main.
**v0.41.0 is already released** (tag `v0.41.0` + GitHub release).

Confirm baselines hold (note: count backend from `tests/` only — a
stale `backend/mutants/` dir throws 33 collect errors on bare pytest):

- Backend pytest: **2399 passed** (`cd backend && poetry run pytest tests/ --collect-only -q | tail -1`)
- Frontend Vitest: **2487 passed** (`make test-frontend`)
- Theme gates: `make verify-theme` (tokens + 96 WCAG contrast + hardcoded-hex) — green
- `make test` green baseline

Then verify the v0.41.0 launcher CI finished (the Windows build was
in-progress at release): `gh run list --limit 5`.

## Step 2: Read Handover

```
cat docs/journal/session-handoff-2026-05-30-next-resume.md
```

Then read in order:

1. `docs/audits/ux-theme-audit-2026-05-30.md` (Resolution + deferrals)
2. `docs/development/theming.md` (theme gates: how to add a palette)
3. `docs/backlog.md` (P0=0, P1=0, P2=0, P3=17, P4=28, P5=12) → `docs/ROADMAP.md`
4. tail of `.claude/rules/lessons-learned.md` (the `| tail`
   exit-code-masking entry added this session)

## Step 3: Internalize the critical gotchas (handover has details)

- **`| tail` masks gate exit codes** → false green. Capture
  `${pipestatus[1]}` or redirect to a file + check `$?`.
- **`--project=screenshots` resets the DB** — only run against an
  isolated throwaway `BIBLIOGON_DATA_DIR` + `BIBLIOGON_TEST=1` +
  `BIBLIOGON_DEBUG=true`, never the production data dir. Recipe in
  the handover.
- **`backend/mutants/`** → use `pytest tests/`, not bare `pytest`.
- This shell is **zsh** (no word-split on unquoted `$VAR`).
- Theme matrix is **6 palettes / 12 variants** (count from
  `palettes.ts`, not the `data-app-theme` grep).
- At release, `verify_docs_completeness.py` requires the version
  HEADER in README / README-de / CLAUDE.md / ROADMAP / backlog to
  match canonical.

## Step 4: Pick the work

No P0/P1/P2 open. Propose one of (confirm with me first — do NOT
start implementing immediately):

1. **Picture-Book & Comics optimization** (ROADMAP P3): e.g.
   `PLUGIN-COMICS-SESSION-3-EXTENDED-FEATURES-01` (drag-to-resize
   panels), `PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01`,
   `PICTURE-BOOK-PDF-FRONT-MATTER-01`.
2. **Theme-audit deferrals**: dynamic axe-core pass (needs live app),
   collage image drag/resize keyboard fallback.
3. **Content-types nav**: split the single content-types help page
   into 8 per-type sub-pages + `_meta.yaml` entries (if you want the
   nav to list each type).

State the chosen item + a short plan, wait for my confirmation, then
follow the Order-for-new-features (schema → service → route →
frontend → tests → i18n → commit). Push autonomously after each
atomic-green commit.

## Active disciplines

Audit-First; STOP only for genuine UX/architecture adjudications;
plain `git status` + explicit-paths before commits; `make test` (+
`make verify-theme` for any theme/CSS change) green before each
commit; every fix ships a regression pin; German production text uses
real umlauts.

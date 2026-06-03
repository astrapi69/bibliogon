# Session kickoff — resume after v0.45.0 ship

Paste this into the new session.

---

You are continuing work on **Bibliogon**. The previous session shipped
**v0.45.0** (E2E smoke remediation 24 → 0, then tag + GitHub Release).
Everything is green and there is **no open release work**.

## First: read state + establish baseline
1. `git log --oneline -8` — confirm HEAD is on `main` at the
   `docs(journal)` smoke-remediation-part3 commit, clean tree, parity
   with `origin/main`.
2. Read **`docs/journal/handover-2026-06-03-v0.45.0-shipped.md`** — the
   long-form state + gotchas. Read it fully before touching anything;
   §4 (gotchas) will save you hours.
3. `git tag --list "v0.45.0"` should exist; do NOT re-tag.
4. Establish green baseline if you'll change code: `make test`
   (backend + plugins + Vitest). Smoke is separate:
   `cd e2e && npx playwright test --project=smoke` (Aster runs this;
   "N passed, 1 flaky, exit 0" IS green — see handover §4.1).

## Then: the work
The queued item is **Tailwind + shadcn/ui Phase A** (carried from the
part-2 handover, user-confirmed for "after v0.45.0 ships"). This is a
deliberate REVERSAL of the documented "No Tailwind / Rejected shadcn"
decision in `.claude/rules/architecture.md`, `.claude/rules/coding-
standards.md`, and `CLAUDE.md`, and it intersects the theming system
(6 palettes × light/dark, `make verify-theme`).

**Do NOT start coding it blind.** It's a large architectural reversal:
1. Re-confirm scope + Phase-A boundaries with Aster first (the only
   written spec is in the part-2 session chat history — treat it as a
   starting point, re-derive).
2. Decide co-existence strategy with the existing CSS-variable theme
   system + the `verify-theme` / `check_hardcoded_colors` gates before
   any install.
3. If approved, follow the AI-workflow order (schema/deps → ... →
   tests → i18n → conventional commits) and update the three rule docs
   that currently forbid Tailwind in the SAME change.

If Aster wants something else instead, take that — there is no other
pending obligation.

## Standing rules for this repo (don't relearn the hard way)
- **STOP-gate:** never push a release tag without Aster's explicit
  E2E-green confirmation. (v0.45.0 is done; this is for the next one.)
- **Commits:** conventional; do NOT add `Co-Authored-By` AI trailers
  (project rule overrides the harness default). Commit to `main`
  matches this solo repo's trunk workflow.
- **Multi-tool coordination:** Aster runs parallel planning sessions.
  Re-sync git state before accepting a plan; stage with EXPLICIT
  paths (no `git add -A`) in case a parallel session left files.
- **Don't probe the app with a bare `python -c "import app.main"`** —
  it hits the real dev DB. Use pytest or set `BIBLIOGON_TEST=1`; for
  ad-hoc live probing run an isolated backend on a non-8000 port.
- **PDF export 500 on this box is environmental** (LaTeX/babel),
  already env-guarded in the smoke suite — not a bug to "fix".

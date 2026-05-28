# Kickoff prompt for the next session

Copy-paste this into a fresh Claude Code session to resume the
comic-bubble visual overhaul. The handover doc carries the full
state; this prompt just bootstraps it.

---

## Prompt

```
Continue the comic bubble visual overhaul (single SVG path /
approach A).

## Read first

cat docs/journal/comic-bubble-overhaul-handover-2026-05-27.md

That doc has the full state, gap analysis, and the open
adjudication question. Read it end-to-end before any code.

## State verification

git status
git log origin/main --oneline -10

The relevant recent commits are 3183d2b (walker mirror), 89137e0
(frontend approach A), and 9b65064 (axe-core fixes). Tree should
be clean.

## Adjudication

The handover doc surfaces an OPEN adjudication between Path A
(literal plan execution including rename/move of the path
module) and Path B (behavioral gaps only). Per the handover's
recommendation: **Path B**.

[USER: replace this paragraph with your choice]

Path chosen: __________

If Path B: proceed C(B1) through C(B7) per the handover's
"Concrete next-session commit plan (Path B)" section.

If Path A: proceed C(A0a), C(A0b), C(A1), then C(B1)-C(B7) per
the handover's "Concrete next-session commit plan (Path A)"
section.

## Per-commit discipline

- Plain `git status` before every commit
- Explicit-paths-only when staging (no `git add -A` if any
  parallel-session work is in the tree)
- Atomic-green-per-commit (Vitest + pytest + tsc green before
  each push)
- Push autonomously after each atomic-green commit
- Pre-Coding-Reality-Check at boundaries: grep current
  callsites of any function you're about to touch BEFORE
  writing the change

## Verifiability checkpoints

- WeasyPrint PDF export — the handover flags this as untested.
  After C(B2) or C(B6), run `make test-plugin-comics` and (if
  available) a sample picture-book / comic-book export to
  confirm the new SVG paths render correctly in PDF.
- Playwright visual regression — C(B5) creates the baseline.
  Until that lands, rely on Vitest unit coverage for visual
  correctness.
- Drag-to-position handle — MUST stay functional throughout.
  The handover documents this as a stop condition. Verify after
  each commit that touches ComicBubble.tsx.

## Stop conditions

The handover's "Stop-condition assessment" section. Re-read
before proceeding if anything's unclear.

If you hit one (e.g. WeasyPrint doesn't render the path
correctly, or the bezier produces visible artifacts at small
sizes), STOP and surface to the user with findings + a proposed
mitigation BEFORE continuing.

## Concept doc

The kickoff for this arc mentioned a concept doc at
`docs/audits/comic-bubble-konzept.md` or
`/mnt/user-data/outputs/comic-bubble-konzept.md`. The previous
session could NOT find it in the repo or sandbox. If you can
access it now, read it BEFORE C(B1) — it may contain visual
specs that the inline plan didn't capture. If you can't access
it either, work from the inline specs in the handover doc.
```

---

## Why this shape

Short prompts (under ~60 lines) keep the new session's context
budget for the actual work. The handover doc carries the
substantive state — the prompt just routes the new session to
it and resolves the one open question (Path A vs B).

The "[USER: replace this paragraph with your choice]" line is
the only manual edit needed before paste. Everything else is
already in the right form.

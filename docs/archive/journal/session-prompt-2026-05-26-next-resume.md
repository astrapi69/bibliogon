# Next Session Resume Prompt

Fresh CC session. Resume work per
[docs/journal/session-handoff-2026-05-26-next-resume.md](session-handoff-2026-05-26-next-resume.md).

## Step 1: State Verification

```bash
git status
git log origin/main --oneline -10
```

Confirm:
- HEAD: `5a959d1` (or later if user shipped follow-up commits between sessions)
- Working tree: clean
- Branch: `main`, parity with `origin/main`

Plus confirm test baselines hold:
- Backend pytest: **2269**
- Frontend Vitest: **2080**
- i18n parity: **51/51** (75/75 keys per catalog)

## Step 2: Read Handover

```bash
cat docs/journal/session-handoff-2026-05-26-next-resume.md
```

## Step 3: Direction

User direction: **Picture-Book & Comics Stack**. Read the relevant backlog entries:

```bash
grep -A 40 "PICTURE-BOOK-STORYBOARD" docs/backlog.md
grep -A 40 "PICTURE-BOOK-PAGE-TEXT-TIPTAP" docs/backlog.md
grep -A 30 "PICTURE-BOOK-OVERLAY-TEXT" docs/backlog.md
grep -A 30 "PICTURE-BOOK-TEXT-CONFIGURATION" docs/backlog.md
```

**Recommended start:** Pre-Inspection for `PICTURE-BOOK-STORYBOARD-VIEW-01` (standalone, 10-15 commits, explicit RCU + schema-additive shape).

**User-Direction-Override always overrides.** The user may redirect to the paired TipTap + Overlay stack (`PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01` + `PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01`, 10-13 commits combined) instead.

## Step 4: Apply Active Disciplines

Per the handover's "Critical Constraints + Active Disciplines" section. Most relevant for PB/Comics work:

- **Audit-First Pre-Inspection** for anything above XS effort
- **Recurring-Component-Unification 2-surface rule** (STORYBOARD-VIEW explicitly flags PageThumbnail extraction)
- **Single-Source-of-Truth** (reuse `page.position`; no parallel ordering shape)
- **Half-wired feature lifecycle** (every state-write needs a render-consumer in the same chain)
- **Architecture-doc consultation as part of Pre-Inspection** (grep `docs/architecture/` + `docs/explorations/`)
- **TipTap `imageFigure` not `image`** for any TipTap-emitting code
- **Module-level caches survive test boundaries** (bidirectional `yield`-based autouse fixture for any new `@lru_cache`)

## Step 5: Execute

**Pre-Inspection first.** STOP for adjudication on substantial architecture decisions BEFORE any code-write. Push autonomously after atomic-green commits.

## Push Convention

CC pushes autonomously after atomic-green commits. Surface only on:
- Stop-Conditions (test red, audit-surfacing-architecture-decision, parallel-session-conflict)
- Substantial architecture decisions requiring user adjudication
- End-of-session summary

## End-of-Session Report

Per established convention:
- Commits shipped (hash + subject)
- Test deltas (backend pytest + frontend Vitest + i18n parity)
- Disciplines re-validated
- Pre-Coding-Reality-Check findings (if any)
- Backlog state changes
- Next session candidate

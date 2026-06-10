# Next Session Resume Prompt

Fresh CC session. Resume work per
`docs/journal/session-handoff-2026-05-29-next-resume.md`.

## Step 1: State Verification

```
git status
git log origin/main --oneline -10
```

Expected HEAD: `ad83cda0`. Clean tree, parity with origin/main.

Confirm test baselines hold:

- Backend pytest: **2388 passed / 1 skipped**
- Frontend Vitest: **2456 passed**
- i18n parity: **92/92 keys** in 8 catalogs
- Playwright smoke specs: **79**

## Step 2: Read Handover

```
cat docs/journal/session-handoff-2026-05-29-next-resume.md
```

Then read in order:

1. `docs/backlog.md` (P0=0, P1=0, P2=0, P3=17, P4=26, P5=12)
2. `.claude/rules/lessons-learned.md`
3. `.claude/rules/coding-standards.md`
4. `backend/config/content-types.yaml`
5. `backend/config/book-types.yaml`
6. `frontend/src/components/SplitButton.tsx` (shared-component
   pattern reference)

## Step 3: Direction

**Title Editing C1-C4.**

Task 0 foundation (`Book.status` + shared `PublicationStatus`
Pydantic Literal) is shipped at commits `fcea37e1..9d747dae`.
Ready for `EditableTitle` implementation.

### Pre-Inspect all editor header components BEFORE code-write

```
grep -rn "title\|Title" frontend/src/pages/BookEditor.tsx | head -20
grep -rn "title\|Title" frontend/src/pages/ArticleEditor.tsx | head -20
grep -rn "title\|Title" frontend/src/components/ComicBookEditor.tsx | head -20
grep -rn "title\|Title" frontend/src/components/PageEditor.tsx | head -20
grep -rn "status\|published" frontend/src/ --include="*.tsx" | head -20
grep -n "publications\b" frontend/src/api/client.ts | head -10
```

Determine:

1. Current title rendering shape in each editor (static text,
   h1, input?).
2. Whether existing PATCH endpoints accept `title` updates
   (Book + Article).
3. Published-state detection signal:
   - Book: `book.status === "published" || book.status === "archived"`
   - Article: `article.publications.length > 0` OR
     `article.status === "published"` — pick one and document.
4. Is there a shared editor-header component, or 4 independent
   header surfaces? RCU rule fires at 2+ surfaces.

### Implementation Plan (4 commits)

- **C1**: `feat(editors): EditableTitle shared component +
  wire into all editors`
  - New `frontend/src/components/EditableTitle.tsx` + module
    CSS.
  - Props: `value`, `onSave(newTitle)`, `disabled?`,
    `testIdPrefix`, plus optional `showPublishedWarning` +
    `onAcknowledgeWarning` for C2.
  - Pencil-toggle inline edit. Enter / blur saves. Escape
    cancels.
  - Wire into BookEditor + ArticleEditor + ComicBookEditor
    (+ PageEditor if it has independent title display).
  - Vitest covers: pencil renders, click toggles edit, Enter
    saves, Escape cancels, blur saves.
- **C2**: `feat(editors): published-work warning on title edit`
  - Detection gates on `book.status === "published"` or
    `article.publications.length > 0` (or
    `article.status === "published"`).
  - Yellow warning banner with acknowledgment button.
  - Vitest covers: warning visible for published, hidden for
    draft, acknowledgment flow.
- **C3**: `feat(i18n): title editing strings in 8 catalogs`
  - `ui.editor.edit_title_tooltip`,
    `ui.editor.published_warning_title`,
    `ui.editor.published_warning_body`,
    `ui.editor.acknowledge_warning_button`.
  - 8 catalogs: de / en / es / fr / el / pt / tr / ja.
  - DE: real UTF-8 umlauts ("Veröffentlichung", "Verstanden,
    Titel ändern").
  - i18n parity must hold (92 → ~96 keys).
- **C4**: `docs(editors): title editing help docs +
  Playwright smoke + close`
  - Playwright `e2e/smoke/editable-title.spec.ts`: edit on
    unpublished Book → save → reload → persists. Edit on
    published Book → warning appears → acknowledge → edit →
    save.
  - Help-doc pair (DE + EN) under `docs/help/{de,en}/editor/`.
  - CHANGELOG Unreleased section entry.
  - Archive entry in `docs/archive/roadmap/2026-05.md`.

## Step 4: Apply Active Disciplines

Per handover's "Critical Constraints + Active Disciplines"
section. Key ones for this arc:

- **Audit-First Pre-Inspection** before code-write — STOP-gate.
- **Pre-Coding-Reality-Check** at each commit boundary.
- **Plain `git status` before every commit** — read FULL
  index state.
- **Explicit-paths-only staging** if parallel-session work is
  in flight.
- **Articles-vs-Books parallel-surface asymmetry** —
  EditableTitle MUST land on all editor surfaces in C1; no
  half-migration.
- **Testid namespace pinning** — `editable-title-{kind}-*`
  prefix; document the pin list in EditableTitle.tsx header.
- **Half-wired feature lifecycle** — C2 published-work warning
  consumes `book.status` (shipped) + `article.publications`
  (shipped); both foundations present.

## Step 5: Execute

Push autonomously after atomic-green commits. Surface on
Stop-Conditions or completion.

## Push Convention

CC pushes autonomously after atomic-green. Surface only on
Stop-Conditions or substantial-architecture-decisions.

## Stop Conditions

- State-divergence (HEAD doesn't match `ad83cda0` or working
  tree dirty)
- Backlog counts diverged beyond expectations
  (P0+P1+P2 should remain 0)
- Multi-Tool-Coordination conflict
- Editor header components share a not-yet-extracted parent
  (the right move would then be to extract the parent FIRST
  before adding EditableTitle to it)
- Article published-state detection is ambiguous (no clear
  signal between `status` and `publications.length`)
- Backend PATCH endpoint doesn't accept title updates (needs
  router change first)

## End-of-Session

Session-end-report per established convention:

- Statistics table (commits, files, tests added, baselines).
- Per-commit subject summary.
- Per-commit one-line outcome.
- Open questions + assumptions (per `ai-workflow.md`).
- Backlog state delta.
- Suggested next direction.

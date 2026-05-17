# Manual smoke-test bug tracker

Running record of bugs surfaced by manual user smoke-testing of
shipped releases. Pairs with `lessons-learned.md` (rules for
preventing recurrence) and `backlog.md` (deferred follow-up
items). This file is the authoritative status table — the
journal entries are first-person narrative, this is the index.

## Purpose + scope

- **Scope:** bugs surfaced by Aster's manual smoke-testing of
  Bibliogon, NOT bugs caught by CI / Vitest / pytest. Those are
  fixed in the normal commit flow and don't need a separate
  tracker.
- **What goes here:** numbered bugs (Bug N), pattern-class
  membership, fix commits, paired lessons-learned rules,
  follow-up backlog items.
- **What doesn't:** routine code-review fixes, dependency bumps,
  internal refactors. Those land in commits + CHANGELOG entries.
- **Living document:** updated at the END of each session that
  closed a bug OR surfaced a new one. The session journal
  describes WHAT happened; this file is the cross-session
  WHERE-WE-ARE.

## Bug-surfacing workflow

1. **User reports finding** during manual smoke-testing of a
   shipped release (typically in a strategic-planning chat
   session).
2. **Strategic Claude formulates a Pre-Inspection-Audit prompt**
   for CC with diagnosis options + stop conditions.
3. **CC runs the Pre-Inspection** before any code changes:
   reads the source, checks git history, queries DB if needed,
   verifies the symptom is reproducible, identifies the correct
   diagnosis (often multiple possibilities — A/B/C analysis).
4. **CC surfaces findings + correct possibility + fix scope**
   before committing. User decides go/no-go on the proposed
   fix.
5. **CC implements** with the full test-palette discipline
   (backend pytest + frontend Vitest + i18n + E2E + lessons-
   learned promotion when applicable).
6. **End-of-session update**: this file's tables get the new
   bug numbered, status moved to closed, commit hashes pinned,
   follow-up backlog items added.

Stop conditions established during recent sessions:
- Multiple diagnoses true simultaneously → surface composite fix
- Data already lost in production → surface, decide recovery
  strategy before patching forward
- Cascade behaviour non-trivial → surface, propose composite fix
- Commit count > 8 in a single bug fix → surface, propose split

## Bug summary table

Verified against git log on 2026-05-17. "Pattern class"
column points at the formal lessons-learned entry (when one
exists) that prevents recurrence.

| # | Description | Status | Shipped | Surfaces | Pattern class | Backlog |
|---|---|---|---|---|---|---|
| 1 | Settings back-button always navigated to `/` regardless of origin | Closed | 2026-05-16 (`6f8819b`, `7ae24c1`) | Settings / Help / GetStarted | "Perception-lag vs code-bug" (lessons-learned) | NAVIGATION-ORIGIN-TRACKING-01 (P3) |
| 2 | BookDashboard list-view rows missing selection checkboxes | Closed | 2026-05-16 (`711aef0`, `bd8cb61`) | BookListView (active + trash) | "Articles-vs-Books parallel-surface asymmetry" #6 | — |
| 3 | AD-Trash + BD-Trash view-mode defaults missing | Closed | 2026-05-16 (`5767289`, `8cf6ed0`, `5d8313f`) | Settings + AD/BD trash | "Settings-Granularity" Class B (single-instance; not formalized) | — |
| 4 | Comments-Admin restructure (bulk-delete + preview modal + reclassify-in-modal) | Closed | 2026-05-16 evening (`c0b9c60..5bf7ef7`, 7-commit atomic) | Settings → Comments admin | "Half-wired trash lifecycle" indirectly (preview modal pinned the reclassify migration; full trash arrived in Bug 10) | — |
| 4a | Bulk-delete missing from Comments-Admin | Closed (folded into Bug 4) | 2026-05-16 evening | Settings → Comments admin | "Articles-vs-Books parallel-surface asymmetry" #7 | — |
| 5 | Settings "Allgemein" tab cognitive-load (one giant tab, 25+ fields) | Open (backlog) | — | Settings → Allgemein | "Inline-component duplication" (component-extraction discipline) | SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01 (P3) |
| 6 | Menu items calling `e.preventDefault()` in `onSelect` keep menu open behind dialog | Closed | 2026-05-16 (`02fc66b`, `d0df9d5`, `b160d6a`) | 6 surfaces: ArticleCard, BookCard, BookListView (trash + permanent items), ArticleEditor (reclassify), Toolbar (Copy split-button), Dashboard (theme toggle) | "Menu-Dialog Lifecycle: do not preventDefault inside onSelect" (lessons-learned) | — |
| 7 | `articles_trash_view` mock contract drift caused stale-state test red on `main` | Closed | 2026-05-16 (`5728e71`, `5bf7ef7`) | ArticleList.test.tsx (existing test broke when new hook introduced) | "New-hook + new-mock-key contract drift in EXISTING test files" (lessons-learned) | — |
| 8 | Wizard Author-Field needs upgrade + Authors-Database foundation | Closed | 2026-05-17 (`a27daaa..e435039` Phase 1 + `5a966b7..fb994d0` Phase 2) | Settings → new "Authors-Database" tab + ConvertToBookWizard Step-2 | "Intentional asymmetry between Articles and Books must be documented" — Authors-DB wizard-only-Phase-2 per D8 | AUTHOR-DATALIST-EXTEND-EDITORS-01 (P3) |
| 9 | Books-only Categories + BISAC support | Closed | 2026-05-17 (`032a1c7..c9e9a79`, 7-commit) | Book model + BookMetadataEditor Marketing tab + KDP plugin metadata checker | "Intentional asymmetry between Articles and Books must be documented" — canonical concrete example | BISAC-DATABASE-LOOKUP-01 (P5), KDP-CATEGORIES-CATALOG-SYNC-01 (P3) |
| 10 | Comments Move-to-Trash data appears lost (half-shipped trash lifecycle) | Closed | 2026-05-17 (`f09f0c2..1b8af09`, 7-commit) | Settings → Comments + backend `/api/comments/trash/*` | "Half-wired trash lifecycle: soft-delete shipped without the restore-surface" + Articles-vs-Books asymmetry #8 | — |

### Sub-finding nesting (Bug 4 example)

When a single bug splits into multiple sub-findings during
implementation, the parent number stays and sub-findings get a
letter suffix:

- Bug 4 = parent (Comments-Admin restructure)
- Bug 4a = bulk-delete missing
- Bug 4b = preview-modal pattern
- Bug 4c = reclassify migration to detail-view

The parent gets one closed-row in the table; sub-findings list
ONLY when they're independently relevant to the
pattern-class / backlog tracking.

## Pattern classes table

Promoted lessons-learned rules that bug findings have
populated. Bug numbers here are forward-references — the
"Instances" count is how many separate bugs of this class
have shipped fixes.

| Pattern class | Instances | Formalized as lessons-learned rule? | Cross-reference |
|---|---|---|---|
| Articles-vs-Books parallel-surface asymmetry | 8 (Bug 1 fix is not an asymmetry; Bug 2 = #6; Bug 4a = #7; Bug 10 = #8; earlier 5 from 2026-05 audits) | Yes | `lessons-learned.md` § "Articles-vs-Books parallel-surface asymmetry" |
| Intentional asymmetry between Articles and Books | 2 (Bug 8 Authors-DB wizard-only, Bug 9 Categories+BISAC Books-only) | Yes (canonical examples documented) | `lessons-learned.md` § "Intentional asymmetry between Articles and Books must be documented" |
| Half-wired feature lifecycle (state-write without inverse-mutation OR state-consumer) | 3 (Bug 10 Comments-Trash — backend shape, closed by Bug 10 fix; PB-PHASE4 Session 4 Layout-Picker without renderer — frontend shape, closed by Session 4 Commits 1-3; PB-PHASE4 `speech_bubble_config` field without UI — frontend shape near-miss, read-path closed via D2a default-position, write-path tracked as `PICTURE-BOOK-SPEECH-BUBBLE-POSITIONING-01` P3) | Yes | `lessons-learned.md` § "Half-wired feature lifecycle" |
| Menu-Dialog Lifecycle (preventDefault in onSelect keeps menu behind dialog) | 1 (Bug 6 — 6 callsites in one fix) | Yes | `lessons-learned.md` § "Menu-Dialog Lifecycle: do not preventDefault inside onSelect" |
| New-hook + new-mock-key contract drift in EXISTING test files | 1 (Bug 7) | Yes | `lessons-learned.md` § "New-hook + new-mock-key contract drift in EXISTING test files" |
| Settings-Granularity (Class B) | 1 (Bug 3) | No (single-instance; per discipline a formalized pattern needs 2 instances) | — |
| Test-isolation discipline (smoke-tests outside pytest bypass production-data guards) | 1 (Bug 10 Commit 1 incident, NOT a user-surfaced bug — process violation by CC during implementation) | Yes | `lessons-learned.md` § "Test-isolation discipline: never run integration smoke-tests outside pytest" |
| Perception-lag vs code-bug (user reports "broken" + cites diagnostic message that isn't the cause) | 1 (Bug 1 narrative — workbox message misread as causal; actual bug was a 419ms perception lag) | Yes | `lessons-learned.md` § "User-perceived bug ≠ code bug: the perception-lag class" |

## Backlog items derived from bug findings

Filed during fix-implementation as deferred follow-ups. All
trigger-gated — none start until the trigger fires.

| ID | Priority | Origin | Description | Trigger |
|---|---|---|---|---|
| SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01 | P3 | Bug 5 (filed 2026-05-16 evening) | Reorganize the giant Settings → Allgemein tab into logical sub-sections (cognitive load reduction) | Convened Settings-Polish-Session OR a user complaint about Settings scroll friction |
| NAVIGATION-ORIGIN-TRACKING-01 | P3 | Bug 1 (filed 2026-05-16) | Extract `useBackNavigate` hook encapsulating the `location.key === "default"` fallback pattern + migrate the 3 hardcoded `navigate(-1)` sites | A fourth page reachable from both AD + BD needs origin-tracking OR a contributor adds a new top-level page |
| AUTHOR-DATALIST-EXTEND-EDITORS-01 | P3 | Bug 8 Phase 2 (filed 2026-05-17) | Extend Wizard's `<input>` + `<datalist>` + Add-to-Authors-DB pattern to ArticleEditor + BookEditor + BookEditor backpage author-bio | User feedback on editor-typing friction OR positive Wizard-pattern validation |
| BISAC-DATABASE-LOOKUP-01 | P5 | Bug 9 (filed 2026-05-17) | Bundled BISAC catalogue + autocomplete + code-existence validation (vs current free-text + format-only check) | Bibliogon obtains BISG license OR user requests autocomplete strongly enough to justify ~$590/year cost |
| KDP-CATEGORIES-CATALOG-SYNC-01 | P3 | Bug 9 (filed 2026-05-17) | Sync KDP plugin's 25-category yaml with the 10-category subset hardcoded in routes.py | Scheduled Settings-Polish-Session OR user reports KDP categories mismatch |
| PICTURE-BOOK-SPEECH-BUBBLE-POSITIONING-01 | P3 | PB-PHASE4 Session 4 Pre-Inspection audit (filed 2026-05-17) | Drag-to-position UI for `Page.speech_bubble_config.anchor_position` (closes the write-path of the field whose read-path Session 4 D2a closed with a fixed bottom-center default) | User-feedback that default bubble position doesn't match content OR first author requests reposition capability |
| PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01 | P3 | PB-PHASE4 Session 5 D5 sub-decision (filed 2026-05-17) | KDP picture-book-specific fields: `age_range` column + UI, `page_count` derived display, `print_format` column + UI; future comic-book likely shares the shape | User-feedback that current Book-Metadata fields are insufficient for KDP picture-book publishing OR first KDP picture-book upload attempt reveals the field gap |

## Session cross-references

Which session shipped what — quick-lookup for "where was this fixed?".

| Session date | Commit range | Bugs shipped | Notes |
|---|---|---|---|
| 2026-05-16 day | `6f8819b..f6e55bf` | Bugs 1 + 2 + 3 (+ Phase 4 Kinderbuch Session 2 backend) | Two parallel tracks (3-bug hotfix + Phase 4 backend). 22 commits. |
| 2026-05-16 evening | `c0b9c60..5bf7ef7` | Bug 4 (closed, 7-commit atomic) + Bug 6 + Bug 7 + Phase 4 test-discipline | Bug 6 + Bug 7 surfaced during Bug 4 work and were folded into the same session. |
| 2026-05-17 (this session) | `a27daaa..c9e9a79` | Bug 8 Phase 1 + Bug 10 (BLOCKER interrupt) + Bug 8 Phase 2 + Bug 9 | 26 commits total. Bug 10 surfaced as a P0 during Bug 8 Phase 1 close + interrupted the planned Session B (Bug 9) start. Bug 8 Phase 2 then resumed; Bug 9 closed last. |

## Pre-existing open findings (status unverified)

Items the user recalled but for which the formal-tracking
trail is unclear. Status should be confirmed before promoting
to a numbered bug.

| Recalled finding | First mentioned | Status (2026-05-17) | Next step |
|---|---|---|---|
| Settings → "author" link broken? | User's recall in 2026-05-17 strategic chat (no journal entry found) | **Unverified** — no audit doc, no journal entry, no commit. May refer to the BookMetadataEditor "Author" tab navigation OR a separate Settings-side link. | Reproduce in browser; if real, file as next-numbered Bug. |
| First-row tiles different size? | User's recall in 2026-05-17 strategic chat (no journal entry found) | **Unverified** — likely refers to the BookDashboard / ArticleList grid view first-row rendering, but no specific audit pinpoints the symptom. | Reproduce in browser at typical viewport (1080p + mobile); if real, capture screenshot + file as next-numbered Bug. |

These two findings sit here until either reproduced (then promoted) or determined to be a misremember of an already-closed item (then archived with a note).

## Companion files

- `lessons-learned.md` § "Articles-vs-Books parallel-surface asymmetry" (the asymmetry-tally maintained there is the source of truth; this file's pattern-class column mirrors it).
- `lessons-learned.md` § "Half-wired trash lifecycle".
- `lessons-learned.md` § "Menu-Dialog Lifecycle".
- `lessons-learned.md` § "New-hook + new-mock-key contract drift".
- `lessons-learned.md` § "Test-isolation discipline".
- `lessons-learned.md` § "User-perceived bug ≠ code bug: the perception-lag class".
- `lessons-learned.md` § "Intentional asymmetry between Articles and Books must be documented".
- `backlog.md` — open follow-up items derived from bug findings.
- `docs/journal/chat-journal-session-{date}.md` — first-person narrative per session; this file is the cross-session index.
- `changelog/releases/v0.33.1.md` — user-facing release notes including the Bug-10 trust-recovery message.

## Update protocol

At the END of every session that touches a bug:

1. **Bug closed** → move row's status to `Closed` with commit hash(es); update Sessions table with the new commit range; remove from any open-findings list.
2. **New bug surfaced** → add next-numbered row with `Open (in-progress)` status; capture diagnosis options + chosen possibility in the relevant session journal; add to pattern-class table only when an instance count makes the pattern formalizable (≥ 2).
3. **Backlog item filed** → add to backlog table with trigger + priority + originating bug.
4. **Lessons-learned rule promoted** → cross-reference in the pattern-class table.
5. **Pre-existing open finding resolved** → promote to numbered Bug, archive the recalled-finding row.

This file is committed as part of the same session's docs commit. Avoid orphan updates that aren't tied to a bug status change.

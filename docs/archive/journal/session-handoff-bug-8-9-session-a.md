# Session handover — Bug 8 + Bug 9 Session A start

This handover packages the Pre-Inspection results + the 10
confirmed sub-decisions + 2 carried-forward design findings, so
the next session can open Phase 1 cold and proceed without
re-running the audit.

**Predecessor session ended:** 2026-05-16 late evening, after a
14-commit run between `c0b9c60..5bf7ef7` shipping Bug 4
(Comments-Admin restructure), Bug 5 (backlog filing), Bug 6
(menu-dialog lifecycle), Bug 7 (mock-contract drift fix), the
Phase-4 Session 2 test-discipline deliverables, plus 2
lessons-learned rules and the Bug 8 + Bug 9 Pre-Inspection.

**Repo state at handoff:** main = `5bf7ef7`, all green
(1774 backend pytest + 1077 frontend Vitest + expanded E2E),
nothing pending in working tree.

**Predecessor handoff (longer narrative):**
[session-handoff-2026-05-16.md](session-handoff-2026-05-16.md).
This file is the focused next-session-start gate.

---

## What ships in the next session

**Bug 8** — Wizard Author-Field upgrade + Authors-Database
foundation. The wizard's Step-1 author input becomes a
combobox-style `<input>` + `<datalist>` whose suggestions are
the union of (a) selected articles' author values and (b) a
global Authors-Database. A new database surface lives in
Settings.

**Bug 9** — Books-only Categories + BISAC support. Two new
columns on `Book` (`categories`: free-text JSON list,
`bisac_codes`: BISAC code JSON list). BISAC is free-text +
format-validated, NOT bundled (per the BISG licensing
resolution at D3). New section in BookMetadataEditor's
Marketing tab. KDP plugin extended for BISAC validation.

**Sequencing decision (D10):** 2 sessions. **Session A = Bug 8
(this one).** Session B = Bug 9 (follows when A lands clean).

---

## Pre-Inspection sub-decisions (all CONFIRMED)

| # | Decision | Confirmed value |
|---|---|---|
| D1 | Categories storage shape | Two columns: `Book.categories` (free-text JSON list) + `Book.bisac_codes` (BISAC code JSON list) |
| D2 | KDP yaml categories vs BISAC | Keep both. KDP yaml 25 categories stay as free-text Categories suggestion pool; BISAC codes go in the separate column |
| D3 | BISAC source/licensing | **RESOLVED: NO BUNDLING.** Free-text input + regex format validation (9-char alphanumeric, 3 letters + 6 digits, e.g. `FIC022020`). Multiple codes allowed (KDP best practice ≤ 3). Helper text + link to www.bisg.org/complete-bisac-subject-headings-list. Reason: BISG license terms incompatible with Bibliogon's local-first + donation-based model. Filed `BISAC-DATABASE-LOOKUP-01` P5 as the deferred-database backlog item. |
| D4 | Author entity scope | `id` (uuid), `name` (required String), `slug` (unique), `bio` (Text nullable), `created_at`, `updated_at`. Minimum surface. |
| D5 | Existing free-text author migration | None. Free-text stays intact. Authors-Database is opt-in additional layer. Datalist suggests; free-text always valid. |
| D6 | Wizard "Anderer Author" UX | `<input>` + `<datalist>` per Bibliogon's architecture-rule. Datalist options = union(selected-articles-authors, global-Authors-DB) |
| D7 | "Add to Authors-Database" prompt | Default-checked checkbox "Add '<typed-name>' to author list" — appears when typed name doesn't match a known author. User can uncheck for one-off contributors. |
| D8 | Articles author-DB integration scope | Wizard only in Phase 1+2. ArticleEditor + BookEditor author inputs stay plain text in this session. Future session adds datalist + add-to-DB pattern to those surfaces. |
| D9 | Articles get Categories too? | **No.** Categories+BISAC are Books-only. Articles use Topic (single, settings-managed enum) + Tags (free-text). Intentional asymmetry — document in Bug 9 commit message + lessons-learned. |
| D10 | Session split | 2 sessions. Session A = Bug 8. Session B = Bug 9. |

---

## Carried-forward design findings

### Finding 1 — Existing `AuthorSettings` tab → use Option A

Settings already has an `author` tab carrying personal
identity (Aster's name + pen_names). It is NOT a collection of
book authors. The new Authors-Database is a sibling concern,
not a replacement.

**Option A confirmed**: new separate "Authors Database" (or
"Authors Library") tab beside the existing "Author" tab.

- Existing tab: stays "Author" OR rename to "Author Identity"
  (decide at Commit-5 implementation time based on user-facing
  label clarity).
- New tab: "Authors Database" (or "Authors Library").
- Settings tab count: 7 → 8 (acceptable).

### Finding 2 — stale stop-condition removed

The original commit-sequence sketch named
`PLUGIN-SETTINGS-TESTID-COVERAGE-01` (P2) as a potential
prerequisite for Phase 1 Commit 5. That item is archived
(closed 2026-05-15) — Settings monolith extraction shipped in
v0.33.0. The per-tab components already live under
`frontend/src/components/settings/`. Phase 1 Commit 5 is
"create new `AuthorsDatabase.tsx` sibling of
`AuthorSettings.tsx`" — no monolith-extraction precondition.

---

## Session A commit sequence (Bug 8)

### Phase 1 — Author DB Foundation (4-5 commits)

1. **feat(api): Author model + Alembic migration**
   - SQLAlchemy `Author` class (D4 fields).
   - Migration creates `authors` table.
   - Models test stays light (creation + repr).

2. **feat(api): Authors router + Pydantic schemas + CRUD**
   - `POST /api/authors`, `GET /api/authors`, `GET /{id}`,
     `PATCH /{id}`, `DELETE /{id}` (soft-delete if pattern
     warrants, else hard).
   - Pydantic schemas: AuthorCreate / AuthorOut /
     AuthorUpdate.
   - Router registered in `app/main.py`.

3. **test(api): backend pytest for Author CRUD + validation**
   - ~15-20 cases: happy-path CRUD, slug uniqueness,
     name-required, 404 on missing, list-pagination if
     applicable.

4. **feat(frontend): api.authors client**
   - Mirror api.comments / api.articles shape.
   - Includes `list`, `get`, `create`, `update`, `delete`.

5. **feat(settings): Authors-Database tab UI + Vitest**
   - New `AuthorsDatabase.tsx` under
     `frontend/src/components/settings/`.
   - New tab in `Settings.tsx` between existing tabs (pick
     a sensible position — e.g. after "Author" identity).
   - CRUD UI: list with rows, add-author form, edit-inline
     or detail-modal, delete with confirm dialog.
   - Vitest: render, add author, edit, delete, error states.

### Phase 2 — Wizard Author-Dropdown (3-4 commits)

6. **feat(wizard): aggregate authors from selected articles**
   - Compute the suggestion pool (union of articles' authors
     + global Authors-DB).
   - Pass into Step-1 author field as datalist options.

7. **feat(wizard): `<input>` + `<datalist>` UI in Step-1 + Vitest**
   - Replace plain `<input>` with the combobox shape.
   - Vitest: renders datalist; typing filters; pre-fill
     from single-article-selection mirrors the subtitle/cover
     pre-fill precedent (Q13 / Q15 from v0.33.0).

8. **feat(wizard): "Add to Authors-Database" checkbox + submit flow**
   - Default-checked when typed name doesn't match a known
     author.
   - On wizard submit: if checkbox is checked and the typed
     name is new, POST to `/api/authors` first, then proceed
     with `POST /api/books/from-articles`.
   - Handle the add-to-DB failure case gracefully (book
     still creates; author-add failure is a non-blocking
     toast).

9. **test(e2e): Playwright spec for full Wizard author-dropdown flow**
   - Single article with author → wizard pre-fills.
   - Multi-article with multiple authors → datalist shows
     all distinct authors.
   - User types new name + checkbox checked → both Book and
     Author are created.
   - User types new name + checkbox unchecked → only Book is
     created.

**Estimated total: 7-9 commits, 2-3 hours.**

---

## Bundled docs items (ride alongside Session A early commits)

These are non-code or near-non-code items the user confirmed
can ship in this session without urgency. Pick a natural
moment (e.g. before Phase 1 Commit 1, or between Phases) to
batch them as a single small docs commit:

1. **`BISAC-DATABASE-LOOKUP-01` (P5)** — file in
   `docs/backlog.md` P5 section.
   - Trigger: Bibliogon obtains BISG license OR user requests
     autocomplete strongly enough to justify license cost
     (~$590/year for under-$1M-revenue tier).
   - Scope: bundled BISAC database + autocomplete + validation
     against real codes (not just format).
   - Defer reason: license cost + local-first principle +
     current free-text + format-validation is sufficient MVP.

2. **`KDP-CATEGORIES-CATALOG-SYNC-01` (P3 IMPROVEMENT)** — file
   in `docs/backlog.md` P3 section.
   - Trigger: scheduled Settings-Polish-Session OR user
     reports KDP categories mismatch.
   - Scope: sync `kdp.yaml` 25 categories with `routes.py`
     10-category subset. Single-commit fix.
   - Defer reason: pre-existing minor drift, not blocking
     Bug 8 or Bug 9 work.

3. **Lessons-learned: "Intentional Asymmetry Documentation Rule"**
   — append to `.claude/rules/lessons-learned.md`.
   - When Articles-vs-Books features intentionally differ for
     conceptual reasons, document the asymmetry in the commit
     message + add a lessons-learned note for future audit
     awareness.
   - Prevents false-positive Pattern-Audit triggers.
   - Use Bug 9 (Categories Books-only) as the canonical
     concrete example.

4. **Tally-edit + footnote** — edit the existing
   "Articles-vs-Books parallel-surface asymmetry"
   lessons-learned entry.
   - Reclassify Bug 3 OUT of the tally (it was symmetric
     across AD and BD, not asymmetric between them).
   - Tally stays at 7 (occurrences 1-6 unchanged + Bug 4a
     Comments-Admin bulk-delete = #7).
   - Footnote: "Bug 3 (Trash-View-Mode-Settings) was
     originally tagged as #7 in mid-session reports;
     reclassified as Settings-Granularity-Pattern (Class B,
     currently single-instance, not yet formalized as
     lessons-learned class)."
   - Class B is NOT formalized as its own lessons-learned
     entry yet — single instance is incident not pattern,
     per the discipline.

---

## Stop conditions for Session A

Surface and pause if any of:

- **Phase 1 Commit 5 design decision deferred too long**: if
  the Authors-Database tab UI needs CRUD primitives that don't
  exist anywhere in Bibliogon (e.g. inline-edit-in-list grid
  with optimistic updates against a typed-search filter),
  scope creep is real — propose splitting the Settings UI
  into its own commit pair.
- **Wizard datalist clashes with existing form validation**:
  if the Step-1 required-field gate
  (`title.trim().length > 0 && author.trim().length > 0`)
  interferes with the datalist's free-typing behavior, surface
  and refactor the validation approach.
- **Commit count grows beyond 10**: surface, propose splitting
  Phase 2 to its own session. The original estimate is 7-9
  commits; +1 leeway is OK, +2 means a real surprise the user
  should weigh.

---

## Pre-Inspection trail

For full context on the audit that produced this handover,
reference the prior session's final turns. The Pre-Inspection
report ran 6 sections (A KDP plugin, B Author storage,
C Wizard author field, D Marketing tab, E sub-decisions,
F Articles-vs-Books impact). Key finding nuggets that inform
implementation:

- **`Book.keywords`** is the JSON-text-column precedent for
  `Book.categories` + `Book.bisac_codes`.
- **`KeywordInput.tsx`** is the natural shape to clone for a
  `CategoryInput` component in Session B.
- **`Article.author`, `Book.author`, `ArticleComment.author`**
  are all `String(N) nullable` free-text columns. No FKs. The
  Authors-DB stays decoupled; the column types do not change.
- **KDP plugin already has `categories` as a request-time
  concept** but does NOT persist to the Book model. Session B
  adds the column + persistence; the existing KDP request
  surface migrates from "free param" to "read from Book".

---

## Multi-tool collaboration tracking note

This session surfaced 3 instances of stale-state drift from
the planning side. The lessons-learned rule
"Multi-tool collaboration tracking: re-sync before accepting
new orders" applies symmetrically. The next session's planner
should pre-flight-check (a) referenced backlog items are
still active, (b) the prior CC output was read before
formulating follow-up, (c) tally references match the current
lessons-learned content. Standard hygiene, not exception
behavior.

---

## Standing-by close

End-of-this-session ledger: 14 commits between
`c0b9c60..5bf7ef7`, all green, all pushed. Bug 8 + Bug 9
queued. Session A opens with this doc as the start gate. No
further work this session.

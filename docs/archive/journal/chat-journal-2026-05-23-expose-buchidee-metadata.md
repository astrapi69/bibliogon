# Chat journal 2026-05-23 — EXPOSE-BUCHIDEE-METADATA-01 close

User-real-test 2026-05-23 surfaced "in den metadaten von den
Büchern fehlt das exposee und Buchidee". Pre-Inspection
confirmed genuine missing-feature (NOT UX-discoverability
collision). Closed via 4 atomic-green commits (C1-C3) + C4
docs commit.

## Session arc

### Pre-Inspection (6 tracks)

- **Track 1 (Backend schema)**: 37 Book fields enumerated;
  NO existing field maps to "Exposé" or "Buchidee" semantics.
  Distinct from ``description`` (short blurb / store),
  ``backpage_description`` (back-cover marketing),
  ``html_description`` (KDP HTML), ``chapter_summaries`` (AI
  per-chapter).
- **Track 2 (Frontend)**: BookMetadataEditor 1556 LOC; uses
  Radix Tabs (8 tabs); General-tab already houses ``description``
  via multiline + markdown + fullscreen Field — canonical
  multi-paragraph shape.
- **Track 3 (i18n)**: zero pre-existing keys for any of
  Exposé/Buchidee/Synopsis/Klappentext/Pitch/Premise/Logline.
- **Track 4 (Disambiguation)**: distinct concepts. Buchidee =
  short premise (1-2 sentences); Exposé = long-form Plot +
  Characters + Setting + Tone document (standard German-
  publishing-domain term).
- **Track 5 (Per-book-type)**: backend unified ``books`` table
  → all 3 types get fields automatically. BUT
  ComicBookEditor has no BookMetadataEditor access path —
  separate Half-Wired-Lifecycle-Cascade discovered.
- **Track 6 (Scope)**: Option α (two fields) + Option A
  (3-5 commit minimal) recommended.

### User adjudication

All 9 Open Decisions resolved (Q1 α two fields; Q2 A minimal;
Q3 defer comic-book gap as P3; Q4 new Story tab; Q5 8 catalogs
canonical; Q6 ``book_idea`` + ``expose`` field names; Q7 TEXT
both; Q8 skip BookFromTemplateCreate; Q9 ship Playwright
smoke).

### Implementation (4 commits)

#### C1 — `b8b6983` feat(books): add book_idea + expose author-design metadata fields

Backend Book model + BookCreate/Update/Out schemas + Alembic
migration `qe6f7a8b9cd0` (chains from `pd5e6f7a8b9c`). 11 new
pytest cases. Intermediate runtime-degradation note: the live
``BookMetadataEditor`` doesn't yet have the new fields wired
through (C2 work).

#### C2 — `9127e88` feat(book-metadata): Story tab with book_idea + expose fields

New Radix Tabs trigger ``metadata-tab-story`` between General
and Publisher. Tab content houses both fields with appropriate
Field variants. Book interface in api/client.ts extended.
4 test-fixture files updated for the new required interface
fields (SaveAsTemplateModal, useBookFilters, BookEditor,
GetStarted). 6 new Vitest cases per LL "Radix Tabs
onMouseDown not onClick" using mouseDown activation.

#### C3 — `8148783` test(book-metadata): i18n (8 catalogs) + Playwright smoke for Story tab

5 new ``ui.metadata.*`` keys across all 8 catalogs (DE + EN
native, 6 passthrough-EN). 3-case Playwright spec with
bounding-box-dimension >100px per LL Playwright-visible-!=-
User-visible + full fill+save+reload round-trip with UTF-8
umlaut ("Sköll") + description-NOT-in-Story regression-pin.

**Boy-Scout fix bundled into C3**: restored 6 pre-existing
i18n-parity failures from GETSTARTED-MULTIBOOK-TYPES C4
(`012396a`). That commit added 6 ``ui.get_started.book_type_*``
keys to DE+EN only; C3's 8-catalog touch enabled adding the
same keys as passthrough-EN to the 6 non-DE/EN catalogs.
Pre-Coding-Reality-Check at C1 boundary surfaced this
regression (caught during the post-C1 full-backend sweep).

#### C4 (this commit) — docs + archive + journal + 1 backlog filing

Archive entry at top of `docs/roadmap-archive/2026-05.md`.
New P3 backlog item `COMIC-BOOK-EDITOR-METADATA-BUTTON-01`
(Half-Wired-Lifecycle-Cascade-Followup, separate-session per
Q3 adjudication). Backlog header refreshed (69 → 70 open
tasks; +1 net from new P3 filing — EXPOSE-BUCHIDEE never
entered active backlog).

## Disciplines applied

- **Audit-First Pre-Inspection** (6-track audit + 9-question
  adjudication before any code-write)
- **Pre-Coding-Reality-Check at each commit boundary** —
  caught the GETSTARTED i18n-parity gap at C1 boundary
- **Recurring-Component-Unification** — reused canonical
  multiline + markdown + fullscreen Field (no new component
  extracted; no RCU candidate trigger)
- **Playwright-visible != User-visible** — bounding-box-
  dimension >100px in C3 smoke
- **Plain `git status`** before every commit
- **Explicit-paths discipline** — every `git add` named
  files individually across all 4 commits
- **Boy-Scout rule** — restored 6 pre-existing i18n-parity
  failures while touching all 8 catalogs in C3
- **Atomic-green per-commit-delta** — backend 2126 → 2137
  (+11), Vitest 1826 → 1832 (+6), each commit green
  individually
- **Half-Wired-Prevention** — comic-book metadata-access
  surfaced + filed as separate P3, NOT silently shipped
  half-wired
- **Push autonomously** per 2026-05-21 discipline-change

## Test deltas

- Backend: 2126 → 2137 (+11 — exactly the new EXPOSE/BUCHIDEE
  pytest cases)
- i18n parity: 45/51 → 51/51 (Boy-Scout restoration)
- Frontend Vitest: 1826 → 1832 (+6 new Story-tab cases)
- Playwright smoke: +1 spec file (3 cases)

## Multi-Tool-Coordination state

Pre-Inspection grep returned working-tree carrying parallel
session's archive-rename state (3 modified + 14 deleted + 14
untracked + 1 untracked exploration prompt). By C2 commit
the parallel session had shipped (`13ce1b6`) — working tree
clean for the rest of the work. Explicit-paths discipline
applied regardless throughout per LL canonical pattern.

## Backlog state after

- Active: 70 (was 69) + 0 P1 + 2 BLOCKED. Net +1 from
  COMIC-BOOK-EDITOR-METADATA-BUTTON-01 filing
  (EXPOSE-BUCHIDEE-METADATA-01 never entered active backlog
  — filed-and-closed in same session).
- P1 tier stays at 0.
- P2 tier unchanged (only KDP-PUBLISHING-WIZARD-01 remaining).

## References

- Trigger: user-real-test 2026-05-23 finding ("in den
  metadaten von den Büchern fehlt das exposee und Buchidee")
- Backlog item closed: `EXPOSE-BUCHIDEE-METADATA-01` (P2)
- Commits: `b8b6983..(C4)`
- Archive: `docs/roadmap-archive/2026-05.md` (newest section)
- Follow-up: `COMIC-BOOK-EDITOR-METADATA-BUTTON-01` (P3,
  separate-session)
- Same-day session arc: 3 closes (MULTI-PAGE-NAVIGATION-01 +
  GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 + EXPOSE-BUCHIDEE-
  METADATA-01) across 14 commits

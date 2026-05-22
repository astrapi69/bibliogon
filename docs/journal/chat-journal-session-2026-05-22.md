# Chat journal — 2026-05-22

## Session arc

User opened session with "proceed with the next most important
task from the backlog". Two distinct tracks shipped:

1. **RECURRING-COMPONENT-AUDIT-01 housekeeping close** — the
   umbrella audit's deliverable had shipped 2026-05-21 with
   4 follow-up extractions already done; only the backlog
   entry was open. Single-commit close.

2. **KDP-PUBLISHING-WIZARD-01 Phase 1 (MVP)** — strategic-
   direction gate explicitly opened by user. 7-commit ship
   covering Pre-Inspection + Phase 1 MVP wizard + i18n +
   Playwright smoke. New backend endpoint
   `POST /api/kdp/package/{book_id}` closes the half-wired-
   visible-in-production gap that the Pre-Inspection Track 3
   surfaced.

## Commit sequence

| SHA | Subject |
|---|---|
| `1b84ad0` | `docs(backlog): close RECURRING-COMPONENT-AUDIT-01 housekeeping` |
| `21ccf57` | `docs(audits): KDP-PUBLISHING-WIZARD-01 Pre-Inspection (read-only)` |
| `7b166dd` | `fix(plugin-kdp): changelog filesystem-isolation` (C0) |
| `d14f291` | `feat(plugin-kdp): KDP Publishing Wizard shell + 3-step navigation` (C1) |
| `4bbce1b` | `feat(plugin-kdp): KDP Publishing Wizard Step 1 — MetadataChecklist` (C2) |
| `09cd17c` | `feat(plugin-kdp): KDP Publishing Wizard Step 2 — CoverValidation` (C3) |
| `89a8c40` | `feat(plugin-kdp): KDP Publishing Wizard Step 3 — ExportPackage + endpoint` (C4) |
| `e839ec2` | `test(plugin-kdp): KDP Publishing Wizard i18n (8 catalogs) + Playwright smoke` (C5) |
| (this) | `docs(plugin-kdp): close KDP-PUBLISHING-WIZARD-01 Phase 1` (C6) |

## Phase 1 MVP scope (A1-A5 adjudication record)

- **A1 MVP-first 3-step ship** — no pricing, no ARC, no
  persistence in Phase 1. Schema-additions deferred.
- **A2 calculator-only pricing** — deferred to Phase 2.
- **A3 direct Python import** — `package.py` reaches into
  `bibliogon_export.scaffolder.scaffold_project` +
  `pandoc_runner.run_pandoc` + `picture_book_pdf.
  generate_picture_book_pdf` + lazy
  `bibliogon_comics.comic_book_pdf.generate_comic_book_pdf`.
- **A4 5-file ZIP layout** — metadata.json + cover.{ext} +
  cover-validation-report.json + manuscript-*.{epub,pdf} +
  publishing-state-snapshot.json + README.txt.
- **A5 React-state only** — wizard is session-scoped; closing
  resets step to 0.

## Mid-session architecture-doc finding (γ path)

After C2 shipped, surfaced
`docs/architecture/state-machines.md` during a Pre-Coding-
Reality-Check. The doc's 5 trigger criteria for XState v5
adoption are all satisfied by the KDP wizard:

1. 3+ states with multiple incoming transitions ✓
2. Async side effects gated by state ✓ (3 API calls, one per
   step)
3. Guards or invariants across transitions ✓
4. Reset/retry semantics ✓
5. Future flows likely to branch ✓ (Phase 2)

The Pre-Inspection (Track 2) had recommended
`ConvertToBookWizard`'s hand-rolled `useState` shape based on
the wrong inference that "linear steps = no need for
xstate". User adjudicated path (γ): finish Phase 1 hand-
rolled (already shipped C0-C2 with zero behavioral cost to
rewind), file `KDP-WIZARD-XSTATE-MIGRATION-01` as the
Phase-2-paired migration. New lessons-learned entry
"Architecture-doc consultation is part of Pre-Inspection,
not post-implementation discovery" captures the recipe.

## Half-Wired-Prevention-Check (C4 milestone)

After C4 (the ExportPackage step + new endpoint), verified
the full round-trip:

```
BookMetadataEditor "Publish to KDP" button
  → KdpPublishingWizard opens (Dialog mounts)
    → Step 0 MetadataChecklist calls /api/kdp/check-metadata
    → Step 1 CoverValidation reads /api/books/{id}/assets/file/...
    → Step 2 ExportPackage calls /api/kdp/package/{id}
      → server-side defence-in-depth metadata gate
      → direct Python imports for manuscript generation
      → ZIP bundling + FileResponse
    → blob URL + anchor-click download
```

Every consumer wired. No half-wired surfaces introduced.

## Side-finding: KDP-CHANGELOG-PATH-ISOLATION (C0)

Pre-Inspection Track 1 documented that
`plugins/bibliogon-plugin-kdp/bibliogon_kdp/changelog.py:11`
used CWD-relative `Path("config/changelogs")` — a
Filesystem-isolation rule violation. Fixed as the first
commit (own scope, ahead of the wizard work). Now uses
`app.paths.get_data_dir() / "kdp" / "changelogs"` via a
fresh-resolution helper.

## Test deltas

- Vitest: 1838 → 1871 (+33: 9 wizard nav + 9 MetadataChecklist
  + 9 CoverValidation + 6 ExportPackage)
- Backend pytest: 2137 → 2142 (+5 KDP package endpoint
  integration tests)
- i18n parity: 51/51 throughout
- `npx tsc --noEmit`: clean
- `make test`: exit 0 every commit

## Phase 2 filings

- `KDP-PUBLISHING-WIZARD-01-PHASE-2` (P2 STRATEGIC) — pricing
  + ARC + state persistence. New `BookPublishingState` (1:1
  Book) + `ArcReviewer` (N:1 Book) tables.
- `KDP-WIZARD-XSTATE-MIGRATION-01` (P3 ARCHITECTURE-DEBT) —
  migrate to XState v5 at the Phase 2 seam. Pairs with the
  Phase 2 work.

## Next-substantial-candidates after this session

From the active P2/P3 backlog tail:

- `KDP-PUBLISHING-WIZARD-01-PHASE-2` (newly filed) — natural
  continuation if KDP-pipeline-as-differentiator is still the
  strategic direction.
- `LIST-VIEW-ROW-SHARED-EXTRACTION-01` (P3, trigger-gated) —
  RCU sequence rank #3.
- `BOOK-TYPES-SSOT-YAML-01` (P3) — book-type metadata SSoT.

No P0 or P1 items open.

## Open questions

None at session close. A1-A5 adjudication clean; γ-path
adjudication on the architecture-doc finding was explicit;
all stop-conditions cleared cleanly.

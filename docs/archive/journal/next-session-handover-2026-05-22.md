# Next-session handover — 2026-05-22

Closing summary for the KDP-PUBLISHING-WIZARD-01 Phase 1 (MVP)
session. Includes a paste-ready prompt block at the bottom for
kicking off the next session.

## What shipped today

**KDP-PUBLISHING-WIZARD-01 Phase 1 (MVP) closed** — strategic-
direction gate opened by user, A1-A5 adjudicated per the
Pre-Inspection's stop points, full 3-step wizard wired
end-to-end. New backend endpoint
``POST /api/kdp/package/{book_id}`` closes the
half-wired-visible-in-production gap that the Pre-Inspection
Track 3 documented (0 frontend consumers of any
``/api/kdp/*`` endpoint before this session).

Plus one housekeeping close at session start:

- `RECURRING-COMPONENT-AUDIT-01` — umbrella audit deliverable
  had shipped 2026-05-21; only the backlog entry was open.
  Single-commit close (`1b84ad0`).

## SHA range

`1b84ad0..2a2b875` — 9 commits, all on `main`, all pushed.

| SHA | Subject | Phase |
|---|---|---|
| `1b84ad0` | docs(backlog): close RECURRING-COMPONENT-AUDIT-01 housekeeping | housekeeping |
| `21ccf57` | docs(audits): KDP-PUBLISHING-WIZARD-01 Pre-Inspection (read-only) | Pre-Inspection |
| `7b166dd` | fix(plugin-kdp): changelog filesystem-isolation | C0 |
| `d14f291` | feat(plugin-kdp): wizard shell + 3-step navigation | C1 |
| `4bbce1b` | feat(plugin-kdp): Step 1 — MetadataChecklist | C2 |
| `09cd17c` | feat(plugin-kdp): Step 2 — CoverValidation | C3 |
| `89a8c40` | feat(plugin-kdp): Step 3 — ExportPackage + endpoint | C4 |
| `e839ec2` | test(plugin-kdp): i18n (8 catalogs) + Playwright smoke | C5 |
| `2a2b875` | docs(plugin-kdp): close Phase 1 + filings + LL | C6 |

## A1-A5 adjudication record (Phase 1 scope)

| Q | Adjudication |
|---|---|
| A1 | MVP-first 3-step ship (no pricing, no ARC) |
| A2 | Calculator-only pricing (deferred to Phase 2) |
| A3 | Direct Python import for plugin-export integration |
| A4 | 5-file ZIP layout (metadata + cover + validation report + manuscripts + state snapshot + README) |
| A5 | React-state only (no `BookPublishingState` table in MVP) |

## Test + verification state

Numbers verified at end of session:

- Vitest: **1871 passed** (was 1838; +33 from this session —
  9 wizard nav + 9 MetadataChecklist + 9 CoverValidation + 6
  ExportPackage)
- Backend pytest: **2142 passed** (was 2137; +5 KDP package
  endpoint integration tests)
- i18n parity: **51/51 passed** (held throughout)
- ``make test``: exit 0 at every commit boundary
- ``npx tsc --noEmit``: clean
- Playwright smoke: 1 new spec at
  ``e2e/smoke/kdp-publishing-wizard.spec.ts`` — exercises the
  full wizard flow up to Step 1 no-cover state. NOT run in
  ``make test``; requires the dev server + manual invocation.

## Working tree state

``git status`` clean. ``git log origin/main..HEAD`` is empty
(all commits pushed). HEAD = ``2a2b875``.

## What was filed (open for follow-up)

### `KDP-PUBLISHING-WIZARD-01-PHASE-2` (P2 STRATEGIC)

Pricing + ARC + state persistence — the half of the original
KDP-PUBLISHING-WIZARD-01 scope that Phase 1 deferred per A1.

**Schema additions** (Pre-Inspection Track 5):
- ``BookPublishingState`` table (1:1 with Book):
  ``royalty_plan``, ``kdp_select_enrolled``,
  ``kdp_select_enrollment_date``, ``expanded_distribution``,
  ``prices`` (JSON dict[region_code, dict{currency,
  list_price, royalty_rate}]), ``launch_checklist_state``
  (JSON dict[checklist_item_id, ISO timestamp]),
  ``publication_target_date``, ``last_kdp_upload_at``.
- ``ArcReviewer`` table (N:1 to Book): ``reviewer_name``,
  ``reviewer_email``, ``review_status``, ``copy_version``,
  ``review_permalink``, ``review_text_excerpt``,
  ``invited_at``, ``reviewed_at``.

**Effort estimate**: M (8-12 commits, 1-2 sessions). **Pairs
with `KDP-WIZARD-XSTATE-MIGRATION-01`** — same surface, same
session.

### `KDP-WIZARD-XSTATE-MIGRATION-01` (P3 ARCHITECTURE-DEBT)

Migrate ``KdpPublishingWizard`` from hand-rolled ``useState``
step-index to the XState v5 pattern documented in
``docs/architecture/state-machines.md``. The doc's 5/5
trigger criteria are all satisfied by the KDP wizard
(verified during this session's mid-session architecture-doc
finding):

1. 3+ states with multiple incoming transitions ✓
2. Async side effects gated by state ✓ (3 API calls)
3. Guards or invariants across transitions ✓
4. Reset/retry semantics ✓
5. Future flows likely to branch ✓ (Phase 2)

**Trigger**: at the start of Phase 2 implementation. The added
branching pressure of pricing + ARC + persistence is what
finally makes the hand-rolled approach genuinely break down;
migrating before is speculative, migrating at the seam ships
a machine that matches actually-shipped behavior.

**Effort estimate**: M (4-6 commits, 1 session).

## Architecture-doc finding (from this session)

After C2 shipped, surfaced
``docs/architecture/state-machines.md`` during a Pre-Coding-
Reality-Check. The Pre-Inspection (Track 2) had NOT consulted
that doc; the audit recommended ``ConvertToBookWizard``'s
hand-rolled shape based on the wrong inference that "linear
steps = no need for xstate". User adjudicated path (γ):
finish Phase 1 hand-rolled (already shipped C0-C2 with zero
behavioral cost to rewind), file the XState migration as
Phase-2-paired follow-up.

Lessons-learned entry filed:
``.claude/rules/lessons-learned.md`` "Architecture-doc
consultation is part of Pre-Inspection, not post-
implementation discovery". Single-instance observation per
the "single instance is incident, not pattern" discipline;
promote to pattern if a second instance surfaces.

## Recommended next-session priority

Three candidates, ranked:

### 1. KDP-PUBLISHING-WIZARD-01-PHASE-2 + KDP-WIZARD-XSTATE-MIGRATION-01 (paired)

**Natural continuation**. The Phase 1 MVP is shipped + working;
Phase 2 closes the commercial-half of the original scope
(pricing calculator + ARC tracking + persistence). The XState
migration pairs naturally — the added branching is what makes
the hand-rolled approach break down, and both items share the
wizard surface.

Effort: 12-16 commits across 1-2 sessions. Phase 2 is XL by
backlog standards but the natural seam pairing keeps the
sessions coherent.

**Gating**: requires the user's explicit go-signal because
it's the larger of the two halves. The strategic-direction
gate that opened Phase 1 is still open for this; user just
needs to confirm.

### 2. LIST-VIEW-ROW-SHARED-EXTRACTION-01 (P3, trigger-gated)

RCU sequence rank #3 — ListRow shared component. Score 13
from the 2026-05-21 audit. ArticleRow + BookListRow
duplication. Trigger: "third instance of duplicate
list-view-row code OR styling drift between Articles and
Books list views". **Trigger HAS NOT fired** as of session
close; this is wait-on-trigger work.

Effort: 5-8 commits (extraction-plus-migration session
shape).

### 3. BOOK-TYPES-SSOT-YAML-01 (P3)

Book-type metadata SSoT — currently scattered across 5+
surfaces (backend enum + Pydantic + frontend literal +
i18n + GetStarted card metadata + getstarted YAML). Trigger
condition: "third surface needs book-type metadata". As of
session close, exactly 5 surfaces exist; one more would fire
the trigger.

Effort: 6-10 commits.

### Picking from the three

- **If user is ready for Phase 2**: (1) is the natural call.
  Largest scope, biggest user-visible value.
- **If user wants something smaller**: (3) is read-only audit
  + targeted refactor. Smaller scope; no UI work.
- **If neither feels right**: wait-on-trigger is defensible.
  Three of today's closures were trigger-driven.

Don't overscope. Prefer one clean close over two half-done.

## Active disciplines that carry forward

The session ran under the following disciplines from the
session instruction; these stay load-bearing for the next
session:

- **Plain `git status` before every commit** (no path filter)
- **Explicit-paths-only `git add`** (no `-A`, no `.`)
- **Atomic-green-per-commit-delta** (test baselines must hold
  or grow at every commit)
- **Pre-Coding-Reality-Check at boundaries** (re-grep
  immediate touch-surface before keystroke)
- **Push autonomously after atomic-green commits**
- **Half-Wired-Prevention-Check at integration milestones**
  (full round-trip wired before commit)

Plus the cross-cutting lessons-learned discipline added this
session: **`ls docs/architecture/` + grep for component-class
keyword during the Pre-Inspection's component-audit track**
(per the new LL entry).

## Paste-ready prompt for new session

The block below is paste-ready into the new session. It pulls
forward the SHA range, the open filings, the active
disciplines, and points at the three candidate paths.

```text
Continuing from the KDP-PUBLISHING-WIZARD-01 Phase 1 session
(closed 2026-05-22).

State of play:
- HEAD = 2a2b875, all 9 commits pushed to origin/main.
- Vitest 1871 passed, Backend pytest 2142 passed, i18n parity
  51/51, tsc clean, make test exit 0.
- Two paired follow-ups filed in the backlog:
  * KDP-PUBLISHING-WIZARD-01-PHASE-2 (P2 STRATEGIC)
  * KDP-WIZARD-XSTATE-MIGRATION-01 (P3, pair with Phase 2)
- One new lessons-learned entry: "Architecture-doc
  consultation is part of Pre-Inspection".

The full handover is at
docs/journal/next-session-handover-2026-05-22.md — read that
first.

Quick start:
1. git log --oneline -10  (verify clean main at 2a2b875)
2. make test  (expect 2142 pytest + 1871 Vitest, both green)
3. Read the "Recommended next-session priority" section of
   the handover doc and tell me which path you'd take.

Top three candidates:

- KDP-PUBLISHING-WIZARD-01-PHASE-2 + KDP-WIZARD-XSTATE-
  MIGRATION-01 (paired): pricing + ARC + state persistence
  + XState migration at the natural seam. XL scope (12-16
  commits across 1-2 sessions). The strategic-direction
  gate from Phase 1 is still open; user confirms to start.

- LIST-VIEW-ROW-SHARED-EXTRACTION-01 (P3, trigger-gated):
  ArticleRow + BookListRow shared base. RCU sequence rank
  #3, score 13. Trigger HAS NOT fired (no third instance,
  no styling drift report); this is wait-on-trigger work.

- BOOK-TYPES-SSOT-YAML-01 (P3): book-type metadata SSoT
  across 5+ scattered surfaces. Trigger condition: third
  surface needs book-type metadata. Smaller scope (6-10
  commits), no UI work.

Active disciplines (carry forward from prior session):
- Plain `git status` before every commit (no path filter)
- Explicit-paths-only `git add` (no `-A`, no `.`)
- Atomic-green-per-commit-delta (baselines hold or grow)
- Pre-Coding-Reality-Check at boundaries
- Push autonomously after atomic-green commits
- Half-Wired-Prevention-Check at integration milestones
- ls docs/architecture/ + grep component-class keyword
  during Pre-Inspection (per the new LL entry from this
  session)

Don't overscope. Prefer one clean close over two half-done.
If you pick Phase 2, lead with the Pre-Inspection (read-only)
+ A-N adjudication BEFORE any code, same shape as the Phase
1 session.
```

End of handover.

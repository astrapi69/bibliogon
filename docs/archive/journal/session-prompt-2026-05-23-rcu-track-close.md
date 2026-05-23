# Resume Prompt — RCU candidate #3 ListRow (last remaining audit candidate)

Paste-ready prompt for a fresh CC session. Builds on the
2026-05-22 + 2026-05-23 RCU-Track close (4 of 5 audit
candidates shipped; #3 ListRow is the last remaining
non-deferred candidate).

Full context: [session-handoff-2026-05-23-rcu-track-close.md](session-handoff-2026-05-23-rcu-track-close.md).

---

## Prompt (copy-paste from below)

You are starting a fresh CC session to ship RCU audit
candidate #3 `ListRow` (score 13, score-tied with Pattern B
audit-followup which already shipped). Last remaining non-
deferred candidate from
`docs/audits/recurring-component-audit-2026-05-21.md`. Backlog
ID: `LIST-VIEW-ROW-SHARED-EXTRACTION-01` (P3).

Read
`docs/journal/session-handoff-2026-05-23-rcu-track-close.md`
for full context.

## State verification

```
git status
git log origin/main --oneline -5
```

Expected: clean working tree, local `main == origin/main ==
`727e3e3` `docs(backlog): file USESELECTION-RESPLIT-IF-
DIVERGENCE-MATERIALIZES-01 (P5)`.

## Pre-Coding-Reality-Check (mandatory before any code)

Per the just-formalized "Audit-Methodology: design-intent-axis
as 5th-Axis or Override-Filter" Lessons-Learned (filed
2026-05-23, commit `563f298`):

1. **Grep for anti-extraction-rationale at both touched files:**

   ```bash
   grep -n "Kept as separate\|deliberate.*separate\|not extract\|intentional" \
     frontend/src/pages/ArticleList.tsx \
     frontend/src/components/BookListView.tsx
   ```

   Surface as STOP-CONDITION if any match. The audit was clean
   at scan time; verify still true.

2. **Confirm caller surfaces:**

   ```bash
   grep -rln "article-list-row-\|book-list-row-" frontend/src e2e --include="*.tsx" --include="*.ts" --include="*.spec.ts"
   ```

   Audit found 0 test consumers of `article-list-row-` testid
   prefix; 4+ for `book-list-row-`. Confirm before assuming
   migration risk is asymmetric.

3. **Verify recent commits on touched files:**

   ```bash
   git log --oneline -10 -- frontend/src/pages/ArticleList.tsx frontend/src/components/BookListView.tsx
   ```

   Surface as STOP-CONDITION if any commit in the last 48h
   touches these files from a parallel session (Multi-Tool-
   Coordination conflict).

4. **Confirm signatures still match.** Read both inline rows
   and verify the signature parity claim from the audit
   (`{item, onClick/onOpen, onDelete, onDeletePermanent,
   isSelected, onToggleSelect}`).

Report findings before code-write. Surface only on:

- Anti-extraction-rationale found (apply useSelection-Lesson;
  defer-pending-adjudication-default)
- Caller surfaces differ from audit estimate (additional
  inline-rows found per the methodology-gap pattern)
- Active-refactor on either file (Multi-Tool-Coordination
  conflict)
- Signature divergence beyond audit's documented variations
  (would expand prop-contract scope)

## Commit plan (target 4-6 commits)

### C1 — Extract `ArticleRow` from `ArticleList.tsx` monolith

**Single commit; behavior-preserving.** Move the inline
`function ArticleRow` at `ArticleList.tsx:1223-1412` (190 LOC)
to a new file `frontend/src/components/articles/ArticleRow.tsx`.
Update import at ArticleList. No behavior change. ArticleList
shrinks from 1434 LOC to ~1244 LOC.

**No test changes expected** — the inline function had 0
test consumers per audit grep. If C1 surfaces consumers,
preserve them via the move.

Commit message: `refactor(article-list): extract inline ArticleRow to its own file (ListRow prep)`

This sub-step has **independent value** per the
"Inline-component duplication is the upstream cause of
parallel-surface asymmetry" LL. If C2-C4 don't ship in this
session, C1 still leaves the codebase in a better state.

### C2 — Extract shared `ListRow` shell + adapter-pattern migration

Mirror the `AuthorProfileSelect` adapter-pattern from
2026-05-23 (commit `11198a4`):

- New canonical:
  `frontend/src/components/ListRow.tsx` — shell with shared
  shape (row container, selection-checkbox, click handler,
  menu-button trigger). Per-site renderers exposed as prop
  slots:
  - `renderThumbnail?: (item) => ReactNode` — Book passes
    cover-image renderer; Article passes null/none
  - `renderDate: (item) => ReactNode` — Book uses plain
    updated_at; Article uses Medium-published-date fallback
  - `getTestId: (item) => string` — per-site testid namespace
    (`book-list-row-${id}` vs `article-list-row-${id}`)
  - Plus `testidPrefix` for chrome elements + i18n key prefix

- `ArticleRow` adapter (in
  `frontend/src/components/articles/ArticleRow.tsx`, from C1)
  becomes a thin wrapper calling
  `<ListRow renderDate={mediumDateFallback}
  testidPrefix="article-list-row" ...>`.

- `BookListRow` adapter (already extracted at
  `BookListView.tsx:100-228`) similarly migrated to call
  `<ListRow renderThumbnail={coverThumb}
  renderDate={plainDate} testidPrefix="book-list-row" ...>`.

- New `ListRow.test.tsx` with ~8-10 Vitest cases pinning the
  shared contract (mount, selection-checkbox toggle, click
  handler, menu open, renderThumbnail slot, renderDate slot,
  testidPrefix namespacing).

- Existing `ArticleList.test.tsx` + `BookListView.test.tsx`
  preserved without rewrites — testids pass through via
  `testidPrefix` props.

Commit message: `feat(list-row): extract ListRow shell + RCU 2-site migration (Article + Book)`

### C3 — i18n keys (if needed)

The shared `ListRow` shell may not introduce new i18n
strings (existing per-site keys reused via prefix). If it
does, add to all 8 catalogs (DE proper umlauts + EN + 6
passthrough-EN per established new-namespace convention).

**Likely NOT needed** — the shared shape is structural, not
text-bearing.

Commit message (if shipped): `i18n(list-row): keys for ListRow chrome`

### C4 — Playwright smoke (if user-visible UX shift)

Mirror the AuthorProfileSelect precedent — adapter-pattern
migration should preserve user-visible behavior, so a new
Playwright smoke may not be strictly needed. **Verify via
existing smoke specs first** before adding new ones:

```bash
ls e2e/smoke/*.spec.ts | xargs grep -l "ArticleList\|BookListView\|article-list-row\|book-list-row"
```

If no regression risk, skip C4. If row interaction is
exercised in existing specs and passes, document the
coverage in C5's archive entry.

### C5 — docs + audit-footnote close + archive + backlog close

- Update audit footnote at
  `docs/audits/recurring-component-audit-2026-05-21.md` to
  mark candidate #3 ListRow as SHIPPED with the commit SHA.
- Add "Archived 2026-05-24 (RECURRING-COMPONENT-AUDIT-01
  candidate #3 — `ListRow` 2-site extraction)" entry to
  `docs/roadmap-archive/2026-05.md`.
- Remove `LIST-VIEW-ROW-SHARED-EXTRACTION-01` from
  `docs/backlog.md` P3 section.
- Update backlog Last-updated prose + NCV counter
  (P3: 31 → 30; total active 67 → 66; back to the v0.31.0-era
  baseline).
- Update audit's Cumulative RCU progress table — final
  tally becomes 4 shipped + 1 permanent-defer = 5 of 5
  resolved. **RECURRING-COMPONENT-AUDIT-01 fully closed.**

Commit message: `docs(extraction): close RECURRING-COMPONENT-AUDIT-01 candidate #3 ListRow + audit fully closed`

## Stop conditions

Surface before continuing if:

- PCRC finds anti-extraction-rationale at either inline-row
  site (apply useSelection-Lesson; defer-pending-adjudication)
- Caller surfaces differ from audit's claim of asymmetric
  test-consumer count (article-list-row=0 vs book-list-row=4+)
- Signature divergence beyond audit's documented variations
  (Book cover + Article date-fallback)
- Multi-Tool-Coordination conflict on ArticleList.tsx or
  BookListView.tsx (parallel session active)
- C2 reveals that the audit's "adapter-pattern matches
  AuthorProfileSelect precedent" assumption is wrong (e.g.
  the row interaction surface is more divergent than the
  audit captured)
- Commit count exceeds 6 (signal scope-creep)
- Backend baseline drops below 2126 (only cascade-tipping
  acceptable; ListRow is frontend-only so this shouldn't
  happen)

## Disciplines active (do not relax)

- **Pre-Coding-Reality-Check at the keystroke** — grep for
  anti-extraction-rationale + design-intent markers before
  any code-write (per 2026-05-23 LL "Audit-Methodology:
  design-intent-axis as 5th-Axis or Override-Filter")
- **Plain `git status` before every commit** (LL 2026-05-21,
  commit `37e36dd`)
- **RCU canonical** — extract + migrate in SAME commit; no
  half-migration
- **Adapter-pattern over direct-to-callers** (per
  BulkActionBar `c2305e7` + AuthorProfileSelect `11198a4`
  precedents) — per-site adapters carry entity-specific
  wrapping; canonical handles shared shape
- **Atomic-green-per-commit-delta** — frontend Vitest 1815
  + backend 2126 must hold
- **Numeric-Claims-Verification** — every count via real
  command
- **Continuous-archival** — close item in same commit as
  ship; archive entry inline
- **Push autonomously** per 2026-05-21 discipline-change

## Push convention

After each commit: report SHA + atomic-green status (Vitest
+ tsc + targeted pytest if applicable). Push after each
atomic-green commit per discipline-change; surface only on
Stop-Conditions or completion.

## Phase status after C5 ship

| Item | Status |
|---|---|
| RCU candidate #3 ListRow | shipped |
| ArticleRow inline-monolith reduction | independent value via C1 |
| `RECURRING-COMPONENT-AUDIT-01` | **fully closed** (4 shipped + 1 permanent-defer = 5 of 5) |
| `LIST-VIEW-ROW-SHARED-EXTRACTION-01` | removed from P3 backlog + archived |
| Backlog P3 count | 31 → 30 |
| Backlog total active | 67 → 66 |
| Next-substantial-session candidate | Phase 3 EXTENDED-FEATURES (P3, multi-session) OR KDP-PUBLISHING-WIZARD-01 (P2, strategic) OR AUTHOR-DATALIST-EXTEND UX-adjudication |

## References

- [docs/journal/session-handoff-2026-05-23-rcu-track-close.md](session-handoff-2026-05-23-rcu-track-close.md) — companion handover
- [docs/audits/recurring-component-audit-2026-05-21.md](../audits/recurring-component-audit-2026-05-21.md) §"Recommended extraction sequence" §"1. `useSelection<T>()` generic hook" footnote 6 (Pattern B) — full candidate #3 context
- [docs/journal/task-overview-2026-05-23.md](task-overview-2026-05-23.md) — 111-item single-source-of-truth
- [docs/roadmap-archive/2026-05.md](../roadmap-archive/2026-05.md) §"Archived 2026-05-23 (RECURRING-COMPONENT-AUDIT-01 audit-followup — Pattern B...)" — latest RCU extraction precedent + adapter-pattern reference
- [.claude/rules/lessons-learned.md](../../.claude/rules/lessons-learned.md) §"Audit-Methodology: design-intent-axis as 5th-Axis or Override-Filter" (2026-05-23) — design-intent override-filter discipline
- [.claude/rules/coding-standards.md](../../.claude/rules/coding-standards.md) §"Recurring-Component Unification Rule" — RCU canonical
- `frontend/src/pages/ArticleList.tsx:1223-1412` — inline `ArticleRow` to extract
- `frontend/src/components/BookListView.tsx:100-228` — existing `BookListRow` extraction precedent

Start with state verification + Pre-Coding-Reality-Check.
Surface findings before any code-write.

End of prompt.

# Recurring-Component Audit — 2026-05-21

**Methodology:** 4-Axes scoring (Site-count, Drift-Risk, Extraction-Ease, Downstream-Value) per `RECURRING-COMPONENT-AUDIT-01` (P2, promoted 2026-05-20).
**Source:** `frontend/src/components/` tree at commit `64a067e` (local; `37e36dd` on `origin/main`).
**Scope:** read-only inventory. Extraction implementation is follow-up work.
**Total clusters evaluated:** 7 + 2 anti-pattern candidates.

> **Update 2026-05-22 — Implementation-session findings:**
>
> 1. **Candidate #1 `useSelection<T>()` (score 16) — DEFERRED-PENDING-DESIGN-INTENT-ADJUDICATION.** Pre-Coding-Reality-Check surfaced an explicit anti-extraction rationale at [useBookSelection.ts:7-10](../../frontend/src/components/useBookSelection.ts#L7-L10): *"Kept as a separate hook (rather than a generic `useSelection`) so that future per-entity divergence (e.g. books-only constraints around audiobook job state) lands in one place without a cross-entity refactor."* The audit's `diff` confirmed implementation-identity but missed the documented design-intent in the doc-comment itself. Honoring the rationale + deferring this candidate pending explicit user adjudication on whether the speculative-divergence-defense should be overridden. Methodology gap: future audits should grep doc-comments for anti-extraction-rationale markers as a soft anti-signal.
> 2. **Candidate #2 `BulkActionBar` (score 15) — SHIPPED via path γ pivot** (commit `c2305e7` on 2026-05-22). 3-site adapter-pattern extraction: new `BulkActionBar` shell wrapper + `BulkActionBar.module.css` (.bar + .count rules) + 5 Vitest cases; 3 adapter files now render `<BulkActionBar>{site-specific actions}</BulkActionBar>` keeping their entity-specific action clusters. No anti-extraction-rationale documented in any of the 3 source files; pivot was clean. Full Vitest 1783 → 1792.
> 3. **Candidates #3 `ListRow` (score 13) + #4 `AuthorSelectInput` (score 12) — REMAIN AVAILABLE** for future sessions per the recommended sequence.

---

## Summary statistics

- **High-priority extractions (16–20):** 1 (`useSelection<T>()`)
- **Medium-priority extractions (12–15):** 3 (BulkActionBar, ListRow, AuthorSelectInput)
- **Low-priority extractions (8–11):** 3 (Card, FilterBar-generic, PdfExportControls-pair)
- **Anti-pattern (NOT extract):** 2 (REMINDER-PANEL single-site, Comments-table-row distinct-shape)

The 4-Axes scoring puts the canonical generic-hook extraction
(`useSelection<T>()`) clearly at the top. The next three are
within 2 points of each other and form a coherent sequence
that compounds: AuthorSelectInput unblocks an already-filed
follow-up, BulkActionBar would benefit from `useSelection<T>()`
foundation, ListRow closes the `ArticleList.tsx` monolith.

---

## Top-N extraction candidates

| Rank | Name | A1 Site | A2 Drift | A3 Ease | A4 Value | Total | Tier |
|---|---|---|---|---|---|---|---|
| 1 | `useSelection<T>()` generic hook | 4 | 3 | 5 | 4 | **16** | HIGH |
| 2 | `BulkActionBar` shared component | 4 | 4 | 3 | 4 | **15** | MEDIUM-HIGH |
| 3 | `ListRow` shared component | 2 | 4 | 3 | 4 | **13** | MEDIUM |
| 4 | `AuthorSelectInput` shared component | 2 | 3 | 4 | 3 | **12** | MEDIUM |
| 5 | PdfExportControls audit (consolidation?) | 2 | 2 | 3 | 2 | **9** | LOW |
| 6 | `Card` shared grid component | 2 | 2 | 2 | 2 | **8** | LOW |
| 7 | `FilterBar<TFilters>` further generic | 2 | 2 | 2 | 2 | **8** | LOW |

Total candidates evaluated: 7. The top-4 (score ≥ 12) form
the recommended near-term extraction sequence; ranks 5–7 are
documented for completeness but do NOT meet the 12-point
threshold this audit treats as the practical action floor.

---

## Detailed candidate analysis

### 1. `useSelection<T>()` generic hook — score 16 (HIGH)

**Cluster description:** three selection hooks with byte-identical
implementation modulo the type-parameter name.

**Instances:**
- [frontend/src/components/articles/useArticleSelection.ts](../../frontend/src/components/articles/useArticleSelection.ts) — 70 LOC
- [frontend/src/components/useBookSelection.ts](../../frontend/src/components/useBookSelection.ts) — ~70 LOC
- [frontend/src/components/comments/useCommentSelection.ts](../../frontend/src/components/comments/useCommentSelection.ts) — ~70 LOC

**Contract:**

```ts
interface XSelection {
    selectedIds: Set<string>
    count: number
    isSelected: (id: string) => boolean
    toggle: (id: string) => void
    selectAll: (ids: string[]) => void
    clear: () => void
    remove: (id: string) => void
}
```

`diff` between `useArticleSelection.ts` and `useBookSelection.ts`
returns ONLY doc-comment differences — implementation is identical.

**Variations between sites:** none functional. Type names only.

**Extraction strategy:** trivial. Rename `useArticleSelection`,
`useBookSelection`, `useCommentSelection` to call a single
`useSelection()` (the hook is already type-erased via
`Set<string>` — no generic parameter needed). Existing
type-alias exports preserved for backward compat (`type
ArticleSelection = Selection`).

**Estimated effort:** 1-2 commits (~3 hours). Site-by-site
migration; ~200 LOC removed net.

**Why A2 Drift-Risk = 3 (not 5):** instances currently in-sync
(verified via diff). Score reflects future-risk: a feature
that lands on one selection-surface without paired updates on
the other two (e.g. a `selectVisible(ids)` variant on Article
selection only) would create silent drift. The existing
in-sync state is fragile, not stable.

---

### 2. `BulkActionBar` shared component — score 15 (MEDIUM-HIGH)

**Cluster description:** three bulk-action bars with shared
"count + actions + dismiss" shape but distinct action sets per
surface.

**Instances:**
- [frontend/src/components/articles/ArticleBulkActionBar.tsx](../../frontend/src/components/articles/ArticleBulkActionBar.tsx) — 316 LOC
- [frontend/src/components/BookBulkActionBar.tsx](../../frontend/src/components/BookBulkActionBar.tsx) — 253 LOC
- [frontend/src/components/comments/CommentBulkActionBar.tsx](../../frontend/src/components/comments/CommentBulkActionBar.tsx) — 132 LOC

Combined: 701 LOC across 3 sibling files. Each carries its own
`.module.css` + Vitest.

**Shared shape:**
- `count` + dismiss button + action button-cluster
- Conditional rendering by `count > 0`
- Action callbacks as optional props (per the established
  "Bulk-action UX: action-bar + selection-hook decoupling
  stays useful" lessons-learned)

**Variations between sites:**
- Article: bulk-export (200-row cap), bulk-soft-delete,
  bulk-permanent-delete (in trash view)
- Book: bulk-soft-delete, bulk-permanent-delete (trash)
- Comment: bulk-restore, bulk-permanent-delete, empty-trash

**Extraction strategy:** generic `BulkActionBar` taking
`count` + `<Slot>actions</Slot>` (children-as-action-cluster)
+ `onClear`. Each site's specific actions render via the
slot. Some site-specific styling concerns (e.g. trash-view
banner color) absorbable as variant prop.

**Difficulty (A3 = 3):** medium. Action sets diverge enough
that a render-prop or children-slot pattern is needed.
Per-site action wiring stays site-local; shared layout
+ count display + dismiss extract cleanly.

**Estimated effort:** 3-5 commits over 1 session. Sequence:
extract + Vitest, migrate Article, migrate Book, migrate
Comment, regression-pin E2E.

**Downstream-Value (A4 = 4):** any future bulk-supporting
page (Settings > Plugins bulk-disable? Authors-DB bulk-
delete?) reuses the bar. Plus aligns with the
"Bulk-action UX: action-bar + selection-hook decoupling
stays useful" LL.

---

### 3. `ListRow` shared component — score 13 (MEDIUM)

**Cluster description:** list-view row rendering, with one
site extracted as a separate file and the other inline inside
a monolith.

**Instances:**
- [frontend/src/components/BookListView.tsx:100-228](../../frontend/src/components/BookListView.tsx#L100-L228) — `BookListRow` function, 128 LOC inside a 229-LOC file. EXTRACTED.
- [frontend/src/pages/ArticleList.tsx:1223-1412](../../frontend/src/pages/ArticleList.tsx#L1223-L1412) — `ArticleRow` function, 190 LOC INLINE inside the 1434-LOC `ArticleList.tsx` monolith.

**Shared signature:**

```ts
function XRow({
    item,                  // book OR article
    onClick / onOpen,
    onDelete,
    onDeletePermanent,
    isSelected,
    onToggleSelect,
}: RowProps) { ... }
```

**Variations between sites:**
- Book: renders cover thumbnail (`/api/books/{id}/assets/file/`)
- Article: renders Medium-published-date fallback
  (`original_published_at ?? updated_at`) — no cover
- Different testid namespaces: `book-list-row-${id}` vs
  `article-list-row-${id}`
- Different className modules (BookListView's
  `styles.row` vs Article's CSS-in-JS)

**Extraction strategy:** generic `ListRow<T>` with
`renderThumbnail` + `renderDate` + `getTestId` props; OR a
narrower split where the row-CHROME (selection checkbox +
menu + click-handler) extracts but the cell-CONTENTS stay
per-site. The chrome-only approach is lower-risk and absorbs
the 60-70% shared LOC.

**Difficulty (A3 = 3):** medium. The biggest cost is
extracting `ArticleRow` from the 1434-LOC `ArticleList.tsx`
monolith FIRST (separate cleanup) before the cross-surface
extraction. Per the "Inline-component duplication is the
upstream cause of parallel-surface asymmetry" LL, the
extraction has compounding value beyond DRY.

**Drift-Risk (A2 = 4):** real. Book-side recently shipped
`book-list-row-menu-${id}` and `book-bulk-check-${id}`
testids (per `VIEW-MODE-TESTID-PARITY-01`); Article-side is
mid-evolution. A feature ship on Books that doesn't get
mirrored on Articles is the exact "Articles-vs-Books
parallel-surface asymmetry" failure mode this audit guards
against.

**Estimated effort:** 4-6 commits. First commit:
extract `ArticleRow` to its own file under
`frontend/src/components/articles/ArticleRow.tsx` (no
behavior change). Second commit: shared `ListRow` extract.
Third+: migrate both sites + Vitest + Playwright pins.

**Note: Comments NOT in this cluster.** `CommentsAdminSection`
renders a `<table>` with `<tr>` rows (verified at
`CommentsAdminSection.tsx:937`). Table-shaped rows have
fundamentally different layout requirements than card/list
rows; merging them into `ListRow` would be the "Specs that
LOOK recurring but should NOT be extracted" anti-pattern.

---

### 4. `AuthorSelectInput` shared component — score 12 (MEDIUM)

**Cluster description:** input + datalist + author-suggestions
union + optional "add to authors-db" checkbox. Already filed
as `AUTHOR-SELECT-INPUT-EXTRACT-01` (P3).

**Instances:**
- [frontend/src/components/CreateBookModal.tsx:125-150 + :513-518](../../frontend/src/components/CreateBookModal.tsx#L125-L150) — initial author input with datalist
- [frontend/src/components/articles/ConvertToBookWizard.tsx:333-340 + :858-865](../../frontend/src/components/articles/ConvertToBookWizard.tsx#L333-L340) — wizard step-2 author input mirror

**Shared shape:**
- `useEffect` fetching `api.authors.list({})` into local
  `globalAuthors` state
- `useMemo` computing union of `authorChoices` (local from
  articles/book context) + `globalAuthors.map(a => a.name)`,
  deduped + ordered
- `<input>` with `list="..."` attribute + `<datalist>` rendering
  the union
- Optional `<input type="checkbox">` for "add to authors DB"
  with i18n string `add_to_authors_db`

**Variations between sites:**
- CreateBookModal: `authorChoices` comes from a single book's
  prior-typed authors
- ConvertToBookWizard: `authorChoices` from
  `computeAuthorSuggestions(selectedArticles, globalAuthors)`
  helper (multi-article context)
- Different i18n key prefixes (`ui.create_book.*` vs
  `ui.convert_to_book.metadata_*`)

**Extraction strategy:** `<AuthorSelectInput value onChange
suggestions onAddToAuthorsDb testidPrefix i18nKeyPrefix />`.
The `suggestions` prop is what's computed per-site (single-
book vs multi-article); the component owns the union with
`globalAuthors`. Mirrors `Tier1Section`'s
`testidPrefix + i18nKeyPrefix` pattern.

**Difficulty (A3 = 4):** clean. The 4-prop signature is well-
defined; the per-site difference (where `suggestions` come
from) stays at the callsite, where it belongs.

**Downstream-Value (A4 = 3):** filed `AUTHOR-DATALIST-EXTEND-
EDITORS-01` plans to apply the same component to ArticleEditor
+ BookEditor single-record editors. Shipping extraction NOW
means those follow-up sites benefit immediately without a
re-extraction step.

**Pre-existing filing:** `AUTHOR-SELECT-INPUT-EXTRACT-01` +
`AUTHOR-DATALIST-EXTEND-EDITORS-01` pair, both P3. Per the
"Recurring-Component Unification Rule" in
`coding-standards.md`, the 2-surface threshold is already
met — recommendation is to promote to P2 in the next
backlog re-prioritization cycle.

---

### 5. PdfExportControls audit — score 9 (LOW)

**Cluster description:** two pdf-export controls components
exist; need clarification on whether they're independent
concerns or RCU candidates.

**Instances:**
- [frontend/src/components/PdfExportControls.tsx](../../frontend/src/components/PdfExportControls.tsx)
- [frontend/src/components/PictureBookPdfExportControls.tsx](../../frontend/src/components/PictureBookPdfExportControls.tsx)

The latter was extracted in 2026-05-19 (Comics-Session-2 C2,
commit `28a2f3e`) as a Picture-Book-specific consolidation
covering PageEditor + BookMetadataEditor + ComicBookEditor —
3 surfaces. The former predates that work.

**Open question:** are these two semantically distinct
(different export-pipeline surfaces) or are they a 2-site
cluster that could consolidate? This audit did NOT
investigate the precise surfaces of `PdfExportControls.tsx`;
it requires a separate read of both components' usage sites
to score correctly.

**Score 9 reflects the uncertainty.** If consolidation IS
viable, score could climb to 12+. If they're semantically
distinct, score stays low and they're documented as a
"looks like but isn't" pair.

**Recommendation:** defer to follow-up audit. Cheap to
investigate (15 min); not worth blocking the current audit's
top-4 sequence.

---

### 6. Card shared grid component — score 8 (LOW)

**Cluster description:** two grid-card components rendering
similar visual shape (cover/thumbnail + title + metadata +
actions-menu) for different content types.

**Instances:**
- [frontend/src/components/articles/ArticleCard.tsx](../../frontend/src/components/articles/ArticleCard.tsx) — 170 LOC
- [frontend/src/components/BookCard.tsx](../../frontend/src/components/BookCard.tsx) — 122 LOC

**Variations:**
- ArticleCard: topic + tags + original_published_at
- BookCard: cover_image + author + language

**Why low score:** the visual shape similarity is real (rank
~A1 = 2) but the cell-content fields are domain-specific to
the point that any extracted component would be mostly
`children`-slots. The abstraction adds complexity without
the LOC-reduction or test-consolidation payoff. Cards work
fine as-is; recommend NO extraction unless a 3rd card site
lands (e.g. ProjectCard, ChapterCard).

---

### 7. FilterBar further generic — score 8 (LOW)

**Cluster description:** two filter-bar components, both
already extracted as separate files.

**Instances:**
- [frontend/src/components/DashboardFilterBar.tsx](../../frontend/src/components/DashboardFilterBar.tsx) — 167 LOC (Book filters)
- [frontend/src/components/articles/ArticleFilterBar.tsx](../../frontend/src/components/articles/ArticleFilterBar.tsx) — 175 LOC (Article filters)

`ARTICLEFILTERBAR-EXTRACT-01` already shipped 2026-05-15
(archived). The two filter-bar components have similar
structure (search-input + filter-pills + sort) but
domain-specific filter shapes (BookFilters vs ArticleFilters
type contracts).

**Why low score:** further generic-extraction into
`FilterBar<TFilters>` would be a TypeScript-generics gymnastics
exercise. The two filter-shape contracts diverge enough
(Book filters: language, genre, series; Article filters:
topic, status, source, publication-state) that the abstraction
adds more type-machinery than it saves.

**Recommendation:** no further extraction. Documented for
completeness; the existing two-file split is the right shape.

---

## Existing RCU-success reference

Documented successes informed the audit's methodology:

| Component | Sites | Extracted | Status |
|---|---|---|---|
| `Tier1Section` | 3 (LayoutConfigSpeechBubble + LayoutConfigComicBubble + LayoutConfigComicPanel) | 2026-05-19 (Comics-Session-2 C5) + 2026-05-21 (Phase 2 C1) | Canonical RCU-3rd-site pattern. `testidPrefix` + `i18nKeyPrefix` props are the n-site reuse contract. |
| `Tier2Section` | 2 (LayoutConfigSpeechBubble + LayoutConfigComicBubble) | 2026-05-19 (Comics-Session-2 C5) | Same shape as Tier1Section. |
| `PictureBookPdfExportControls` | 3 (PageEditor + BookMetadataEditor + ComicBookEditor) | 2026-05-19 (Comics-Session-2 C2) | Closes a half-wired surface as RCU side-effect. |
| `ArticleFilterBar` | 1 (was inline; now extracted file) | 2026-05-15 | `ARTICLEFILTERBAR-EXTRACT-01` archive — single-site extraction from monolith. |
| `AppDialog`, `EmptyState`, `TypeToConfirmDialog` | many | pre-2026-05 | Generic primitives; not domain-specific RCU candidates. |

**Pattern observation:** the most successful RCU extractions
expose the per-site difference as a prop pair (`testidPrefix`
+ `i18nKeyPrefix`). Tier1Section's design — Record-shaped
config + simple prop-injected namespacing — is the cleanest
template. The four top-tier candidates in this audit (rows
1-4) all fit that template.

---

## Anti-pattern candidates (NOT extract)

### REMINDER-PANEL — single-site (defer)

`DonationReminderBanner.tsx` is the only reminder-shaped
surface in the codebase. The 2-surface RCU threshold is NOT
met. `REMINDER-PANEL-GENERIC-EXTRACTION-01` (P3) is filed
correctly as a deferred-until-2nd-site item; no audit-driven
action needed. Re-check when a second reminder-shaped
affordance lands (the v0.35.1 release-archive flagged a
possible future "update-available reminder" surface as a
candidate trigger).

### Comments-table-row — semantically distinct from ListRow

`CommentsAdminSection` renders comment rows as `<tr>` inside
a `<table>` (verified at `CommentsAdminSection.tsx:937`).
Article + Book lists use `<div role="row">` card/list
shapes. Merging table-row + card-row into a single `ListRow`
would force one of:
- A polymorphic component (`as` prop / `forwardRef` to `tr`
  or `div`) — high cost, low value
- A shared sub-tree that ignores the outer element — defeats
  the abstraction

Recommend: leave Comments-table-row as-is. Document in the
`ListRow` extraction spec that Comments is intentionally
out-of-scope.

---

## Recommended extraction sequence

Top-3 next-session candidates, ordered by combined score +
dependency-graph (independence first, compounding later):

### Session 1 (immediate, ~3 hours)

**`useSelection<T>()` generic hook extract** (Rank 1, score 16).
Easy win. Zero behavioral change. Proves the generic-hook
pattern. Site-by-site migration with the existing
component-local type-alias preserved as backward-compat.

### Session 2 (next, ~5 hours)

**`AuthorSelectInput` extract + apply** (Rank 4, score 12).
Pair with `AUTHOR-DATALIST-EXTEND-EDITORS-01` (already filed
P3) so the extraction immediately gains 2 NEW callsites
(ArticleEditor + BookEditor) in addition to the existing
CreateBookModal + ConvertToBookWizard. Total: 4 surfaces
after this session.

### Session 3 (mid-term, ~6 hours)

**`BulkActionBar` shared component** (Rank 2, score 15).
Larger lift but benefits from Session 1's
`useSelection<T>()` foundation. Slot-based action cluster.
3 sites migrated + 1 E2E regression-pin per site.

### Session 4 (longer-term, ~6-8 hours)

**`ListRow` shared component** (Rank 3, score 13). Two
sub-steps: (a) extract `ArticleRow` out of
`ArticleList.tsx` to its own file (inline-monolith
reduction), (b) cross-surface `ListRow` extract +
migrate. The intermediate step matters because step (a)
alone unlocks per-component Vitest coverage for ArticleRow,
which currently shares the giant ArticleList test file.

**Total downstream value of the 4-session arc:** 4
high-value extractions, ~20 commits, ~20 hours. Plus
unblocks at least 3 follow-up surfaces
(AUTHOR-DATALIST-EXTEND-EDITORS-01 callsites, the
inline-monolith reduction's tests, and any future
bulk-action site).

---

## Methodology limitations

The 4-Axes scoring fell short in several places where
subjective judgment was necessary:

1. **A2 Drift-Risk is forward-looking, not observable.**
   `useSelection<T>()` got a 3 (currently in-sync) rather
   than a 1 (identical copies, no drift observed). The
   score reflects the LL principle that copy-paste sync is
   fragile, not the observed state. Reasonable reviewers
   could score it 2.
2. **A3 Extraction-Ease conflates two concerns: shape
   simplicity and dependency surface.** `AuthorSelectInput`
   has a clean shape (A3=4) but depends on `api.authors`
   + `computeAuthorSuggestions` helper + i18n + state-
   reset logic. The score doesn't capture that the
   extraction's blast-radius extends to the helper
   function.
3. **A4 Downstream-Value double-counts when extractions
   stack.** `useSelection<T>()` (Rank 1, A4=4) and
   `BulkActionBar` (Rank 2, A4=4) both score for
   "unblocks future bulk-action sites" — but a single
   future site benefits from both extractions, not from
   each independently. The combined sequence's downstream
   value isn't the sum of A4s.
4. **Audit did NOT score the PdfExportControls audit
   accurately.** The 9 is a placeholder reflecting
   uncertainty; a real score requires reading both
   components' usage sites, which this audit deferred.
5. **No score for inline-monolith reduction as its own
   value.** `ListRow`'s extraction would also reduce
   `ArticleList.tsx`'s 1434-LOC monolith — a real
   maintenance win not captured by the 4 axes. This is
   the "compounding-value" pattern the audit's
   downstream-value column tries to surface but doesn't
   quite reach.

**Interpretation guidance:** scores within ±2 of each
other are within methodology noise. The top-4 sequence
(score 12-16) is robust; the bottom-3 (score 8-9) is
also robust in the OTHER direction (not worth extracting
under any reasonable re-scoring).

---

## Open questions for the next backlog cycle

1. **Should `AUTHOR-SELECT-INPUT-EXTRACT-01` promote
   from P3 to P2?** Per this audit's findings (RCU 2-site
   trigger met, clean shape, paired with already-filed
   follow-up), the answer is yes. Defer the decision to
   the next backlog re-prioritization cycle.
2. **PdfExportControls audit** — schedule the 15-min
   follow-up to determine consolidation viability.
3. **New filing: `USE-SELECTION-HOOK-GENERIC-EXTRACT-01`**
   does not yet exist in the backlog. Audit recommends
   filing as P2 (matches the 16-score top-tier).
4. **New filing: `BULK-ACTION-BAR-SHARED-COMPONENT-01`**
   does not yet exist in the backlog. Audit recommends
   filing as P3 (15-score; benefits from preceding the
   useSelection extract).

---

## References

- [docs/audits/backlog-reprioritization-2026-05-20.md](backlog-reprioritization-2026-05-20.md) (RCU-AUDIT-01 promotion + filed candidates)
- [docs/roadmap-archive/2026-05.md](../roadmap-archive/2026-05.md) §"Archived 2026-05-15 (ARTICLEFILTERBAR-EXTRACT-01)" (precedent extraction)
- [docs/roadmap-archive/2026-05.md](../roadmap-archive/2026-05.md) §"Archived 2026-05-20 (Comics-Session-2 CLOSE)" (Tier1+Tier2+PictureBookPdfExportControls extractions)
- [docs/roadmap-archive/2026-05.md](../roadmap-archive/2026-05.md) §"Archived 2026-05-21 (PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01)" (Tier1Section 3rd-site application — RCU canonical confirmation)
- [.claude/rules/coding-standards.md](../../.claude/rules/coding-standards.md) §"Recurring-Component Unification Rule"
- [.claude/rules/lessons-learned.md](../../.claude/rules/lessons-learned.md) §"Inline-component duplication is the upstream cause of parallel-surface asymmetry"
- [.claude/rules/lessons-learned.md](../../.claude/rules/lessons-learned.md) §"Articles-vs-Books parallel-surface asymmetry"
- [.claude/rules/lessons-learned.md](../../.claude/rules/lessons-learned.md) §"Bulk-action UX: action-bar + selection-hook decoupling stays useful"

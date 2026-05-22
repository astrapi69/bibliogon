# KDP-Publishing-Wizard Phase 2 Pre-Inspection — 2026-05-22

**Backlog items:** `KDP-PUBLISHING-WIZARD-01-PHASE-2` (P2 STRATEGIC)
+ `KDP-WIZARD-XSTATE-MIGRATION-01` (P3 ARCHITECTURE-DEBT) — paired,
shipped in the same session per their filings.
**Audit scope:** read-only inventory across 7 tracks; deliverable
is THIS document. NO implementation planning until the A-N
decisions surfaced per-track are adjudicated.
**Source:** repo state at HEAD `163c42d` (immediately after the
2026-05-22 Phase 1 close + handover commit). Working tree clean.
**Phase 1 reference:** [docs/audits/kdp-publishing-wizard-pre-inspection-2026-05-24.md](kdp-publishing-wizard-pre-inspection-2026-05-24.md).

---

## Track scope (this document)

| Track | Status | Scope |
|---|---|---|
| 1 — XState Migration | **COMPLETE** (A6-A11 confirmed) | Machine design + Vitest migration map |
| 2 — Schema Design | **COMPLETE** | `BookPublishingState` + `ArcReviewer` models |
| 3 — Pricing Calculator | **COMPLETE** | KDP royalty rules + book-type variations |
| 4 — ARC Reviewer | **COMPLETE** | Workflow + Book-integration surface |
| 5 — Persistence Model | **COMPLETE** | Save/resume semantics + UI surface |
| 6 — Session-Split | **COMPLETE** | Commit sequence + session boundaries |
| 7 — A-N Adjudication | **COMPLETE** | Consolidated decisions |

A6-A11 (Track 1) already adjudicated with confirmed defaults.
A12-A19 surfaced in Tracks 2-5 below; consolidated in Track 7.

---

## Track 1 — XState Migration Audit

The XState migration is the FIRST work to ship in Phase 2 per the
session instruction ("XState v5 migration (paired, do FIRST) —
foundation work before adding new steps"). It MUST land green
before any Phase 2 feature step (pricing / ARC / persistence) is
built on top.

### 1A. `state-machines.md` adoption signal — applied

The architecture doc lists 5 trigger criteria for adopting XState.
Phase 1's mid-session finding (per the `lessons-learned.md` entry
"Architecture-doc consultation is part of Pre-Inspection") already
established that the KDP wizard satisfies 5/5 criteria. Phase 2
makes that even more true: pricing branching + ARC list-CRUD +
persistence load/save add events 4-7 transitions each.

**Conclusion**: XState v5 is the right substrate. Conform to the
canonical pattern at
[frontend/src/components/import-wizard/machines/wizardMachine.ts](../../frontend/src/components/import-wizard/machines/wizardMachine.ts).

### 1B. Canonical reference — `wizardMachine.ts` shape

- **File location**: `frontend/src/<feature>/machines/<name>Machine.ts`
  + co-located `<name>Machine.test.ts`. Phase 2 path:
  `frontend/src/components/kdp-wizard/machines/kdpWizardMachine.ts`.
- **Pure data file**: zero React imports
  ([wizardMachine.ts:22](../../frontend/src/components/import-wizard/machines/wizardMachine.ts#L22)
  imports only `setup` + `assign` from `xstate`).
- **Exports**: `WizardContext` (typed shape), `WizardEvent` (typed
  union), `wizardMachine` (configured instance).
- **Pattern**: `setup({ types, guards, actions }).createMachine({
  states: { ... } })`.
- **Modal stays thin**:
  [ImportWizardModal.tsx:68](../../frontend/src/components/import-wizard/ImportWizardModal.tsx#L68)
  reads `[snapshot, send] = useMachine(wizardMachine)`, treats
  `snapshot.value` as render discriminator. Per-step components
  receive callback props that dispatch result events back into the
  machine.
- **Async lives in React layer, NOT in machine context**
  ([state-machines.md:88-93](../architecture/state-machines.md#L88-L93)).
  Promises + AbortControllers stay in `useEffect`. Actions only
  update context.
- **Test pattern**:
  [wizardMachine.test.ts](../../frontend/src/components/import-wizard/machines/wizardMachine.test.ts)
  ships 14 actor-level tests. Each test uses
  `createActor(wizardMachine).start()` + `actor.send({...})` +
  `actor.getSnapshot()`. No DOM. No fake timers. Direct dispatch.

### 1C. Current KDP wizard (Phase 1 useState) inventory

State surface across the 4 Phase 1 files:

| File | State variables (useState) | Async ownership |
|---|---|---|
| [KdpPublishingWizard.tsx](../../frontend/src/components/kdp-wizard/KdpPublishingWizard.tsx) | `step: 0\|1\|2`, `step0CanAdvance`, `step1CanAdvance` | None (delegates to children) |
| [MetadataChecklist.tsx](../../frontend/src/components/kdp-wizard/MetadataChecklist.tsx) | `result`, `loading`, `error` | `api.kdp.checkMetadata` in useEffect |
| [CoverValidation.tsx](../../frontend/src/components/kdp-wizard/CoverValidation.tsx) | `dim`, `loadError` | Client-side image-load only (no backend call) |
| [ExportPackage.tsx](../../frontend/src/components/kdp-wizard/ExportPackage.tsx) | `state: idle\|generating\|done\|error` (discriminated union) | `api.kdp.buildPackage` on user click |

Inter-component contract: each step child takes
`onCanAdvanceChange: (canAdvance: boolean) => void` and fires it
once when its readiness state changes
([KdpPublishingWizard.tsx:71-72](../../frontend/src/components/kdp-wizard/KdpPublishingWizard.tsx#L71-L72)
holds the mirror booleans).

Reset semantics (Phase 1):
- `onOpenChange(false)` → `setStep(0)` + `onClose()`
  ([KdpPublishingWizard.tsx:132-137](../../frontend/src/components/kdp-wizard/KdpPublishingWizard.tsx#L132-L137)).
- `Dialog.Close` (ESC + X) routes through the same `onOpenChange`
  path.
- `Finish` button: `setStep(0)` + `onClose()`.
- Per-step components do NOT reset on dialog close; they re-mount
  fresh when the wizard re-opens because the parent unmounts the
  step subtree on close.

### 1D. Proposed `kdpWizardMachine` design

#### State graph

```
initial: metadata

states:
  metadata:                      # Step 1 (was MVP step 0)
    on:
      METADATA_LOADED            → metadata (action: setMetadataResult)
      METADATA_FAILED            → metadataError (action: setError)
      ADVANCE [guard: canAdvanceFromMetadata]
                                 → cover
      CANCEL                     → resetToInitial → metadata

  metadataError:
    on:
      RETRY [guard: canRetry]    → metadata (action: clearError)
      CANCEL                     → resetToInitial → metadata

  cover:                         # Step 2
    on:
      COVER_VALIDATED            → cover (action: setCoverDimensions)
      ADVANCE [guard: canAdvanceFromCover]
                                 → pricing
      BACK                       → metadata
      CANCEL                     → resetToInitial → metadata

  pricing:                       # Step 3 (NEW Phase 2)
    on:
      PRICING_CHANGE             → pricing (action: setPricing)
      ADVANCE [guard: hasRequiredPricing]
                                 → arc
      BACK                       → cover
      CANCEL                     → resetToInitial → metadata

  arc:                           # Step 4 (NEW Phase 2)
    on:
      ADD_REVIEWER               → arc (action: addReviewer)
      UPDATE_REVIEWER_STATUS     → arc (action: updateReviewerStatus)
      REMOVE_REVIEWER            → arc (action: removeReviewer)
      ADVANCE                    → export
      BACK                       → pricing
      CANCEL                     → resetToInitial → metadata

  export:                        # Step 5 (was MVP step 2)
    on:
      GENERATE                   → exporting
      BACK                       → arc
      CANCEL                     → resetToInitial → metadata
      FINISH                     → closed

  exporting:
    on:
      EXPORT_SUCCESS             → exportSuccess (action: setExportResult)
      EXPORT_FAILED              → exportError (action: setError)

  exportSuccess:
    on:
      FINISH                     → closed
      CANCEL                     → resetToInitial → metadata

  exportError:
    on:
      RETRY                      → exporting (action: clearError)
      BACK                       → export
      CANCEL                     → resetToInitial → metadata

  closed:
    type: final                  # Modal unmounts on entry
```

#### Context shape (proposed)

```typescript
interface KdpWizardContext {
    // Pre-loaded once at wizard open:
    book: BookDetail;

    // Step-1 (metadata):
    metadataResult: KdpMetadataCheckResult | null;
    metadataIssuesFiltered: KdpMetadataIssue[];   // Post book-type filter

    // Step-2 (cover):
    coverDimensions: ImageDimensions | null;
    coverIssues: ValidationIssue[];

    // Step-3 (pricing, NEW):
    pricing: PricingState;        // shape defined in Track 3

    // Step-4 (ARC, NEW):
    arcReviewers: ArcReviewer[];  // shape defined in Track 4

    // Step-5 (export):
    exportFilename: string | null;
    exportBlobUrl: string | null;

    // Persistence (NEW):
    publishingStateId: string | null;   // Server-loaded BookPublishingState row
    lastSavedAt: string | null;

    // Errors (any retryable surface):
    error: WizardError | null;
}
```

Per `state-machines.md:88` anti-pattern guidance, the blob URL +
in-flight promise stay in the React layer's `useEffect`, NOT in
the machine context. The `exportBlobUrl` in context is the
finalized URL only (post `EXPORT_SUCCESS` dispatch), so the
"download again" button can rebuild a download click.

#### Event union (proposed)

```typescript
type KdpWizardEvent =
    // Step-1 results:
    | { type: 'METADATA_LOADED'; result: KdpMetadataCheckResult }
    | { type: 'METADATA_FAILED'; error: WizardError }
    // Step-2 results:
    | { type: 'COVER_VALIDATED'; dim: ImageDimensions; issues: ValidationIssue[] }
    // Step-3 (pricing):
    | { type: 'PRICING_CHANGE'; pricing: Partial<PricingState> }
    // Step-4 (ARC):
    | { type: 'ADD_REVIEWER'; reviewer: NewArcReviewer }
    | { type: 'UPDATE_REVIEWER_STATUS'; id: string; status: ReviewStatus }
    | { type: 'REMOVE_REVIEWER'; id: string }
    // Step-5 (export):
    | { type: 'GENERATE' }
    | { type: 'EXPORT_SUCCESS'; filename: string; blobUrl: string }
    | { type: 'EXPORT_FAILED'; error: WizardError }
    // Navigation:
    | { type: 'ADVANCE' }
    | { type: 'BACK' }
    | { type: 'FINISH' }
    // Recovery:
    | { type: 'RETRY' }
    | { type: 'CANCEL' }
    | { type: 'RESET' }
    // Persistence (Track 5):
    | { type: 'STATE_LOADED'; state: BookPublishingStateRow }
    | { type: 'STATE_SAVED'; timestamp: string };
```

#### Guards

| Guard | Condition |
|---|---|
| `canAdvanceFromMetadata` | `!context.metadataIssuesFiltered.some(i => i.severity === 'error')` |
| `canAdvanceFromCover` | `context.coverIssues.filter(i => i.severity === 'error').length === 0` |
| `hasRequiredPricing` | `context.pricing.royalty_plan !== null` (and any Track 3 additions) |
| `canRetry` | `context.error?.retryable === true` |

Anti-pattern check: each guard answers "is THIS transition
allowed?" — not "what does the transition do?". Conforms to
[state-machines.md:94-96](../architecture/state-machines.md#L94-L96).

### 1E. Vitest spec migration map

Phase 1 ships **33 wizard-related Vitest cases** (per the handover
doc verification numbers):

| File | Cases | Phase 2 action |
|---|---|---|
| [KdpPublishingWizard.test.tsx](../../frontend/src/components/kdp-wizard/KdpPublishingWizard.test.tsx) | 9 nav | **REWRITE as actor-level** at `machines/kdpWizardMachine.test.ts` |
| [MetadataChecklist.test.tsx](../../frontend/src/components/kdp-wizard/MetadataChecklist.test.tsx) | 9 component | **KEEP unchanged** (step owns its loading state; only callback shape changes) |
| [CoverValidation.test.tsx](../../frontend/src/components/kdp-wizard/CoverValidation.test.tsx) | 9 component | **KEEP unchanged** |
| [ExportPackage.test.tsx](../../frontend/src/components/kdp-wizard/ExportPackage.test.tsx) | 6 component | **KEEP unchanged** (the internal idle/generating/done/error machine stays local) |

#### Wizard-nav migration detail (9 cases → 14-18 actor-level)

Existing 9 wizard-nav cases (in
[KdpPublishingWizard.test.tsx](../../frontend/src/components/kdp-wizard/KdpPublishingWizard.test.tsx))
become actor-level tests under the canonical
`wizardMachine.test.ts` shape:

| Existing case | Actor-level replacement |
|---|---|
| "renders the dialog with title + book-title subtitle when open" | Drop; covered by remaining React-layer integration test |
| "renders 3 step-dots" | Drop; React-layer rendering concern |
| "starts on step 0 (metadata placeholder)" | `"starts in metadata state"` (assert `actor.getSnapshot().value === 'metadata'`) |
| "advances step 0 → 1 → 2 on Next clicks" | Split into 4 transitions: `metadata→cover`, `cover→pricing`, `pricing→arc`, `arc→export` |
| "step 2 (last) shows Finish, not Next" | Move to React-layer integration: `state.value === 'export'` renders Finish, not Next |
| "Back navigates step 1 → 0" | Split into 4 BACK transitions across the state graph |
| "Finish calls onClose" | React-layer integration: FINISH event → final state → modal unmounts |
| "Close button calls onClose" | React-layer integration |
| "step-0/step-1 Next gated by callback" | `"ADVANCE blocked when canAdvanceFromMetadata returns false"` (machine guard test) |

Plus net-new tests from the Phase 2 state graph:
- CANCEL from each non-initial state → resetToInitial
- METADATA_FAILED → metadataError; RETRY → metadata
- PRICING_CHANGE updates context.pricing without state transition
- ADD_REVIEWER / UPDATE_REVIEWER_STATUS / REMOVE_REVIEWER context updates
- EXPORT_FAILED → exportError; RETRY → exporting

Target: **14-18 actor-level cases** in
`machines/kdpWizardMachine.test.ts`, matching the canonical
wizardMachine.test.ts density.

#### React-layer integration tests (NEW)

Add a small `KdpPublishingWizard.integration.test.tsx` (or replace
the current `KdpPublishingWizard.test.tsx`) with **3-5 cases**:

1. Wizard renders MetadataChecklist when `state.value === 'metadata'`.
2. Wizard renders CoverValidation when `state.value === 'cover'`.
3. (similar for pricing, arc, export)
4. Next button's `disabled` follows `!snapshot.can({type: 'ADVANCE'})`.
5. CANCEL on dialog close fires `RESET` event into the machine.

These exercise the React-machine wiring; the per-step component
behaviour is covered by the unchanged component tests.

#### Total Vitest count delta

- Removed: 9 wizard-nav cases
- Added: 14-18 actor-level + 3-5 React-layer integration = 17-23
- Net: +8 to +14 (Vitest 1871 → 1879-1885 from Phase 1
  baseline, before Phase 2 feature tests for pricing / ARC / etc.)

### 1F. Step-component refactor surface

Each step's prop interface narrows from `onCanAdvanceChange` to
`onLoaded`/`onValidated`/`onFailed` per-step:

```typescript
// MetadataChecklist:
interface Props {
    book: BookDetail;
    onLoaded: (result: KdpMetadataCheckResult) => void;
    onFailed: (error: WizardError) => void;
}

// CoverValidation:
interface Props {
    book: BookDetail;
    onValidated: (dim: ImageDimensions, issues: ValidationIssue[]) => void;
    // No onFailed: client-side validation, no async failure path
}

// ExportPackage:
interface Props {
    book: BookDetail;
    onSuccess: (filename: string, blobUrl: string) => void;
    onFailed: (error: WizardError) => void;
    // The user-triggered GENERATE click stays inside the component;
    // it dispatches { type: 'GENERATE' } via a parent-passed callback,
    // OR the component watches state.value === 'exporting' from a
    // useMachine-shared context. Choice surfaces as adjudication A11.
}
```

Each step does its own filtering / validation internally and
dispatches a result event to the machine. The wizard's React layer
becomes:

```typescript
const [snapshot, send] = useMachine(kdpWizardMachine);
const stepValue = snapshot.value as KdpWizardState;

{stepValue === 'metadata' && (
    <MetadataChecklist
        book={book}
        onLoaded={(result) => send({ type: 'METADATA_LOADED', result })}
        onFailed={(error) => send({ type: 'METADATA_FAILED', error })}
    />
)}
// (parallel for cover, pricing, arc, export)
```

### 1G. Anti-patterns audit (per `state-machines.md:86-99`)

| Anti-pattern | Compliance |
|---|---|
| Storing transient async state in context | ✓ — Blob URL + in-flight Promise in React layer; only post-success URL in context |
| Side effects in actions | ✓ — All `assign(...)` actions are pure context updates |
| Guards for business logic (vs "is transition allowed?") | ✓ — Each guard answers a transition-permission question |
| A machine per component | ✓ — One `kdpWizardMachine` per the whole wizard surface |

### 1H. Tooling sanity check

- `xstate@^5.31.1` — already installed
  ([frontend/package.json:68](../../frontend/package.json#L68))
- `@xstate/react@^6.1.0` — already installed
  ([frontend/package.json:55](../../frontend/package.json#L55))
- No new deps required.
- DevTools work without configuration
  ([state-machines.md:76-84](../architecture/state-machines.md#L76-L84)).
- Visualizer-ready: paste machine block into
  https://stately.ai/viz.

### 1I. Estimated effort (Track 1 isolation)

XState migration **alone** (no Phase 2 feature work yet):

| Commit | Scope | LOC delta |
|---|---|---|
| C1 | New `machines/kdpWizardMachine.ts` + `kdpWizardMachine.test.ts` (14-18 actor-level tests) | +400 / -0 |
| C2 | Refactor `KdpPublishingWizard.tsx` to `useMachine`; step-component callback prop rename | +30 / -50 |
| C3 | Rewrite `KdpPublishingWizard.test.tsx` (5 React-layer integration cases) | +100 / -200 |

**Total: 3 commits, +530 / -250 ≈ net +280 LOC, atomically green
per commit.**

### 1J. A-N decisions surfaced from Track 1

Adjudication points before code-write:

- **A6 (state graph topology)**: Confirm the 5-step-plus-error-sub-states
  graph above. Alternatives: (a) flatten errors into the parent
  states with retry events at each level (less ceremony, harder
  to express `canRetry` guard cleanly); (b) keep MVP's 3-step
  shape and gate ARC/pricing as conditionally-visible UI within
  the existing `metadata`/`cover`/`export` states (rejected:
  defeats the migration's purpose).
- **A7 (Vitest migration strategy)**: Confirm "migrate wizard-nav
  to actor-level, keep step tests in place, add 3-5 React-layer
  integration cases". Alternative: migrate ALL to actor-level +
  pure unit (rejected: loses the per-step error-state coverage
  that's easier to assert via DOM).
- **A8 (BACK semantics)**: Confirm linear BACK (each state has a
  single BACK target). Alternative: history-stack BACK (every
  visited state pushed to a history array; CANCEL clears it).
  Recommend linear: matches the current wizard's predictable
  shape; the user can always click step-dots if step-skipping is
  needed (Phase 2 backlog item).
- **A9 (CANCEL semantics)**: Confirm hard reset on CANCEL (matches
  `wizardMachine`'s `CANCEL: { target: "upload", actions: "reset" }`).
  Alternative: persist wizard state on cancel, restore on next
  open. Recommend HARD-RESET for Phase 2 v1; soft-persist becomes
  natural if Track 5 (persistence) lands a server-side
  `BookPublishingState` row that the wizard auto-resumes from.
- **A10 (Phase 1 MVP cutover)**: Confirm replacing the MVP wizard
  outright vs keeping behind a feature flag. Recommend OUTRIGHT
  REPLACE: no production users have a MVP-completed wizard in
  flight; nothing to migrate; the user is the only consumer and
  the strategic gate is open.
- **A11 (ExportPackage GENERATE source)**: When the user clicks
  the GENERATE button inside `ExportPackage`, does the component
  receive `send` via a parent-passed callback (`onGenerate: () =>
  send({type: 'GENERATE'})`), or does the parent guard the
  GENERATE click via a different pattern? Recommend
  PARENT-PASSED-CALLBACK to keep the step component machine-
  agnostic.

### 1K. Stop-condition check (Track 1)

Per the session's stop-conditions:

| Stop condition | Triggered? |
|---|---|
| Schema design ambiguity that affects multiple models | No (Track 2 will cover schemas) |
| XState machine design that doesn't cleanly map to existing wizard behavior | **No** — Phase 1's 3-step useState maps 1:1 onto the proposed `metadata` → `cover` → `export` chain. Phase 2 additions (pricing/arc) extend the chain with new states; no MVP behavior changes shape |
| Pricing logic uncertainty | Out of Track 1 scope (Track 3) |
| Any finding that contradicts Phase 1 Pre-Inspection assumptions | **No** — Phase 1 explicitly deferred XState to Phase 2 per the user's γ-adjudication. This audit confirms that decision was correct |

**No stop-conditions hit. Track 1 is ready for adjudication.**

### 1L. Recommendation

Ship the XState migration as the FIRST 3 commits of Phase 2,
before any pricing / ARC / persistence feature work. The migration
is a behavior-preserving refactor with comprehensive actor-level
test coverage replacing the existing wizard-nav DOM tests. Once
green, the new feature steps (pricing, ARC) drop into the state
graph cleanly with their own per-step components + the
machine-extension pattern established in C1.

---

## Track 2 — Schema Design Audit

### 2A. Existing model conventions (relevant)

Verified via [backend/app/models/__init__.py](../../backend/app/models/__init__.py):

- **ID shape**: `String(32) primary_key` + `default=_new_id`.
  Every existing model uses this; matches `Book`, `Page`,
  `ComicPanel`, `ComicBubble`, `Publication`, `Author`.
- **Foreign keys**: explicit `ondelete="CASCADE"` for parent-child
  relationships ([Page:page_id, ComicPanel:page_id,
  ComicBubble:panel_id, Publication:article_id, Chapter:book_id]).
  `ondelete="SET NULL"` only for asset references (panels keep
  their bounds even when the image is removed).
- **JSON-as-Text** for nested data: `Page.layout_config`,
  `ComicPanel.bounds`, `Book.keywords` /`categories` /
  `bisac_codes` all serialise dicts/lists as JSON strings in
  `Text` columns. Anti-convention: SQLAlchemy `JSON` type —
  not used anywhere in the model tree.
- **Timestamps**: `created_at` + `updated_at` (with
  `onupdate=_utcnow`) on every mutable row.
- **Soft-delete**: only `Book` + `Article` carry `deleted_at`.
  Child entities are hard-deleted via CASCADE.
- **String length conventions**: 32 (IDs), 50 (enums/types), 100
  (short tags), 300 (names), 500 (titles/paths), 2000+ (URLs).
  Verified: `Publication.platform=50`, `Author.name=300`,
  `Asset.path=500`.
- **Latest migration**: `qe6f7a8b9cd0` (book_idea + expose). New
  migration's `down_revision = "qe6f7a8b9cd0"`.

### 2B. `BookPublishingState` model (1:1 with Book)

The 1:1 relationship is enforced via a `UNIQUE` constraint on
`book_id`. Rationale: a Book has at most ONE publishing state row;
the wizard either creates it on first save or updates it. Loading
the wizard for a book with no row returns defaults.

```python
class BookPublishingState(Base):
    """KDP Publishing Wizard Phase 2 — per-book commercial state.

    1:1 with Book (UNIQUE constraint on book_id). The wizard
    creates the row on first auto-save; subsequent transitions
    PATCH the same row. Loading the wizard for a Book with no row
    returns default values (royalty_plan=NULL, kdp_select=False,
    empty JSON dicts).

    All JSON-shaped fields use Text + json-as-string per the
    existing Bibliogon convention (Page.layout_config,
    ComicPanel.bounds). The wizard parses on read, serialises on
    write; Pydantic schemas at the API layer validate shape.
    """

    __tablename__ = "book_publishing_state"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    book_id: Mapped[str] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Pricing (Track 3): royalty plan is "35" | "70" | None.
    # Stored as String(8) for forward-compat with hypothetical
    # KDP-changed values; Pydantic Literal enforces shape at API.
    royalty_plan: Mapped[str | None] = mapped_column(String(8), nullable=True)
    kdp_select_enrolled: Mapped[bool] = mapped_column(Boolean, default=False)
    kdp_select_enrollment_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expanded_distribution: Mapped[bool] = mapped_column(Boolean, default=False)
    # JSON dict keyed by region_code ("US","EU","UK","JP","IN")
    # → {currency, list_price, royalty_rate}. Default "{}".
    prices: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    # JSON dict keyed by checklist_item_id → ISO timestamp.
    # Tracks per-checklist-item completion (e.g. "metadata_validated",
    # "cover_validated", "package_generated"). Used by the
    # auto-resume logic to jump to the last-incomplete step.
    launch_checklist_state: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    # ISO-date string (matches Book.publish_date shape). Optional
    # planning field; not used to gate any transition.
    publication_target_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_kdp_upload_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    arc_reviewers: Mapped[list["ArcReviewer"]] = relationship(
        back_populates="publishing_state",
        cascade="all, delete-orphan",
        order_by="ArcReviewer.created_at",
    )
```

### 2C. `ArcReviewer` model (N:1 with Book via BookPublishingState)

Conscious choice: ARC reviewers attach to the **publishing-state
row**, not directly to the Book. Reasons:

1. **Conceptual coupling.** ARC reviewers exist only in the
   context of a launch workflow; without a `BookPublishingState`
   row there's no launch in progress.
2. **CASCADE simplicity.** Delete the Book → CASCADE deletes the
   publishing-state row → CASCADE deletes the ARC reviewers. One
   chain, predictable.
3. **Future re-launches.** If the user wants to start a second
   ARC campaign for a re-edition, they reset/clone the
   publishing-state row; existing reviewers travel with the
   "current" state and the wizard offers archive-current-and-start-
   new at that point (out of scope for v1; design preserves the
   option).

```python
class ArcReviewer(Base):
    """KDP Publishing Wizard Phase 2 — ARC reviewer tracking.

    N:1 with BookPublishingState. CASCADE chain: deleting a Book
    deletes its publishing_state row deletes its ARC reviewers.

    review_status values (validated at Pydantic layer, not DB):
        - "invited"  : added to the list, not yet contacted
        - "sent"     : ARC copy delivered (manually by user)
        - "received" : reviewer confirmed receipt
        - "reviewed" : review posted, permalink recorded
        - "declined" : reviewer opted out

    Email integration: OUT OF SCOPE for v1 (A16). The user adds
    reviewers + tracks status manually. A future POLISH item
    (ARC-MAILTO-LINK-01) may add a mailto: button to the row.
    """

    __tablename__ = "arc_reviewers"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    publishing_state_id: Mapped[str] = mapped_column(
        ForeignKey("book_publishing_state.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    reviewer_name: Mapped[str] = mapped_column(String(300), nullable=False)
    # RFC 5321 max length is 320 chars. Nullable: a reviewer may
    # be known only by name (a colleague the user sees in person).
    reviewer_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    review_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="invited", index=True
    )
    # Free-text version label ("ARC-v1.0", "Final-Proof"). Optional.
    copy_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # URL of the posted review (Goodreads, Amazon, blog). Optional;
    # nullable until status reaches "reviewed".
    review_permalink: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    # Optional excerpt for the user's records.
    review_text_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    invited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    publishing_state: Mapped["BookPublishingState"] = relationship(
        back_populates="arc_reviewers"
    )
```

### 2D. Alembic migration shape

Single migration adds both tables — they're cohesive and CASCADE-
linked. File:
`backend/migrations/versions/rf7a8b9cd0e1_add_kdp_publishing_state_and_arc_reviewers.py`.

```python
"""add book_publishing_state + arc_reviewers tables (KDP Phase 2)

Revision ID: rf7a8b9cd0e1
Revises: qe6f7a8b9cd0
Create Date: 2026-05-22 ...
"""

def upgrade() -> None:
    # 1. book_publishing_state: 1:1 with books via UNIQUE(book_id).
    op.create_table(
        "book_publishing_state",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "book_id",
            sa.String(length=32),
            sa.ForeignKey("books.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("royalty_plan", sa.String(length=8), nullable=True),
        sa.Column("kdp_select_enrolled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("kdp_select_enrollment_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expanded_distribution", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("prices", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("launch_checklist_state", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("publication_target_date", sa.String(length=20), nullable=True),
        sa.Column("last_kdp_upload_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_book_publishing_state_book_id",
        "book_publishing_state",
        ["book_id"],
        unique=True,
    )

    # 2. arc_reviewers: N:1 with book_publishing_state.
    op.create_table(
        "arc_reviewers",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "publishing_state_id",
            sa.String(length=32),
            sa.ForeignKey("book_publishing_state.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reviewer_name", sa.String(length=300), nullable=False),
        sa.Column("reviewer_email", sa.String(length=320), nullable=True),
        sa.Column(
            "review_status",
            sa.String(length=32),
            nullable=False,
            server_default="invited",
        ),
        sa.Column("copy_version", sa.String(length=50), nullable=True),
        sa.Column("review_permalink", sa.String(length=2000), nullable=True),
        sa.Column("review_text_excerpt", sa.Text(), nullable=True),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_arc_reviewers_publishing_state_id_status",
        "arc_reviewers",
        ["publishing_state_id", "review_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_arc_reviewers_publishing_state_id_status", table_name="arc_reviewers")
    op.drop_table("arc_reviewers")
    op.drop_index("ix_book_publishing_state_book_id", table_name="book_publishing_state")
    op.drop_table("book_publishing_state")
```

Reversible. No data migration — all existing books get NULL/default
state on next read; first wizard save creates the row.

### 2E. CASCADE chain audit

```
Book deleted
  ↓ ondelete=CASCADE (books → book_publishing_state)
BookPublishingState deleted
  ↓ ondelete=CASCADE (book_publishing_state → arc_reviewers)
ArcReviewer(s) deleted
```

Soft-delete: `Book.deleted_at` is a SOFT delete (per existing
convention). The CASCADE only fires on HARD delete (empty trash).
That's correct — a soft-deleted book's publishing state should be
preserved for the restore path. Verified: `Page` follows the same
convention (`ondelete="CASCADE"` from Book, but a soft-deleted
Book still has its Pages because the FK CASCADE only triggers on
DB-level DELETE).

### 2F. A-N decisions surfaced from Track 2

- **A12 (JSON-as-Text vs typed sub-tables)**: Confirm JSON-as-Text
  for `prices` + `launch_checklist_state`. Matches existing
  convention; sub-table would force 2 more migrations + 2 more
  models (PriceEntry, ChecklistState) for marginal gain.
  *[Recommend: JSON-as-Text]*
- **A13 (UNIQUE on book_id for 1:1)**: Confirm UNIQUE constraint
  enforcing 1:1 at DB layer (vs application-layer enforcement).
  *[Recommend: DB-level UNIQUE]*
- **A20 (ArcReviewer parent: book_id direct vs publishing_state_id)**:
  Confirm FK to `book_publishing_state.id` rather than direct to
  `books.id`. Rationale in 2C. Alternative: FK direct to books
  with a nullable `is_arc_reviewer` column (rejected: pollutes
  the books-direct-children namespace; ARC is launch-scoped).
  *[Recommend: FK to publishing_state.id]*

---

## Track 3 — Pricing Calculator Audit

### 3A. Existing pricing surface — verification

`grep` across plugin-kdp confirms **no pricing-related code exists**:

- `plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py` — 7
  endpoints; none pricing-related (verified at Phase 1 Track 1).
- `plugins/bibliogon-plugin-kdp/bibliogon_kdp/package.py` — line
  492's `publishing-state-snapshot.json` writes `book_data` only;
  no price fields. The "publishing-state-snapshot" name is
  forward-compat: it documents what Phase 1 captured (zero
  commercial fields) and what Phase 2 adds (the
  BookPublishingState row).
- No `price`, `royalty`, `tier`, `marketplace` constants exist in
  any backend module.
- No `Book` field carries price data (verified against the 60+
  columns audit at Phase 1 Track 5).

Phase 2's pricing surface is built from zero. No legacy
contradiction risk.

### 3B. KDP royalty rules (authoritative, from KDP docs)

**Ebook (KDP-DP / Kindle Direct Publishing Digital):**

| Plan | List price range (USD) | Royalty | Delivery cost | Notes |
|---|---|---|---|---|
| **70%** | $2.99 – $9.99 | 70% × (list − delivery cost) | $0.15/MB | Eligibility: file ≤ 50 MB, sold in eligible territories |
| **35%** | $0.99 – $200 | 35% × list | None | Available everywhere KDP ships |

70% plan is territory-restricted: US, UK, DE, FR, ES, IT, NL, JP,
BR, CA, MX, AU, IN are 70%-eligible. Other regions auto-fall-back
to 35%.

**Paperback (KDP-POD):**

- Single formula. No plan choice.
- `royalty = (list_price × 0.60) − print_cost`
- `print_cost = fixed + (per-page × page_count)`
  - Standard B&W on white/cream paper: `fixed = $0.85`,
    `per_page = $0.012` (US marketplace)
  - Premium color: `fixed = $0.85`, `per_page = $0.07`
  - Numbers vary per marketplace; canonical source is the KDP
    Paperback Pricing & Royalty page.

**Hardcover (KDP-POD):**

- Same formula as paperback with different fixed/per-page costs.
- Out of v1 scope (paperback covers the launch case; hardcover
  adds in a future polish session if smoke surfaces it).

### 3C. Phase 2 pricing scope (calculator-only per A2)

**A2 from Phase 1 adjudication: calculator-only, NOT strategy-tool.**
The pricing step shows what the royalty WILL be at the price the
user picks; it does NOT recommend prices or run market analysis.

Per-region inputs the user provides:

| Region code | Currency | Default marketplace | Notes |
|---|---|---|---|
| `US` | USD | amazon.com | 70% eligible |
| `EU` | EUR | amazon.de | 70% eligible |
| `UK` | GBP | amazon.co.uk | 70% eligible |
| `JP` | JPY | amazon.co.jp | 70% eligible |
| `IN` | INR | amazon.in | 70% eligible |

5 regions hardcoded for v1 (A14). YAML expansion (CA/AU/MX/BR/IT/
ES/NL/FR) is a future config change.

Per-region inputs collected by the wizard:
- `list_price` (numeric, currency-typed)
- (paperback only) `page_count` (integer; default from
  `len(book.chapters)` × 250 estimate, user-overridable)

Computed outputs (client-side):
- `royalty_per_unit_ebook_70`: when eligible
- `royalty_per_unit_ebook_35`: always
- `royalty_per_unit_paperback`: when paperback included
- Net amounts in each currency

Delivery-cost detail (70% eligibility):
- File size (MB) approximated from the rendered EPUB size at
  export time. Phase 2 wizard uses a placeholder estimate (e.g.
  EPUB file size from the most-recent `/api/books/{id}/export/epub`
  cache, or a sane default like 1.5 MB) — exact file size is only
  known post-export. Per A15, calculator is client-side; the
  approximate size is good enough for the calculator's purpose
  (royalty difference between 70%-eligible-price and 35%-fallback-
  price). A precise calculator is filed as
  `KDP-PRICING-PRECISE-FILE-SIZE-01` (P5) if real demand surfaces.

### 3D. Book-type variations

| book_type | Ebook supported | Paperback supported | Calculator surface |
|---|---|---|---|
| `prose` | Yes (EPUB / PDF via plugin-export) | Yes (PDF via plugin-export) | Both panels |
| `picture_book` | No (WeasyPrint produces PDF only; KDP paperback ingests) | Yes | Paperback panel only |
| `comic_book` | No (same as picture_book) | Yes | Paperback panel only |

The wizard's pricing step renders panels conditionally by book_type.
Rationale: showing an "ebook" pricing panel for a picture_book is
misleading — KDP doesn't accept the WeasyPrint output as an ebook
format.

### 3E. PricingState TypeScript shape

```typescript
type RegionCode = "US" | "EU" | "UK" | "JP" | "IN";
type RoyaltyPlan = "35" | "70" | null;
type CurrencyCode = "USD" | "EUR" | "GBP" | "JPY" | "INR";

interface PriceEntry {
    currency: CurrencyCode;
    list_price: number;        // In the region's currency, decimal
    page_count?: number;        // Paperback only; optional override
}

interface PricingState {
    royalty_plan: RoyaltyPlan;
    kdp_select_enrolled: boolean;
    expanded_distribution: boolean;    // Only when royalty_plan="35"
    prices: Partial<Record<RegionCode, PriceEntry>>;
}

interface ComputedRoyalty {
    region: RegionCode;
    ebook_70?: { gross: number; delivery_cost: number; net: number; eligible: boolean };
    ebook_35?: { gross: number; net: number };
    paperback?: { gross: number; print_cost: number; net: number };
}
```

Stored at `BookPublishingState.prices` as JSON-stringified
`Record<RegionCode, PriceEntry>`. The `royalty_plan` +
`kdp_select_enrolled` + `expanded_distribution` are columns;
`prices` is the only JSON field.

### 3F. Computation module location

Per A15 (client-side calc), new module:
`frontend/src/components/kdp-wizard/pricing.ts`. Pure functions:

```typescript
function computeEbookRoyalty70(listPrice: number, fileSizeMb: number, currency: CurrencyCode): number;
function computeEbookRoyalty35(listPrice: number): number;
function computePaperbackRoyalty(listPrice: number, pageCount: number, currency: CurrencyCode, color: "bw" | "color"): number;
function isPlanEligible(listPrice: number, currency: CurrencyCode, plan: "35" | "70"): boolean;
function computeAll(pricing: PricingState, book: BookDetail, fileSizeMb: number): ComputedRoyalty[];
```

Co-located `pricing.test.ts` with at least 1 test per royalty
function + 3 integration cases (eligible-70, fallback-35, paperback
royalty crosses zero on a too-low list price). KDP fixed/per-page
constants land in a `KDP_PAPERBACK_COSTS` constant inside the same
file with a citation comment pointing at the KDP docs.

### 3G. A-N decisions surfaced from Track 3

- **A14 (5 regions hardcoded)**: Confirm US/EU/UK/JP/IN as v1
  regions. Alternative: YAML-configurable list. Recommend
  hardcoded for v1; expansion adds entries to a `KDP_REGIONS`
  constant later — same edit shape as adding a category.
  *[Recommend: hardcoded]*
- **A15 (client-side vs backend pricing endpoint)**: Confirm
  client-side calculation. Rationale: matches CoverValidation
  pattern (client-side dimensions + format checks); pure
  functions are easier to test; no roundtrip latency. The
  authoritative KDP-cost constants live in
  `frontend/src/components/kdp-wizard/pricing.ts` with the same
  "if KDP changes the spec, update here" comment as
  `KDP_REQ` in [CoverValidation.tsx:38-47](../../frontend/src/components/kdp-wizard/CoverValidation.tsx#L38-L47).
  *[Recommend: client-side]*
- **A21 (file size source for delivery-cost calc)**: Approximate
  via the most-recent export cache OR a sane default (1.5 MB).
  Precise size requires post-export-link calculation which adds
  complexity and a synchronous roundtrip. *[Recommend:
  approximate-with-warning, file
  `KDP-PRICING-PRECISE-FILE-SIZE-01` (P5)]*
- **A22 (paperback page-count source)**: Default from
  `len(book.chapters) × 250` (rough word-to-page estimate). User
  overrides via a number input. Alternative: trigger a real PDF
  export to count. Recommend ESTIMATE-WITH-OVERRIDE — matches the
  calculator's "guidance not source-of-truth" framing.
  *[Recommend: estimate + override]*

---

## Track 4 — ARC Reviewer Audit

### 4A. Workflow

ARC (Advance Reader Copy) tracking is a launch-workflow surface:
the author distributes a not-yet-final-version manuscript to
reviewers, tracks which reviews land, posts launch with momentum
from collected reviews.

**Status machine** (per-reviewer, linear with a branch):

```
invited
  ↓ user-action "Send ARC"
sent
  ↓ user-action "Confirm receipt"
received
  ↓ user-action "Mark reviewed" + paste permalink
reviewed
  ⊕ user-action "Decline" (from any state)
declined (terminal)
```

The wizard's ARC step renders the list with per-row status select +
"add reviewer" form. No automated transitions; the user maintains
the list manually.

**CRUD operations:**

- `addReviewer(name, email?)`: creates a row with `review_status =
  "invited"` + `invited_at = now`.
- `updateReviewerStatus(id, newStatus, fields?)`: updates the
  status; if `newStatus === "reviewed"`, expects
  `{review_permalink, review_text_excerpt?, reviewed_at = now}`.
- `removeReviewer(id)`: hard-delete (no soft-delete for ARC; the
  list is the user's working set).

### 4B. Backend surface

New endpoints under `/api/kdp/publishing-state/{book_id}/arc-reviewers`:

- `GET /` — list reviewers for the book
- `POST /` — create reviewer (`{name, email?}`)
- `PATCH /{reviewer_id}` — update status / metadata
- `DELETE /{reviewer_id}` — remove

Pydantic schemas:

```python
class ArcReviewerCreate(BaseModel):
    reviewer_name: str
    reviewer_email: str | None = None

class ArcReviewerUpdate(BaseModel):
    review_status: Literal["invited","sent","received","reviewed","declined"] | None = None
    copy_version: str | None = None
    review_permalink: str | None = None
    review_text_excerpt: str | None = None
    reviewed_at: datetime | None = None

class ArcReviewerOut(ArcReviewerCreate):
    id: str
    publishing_state_id: str
    review_status: str
    copy_version: str | None
    review_permalink: str | None
    review_text_excerpt: str | None
    invited_at: datetime | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
```

Lives in `plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py`
alongside the existing endpoints; the publishing-state endpoints
also live in that file (Track 5).

### 4C. Email integration

**OUT OF SCOPE for v1 (A16).** Reasons:

1. **No existing email infrastructure.** Bibliogon's only outbound-
   email-shaped surface is plugin-grammar's LanguageTool API call
   (synchronous, not email). Adding email requires SMTP config,
   templating, error handling for delivery failures, throttling,
   bounce processing — a session's worth of work for a feature
   most authors don't want (preferring their own outreach).
2. **Trust + deliverability risk.** A self-hosted Bibliogon
   sending email from `noreply@bibliogon.local` lands in spam.
   Using user's own SMTP credentials means storing them.
3. **Workflow fit.** Authors typically email reviewers from their
   own personal/Gmail accounts where the reviewer recognizes them.
   Bibliogon-as-sender adds an unwanted intermediary.

What v1 SHIPS instead: each reviewer row gets a Lucide
`<Mail />` icon button. Clicking opens a `mailto:` link with the
reviewer's email pre-filled. The user composes the message in
their existing email client. ARC delivery + receipt confirmation
stays manual.

Filed `ARC-MAILTO-LINK-01` (P5 POLISH) for the mailto: button.
If the v1 wizard ships without even this, surface it as a
follow-up commit in Session 2.

### 4D. Wizard-only surface (no BookMetadataEditor tab)

ARC reviewers do NOT appear in BookMetadataEditor's tabs. Reasons:

1. **Scope-localised.** ARC is a launch-workflow concern, not an
   ongoing book-metadata concern. After the launch, the reviewer
   list is historical data.
2. **Half-Wired prevention.** Adding a BookMetadataEditor tab
   requires a half-wired-feature-lifecycle check (per the
   "Half-wired feature lifecycle" rule in
   `.claude/rules/lessons-learned.md`) — the read path (tab) +
   the write path (wizard step) must ship together. Restricting
   v1 to the wizard avoids this until smoke surfaces user demand.
3. **Trigger for promotion.** If the user later needs to inspect
   reviewer lists outside the wizard flow, file
   `ARC-BOOK-METADATA-TAB-01`. Until then, the wizard's ARC step
   IS the surface.

### 4E. Status field semantics — observable transitions

The status machine in 4A is observable in the UI via per-row
display:

| status | Display | Action button | Notes |
|---|---|---|---|
| `invited` | "Invited" tag | "Mark sent" | Initial state |
| `sent` | "Sent" tag + invited_at relative | "Mark received" / "Mark declined" | ARC delivered |
| `received` | "Received" tag | "Mark reviewed" / "Mark declined" | Reviewer has the file |
| `reviewed` | "Reviewed" tag + review_permalink link | (terminal; can re-edit permalink) | Done |
| `declined` | "Declined" tag (muted) | (terminal) | Out of pipeline |

Each row also exposes a 3-dot menu with "Remove from list".

### 4F. Bulk operations

Phase 1's bulk-operation rules (per
`.claude/rules/lessons-learned.md` "Bulk-operation limits should
be per-operation cost-profile"): ARC reviewer operations are
DB-bound; no caps needed. v1 ships individual-row actions; no
bulk-select.

### 4G. A-N decisions surfaced from Track 4

- **A16 (email integration scope)**: Confirm OUT OF SCOPE for v1
  + ship mailto: link only (filed as `ARC-MAILTO-LINK-01` follow-
  up). *[Recommend: out-of-scope]*
- **A23 (ARC surface location)**: Confirm wizard-only (no
  BookMetadataEditor tab). *[Recommend: wizard-only]*
- **A24 (status enum at DB layer)**: Confirm enum validation at
  Pydantic layer ONLY (matches `bubble_type` /
  `Chapter.chapter_type` pattern). DB column stays `String(32)`.
  *[Recommend: Pydantic-only]*
- **A25 (delete semantics)**: Confirm hard-delete (no soft-delete
  for ARC rows). Matches `Chapter` / `Page` precedent. *[Recommend:
  hard-delete]*

---

## Track 5 — Persistence Model Audit

### 5A. Save semantics — auto-save on every transition (A17)

The wizard auto-saves to `BookPublishingState` on every state
transition. Rationale (per the "Half-wired feature lifecycle"
discipline):

- **Explicit-save button** is the half-wired-UX failure mode: the
  user sees a "saved" toast and assumes persistence, but if the
  button is missed (mid-flow close, browser crash, accidental
  CANCEL), the state vanishes. Discoverable only by reopening the
  wizard and finding it empty.
- **Auto-save-on-transition** is the always-saved invariant: any
  state observable in the UI is also observable on the server.
  Reload, browser crash, switching books — none lose state.

The transition-level save is implemented inside the XState
machine's `entry` hook on each non-initial state OR in the React
layer's effect that watches `state.value`. Recommend the React-
layer effect: keeps the machine pure (no I/O in actions, per the
`state-machines.md` anti-pattern guidance).

```typescript
// In KdpPublishingWizard.tsx:
useEffect(() => {
    if (snapshot.value === "metadata") return;  // Skip initial
    if (snapshot.value === "closed") return;    // Final state
    // Snapshot context to a PATCH payload + fire async PATCH.
    // Failure handling: log + toast "Could not save state",
    // wizard continues — local context stays authoritative.
    persistWizardState(book.id, snapshot.context);
}, [snapshot.value]);
```

### 5B. Resume semantics

When the wizard opens for a book that has a `BookPublishingState`
row server-side, the machine starts at the LAST-INCOMPLETE step
(from `launch_checklist_state` JSON):

```typescript
const resumeStep = computeResumeStep(state.launch_checklist_state);
// resumeStep ∈ "metadata" | "cover" | "pricing" | "arc" | "export"
const machine = wizardMachine.provide({
    // ...
}).createMachine({ initial: resumeStep, /* ... */ });
```

Or equivalently, dispatch a synthetic `RESUME_AT` event at mount:

```typescript
useEffect(() => {
    if (!open || !persistedState) return;
    send({ type: "STATE_LOADED", state: persistedState });
    // The machine's STATE_LOADED handler computes the resume target
    // and jumps via deferred transitions.
}, [open, persistedState]);
```

Recommend the `STATE_LOADED` event path — cleaner separation
between "wizard is opening" and "the machine knows where to start";
testable at actor-level.

### 5C. Conflict resolution

A `BookPublishingState` row may be stale relative to the Book
record (the user edited title/author/cover/keywords between wizard
sessions). On wizard open:

1. Load the publishing-state row.
2. Compare `book.updated_at` against `book_publishing_state.updated_at`.
3. If `book.updated_at > book_publishing_state.updated_at`:
   - Show a yellow banner at the top of the wizard:
     "Book metadata changed since the last validation. We'll
     re-run the metadata + cover checks."
   - Force the wizard to start at `metadata` (re-validate),
     regardless of what `launch_checklist_state` says.
   - After re-validation passes, normal resume kicks in from the
     last-incomplete subsequent step.

Cover-specific: if `book.cover_image` changed, the cover panel
re-validates client-side (it always does on mount; no special
handling needed). The banner is the user-facing signal.

### 5D. UI surface — BookMetadataEditor badge

A small "publishing-state" badge appears in the
BookMetadataEditor header next to the existing "Publish to KDP"
button. Shape:

```
[ KDP: 2 / 5 steps · resume ▸ ]    ← clickable, opens wizard at last step
[ KDP: not started · launch ▸ ]    ← when no publishing-state row exists
[ KDP: complete · review ▸ ]        ← when all steps green
```

Reads from `BookPublishingState.launch_checklist_state` JSON.
Optional polish for v1; the "Publish to KDP" button is sufficient
on its own. Filed as `KDP-WIZARD-RESUME-BADGE-01` (P3) if not
shipped in v1.

### 5E. Backend endpoints for persistence

New endpoints under `/api/kdp/publishing-state/{book_id}`:

- `GET /` — returns the row OR `{exists: false}` if no row yet.
- `PATCH /` — partial update (any subset of columns + `prices` /
  `launch_checklist_state` JSON merges).
- `DELETE /` — hard-delete the row + cascade ARC reviewers.
  Endpoint exists for "reset wizard" flow; not exposed in UI v1
  but available via API.

Pydantic schemas:

```python
class BookPublishingStateRead(BaseModel):
    id: str
    book_id: str
    royalty_plan: Literal["35","70"] | None
    kdp_select_enrolled: bool
    kdp_select_enrollment_date: datetime | None
    expanded_distribution: bool
    prices: dict[str, dict]      # JSON-decoded
    launch_checklist_state: dict[str, str]  # JSON-decoded
    publication_target_date: str | None
    last_kdp_upload_at: datetime | None
    created_at: datetime
    updated_at: datetime
    arc_reviewers: list[ArcReviewerOut]

class BookPublishingStateUpdate(BaseModel):
    royalty_plan: Literal["35","70"] | None = None
    kdp_select_enrolled: bool | None = None
    expanded_distribution: bool | None = None
    prices: dict[str, dict] | None = None
    launch_checklist_state: dict[str, str] | None = None
    publication_target_date: str | None = None
    last_kdp_upload_at: datetime | None = None
```

Service module: new `plugins/bibliogon-plugin-kdp/bibliogon_kdp/
publishing_state_service.py` holds the load/save/upsert logic.
Route handlers stay thin (per `coding-standards.md` "Routers are
thin").

### 5F. Auto-save failure handling

If a PATCH fails (network / server error), the wizard:
- Logs the error (no toast spam — the user just transitioned).
- Continues with in-memory state. Local context is authoritative
  during the session.
- On the NEXT successful transition, the auto-save retries the
  full snapshot. Eventually consistent.
- On wizard close: if the last save failed, show a single toast:
  "Some changes weren't saved. They'll sync next time you open
  the wizard." (Not blocking close.)

This is the "fail open" pattern from
`.claude/rules/lessons-learned.md` "Diagnostic features must fail
open" — persistence failure doesn't block the user's primary
workflow.

### 5G. A-N decisions surfaced from Track 5

- **A17 (auto-save granularity)**: Confirm save-on-every-transition.
  Alternative: explicit-save button (rejected: half-wired-UX risk).
  *[Recommend: auto-save]*
- **A18 (conflict-resolution banner)**: Confirm yellow banner +
  re-validate-now button when `book.updated_at >
  book_publishing_state.updated_at`. *[Recommend: yellow + auto-
  retrigger validation]*
- **A26 (resume step computation)**: Confirm `STATE_LOADED` event
  path (cleaner machine separation) vs dynamic `initial` state.
  *[Recommend: STATE_LOADED event]*
- **A27 (BookMetadataEditor badge for v1)**: Confirm DEFER badge
  to follow-up (`KDP-WIZARD-RESUME-BADGE-01` P3); v1 ships
  wizard-open-from-button path only. *[Recommend: defer badge]*
- **A28 (PATCH failure UX)**: Confirm "fail open" — log + retry on
  next transition; no blocking toast; close-time summary toast if
  the LAST save failed. *[Recommend: fail-open]*

---

## Track 6 — Session-Split Recommendation

### 6A. Commit sequence (14 commits, 2 sessions)

The XL scope is split at the **server-side foundation green**
boundary (end of C7). At that point all schema + endpoints are
in place, tests pass, no UI work has shipped. A natural rollback
+ resume point.

**Session 1 — Foundation (7 commits, green-per-commit)**

| # | Subject | Scope | LOC ± |
|---|---|---|---|
| C1 | `feat(kdp-wizard): kdpWizardMachine.ts + actor-level tests` | New `machines/kdpWizardMachine.ts` (~300 LOC) + `kdpWizardMachine.test.ts` (~280 LOC, 14-18 cases). ZERO React changes. | +580 |
| C2 | `refactor(kdp-wizard): KdpPublishingWizard to useMachine` | Replace useState step-index with useMachine. Step components' callback props update (`onCanAdvanceChange` → `onLoaded`/`onValidated`/`onFailed`). | -50 / +30 |
| C3 | `test(kdp-wizard): rewrite KdpPublishingWizard tests as integration` | 5 React-layer integration cases replace the 9 nav cases. | -200 / +100 |
| C4 | `feat(models): BookPublishingState + ArcReviewer tables` | Alembic migration `rf7a8b9cd0e1_...` + SQLAlchemy models + relationships. No endpoints yet. | +250 |
| C5 | `feat(plugin-kdp): publishing-state CRUD endpoints + service` | New `publishing_state_service.py` + GET/PATCH/DELETE routes + Pydantic schemas. Backend integration tests. | +400 |
| C6 | `feat(plugin-kdp): arc-reviewers CRUD endpoints` | POST/PATCH/DELETE + LIST routes. Backend integration tests. | +250 |
| C7 | `test(plugin-kdp): publishing-state + arc-reviewers integration` | Full pytest matrix: CASCADE on Book delete, UNIQUE on book_id, status-transition validation, 422 on invalid enum, etc. | +200 |

**Session 1 outcome**: Wizard runs on XState; server-side foundation
green; ZERO new user-visible features yet. The wizard still looks
like Phase 1 to the user.

**Session 2 — Features + persistence wiring (7 commits)**

| # | Subject | Scope | LOC ± |
|---|---|---|---|
| C8 | `feat(kdp-wizard): pricing.ts pure functions + tests` | `pricing.ts` + `pricing.test.ts`. Pure royalty math, no UI. Per-region constants. | +400 |
| C9 | `feat(kdp-wizard): PricingStep component + machine wiring` | Pricing step component + integration into kdpWizardMachine (new `pricing` state). Per-region inputs + computed-royalty display. | +500 |
| C10 | `feat(kdp-wizard): ArcStep component + CRUD wiring` | ARC step + add-reviewer form + per-row status select + mailto: link. Integration into machine (new `arc` state). | +600 |
| C11 | `feat(kdp-wizard): persistence wiring (load + auto-save)` | STATE_LOADED on wizard open; PATCH-on-transition useEffect; failure handling. | +300 |
| C12 | `feat(kdp-wizard): conflict-resolution banner` | Yellow banner when book.updated_at > publishing_state.updated_at. Re-validate trigger. | +150 |
| C13 | `i18n(kdp-wizard): Phase 2 strings × 8 catalogs` | Pricing + ARC + banner strings in DE/EN/ES/FR/EL/PT/TR/JA. Parity test guards. | +400 |
| C14 | `test(kdp-wizard): Playwright smoke for Phase 2 flow + close filings` | End-to-end Playwright spec for the full 5-step wizard. Close `KDP-PUBLISHING-WIZARD-01-PHASE-2` + `KDP-WIZARD-XSTATE-MIGRATION-01` + archive entries. | +200 |

**Total: 14 commits, ~+4000 LOC net across 2 sessions.**

### 6B. Commit independence + rollback boundaries

Per the active discipline "Atomic-green-per-commit-delta":

- **C1-C3 are independently green** (XState migration only;
  Phase 1 behavior preserved). Rollback boundary 1.
- **C4 is green standalone** (schema + models; nothing uses them
  yet). Rollback boundary 2.
- **C5-C6 are independently green** (endpoints land, integration
  tested; UI doesn't call them yet). Rollback boundary 3.
- **C7 is green standalone** (test coverage close-out).
- **C8 is independently green** (pure functions + tests; no UI).
- **C9-C10 add UI features** that depend on C1-C8 substrate. Not
  independently shippable WITHOUT C1-C8 below them.
- **C11-C12 wire persistence** — depend on C5-C6 endpoints + C9-C10
  UI.
- **C13-C14 close-out** — i18n + smoke + filings.

If Session 2 stalls after C10 (UI features done, persistence not
wired), the wizard is in a "Half-Wired-Visible-in-Production"
state: the user sees Pricing + ARC steps but their inputs vanish
on reload. **MUST NOT ship without C11** per the
`Half-wired feature lifecycle` rule.

### 6C. Session-1-to-Session-2 handover artifact

End of Session 1: write `docs/journal/next-session-handover-
{C7-date}.md` per the convention established by today's handover
(2026-05-22). Captures:

- HEAD SHA + commit range
- Test baseline (pytest + Vitest counts after C7)
- What's wired vs what's stub (C8-C14 still open)
- Resume-prompt for Session 2

### 6D. Why NOT one mega-session

- **Cognitive load**: 14 atomic commits exceeds the 5-commit
  stop-condition mentioned in `release-workflow.md`. Cross-cutting
  work (XState migration + schema + UI features + persistence)
  belongs in coordinated halves.
- **Pre-Inspection coverage**: Track 1 doesn't pre-audit the
  Pricing-step UX in depth (Track 3 covers the math, not the UX);
  Session 1's commits give time + a real-codebase substrate to
  pre-Inspect Session 2's UI shape against.
- **Two-session shape is the historical precedent**: per the
  handover doc, Phase 1 itself ran C0-C6 in one session; the
  Phase 2 scope is 2x larger.

### 6E. A-N decisions surfaced from Track 6

- **A19 (session boundary at C7)**: Confirm boundary after
  server-side foundation green (C4-C7 done). Alternative:
  boundary after C3 (XState only). Recommend C7 because the
  Session 1 deliverable is more cohesive ("wizard + server-side
  ready for UI features") than C3 alone ("XState migration with
  no follow-up scheduled"). *[Recommend: boundary at C7]*
- **A29 (Session 2 mega-commit C11+C12 merge)**: Confirm keeping
  C11 (persistence wiring) + C12 (conflict-resolution banner) as
  separate commits. Alternative: merge into one C11. Recommend
  SEPARATE — conflict resolution is a feature distinct from base
  persistence; bisect granularity matters if banner UX surfaces
  bugs. *[Recommend: separate]*

---

## Track 7 — A-N Adjudication Summary

Consolidated decision list across Tracks 1-6. **A6-A11 already
confirmed (defaults) per the 2026-05-22 turn between Track 1 and
Track 2.** A12-A29 surface for the same default-pattern
confirmation.

### Track 1 — XState Migration (A6-A11) — CONFIRMED 2026-05-22

| ID | Decision | Confirmed value |
|---|---|---|
| A6 | State graph topology | 5 steps + per-step error sub-states |
| A7 | Vitest migration strategy | Migrate wizard-nav to actor-level; keep step tests |
| A8 | BACK semantics | Linear (each state has one BACK target) |
| A9 | CANCEL semantics | Hard reset to `metadata` |
| A10 | Phase 1 MVP cutover | Replace outright (no flag) |
| A11 | ExportPackage GENERATE | Parent-passed `onGenerate` callback |

### Track 2 — Schema Design (A12-A13, A20)

| ID | Decision | Recommendation |
|---|---|---|
| A12 | JSON-as-Text vs typed sub-tables for `prices` + `launch_checklist_state` | JSON-as-Text (matches existing convention) |
| A13 | DB-level UNIQUE on `book_publishing_state.book_id` | UNIQUE constraint |
| A20 | `ArcReviewer` parent FK target | `book_publishing_state.id` (NOT `books.id`) |

### Track 3 — Pricing Calculator (A14-A15, A21-A22)

| ID | Decision | Recommendation |
|---|---|---|
| A14 | Regions hardcoded vs YAML-configurable | Hardcoded US/EU/UK/JP/IN for v1 |
| A15 | Client-side vs backend pricing endpoint | Client-side (matches CoverValidation pattern) |
| A21 | EPUB file size source for delivery-cost calc | Approximate + warning + file `KDP-PRICING-PRECISE-FILE-SIZE-01` P5 |
| A22 | Paperback page count source | Estimate from `chapters × 250` + user override |

### Track 4 — ARC Reviewer (A16, A23-A25)

| ID | Decision | Recommendation |
|---|---|---|
| A16 | Email integration scope | Out-of-scope v1; ship mailto: link only (`ARC-MAILTO-LINK-01` P5 follow-up) |
| A23 | ARC surface location | Wizard-only (no BookMetadataEditor tab) |
| A24 | `review_status` enum validation layer | Pydantic-only (DB stays `String(32)`) |
| A25 | Reviewer delete semantics | Hard-delete |

### Track 5 — Persistence Model (A17-A18, A26-A28)

| ID | Decision | Recommendation |
|---|---|---|
| A17 | Save granularity | Auto-save on every transition |
| A18 | Conflict-resolution banner shape | Yellow banner + re-validate-now trigger |
| A26 | Resume step computation | `STATE_LOADED` event path (not dynamic initial) |
| A27 | BookMetadataEditor resume badge for v1 | DEFER (file `KDP-WIZARD-RESUME-BADGE-01` P3) |
| A28 | PATCH failure UX | Fail-open: log + retry next transition; close-time summary toast if last save failed |

### Track 6 — Session-Split (A19, A29)

| ID | Decision | Recommendation |
|---|---|---|
| A19 | Session boundary | After C7 (server-side foundation green) |
| A29 | C11+C12 merge | Separate commits (bisect granularity) |

### Filings produced (independent of A-N defaults)

These backlog items are filed regardless of how A-N adjudicate:

- `KDP-PRICING-PRECISE-FILE-SIZE-01` (P5) — Precise EPUB file-size
  for delivery-cost calc (per A21).
- `ARC-MAILTO-LINK-01` (P5) — mailto: button on ARC reviewer rows
  (per A16).
- `KDP-WIZARD-RESUME-BADGE-01` (P3) — BookMetadataEditor badge
  showing wizard progress + resume button (per A27).
- `ARC-BOOK-METADATA-TAB-01` (trigger-gated; not filed unless
  smoke surfaces user demand per A23).
- `KDP-PRICING-EXPAND-REGIONS-01` (P5) — Add CA/AU/MX/BR/IT/ES/
  NL/FR to the regions catalog (per A14, when smoke surfaces
  demand).

### Decisions NOT surfaced (deliberate omissions)

The following pieces are NOT decisions — they're consequences of
the confirmed defaults or out-of-scope follow-ups:

- **Hardcover support**: out of v1 scope (per Track 3.B). Filed
  conceptually but no backlog item yet — file when first user
  surfaces hardcover-publish intent.
- **Multi-author ARC tracking**: out of v1 (assume single primary
  author). Multi-author authors-DB integration (Bug 8) is on a
  separate track.
- **i18n surface for KDP categories**: KDP_CATEGORIES list stays
  English-only (Amazon-dictated; not user-editable). Aligns with
  existing precedent.
- **Print-cost color preset (b&w vs color)**: pricing.ts defaults
  to b&w; user toggle is a wizard input. No separate decision —
  it's a calculator parameter, not a workflow choice.

### Stop-condition recheck (across all tracks)

| Stop condition | Triggered? |
|---|---|
| Schema design ambiguity affecting multiple models | No (Track 2 closes cleanly; CASCADE chain audited; 1:1 + N:1 well-defined) |
| XState machine design not cleanly mapping to wizard behavior | No (Track 1; 1:1 mapping of Phase 1 + clean extensions for Phase 2) |
| Pricing logic uncertainty | No (Track 3; KDP rules are public + stable; client-side calc) |
| Any finding contradicting Phase 1 Pre-Inspection assumptions | No (Phase 1 explicitly deferred this scope per A1; this audit extends, doesn't contradict) |

**No stop-conditions hit across Tracks 1-7.**

### Recommendation

Proceed with the 14-commit, 2-session implementation plan in
Track 6, contingent on user confirmation of A12-A29 defaults (or
any deltas).

---

## Audit cross-references

- Phase 1 Pre-Inspection: [docs/audits/kdp-publishing-wizard-pre-inspection-2026-05-24.md](kdp-publishing-wizard-pre-inspection-2026-05-24.md)
- Phase 1 handover: [docs/journal/next-session-handover-2026-05-22.md](../journal/next-session-handover-2026-05-22.md)
- Architecture: [docs/architecture/state-machines.md](../architecture/state-machines.md)
- Canonical machine: [frontend/src/components/import-wizard/machines/wizardMachine.ts](../../frontend/src/components/import-wizard/machines/wizardMachine.ts)
- Canonical machine tests: [frontend/src/components/import-wizard/machines/wizardMachine.test.ts](../../frontend/src/components/import-wizard/machines/wizardMachine.test.ts)
- Canonical modal-machine wiring: [frontend/src/components/import-wizard/ImportWizardModal.tsx](../../frontend/src/components/import-wizard/ImportWizardModal.tsx)
- Lessons-learned entry from Phase 1: `.claude/rules/lessons-learned.md` "Architecture-doc consultation is part of Pre-Inspection, not post-implementation discovery"

---

## Questions and assumptions (full audit)

**Evidence-based answers derived during this audit:**

- Canonical XState path is `frontend/src/<feature>/machines/<name>Machine.ts`
  ([state-machines.md:67](../architecture/state-machines.md#L67) +
  in-tree confirmation).
- Phase 1's `KdpPublishingWizard.tsx` step-index pattern maps 1:1
  to a 3-state machine (metadata → cover → export)
  ([KdpPublishingWizard.tsx:74-105](../../frontend/src/components/kdp-wizard/KdpPublishingWizard.tsx#L74-L105)).
- `onCanAdvanceChange` callback pattern becomes `onLoaded`/
  `onValidated`/`onFailed` per-step on migration.
- Vitest 1871 → ≈1885 with the migration (8-14 net new tests).
- Latest Alembic migration is `qe6f7a8b9cd0` (book_idea +
  expose); Phase 2 migration's `down_revision = "qe6f7a8b9cd0"`.
  Verified via `ls backend/migrations/versions/`.
- Existing model conventions verified across `Book`, `Page`,
  `ComicPanel`, `ComicBubble`, `Publication`, `Author` (String(32)
  IDs, JSON-as-Text for nested data, snake_case columns,
  CASCADE for parent-child, soft-delete only on `Book` + `Article`).
- KDP royalty rules (35% vs 70%, eligibility ranges, delivery cost
  formula) sourced from public KDP documentation; verified no
  legacy Bibliogon code carries these constants (grep clean across
  plugin-kdp).
- `Book.book_type` discriminator's ebook-vs-paperback support
  matrix derived from
  [plugins/bibliogon-plugin-kdp/bibliogon_kdp/package.py:451-469](../../plugins/bibliogon-plugin-kdp/bibliogon_kdp/package.py#L451-L469).
- 5-region selection (US/EU/UK/JP/IN) matches KDP's primary
  marketplaces. CA/AU/MX/BR/IT/ES/NL/FR exist on KDP but are
  filed as P5 expansion per A14.
- Auto-save-on-every-transition pattern is precedent-free in
  Bibliogon (no other surface persists to a DB row on every UI
  state change). Closest analog is the Editor's autosave-on-blur,
  which is debounced + scoped to chapter content. The KDP wizard's
  PATCH-per-transition is light (sub-second roundtrips, < 20 per
  full wizard flow) so debouncing isn't required.

**Parked questions**: none. All deferred items surface as
A6-A29 adjudication points or as filed backlog items
(`KDP-PRICING-PRECISE-FILE-SIZE-01`, `ARC-MAILTO-LINK-01`,
`KDP-WIZARD-RESUME-BADGE-01`).

**STOP-blocking questions encountered**: none.

---

End of Pre-Inspection.

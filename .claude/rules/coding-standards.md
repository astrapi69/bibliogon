# Coding standards

## General

- Developer: Asterios Raptis (solo developer, AI-assisted).
- Goal: pragmatic, maintainable, quickly deliverable. No over-engineering.
- When unclear: ask rather than guess.

## Python (Backend + Plugins)

- Python 3.11+, Poetry for dependency management.
- Type hints ALWAYS. No `Any` without a comment.
- Docstrings for public functions (Google style).
- pytest for tests. Prefer fixtures, no setUp/tearDown.
- Prefer async where FastAPI supports it.
- Import order: stdlib, third-party, local (isort-compatible).
- Pydantic v2 for schemas. Field validators instead of manual checks.
- HTML conversion: HTMLParser-based, NO regex for nested structures.

## TypeScript (Frontend)

- Strict mode enabled. No `any` without a comment.
- Interfaces for data models, types for unions/aliases.
- Functional components with hooks. No class components.
- Props defined as an interface.
- Extract complex logic into utility functions or the API client, not into components.
- Radix UI for dialogs, dropdowns, tooltips, tabs, select. No custom DOM handling for those.
- @dnd-kit for drag-and-drop. No manual DnD.
- Lucide React for icons. No other icon libraries.
- react-toastify for user feedback. No window.alert(), no console.log for user info.

## Naming

- Python: snake_case (files, functions, variables), PascalCase (classes).
- TypeScript: PascalCase (components, interfaces), camelCase (functions, variables).
- Plugin folders: bibliogon-plugin-{name} (kebab-case).
- Python package inside a plugin: bibliogon_{name} (snake_case).
- Events/hooks: snake_case (chapter_pre_save, export_execute).
- No I-prefix for interfaces. `Book`, not `IBook`.
- File formats: .bgb (backup), .bgp (project). Not .zip.
- No generic names: data, info, result, temp, item, obj, val, tmp, x are forbidden.
  Use instead: book_data, plugin_info, export_result, chapter_item.
  Exception: loop variables (i, j) and lambdas.

## Formatting

- No em-dash (-- or Unicode U+2014). Use hyphens (-) or commas.
- Standard UTF-8 characters only.
- No emojis in code or comments.
- Indentation: 4 spaces (Python), 2 spaces (TypeScript/CSS).
- Automatic formatting: ruff (Python), Prettier (TypeScript). See code-hygiene.md.
- Automatic linting: ruff (Python), ESLint (TypeScript). See code-hygiene.md.
- Pre-commit hooks enforce formatting and linting before every commit.

## Git

- Conventional Commits: feat:, fix:, refactor:, docs:, test:, chore:
- Provide a scope when it's clear: feat(export): ..., fix(editor): ...
- One commit per logical change, not everything in one.
- Branch naming: feature/{name}, fix/{name}, chore/{name}
- Do not add `Co-Authored-By` trailers attributing non-human
  collaborators (AI tools, automation bots, MCP agents). Human
  co-authors are attributed via the standard GitHub mechanism.
  Exceptions require an explicit note in the commit body
  stating who authorized the attribution.

## Function design and cohesion

### Ground rules

- Every function has exactly one responsibility.
- Max 40 lines per function. Anything over 50 is an immediate refactoring signal.
- Functions that do multiple things (parse AND save, validate AND transform) get split into separate functions.
- Indicator of low cohesion: comments like "# Step 1", "# Step 2", "# Now do X" inside a single function. Every step is its own function.

### Do not mix abstraction levels

- A function operates at ONE abstraction level.
- WRONG: db.query() and string formatting in the same function.
- RIGHT: a high-level function calls low-level helper functions.

### Route handlers

- routes.py contains ONLY routing logic: validate input, call a service, return the response.
- Business logic belongs in service modules or helper functions, NOT in route handlers.
- Different code paths (if/elif cascades for formats, types, etc.) get extracted into their own functions.

### Data between functions

- Shared data: a dataclass or TypedDict, NOT loose dicts passed around.
- Every extracted function must be individually testable without reconstructing the whole context.

### Crash early

- Catch invalid inputs at the start of the function, not deeply nested.
- Pydantic validation for API input.
- Guard clauses instead of deeply nested if/else.

**Anti-pattern (God Method):**
```python
# WRONG: 150+ lines, 8 responsibilities
@router.get("/{fmt}")
def export(book_id, fmt, ...):
    # load DB, load config, detect TOC, scaffold,
    # build filename, ZIP/audiobook/Pandoc, find cover, ...
```

**Right (decomposed):**
```python
# routes.py - ONLY routing
@router.get("/{fmt}")
def export(book_id, fmt, ...):
    validate_format(fmt)
    context = build_export_context(book_id, fmt, book_type, ...)
    return EXPORTERS[fmt](context)

# exporters.py - one function per format group
def export_project(ctx: ExportContext) -> FileResponse: ...
def export_audiobook(ctx: ExportContext) -> FileResponse: ...
def export_document(ctx: ExportContext) -> FileResponse: ...

# helpers.py - individually testable
def validate_format(fmt: str) -> None: ...
def detect_manual_toc(chapters: list[dict]) -> bool: ...
def build_filename(slug: str, book_type: str, suffix: bool) -> str: ...
def find_cover_image(project_dir: Path) -> str | None: ...
```

## DRY - Don't Repeat Yourself

- Same logic in two places: extract into a shared function.
- Same constants in two places: move them into a central file.
- Three duplicates: refactor immediately, not later.

**Specialisation for UI components: see "Recurring-Component Unification Rule" below.** The 3-duplicates threshold above is the general case; UI patterns get a stricter 2-surfaces threshold.

## Recurring-Component Unification Rule

Filed 2026-05-19 as a project-wide discipline. Supersedes the generic 3-duplicates threshold for UI patterns specifically.

**Rule:** when a UI pattern (component shape, hook composition, styling cluster) appears in 2+ surfaces, extract as a shared component AND migrate ALL existing usage-sites in the SAME coordinated session. No half-migration; no parallel implementations of the same pattern.

The threshold is **2 surfaces, not 3**, because UI duplication compounds visually: users notice when "the same thing" looks slightly different across screens. Test-fixture-only code-level duplicates may tolerate the 3-threshold (the original DRY rule); user-facing UI patterns do not.

### Why stricter than the general DRY rule

- **Visual drift cost:** the same author-select pattern with subtly different padding / dropdown ordering / checkbox-label across two surfaces looks like a bug to users, even when the code-level behavior is identical.
- **Test churn cost:** every duplicate Vitest covering the same pattern is repeated effort. Extraction lets the test live next to the component and cover all sites at once.
- **i18n drift cost:** duplicate UI patterns tend to grow duplicate i18n keys ("modal_author_label" vs "wizard_author_label"). A shared component has shared i18n keys.
- **Refactor inertia:** waiting for a 3rd usage to land means 2 sites are already migrated under the new pattern when extraction starts. Extracting at site #2 means only 1 site needs migration.

### What counts as a UI pattern

- A component shape with 2+ usage-sites that take the same conceptual props (e.g. `<AuthorSelectInput value={} onChange={} suggestions={} addToDbChecked={} ...>` across the create-modal + wizard + editors).
- A hook composition reused for the same purpose (e.g. `useTrashViewMode` + `viewMode` toggle UI pattern across Articles + Books).
- A styling cluster that's been copy-pasted into multiple components (e.g. the bulk-action-bar layout across Article + Book + Comment dashboards).

### What does NOT count (the rule does not fire)

- Two surfaces with similar SHAPE but genuinely different SEMANTICS (e.g. the AD `BulkActionBar` and a hypothetical Comments-Admin `EmptyState` — different concerns, similar visual layout).
- One-off components in test fixtures or development tooling.
- Backend pattern duplication (covered by the generic DRY rule).

### Pre-Inspection for new UI components

Before adding ANY new UI component:

1. **Grep the codebase for similar patterns.** Recipes:
   ```bash
   # Component shape: search for distinctive JSX + state combos
   grep -rln "useState.*[Aa]uthor\|<input.*list=" frontend/src --include="*.tsx"
   # Hook composition: search for distinctive hook chains
   grep -rln "useSelection\|useViewMode" frontend/src --include="*.tsx"
   # Styling cluster: search for distinctive class combinations
   grep -rln "bulkActionBar\|filterBar" frontend/src --include="*.tsx"
   ```
2. **If a similar pattern exists in 1+ surface:** extract first (per this rule), THEN apply at the new surface. Do not add a second instance.
3. **If no similar pattern exists:** ship the component as a single-site implementation. The 2-surfaces threshold fires when the SECOND surface needs it.
4. **Document the audit step** in the session journal or commit message so future contributors can verify the Pre-Inspection happened.

This is the same "use what already exists" principle applied at component-level. Same intent as the architecture rule "Before writing custom code, ALWAYS check whether an official TipTap extension exists".

### Session shape for extraction-plus-migration

When the rule fires at the second-site landing:

1. **Audit commit (docs-only):** grep for all surfaces, list candidates, document the API surface inferred from all sites' use cases.
2. **Component commit:** new shared component + Vitest covering the component in isolation.
3. **Migration commits (one per surface):** rewrite each site to use the new component. Existing site-level tests should still pass; updated where shape changed.
4. **E2E commit:** Playwright smoke that exercises all migrated surfaces.
5. **Backlog filing:** if the audit surfaced related candidates, file them as separate items so the next contributor knows about them.

Typical shape: 4–7 commits. The 5-commit stop-condition in `release-workflow.md` may be exceeded for extraction-plus-migration work because half-migration is forbidden by this rule — better to ship 7 coherent commits than 5 leaving the codebase in mixed state.

### Detection backlog

Audit candidates already known at filing time:

- `AUTHOR-SELECT-INPUT-EXTRACT-01` (P3) — closes together with `AUTHOR-DATALIST-EXTEND-EDITORS-01` (P3). This rule's canonical first-application.
- `LIST-VIEW-ROW-SHARED-EXTRACTION-01` (P3) — duplicate ArticleRow + BookListView row shape.
- `ARTICLEFILTERBAR-EXTRACT-01` — extract Articles-side inline filter bar to a shared component (currently 200-LOC inline duplicate of `DashboardFilterBar`).

A broader `RECURRING-COMPONENT-AUDIT-01` (filed alongside this rule) sweeps the frontend for additional candidates.

### Tension with "Don't add features beyond what the task requires"

The general system prompt rule "Don't add features, refactor, or introduce abstractions beyond what the task requires" still applies — but ONLY when there are zero existing usage-sites. The Recurring-Component Unification Rule fires when there ARE existing sites; in that case the "use what already exists" principle takes precedence over the "don't add abstractions" principle. The abstraction isn't speculative when 2+ concrete instances drive the API.

## Tailwind-first for visual consistency

Updated 2026-06-05. **Supersedes the former "CSS-first" rule** (filed 2026-05-30), which predated the Tailwind v4 migration.

**All new visual/layout work goes through Tailwind utilities and Tailwind config.** No new entries in `global.css`. No raw CSS, no custom `@media` blocks, no `<style>` tags for layout logic. Existing `global.css` classes remain (do not migrate retroactively) but are NOT extended. New shared styles use Tailwind utilities, `@apply` directives in the Tailwind CSS file, or Tailwind config extensions.

Why Tailwind-first does not introduce a second color system (and keeps `make verify-theme` authoritative):

- `frontend/src/styles/tailwind.css` maps every Tailwind color utility onto the existing `var(--*)` tokens (`bg-primary` → `var(--accent)`, `text-foreground` → `var(--text)`, …) via `@theme inline`, and clears Tailwind's default palette (`--color-*: initial`) so a hardcoded-color escape hatch like `bg-red-500` cannot be generated. A Tailwind color utility is just another way to reference a theme token.
- Preflight is omitted, so Tailwind adds no base reset; the existing `global.css` remains the base layer for the surfaces it already styles.

What this rule forbids:

- **New or extended `global.css` entries** for a component/surface look. Use a Tailwind utility, an `@apply` directive in the Tailwind CSS file, or a Tailwind config extension instead.
- **Inline `style={{}}` for anything themable** (color, background, border, radius, padding-that-matches-a-token). Inline `style` is acceptable ONLY for genuinely dynamic/computed values (a drag-positioned `transform`, a data-driven `width: ${pct}%`, an image `background-image: url(...)`).
- **Hardcoded hex / rgb** anywhere — including the Tailwind-shaped `bg-[#16a34a]`. Use the semantic utility (`bg-success`) or a `[prop:var(--token)]` arbitrary value for non-color tokens (`rounded-[var(--radius-md)]`). The data-color exemptions (storyboard mood presets, comic-bubble convention defaults) are allowlisted in `scripts/check_hardcoded_colors.py`.

Existing-surface policy: the legacy `global.css` classes (`.btn*`, `.input`, `.slider`, `.radix-select-trigger`, `.badge*`, `.card*`) and the shared components that render them (`Toggle`, `RadixSelect`, `Badge`, `AppDialog`, …) stay in place and remain the right thing to REUSE when touching an already-styled surface — but they are frozen: no new classes, no extensions. New reusable primitives live under `src/components/ui/*`, built from Tailwind/shadcn.

This rule is the visual-layer counterpart of the Recurring-Component Unification Rule: that one unifies component *shape*; this one unifies component *look*.

## Test Quality Rule

Passing unit tests != working feature. Every critical user flow needs at
least one integration test that exercises the real path with minimal
mocking.

When fixing a bug: the regression test must exercise the same path a user
would. If the test passes with the bug still present, the test is wrong.
Before claiming a regression test, confirm it FAILS on the pre-fix code
(or would fail if the bug were reintroduced) — a test that is green
either way proves nothing.

Mock only true external boundaries (network calls to third-party APIs,
the clock, the filesystem when isolation demands it). Do NOT mock the
layer the bug lives in: an API-contract bug needs a `TestClient` test
that calls the real endpoint; a data-integrity bug needs the real DB
round-trip; a UI-wiring bug needs a render-and-interact test.

Every Playwright E2E spec is part of the release gate. "Written for
Aster to run" is not "deferred" — it is mandatory before release (see
release-workflow.md "Pre-Release Gate"). UI-visibility bugs that a
component test cannot catch (CSS positioning, z-index, real-browser
layout) MUST ship a Playwright spec, flagged for Aster to run.

## Boy Scout Rule

- Leave code cleaner than you found it. Small improvements on every change.
- This also applies to Claude Code: if you touch a function and it violates rules, fix the violation along with it.

## Error reporting

Error details must be precise enough that a GitHub Issue built from them is directly actionable, without follow-up questions.

Chain: BibliogonError -> API response (detail + traceback) -> ApiError -> toast with "Report issue" -> GitHub Issue

- No `except` without logger.error(). Never swallow an exception.
- Exception detail must contain the reason, not just the function name.
- Services: include str(e) in BibliogonError subclasses (NOT HTTPException, see code-hygiene.md).
- In debug mode: include the stacktrace in the response (global exception handler in main.py). Consumed by the "Report issue" button as the issue body.
- On the frontend: pass the ApiError object to toast.error(), not just a string.
- "Report issue" button in the toast: opens a GitHub Issue with title (error detail), body (stacktrace, browser, app version).
- Generic error messages like "Export failed" or "Import failed" without details are FORBIDDEN. They make GitHub Issues worthless.
- Every fetch call on the frontend must throw ApiError on failure, not Error.

## Tests

- Backend: pytest. Plugin tests in plugins/{name}/tests/.
- Frontend: Vitest (happy-dom).
- E2E: Playwright.
- Mutation testing: mutmut (Python).
- New endpoints: at least one happy-path test.
- Bug fixes: failing test FIRST, then fix.
- Mocking: mock external services (LanguageTool, Pandoc), no real calls in tests.
- `make test` must stay green after every change.
- Surviving mutants in critical code: add tests. In trivial code: ignore.
- See quality-checks.md for the full test strategy and mutmut configuration.

## Touch targets (TOUCH-TARGETS)

Synced from adaptive-learner (2026-06-05). NON-NEGOTIABLE.

Every interactive element (button, link, icon-button, toggle, select trigger,
drag handle, list-row tap area) MUST present a touch target of at least
**44x44px**. This is the WCAG 2.5.5 / Apple HIG minimum and matters for the
phone/tablet surfaces (LAN Mode + the offline PWA) that Bibliogon now serves.

- Icon-only controls need padding (or an explicit min-size) to reach 44px even
  when the glyph is smaller; do not rely on the glyph box.
- A visually smaller control is acceptable only if its hit area is enlarged
  (e.g. an invisible padding / pseudo-element) to 44px.
- New components ship at >=44px from the start; this is not a later a11y pass.

## Backup parity (BACKUP-PARITY-PIN)

Synced from adaptive-learner (2026-06-05). Bibliogon already practises this
since the v0.45.0 `.bgb` overhaul (introspection-driven
`serialize_row`/`restore_row`); this formalises it as a named rule.

Structural parity must hold across the three persistence paths:
**export == restore == sync**. The same set of models/columns that a feature
writes to the DB must also be carried by `.bgb` export, reconstructed by
import, and (where applicable) replayed by the offline sync queue.

- **Round-trip test:** every backup-touching change ships a
  create -> export -> wipe -> import -> compare test that asserts the restored
  state equals the original (not just "import returns 200").
- **FK-order pins:** restore inserts parents before children
  (Book before Chapter/Page, StoryEntity before StoryEntityPageLink, etc.);
  a test pins the order so a reshuffle can't reintroduce an integrity error.
- When a new model/column is added, extend the backup serializer in the SAME
  change - a column the DB has but `.bgb` lacks is silent data loss on restore.

## Synced-rule reconciliation notes (2026-06-05)

Two adaptive-learner rules conflicted with standing Bibliogon directives. Both
were adjudicated by the user on 2026-06-05 and are now RESOLVED:

- **FUNKTION-NICHT-VERFUEGBAR** (AL: render nothing for an unavailable
  function) is **overridden for Bibliogon** in favour of "disable + explain,
  do not hide". See architecture.md "Dexie-mode rule" for the full override
  rationale.
- **TAILWIND-ONLY / no new `global.css` entries** is **adopted**: the former
  "CSS-first" rule above is replaced by "Tailwind-first for visual
  consistency". New visual/layout work goes through Tailwind; `global.css` is
  frozen (existing classes reused, never extended).

## Security

- Never commit BIBLIOGON_SECRET_KEY.
- .env files in .gitignore.
- License keys only through LicenseStore (backend/app/licensing.py).
- Validate user uploads (file type, size) before storage.
- Plugin ZIP installation: name validation + path traversal check.

## Performance

- SQLite is single-writer. Minimize writes, batch where possible.
- TipTap JSON can get large. Autosave with debounce (not on every keystroke).
- Plugin loading at app startup. Lazy-load plugin UI where possible.

## Dependencies

New dependencies only after asking. Existing stack:

Backend: FastAPI, SQLAlchemy, Pydantic v2, pluginforge, manuscripta, PyYAML, markdown (MD->HTML)
Frontend: React 18, TypeScript, TipTap (15+1 extensions), Vite, Radix UI, Tailwind v4 (@tailwindcss/vite, token-mapped, Preflight-omitted) + shadcn/ui (clsx + tailwind-merge), @dnd-kit, Lucide, react-toastify
Testing: pytest, Playwright, Vitest, mutmut (Python mutation testing)
Linting/formatting: ruff (Python), ESLint + Prettier (TypeScript), pre-commit
Tooling: Poetry, npm, Docker, Make

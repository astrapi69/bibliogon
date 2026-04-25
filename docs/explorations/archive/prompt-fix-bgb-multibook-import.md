# Bug Fix: BGB Multi-Book Import Regression

## Context

User reports regression: when a `.bgb` backup file contains
multiple books, only ONE book is imported. Previous behavior
imported all books from the backup.

This is a regression introduced sometime during the
CIO-01..CIO-08 import orchestrator work. The new wizard's
preview panel was designed for single-book import; multi-book
BGBs got truncated to the first book during the migration.

User's intent: restore multi-book import. UX consistent with
recent decisions (user selects with default-all-on, list view
not per-book detail preview).

---

## Scope

5-7 atomic commits. Estimated 4-6 hours.

Backend: extend `.bgb` handler to surface book list in
DetectedProject, execute multiple books from selected list.

Frontend: wizard Step 3 detects multi-book BGB and renders
book selection list instead of single-book preview.

---

## Architectural principles

**Backward compatible:** single-book BGBs continue to use the
existing single-book preview UI. Only multi-book BGBs trigger
the new list view.

**Default all-on:** consistent with field-selection wizard
pattern. User can deselect individual books.

**No detail editing in multi-book mode:** title/author/etc.
edits happen in the single-book Metadata Editor after import.
Multi-book wizard is a pure import gate, not a detail editor.

**Preserve duplicate detection:** each book in the BGB gets
its own duplicate check. User sees per-book duplicate status
in the list.

---

## Part 1: Audit

Before any change, confirm current state.

```bash
grep -n "books\|book_list\|multi" \
  backend/app/import_plugins/handlers/bgb.py
grep -n "Book(\|book =\|create" \
  backend/app/services/backup/backup_import.py
```

Report:
- How does the .bgb format encode multiple books today?
  (manifest.json with array? Multiple book.json files?)
- Where does the current handler iterate or fail to iterate
  the books array?
- What is `DetectedProject` populated with when input is a
  multi-book BGB? (Likely just the first book's data.)
- Does the legacy /api/backup/import endpoint (deprecated in
  CIO-05) handle multi-book correctly? Confirms previous
  behavior shape.

Identify the exact code path where multi-book degrades to
single-book.

---

## Part 2: DetectedProject extension for book list

Extend `DetectedProject` schema to carry an optional book
list:

```python
class DetectedBookSummary(BaseModel):
    """Lightweight summary of a book in a multi-book backup."""
    title: str
    author: str
    subtitle: Optional[str] = None
    chapter_count: int
    has_cover: bool
    source_identifier: str  # for per-book duplicate detection
    duplicate_of: Optional[str] = None  # existing Book.id if
                                        # already imported

class DetectedProject(BaseModel):
    # existing single-book fields stay populated for
    # single-book BGBs
    # ...

    # New for multi-book:
    books: Optional[list[DetectedBookSummary]] = None
    is_multi_book: bool = False
```

Non-breaking: defaults to None and False. Single-book BGBs
continue to use the existing scalar fields. Multi-book BGBs
populate `books` and set `is_multi_book = True`.

### Tests

- Single-book BGB: books is None, is_multi_book False,
  scalar fields populated as before
- Multi-book BGB: books has all entries, is_multi_book True,
  scalar fields may be None or hold the first book's data
  (consistency with audit findings)

### Commit 1

```
feat(import): DetectedProject carries multi-book list

Backup files containing multiple books now surface the full
list in DetectedProject.books with per-book summary and
duplicate-detection results. Single-book BGBs continue to
populate scalar fields unchanged.

Non-breaking schema extension.
```

---

## Part 3: BGB handler iterates all books

Update `backend/app/import_plugins/handlers/bgb.py`:

`detect()`:
- Open ZIP, read manifest
- If manifest has multiple books: populate
  `detected.books` and `detected.is_multi_book = True`
- For each book, compute its source_identifier (per-book hash
  of book.json content, or position-based if content is the
  same)
- Run duplicate check for each book against
  `BookImportSource`
- Single-book BGBs: existing scalar-field path continues
  unchanged

`execute()`:
- Read new override key `selected_books` (list of
  source_identifiers user wants to import)
- If multi-book: iterate `selected_books`, create each Book
  with chapters and assets
- If single-book: existing single-book path (no changes)
- Each book gets its own `BookImportSource` row

### Tests

- Multi-book BGB detect: returns full list, all books
  surfaced
- Single-book BGB detect: scalars populated, books is None
- Multi-book execute with all selected: all books created
- Multi-book execute with subset selected: only selected
  books created
- Multi-book execute with none selected: returns 400 error
  (must select at least one)
- Per-book duplicate check works correctly

### Commit 2

```
feat(import): BGB handler iterates all books in multi-book backups

Detect surfaces all books with per-book duplicate status.
Execute respects selected_books override; creates each book
with its own BookImportSource row.

Resolves regression where multi-book BGBs imported only the
first book.
```

---

## Part 4: Frontend — multi-book detection in wizard

Update `frontend/src/components/import-wizard/steps/PreviewStep.tsx`:

Branch on `detected.is_multi_book`:

```tsx
{detected.is_multi_book ? (
  <MultiBookList
    books={detected.books}
    selectedIds={selectedBookIds}
    onSelectionChange={setSelectedBookIds}
  />
) : (
  <SinglePreviewPanel detected={detected} ... />
)}
```

### MultiBookList component

```
frontend/src/components/import-wizard/steps/MultiBookList.tsx
frontend/src/components/import-wizard/steps/MultiBookList.test.tsx
```

UI:
- Header: "{count} books in this backup"
- Bulk action bar: "Select all / Deselect all"
- List rows, one per book:
  - Checkbox (default checked)
  - Title (large)
  - Author (medium)
  - Subtitle (small, if present)
  - Metadata badges: chapters count, cover indicator
  - Duplicate banner if `duplicate_of` is set, with
    per-book duplicate action (skip / overwrite)
- Footer: count of selected books, "Import N books" button

Selecting/deselecting updates `selectedBookIds` state. Default
state: all book IDs selected.

For duplicates:
- Per-book duplicate dropdown: "Skip / Overwrite / Create new"
- Default: "Skip" (avoids accidental overwrite)

### Tests

- Renders all books
- Default selection is all-on
- Select-all and deselect-all work
- Per-book selection updates state
- Per-book duplicate handling renders correctly
- Import button disabled if zero selected

### Commit 3

```
feat(import): wizard renders book list for multi-book BGBs

When detected.is_multi_book is true, Step 3 shows a list of
books with per-book selection checkboxes. Single-book imports
unchanged (existing preview panel).

Bulk select-all/deselect-all. Per-book duplicate handling.
Import disabled with zero selected.
```

---

## Part 5: Wizard execute flow update

Wizard's execute call passes `selected_books` array of
source_identifiers when in multi-book mode:

```typescript
type Overrides = {
  // existing fields
  selected_books?: string[];          // multi-book mode only
  per_book_duplicate?: Record<string, "skip" | "overwrite" | "create_new">;
};
```

Backend execute respects these.

For single-book mode: no change, existing path continues.

### Tests

- Multi-book execute with selected_books sends correct payload
- Backend creates only selected books
- Per-book duplicate handling sent and respected
- Single-book mode unchanged

### Commit 4

```
feat(import): execute respects selected_books for multi-book imports

Wizard's execute call carries selected_books and
per_book_duplicate when in multi-book mode. Backend creates
only selected books with their per-book duplicate decisions.

Single-book mode unchanged.
```

---

## Part 6: i18n

Add new strings to 8 languages:

```yaml
import_wizard:
  multi_book_count: "{count} books in this backup"
  multi_book_select_all: "Select all"
  multi_book_deselect_all: "Deselect all"
  multi_book_chapters_label: "{count} chapters"
  multi_book_has_cover: "Has cover"
  multi_book_no_cover: "No cover"
  multi_book_duplicate_label: "Already imported"
  multi_book_duplicate_action_skip: "Skip"
  multi_book_duplicate_action_overwrite: "Overwrite"
  multi_book_duplicate_action_create_new: "Create new copy"
  multi_book_selected_count: "{count} of {total} books selected"
  multi_book_import_button: "Import {count} books"
  multi_book_no_selection: "Select at least one book to import"
```

Machine-translate per existing AUTO_TRANSLATED.md pattern.

### Commit 5

```
i18n(import): multi-book wizard strings in 8 languages

13 new keys for the multi-book BGB import flow. Tracked
in AUTO_TRANSLATED.md for native review.
```

---

## Part 7: Help docs

Update import help docs (en + de minimum) to mention
multi-book BGB support.

### Commit 6

```
docs(import): help docs note multi-book BGB import
```

---

## Part 8: Tests

End-to-end tests covering:

- Multi-book BGB upload
- Detection returns all books
- Selection of all books → all imported
- Selection of subset → only those imported
- Selection of zero → error
- Duplicate handling per book
- Backward compat: single-book BGB still works as before

### Commit 7

```
test(import): multi-book BGB end-to-end coverage

Adds Vitest + backend tests for multi-book detect, multi-book
execute with various selection combinations, duplicate
handling per book, and backward compatibility with single-book
BGBs.
```

---

## Verification

```bash
cd backend && poetry run pytest 2>&1 | tail -10
cd frontend && npm run test 2>&1 | tail -10

# Manual smoke
# 1. Create or use a multi-book .bgb (export multiple books
#    from current Bibliogon)
# 2. Import via new wizard
# 3. Verify list shows all books
# 4. Select subset, import
# 5. Verify only selected books in dashboard
# 6. Re-import same .bgb, verify per-book duplicate detection
```

---

## Out of scope

- Per-book detail editing in wizard (chapter renames, asset
  reassignment, etc.) — happens post-import in Metadata Editor
- Reordering books in the list
- Filtering / searching the book list (defer until count
  warrants it)
- Batch metadata operations across selected books
- Other multi-entity formats (only BGB; markdown-folder,
  ZIP, git URL all stay single-book)
- Single-book BGB UI changes
- Settings or schema changes beyond the additive ones above

---

## Stop conditions

- BGB format doesn't actually support multi-book at the file
  level — STOP and reconsider
- Existing backup_import.py heavily entangles with Book
  creation in ways that resist iteration — split into a
  separate refactoring task
- Per-book duplicate detection requires schema changes to
  BookImportSource — STOP, discuss
- Any commit exceeds 90 minutes — split, atomic boundary
- Session real work exceeds 5 hours — stop at clean commit

---

## Closing checklist

- [ ] Multi-book BGB detection populates books list
- [ ] Single-book BGB detection unchanged
- [ ] Wizard renders MultiBookList for multi-book imports
- [ ] Per-book selection works
- [ ] Per-book duplicate handling works
- [ ] Selected books created on execute
- [ ] Bulk select-all/deselect-all functional
- [ ] All existing tests pass
- [ ] Multi-book test coverage added
- [ ] i18n in 8 languages
- [ ] Production DB untouched (tripwire active)
- [ ] Atomic commits with Co-Authored-By

Report:
- Commit hashes
- Test counts before/after
- Any deferred items
- Confirmation that single-book BGB import is unchanged
- How the regression was actually introduced (which commit
  truncated the books array)

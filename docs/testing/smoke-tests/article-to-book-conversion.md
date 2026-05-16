# Smoke Test: Article-to-Book Conversion

**Shipped:** 2026-05-15 (Phase 1+2+3 + post-audit WARN fixes)
**Commits:**
- `64ffbd4` (Phase 1: backend `POST /api/books/from-articles` + 37 integration tests)
- `b002a54` (Phase 2.A: API client types + method)
- `9261acd` (Phase 2.B: `ConvertToBookWizard` component, 6 steps)
- `acfb251` (Phase 2.C: wire wizard into `ArticleBulkActionBar` + `ArticleList`)
- `e5668ac` (Phase 2.D: 12 Vitest specs)
- `aeac4db` (Phase 2.E: 52-key i18n namespace across 8 languages)
- `7440564` (Phase 2.F: 3 Playwright smoke specs)
- `8e10942` (Phase 3.1: bilingual help doc)
- `26c77c1` (post-audit WARN fixes: aria-label i18n + focus management + toast-with-CTA)

**Reference:**
- Help doc: [docs/help/en/articles/convert-to-book.md](../../help/en/articles/convert-to-book.md)
- Manual test guide: [article-to-book-conversion-manual.md](./article-to-book-conversion-manual.md)
- Backend endpoint: `backend/app/routers/books.py` (`/from-articles`)
- Frontend wizard: `frontend/src/components/articles/ConvertToBookWizard.tsx`
- E2E pin spec: `e2e/smoke/convert-to-book.spec.ts`

## Overview

- **Feature:** Article-to-Book Conversion
- **Surface:** ArticlesList bulk-action bar → `ConvertToBookWizard` (6-step Radix Dialog) → new Book in BookEditor
- **Backend:** Transactional `POST /api/books/from-articles` endpoint
- **Last verified:** 2026-05-15 (initial ship)

## Prerequisites

- Bibliogon dev backend + frontend running (`make dev`)
- At least 3 articles in Articles-Dashboard (`/articles`); ideally with mixed tags + shared series for stress coverage
- Optional: the 209-article Medium-imported corpus available for the 22-article stress test
- Browser open on `/articles`

## Smoke-Test Steps

Each test is deterministic: every check is a verifiable visual or DOM assertion. Run in order; later tests assume the earlier ones pass.

### Test 1: Happy-Path Single-Article

1. Open `/articles`.
2. Select exactly one article via row checkbox (`article-bulk-check-{id}`).
3. **Verify:** bulk-action bar appears with "1 ausgewählt" / "1 selected" count.
4. **Verify:** "Als Buch" / "As book" button (testid `article-bulk-convert-to-book`) is visible AND enabled.
5. Click the button.
6. **Verify:** Wizard opens at Step 0 (Selection); the selected article appears as a sortable row (`convert-to-book-wizard-selection-row-{id}`).
7. **Verify:** Sort-strategy dropdown (`convert-to-book-wizard-selection-sort-strategy`) is visible.
8. **Verify (if article has tags):** Tag-helper buttons appear under the sort dropdown.
9. Click "Weiter" / "Next" → reaches Step 1 (Metadata).
10. **Verify (Q13 pre-fill):** Subtitle field's placeholder equals the source article's subtitle (if non-null).
11. **Verify (Q15 pre-fill):** Cover-info banner (`convert-to-book-wizard-metadata-cover-info`) is visible IF the article has `featured_image_url`; HIDDEN otherwise.
12. **Verify (A2 fix):** Focus has automatically landed on the Title input.
13. Type Title: `Test Single-Article Book`.
14. Type Author: `Test Author`.
15. Click "Next" → Step 2 (Front-Matter). Click "Überspringen" / "Skip".
16. Step 3 (Back-Matter). Click "Skip".
17. Step 4 (Chapter Settings). **Verify:** "Use article title as chapter title" toggle is ON by default.
18. Click "Next" → Step 5 (Review). **Verify:** summary shows "1 chapter" total.
19. Click "Buch erstellen" / "Create book" (`convert-to-book-wizard-review-confirm`).
20. **Verify:** brief loading state inside the wizard (the Convert button text changes to "Wird konvertiert ..." / "Converting ...").
21. **Verify (I1 fix):** wizard closes AND a success toast appears with a "Buch öffnen" / "View book" CTA (`convert-to-book-success-view-book`).
22. **Verify:** browser URL is still `/articles` (NO auto-navigate).
23. Click the toast's "View book" CTA.
24. **Verify:** browser navigates to `/book/{new-id}`.
25. **Verify:** BookEditor renders the new book with exactly 1 chapter whose title equals the source article's title.
26. Navigate back to `/articles`.
27. **Verify (decoupled lifecycle):** the source article is still visible on the dashboard, NOT in trash, with `deleted_at` unset.

### Test 2: Multi-Article with Front-Matter + Back-Matter

1. Open `/articles`. Select 3-5 articles via row checkboxes.
2. **Verify:** bulk-action bar shows the correct count.
3. Click "As book" → wizard opens at Step 0.
4. Verify each selected article appears as a row.
5. **(Drag-reorder test)** Drag the first row to the last position via the GripVertical handle.
6. **Verify:** the row order in the list updates AND the sort dropdown switches from "Datum (alt zuerst)" to "Manuell".
7. Click "Next" → Step 1.
8. **Verify (multi-article):** subtitle field has NO placeholder pre-fill.
9. **Verify (multi-article):** cover-info banner is HIDDEN.
10. Fill Title `Test Multi-Article Book`, Author `Test`.
11. Click "Next" → Step 2 (Front-Matter).
12. Check "Titelseite" / "Title page" toggle.
13. Check "Widmung" / "Dedication" toggle; type `For testing` in the textarea.
14. Check "Einleitung" / "Introduction" toggle; type `This is a test introduction.`
15. Click "Next" → Step 3 (Back-Matter).
16. Check "Danksagung" / "Acknowledgments" toggle; type `Thanks to nobody.`
17. Click "Next" → Step 4. Click "Next" → Step 5.
18. **Verify:** review screen shows chapter total = (selected count) + 3 front-matter + 1 back-matter.
19. Click "Create book".
20. Click the toast's "View book" CTA → navigate to `/book/{new-id}`.
21. **Verify:** chapter list order is `title_page → dedication → introduction → chapter × N → acknowledgments`.
22. **Verify:** the dedication chapter's content matches the typed text (wrapped as a single TipTap paragraph).

### Test 3: Validation Gates (422 routing back to Step 0)

This test exercises the backend's Q10/Q11 validation gates. Easiest path: trash one article first, then attempt to convert it.

1. Pick one article on `/articles`, use the row menu to "In Papierkorb verschieben" / "Move to trash". Confirm the article moved.
2. Open the trash view (`/articles` → Trash tab) and copy the trashed article's id from the URL or backend log.
3. Open `/articles`. Select 2 live articles + 1 live article you'll NOT convert.
4. With the developer tools' Network tab open, click "As book" → fill Title + Author → reach Step 5 → click "Create book".
5. **Substitution:** before the request fires, intercept the POST to `/api/books/from-articles` and inject the trashed article's id into `article_ids`. Alternatively, run this raw cURL after capturing a fresh CSRF/cookie:
   ```bash
   curl -X POST http://localhost:8000/api/books/from-articles \
     -H "Content-Type: application/json" \
     -d '{"title":"Should 422","author":"T","article_ids":["<trashed-article-id>"]}'
   ```
6. **Verify (API):** response is HTTP 422 with body shape:
   ```json
   {"detail": {"code": "invalid_articles", "trashed": [{"id": "...", "title": "..."}], "non_article": [], "not_found_ids": []}}
   ```
7. **Verify (UI):** wizard rewinds to Step 0 AND renders the validation banner (`convert-to-book-wizard-validation-banner`) listing every offending row title.
8. Remove the trashed article from the selection (via the row's X button).
9. Re-submit. **Verify:** conversion succeeds normally.

### Test 4: Empty-Author Client-Side Gate

1. Open `/articles`. Select 1 article. Click "As book".
2. Click "Next" → Step 1.
3. Type Title, leave Author empty.
4. **Verify:** "Next" button on Step 1 is DISABLED (greyed out).
5. **Verify:** the Author field shows the "Autor ist erforderlich" / "Author is required" inline error.
6. Type Author.
7. **Verify:** "Next" button is now ENABLED.

### Test 5: Tag-Helper Quick-Selection

1. Pre-condition: have 3+ articles share a common tag (e.g. `living-health`).
2. Open `/articles`. Select 5+ articles INCLUDING all 3 with the common tag PLUS 2 without it.
3. Click "As book" → wizard opens at Step 0.
4. **Verify:** the tag-bar (`convert-to-book-wizard-selection-tag-bar`) shows the common tag with its count (e.g. "living-health (3)").
5. Click the tag button (`convert-to-book-wizard-selection-tag-{tag}`).
6. **Verify:** the row list narrows to ONLY the 3 articles carrying that tag.
7. **Verify:** the "Zurücksetzen" / "Reset" button (`convert-to-book-wizard-selection-reset`) appears.
8. Click "Reset".
9. **Verify:** the full 5-article selection is restored.

### Test 6: Sort-Strategy Changes

Pre-condition: 3+ articles with distinct titles + distinct `created_at` timestamps.

1. Open `/articles`. Select 3 articles. Click "As book" → Step 0.
2. Set sort dropdown to "Datum (alt zuerst)" / "Date (oldest first)". **Verify:** rows ordered oldest → newest.
3. Set sort dropdown to "Datum (neu zuerst)" / "Date (newest first)". **Verify:** rows ordered newest → oldest.
4. Set sort dropdown to "Titel A-Z". **Verify:** rows ordered alphabetically ascending.
5. Set sort dropdown to "Titel Z-A". **Verify:** rows ordered alphabetically descending.
6. Set sort dropdown to "Manuell" / "Manual".
7. Drag the first row to the second position.
8. Click "Next" → Step 1 (Metadata).
9. Click "Zurück" / "Back" → Step 0.
10. **Verify:** the manual drag-order is PRESERVED (the row order does not reset).

### Test 7 (Optional): 22-Article Stress

Pre-condition: the 209-article Medium-imported corpus loaded in the DB.

1. Open `/articles`. Filter by `tag: living-health`.
2. Click "Alle auswählen" / "Select all".
3. **Verify:** the bar shows 22 selected.
4. Click "As book" → wizard opens with 22 rows visible.
5. Fill Title `Living Health: Complete Series`, Author `Asterios Raptis`.
6. Skip Steps 2-4.
7. Step 5 review: **verify** chapter count = 22.
8. Click "Create book".
9. **Measure:** time from click to toast appearance. Expected: 1-3 seconds (sub-second DB op + network round trip).
10. Click "View book" → BookEditor opens with 22 chapters.

## Stop-Conditions

| Symptom | Severity | Action |
|---|---|---|
| Toast does NOT appear after Create-Book click | CRITICAL | Stop. Capture browser console + Network response. Likely regression in `handleSubmit` or `notify.successAction`. |
| Original articles vanish OR appear in trash after conversion | CRITICAL (data-loss class) | Stop. Verify DB state directly (`SELECT * FROM articles WHERE id = '...'`). Likely violation of the decoupled-lifecycle contract. |
| 422 validation routes user to Step 0 with EMPTY banner | MEDIUM | Stop. `ApiError.detailBody` shape may have drifted. |
| Wizard auto-navigates to `/book/{id}` without showing toast CTA | MEDIUM (WARN-I1 regression) | Stop. The `onConverted` page handler is calling `navigate()` instead of `handleViewBook`. |
| Step indicator aria-label reads "Wizard progress" in non-EN UI | LOW (WARN-A1 regression) | Note. `t("ui.convert_to_book.step_indicator_aria")` lookup fallback fired. |
| Focus does not land on first input on step transitions | LOW (WARN-A2 regression) | Note. The `stepContentRef` useEffect may be misfiring. |

## Re-Verification Cadence

- After every commit touching `frontend/src/components/articles/ConvertToBookWizard.tsx`
- After every commit touching `backend/app/routers/books.py` `/from-articles` handler
- After every commit touching `frontend/src/utils/notify.ts` `successAction` helper
- After every commit touching `backend/config/i18n/*.yaml` `convert_to_book` namespace
- Before v0.33.0 release tag

## Known issues / by-design

- The wizard does NOT clone embedded images from source articles to the new book; image `src` attributes keep pointing at `/articles/{id}/assets/...`. Documented limitation; see `CONVERT-TO-BOOK-ASSET-CLONE-01` (P3) for the future asset-clone walker.
- All converted chapters get `chapter_type = "chapter"`; users retype manually in the BookEditor sidebar. See `CONVERT-TO-BOOK-CHAPTER-TYPE-DETECTION-01` (P5) for future smart-typing.
- The wizard's working selection does NOT update the parent page's bulk-selection; the snapshot taken at wizard-open time is the wizard's domain.
- Drag-reorder is browser-only (E2E covers it); not asserted in Vitest because happy-dom's pointer events do not exercise `@dnd-kit` reliably (per lessons-learned).

## Failure modes

| Symptom | Likely cause |
|---|---|
| 400 Bad Request on submit with non-empty Author field | `_validate_author` raised on a string that became blank after trim. Check for trailing whitespace. |
| Wizard's step-indicator dots all grey | `step` state stuck at 0 OR all transitions failing - check console for setState errors. |
| Tag-helper buttons missing despite tagged selection | `Article.tags` may be a JSON string instead of a list - check `_decode_tags_to_list` decoded the column correctly. |
| Toast CTA invokes nothing on click | `onViewBook` prop missing from the page wiring - check `ArticleList.tsx` passes `handleViewBook`. |
| 422 response routes to Step 0 but banner is empty | `ApiError.detailBody` is `undefined` - the backend may have returned a string `detail` instead of the structured dict. |
| BookEditor shows the new book but chapters are empty | `Chapter.content` column got cleared or never copied - verify `content_json` was passed to the new Chapter rows in `_resolve_articles_or_422`'s downstream insert loop. |

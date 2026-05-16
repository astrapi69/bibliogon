# Convert articles to a book

The Articles dashboard can compile a selection of articles into a brand-new Book, with the articles as chapters. A guided 6-step wizard collects the metadata, optional front-matter (title page, dedication, introduction) and back-matter (acknowledgments, author bio), and creates the book in a single transaction.

## When to use it

- You have a series of articles on one topic and want to ship them together as an EPUB / PDF / KDP listing.
- You wrote a multi-part long-form piece and want to bundle the parts into one publishable artefact.
- You're consolidating a year of posts into an anthology.

For a single article, the per-article Export action in the row menu can already produce an EPUB or PDF directly. The conversion wizard is most useful at two or more articles, where front-matter / back-matter framing and a chapter sequence matter.

## Step-by-step walkthrough

1. **Select articles** on the dashboard with the per-row checkbox or the "Select all" header checkbox. The bulk-action bar appears once at least one article is selected.
2. Click **"As book"** on the bulk-action bar. The wizard opens with your selection pre-loaded.
3. **Step 0 - Selection.** The sort dropdown chooses the chapter order (date oldest first, date newest first, title A-Z, title Z-A, or manual via drag-and-drop). Tag-helper buttons under the dropdown narrow the wizard's working selection to articles carrying a specific tag - useful for slicing a large pre-selection down to just one tag. The "Reset" button restores the original selection.
4. **Step 1 - Book metadata.** Title and Author are required; Subtitle, Language, Series, and Series index are optional. Single-article conversions pre-fill Subtitle from the article's subtitle and Cover image from the article's featured image (see Limitations below).
5. **Step 2 - Front-matter (optional, skippable).** Tick the chapters you want prepended: Title page (an empty chapter you customise later in the Book editor), Dedication (with text), Introduction (with text). Order: Title page -> Dedication -> Introduction.
6. **Step 3 - Back-matter (optional, skippable).** Tick the chapters appended after the article chapters: Acknowledgments (with text), About the author (with text). Order: Acknowledgments -> About the author.
7. **Step 4 - Chapter settings.** "Use article title as chapter title" is on by default. When off, chapters are named "Chapter 1", "Chapter 2", etc.
8. **Step 5 - Review.** The review screen lists the chosen title, author, total chapter count (front-matter + articles + back-matter), and sort strategy. Click **"Create book"**. The wizard submits, navigates to the new book in the Book editor, and clears the source-articles selection.

## What stays vs what gets copied

**Decoupled lifecycle.** The original articles remain on the Articles dashboard, untouched. The new book holds an independent copy of each article's body content (TipTap JSON) as a chapter. Editing an article after conversion does NOT update the book; editing the book does NOT update the article. The two artefacts live independently from the moment of conversion onward.

This is intentional. Once you publish a book, you want it stable against future edits to the source articles; conversely, you want to keep the original articles available as their own publishable artefacts.

## Known limitations

- **Embedded images reference the source articles.** If an article's body contains an image (`imageFigure` TipTap node), the image's `src` keeps pointing at the original article's asset endpoint (`/articles/{id}/assets/...`). If you later delete the source article, those images break in the book. The mitigation - copying assets into the book and rewriting URLs - is filed as `CONVERT-TO-BOOK-ASSET-CLONE-01` for a future release. Workaround: do not delete source articles you've already converted, or re-upload the affected images via the Book editor's chapter editor.
- **Single-article cover inheritance.** When you convert exactly one article AND that article has a `featured_image_url`, the wizard pre-fills `Book.cover_image` with the same URL. Multi-article conversions do not auto-assign a cover; use the existing cover-upload workflow in the Book editor after conversion.
- **All chapters default to `chapter` type.** The wizard does not try to guess `introduction` / `epilogue` / `appendix` from article titles. If you want a specific chapter to carry a different `chapter_type` (so manuscripta-export treats it as front-matter / back-matter), change it in the Book editor's chapter sidebar after conversion. Smart-typing is filed as `CONVERT-TO-BOOK-CHAPTER-TYPE-DETECTION-01` for a future release.

## Validation errors

If your selection contains articles the backend cannot convert, the wizard routes back to Step 0 with a banner listing every offending article in one go:

- **In trash** - articles whose `deleted_at` is set. Restore them first via the Articles dashboard trash tab.
- **Wrong content type** - articles where `content_type` is not `"article"` (reserved for future Blogpost / Tweet types). v1 never writes those, so this case is unreachable today but will surface if future content types ship.
- **Not found** - article IDs the backend cannot resolve. Usually only happens when an article was deleted between selection and conversion in a separate tab.

The whole selection is rejected with a 422 if any single article fails - this is by design, so you can fix every issue in one pass instead of iterating through rejections.

## FAQ

**What happens to my articles after conversion?**
They stay on the Articles dashboard exactly as before. The conversion produces a new book; the original articles are not deleted, archived, or modified. You can keep editing them, exporting them individually, or converting them again into a different book.

**Can I update the book if I later edit the articles?**
No. Books and articles are decoupled. Once the conversion completes, the book carries its own copy of each chapter and edits to the source articles do not propagate. Reverse-link tracking (so the Book editor could offer a "pull updates from source articles" affordance) is filed as `CONVERT-TO-BOOK-REVERSE-LINK-01` for a future release.

**What if I want to undo the conversion?**
Delete the book from the Books dashboard. The source articles are unaffected - the deletion only removes the book and its chapters. You can re-run the wizard with the same article selection if you want a fresh conversion with different metadata.

**Is there a selection limit?**
No fixed cap. The conversion is one transactional database write per book + N chapter inserts; the cost is sub-second regardless of selection size. This is different from bulk export, where Pandoc per-article processing genuinely takes time and a 200-article cap applies.

**What gets aggregated from the source articles into the book?**
Tags from all selected articles are deduplicated (case-insensitive) and merged into `Book.keywords`. If all selected articles share the same `series` value, that value is pre-filled as `Book.series` (you can override it in Step 1). Other per-article fields (canonical_url, excerpt, SEO meta) are not aggregated - they belong to the original articles only.

## For testing this feature

If you want to manually verify the conversion end-to-end (e.g. after upgrading or before reporting a bug), follow the [bilingual manual test guide](https://github.com/astrapi69/bibliogon/blob/main/docs/testing/smoke-tests/article-to-book-conversion-manual.md). For the deterministic / CI-style checklist, see the [smoke-test plan](https://github.com/astrapi69/bibliogon/blob/main/docs/testing/smoke-tests/article-to-book-conversion.md). Both files live in the repo under `docs/testing/smoke-tests/` (they are not part of the in-app help site, only of the GitHub repo).

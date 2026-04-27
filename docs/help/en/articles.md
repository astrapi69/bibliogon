# Articles

Articles are standalone long-form documents — blog posts, essays, release announcements, ideas you want to publish without bundling them into a book. Each article lives separately from books in `/articles`.

## What an article is (and isn't)

An article is:

- A single TipTap document (no chapters).
- Minimal metadata: title, subtitle, author, language, status.
- A simple lifecycle: **Draft → Published → Archived**.

An article is **not**:

- A book (no front-matter, no ISBN, no chapters, no audiobook export).
- A multi-platform publication (Phase 2 will add Medium / Substack / X / LinkedIn cross-posting).
- A promo post (tweets, threads, LinkedIn announcements about the article come in Phase 2).

If you find yourself reaching for chapters or a back-cover description, you want a Book, not an Article.

## Creating an article

1. From the Dashboard, click **Articles** in the header. The article list opens.
2. Click **New Article** (or use the empty-state CTA on first run).
3. Bibliogon creates a draft and opens the editor immediately. Your changes auto-save every second; the title bar shows "Saving…" / "Saved" while you work.

## The editor

Article editor differs from the book editor by design:

- **No chapter sidebar** — articles are single documents.
- **No front-matter tabs** — no half-title, copyright, dedication.
- **Sidebar** shows subtitle, author, language, status, word count.
- **Auto-save** triggers on every keystroke with a 1-second debounce.
- **Status select** moves an article through draft / published / archived.

Title is editable inline at the top of the page. Click the title text and start typing.

## Status

- **Draft** — work in progress. Default for new articles.
- **Published** — content is final. The article is ready (or has already been) shared.
- **Archived** — historical. Not deleted, but removed from default list views.

The list page filter pills let you scope to a single status. The default `All` view shows everything.

## Deleting an article

The sidebar's **Delete** button (red, bottom of the metadata pane) removes the article. A confirmation dialog asks you to acknowledge that the action cannot be undone — Bibliogon does not currently put articles in a trash (that's a Phase 2 polish item, parallel to book trash).

## What's coming next (Phase 2+)

The exploration in `docs/explorations/article-authoring.md` documents the full roadmap. Phase 2 candidates include:

- Multi-platform publication: cross-post the same article to Medium, Substack, X, LinkedIn with one click and track per-platform URLs.
- Promo posts: short companion posts (tweets, threads, LinkedIn announcements) linked back to the article.
- SEO metadata: per-platform SEO title, description, canonical URL, featured image, tags.
- Drift detection: warn when a published article was edited locally and the platforms still serve the older version.
- Trash + restore (parity with books).

Phase 1 ships the data foundation — entity, editor, list, basic CRUD. Phase 2 lands when there's validation data showing the cross-posting workflow is repetitive enough to be worth automating.

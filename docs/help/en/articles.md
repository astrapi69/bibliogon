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

## Topic and SEO

Each article has a **Topic** dropdown in the metadata sidebar. Topics are the article's primary category and come from a single list managed in **Settings → Topics**. The dropdown is disabled until you've defined at least one topic; an empty hint links you to the right Settings tab.

Topic is single-value (an article belongs to one topic). Tags remain a separate, multi-value field for finer cross-cutting labels.

The **SEO** section (below Status) collects two dedicated fields:

- **SEO Title** — overrides the article title in search snippets. Falls back to the article title when left empty.
- **SEO Description** — overrides the excerpt in search snippets. Falls back to the article excerpt when left empty.

These are article-level defaults. Publications (Medium, Substack, X, LinkedIn) inherit them; per-platform overrides go in the platform_metadata blob.

## Status

- **Draft** — work in progress. Default for new articles.
- **Published** — content is final. The article is ready (or has already been) shared.
- **Archived** — historical. Not deleted, but removed from default list views.

The list page filter pills let you scope to a single status. The default `All` view shows everything.

## Deleting an article

The sidebar's **Delete** button (red, bottom of the metadata pane) removes the article. A confirmation dialog asks you to acknowledge that the action cannot be undone — Bibliogon does not currently put articles in a trash (that's a Phase 2 polish item, parallel to book trash).

## Publications (AR-02 Phase 2)

A Publication tracks one piece of outbound content on one platform: the main publication of an article on Medium / Substack / X / LinkedIn, or a promo post linking back to it.

### Adding a publication

1. Open an article in the editor.
2. In the sidebar, scroll to **Publications** and click **Add**.
3. Pick a platform from the dropdown. The form fills in with that platform's required + optional fields.
4. Fill in the data (e.g. Medium needs title + tags; X needs body) and submit.

The publication starts in **Planned** state. No platform API is contacted — Bibliogon just records what you intend to publish.

### Lifecycle

- **Planned** — created, not yet live.
- **Scheduled** — has a scheduled_at date; still not live.
- **Published** — you marked it published after pasting the article into the platform. Bibliogon snapshots the article's TipTap content at this moment for drift detection.
- **Out of sync** — the article's content has changed since the publication was marked published. Bibliogon flags the publication so you remember to update the live version.
- **Archived** — historical, no longer active.

### Mark as published

Once you've pasted the article into Medium (or your platform of choice) and the live URL is up:

1. Click **Mark as published** on the row.
2. Optionally provide the published URL (Bibliogon stores it under `platform_metadata.published_url`).

Bibliogon snapshots the article's current `content_json` and remembers it as the baseline for drift detection.

### Drift detection

Every time you edit the article after a publication is **Published**, the next time you view that publication Bibliogon compares the live snapshot against the current draft. Mismatch flips the publication to **Out of sync** with a warning banner.

### Verify live

When you've updated the live platform version to match (or accept that the local draft is the new baseline):

1. Click **Verify live** on the out-of-sync row.
2. Bibliogon re-snapshots the article and clears the out-of-sync state.

### Promo posts

A Publication with `is_promo` true is a short companion piece — a tweet, thread, or LinkedIn announcement that links back to a main publication on Medium/Substack. Same lifecycle, same drift detection.

### SEO metadata

The article-level SEO fields (SEO Title, SEO Description, canonical URL, featured image, excerpt, tags) live above the Publications panel. Publications inherit them as defaults; per-platform overrides go in the platform_metadata blob you fill out on Add.

SEO Title and SEO Description fall back to the article title and excerpt at publish time when empty, so leaving them blank is fine for most articles.

### What's still NOT in scope (Phase 3+)

- Platform API integration (Medium / Substack / X / LinkedIn). Publishing remains manual.
- Scheduled publishing background jobs.
- Cross-posting automation.
- Analytics fetching.
- Tag taxonomy (tags are free strings, no autocomplete across articles).
- Trash + restore for articles.

If your cross-posting workflow surfaces a friction Bibliogon can solve, log it in `docs/journal/article-workflow-observations.md` so the case is concrete before Phase 3 priorities are picked.

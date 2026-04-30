# Smoke Test: Articles Backup + Import (Manifest 2.0)

**Shipped:** 2026-04-30
**Commits:**
- ed2e3ec (export side, prior session)
- ca5e57e (CIO bgb_handler restores articles + handles articles-only .bgb)
- ea20fd7 (wizard bypasses title+author gate for articles-only)
- 1abc937 (wizard fires onImported for articles-only)
- 8043105 (full-pyramid coverage tests)
- a415ee9 (wizard surfaces article counts)
- 128ea16 (Articles dashboard refresh on bfcache + visibility)

**Reference:**
- [docs/explorations/backup-articles-debug.md](../../explorations/backup-articles-debug.md)
- [docs/explorations/backup-articles-audit.md](../../explorations/backup-articles-audit.md)

Manifest version 2.0 backup format adds an `articles/` segment alongside `books/`. CIO `BgbImportHandler` extended to restore articles too.

## Prerequisites

- Backend running.
- 0+ books, 1+ articles.

## Flow 1 — Export with articles + books

1. Create 2 books with chapters + 3 articles (some with featured images).
2. Either dashboard → Backup button → download `.bgb` file.
3. Inspect:
   ```bash
   unzip -l ~/Downloads/bibliogon-backup-*.bgb | grep -E "articles|books|manifest"
   unzip -p ~/Downloads/bibliogon-backup-*.bgb manifest.json | jq .
   ```

**Expected manifest:**
```json
{
  "format": "bibliogon-backup",
  "version": "2.0",
  "book_count": 2,
  "article_count": 3,
  "publication_count": 0,
  "article_asset_count": ...,
  "includes_audiobook": false
}
```

**Expected ZIP entries:**
- `books/<book-id>/book.json` × 2
- `books/<book-id>/chapters/*.json`
- `articles/<article-id>/article.json` × 3
- `articles/<article-id>/assets/` (when featured images attached)

## Flow 2 — Articles-only backup (zero books)

1. Trash all books (verify empty in /).
2. Articles dashboard → Backup → download.
3. Inspect:
   ```bash
   unzip -l ~/Downloads/bibliogon-backup-*.bgb
   ```

**Expected:** `articles/` directory with N articles. `books/` directory exists but empty (materialised by `_require_books_dir` validator).

Manifest:
```json
{"version": "2.0", "book_count": 0, "article_count": N, ...}
```

## Flow 3 — Restore via CIO upload (user-flow path)

1. Wipe articles + books from DB.
2. Articles dashboard → Import button → drag the `.bgb` file.
3. Wizard opens → Detect step:
   **Expected:** summary shows "X books, Y articles". For articles-only, shows "Articles backup" panel ("This backup contains N article(s) and no books").
4. Click Confirm.
5. **Expected:**
   - Books restored (when present).
   - Articles restored.
   - Wizard SuccessStep renders. Articles-only path navigates to `/articles` after timer; mixed path goes to first restored book editor.
   - ArticleList refreshes immediately via `onImported` callback (no F5 needed thanks to commit 128ea16).

## Flow 4 — Idempotent re-import

1. Restore the same `.bgb` again.
2. **Expected:** no duplicate rows in DB. Articles already-live → silently skipped (no `_BgbInvalid` raise after the relax in ca5e57e).

## Flow 5 — Soft-delete revival

1. Trash one article (it has `deleted_at` set).
2. Re-import a `.bgb` that contains the same article id with `deleted_at: null`.
3. **Expected:** article hard-deleted from trash + re-inserted as live.

## Flow 6 — Legacy v1.0 manifest

1. Use a v1.0 backup (no `articles/` segment, books only).
2. Import via CIO.
3. **Expected:** restores books cleanly. `_load_app_config` warns about unknown manifest version is ONLY for the inverse case (newer than known); v1.0 is silent.

## Flow 7 — Forward-compat warning

Hand-craft a `.bgb` with `manifest.json` `"version": "9.9"`.

```bash
mkdir /tmp/fake-future
cat > /tmp/fake-future/manifest.json << 'EOF'
{"format": "bibliogon-backup", "version": "9.9", "book_count": 0, "article_count": 0}
EOF
mkdir -p /tmp/fake-future/books
cd /tmp/fake-future && zip -r /tmp/future.bgb . && cd -
mv /tmp/future.bgb /tmp/future.bgb  # rename .zip -> .bgb if needed
```

Import → expect WARNING in backend log:
```
Backup manifest version '9.9' is newer than this build supports (['1.0', '2.0']) ...
```

## Known issues / by-design

- Articles travel as a batch; not selectable in wizard. Multi-book wizard still selects per-book; articles always import.
- Wizard's `onImported` fires with `bookId=""` for articles-only path; SuccessStep redirects to `/articles` (commit 1abc937).
- Articles trash list refresh on bfcache restore (commit 128ea16) — relevant for browser-back navigation.

## Failure modes

| Symptom | Likely cause |
|---------|---|
| ZIP missing `articles/` despite articles in DB | `export_backup_archive` regression on ed2e3ec — missing `len(articles) > 0` branch. |
| Wizard says "No book.json inside the backup." for articles-only | regression on ca5e57e — `BgbImportHandler.detect()` not counting articles. |
| Wizard Continue disabled for articles-only | regression on ea20fd7 — orchestrator `is_articles_only` check missing in `validate_overrides` skip. |
| ArticleList stale after import (needs F5) | regression on 128ea16 — ArticleList missing pageshow/visibilitychange listeners. |

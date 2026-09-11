# Promotion plugin (Phase 1)

Portfolio board over an author's retail presence. Design and phasing:
`docs/explorations/author-promotion.md`.

## What it adds

`Book.status` is one value for the whole book, so it cannot say that a title is
live as an eBook, still a draft as a paperback, and missing a hardcover. The
`book_format_states` table holds that per-format truth; `Book.universal_link`
holds the shortlink an author hands out.

The ASIN is deliberately **not** duplicated into the format row - it stays in
the existing `Book.asin_ebook` / `asin_paperback` / `asin_hardcover` columns
that the KDP plugin reads. The board composes both sides, and every write goes
through one service function.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/promotion/portfolio` | the board; `language`, `author`, `gaps_only` filters |
| GET | `/api/promotion/portfolio/{book_id}` | one book's formats and gaps |
| PUT | `/api/promotion/portfolio/{book_id}/formats/{format}` | upsert one format's status, link, ASIN |
| PATCH | `/api/promotion/portfolio/{book_id}` | set the universal link |
| POST | `/api/promotion/portfolio/import` | apply a batch of rows, idempotently |

A format is a *gap* when it is not on sale, which covers both `draft` and
`missing`.

## Seeding from the author's CSV

```bash
make import-portfolio-check CSV=/path/to/books-list.csv   # dry run, writes nothing
make import-portfolio CSV=/path/to/books-list.csv         # apply
```

Rows match on the repository first (the stable `git:<host>/<owner>/<repo>#<branch>`
identifier every imported book carries since #762) and fall back to an exact
title match. Re-running an unchanged CSV reports every row as unchanged and
writes nothing.

## Tests

```bash
make test-plugin-promotion
```

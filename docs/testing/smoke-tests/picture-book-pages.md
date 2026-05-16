# Smoke Test: Picture-Book Pages CRUD

**Shipped:** 2026-05-16 (Phase-4 Session 2: backend Pages-Foundation)

**Commits:**
- `d0f0acc` (DB schema: `book_type` discriminator + `pages` table + Alembic migration)
- `9e07fb0` (Pydantic schemas: PageCreate / PageUpdate / PageOut / PagesReorder + `book_type` Literal)
- `ce642f3` (`book_type` immutability gate on `PATCH /api/books/{id}` — returns 400)
- `3f9aa0c` (Pages CRUD routes: GET / POST / PATCH / DELETE / reorder)
- `4e41e06` (35 pytest cases: pages CRUD + reorder atomicity + book-type discriminator)
- `0b182b5` (docs reconciliation: flat `book_type` scope, dropped `visual_book` umbrella)

**Reference:**
- Backend router: [plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/pages.py](../../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/pages.py)
- Pydantic schemas: [plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/pages.py](../../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/pages.py) (top of file)
- Tests: `plugins/bibliogon-plugin-kinderbuch/tests/test_pages.py`
- Manual test guide (DE + EN): [picture-book-pages-manual.md](./picture-book-pages-manual.md)
- Frontend UI: deferred to Session 3 (no UI yet; this smoke test exercises the API directly)

## Overview

- **Feature:** Pages CRUD for picture books (`book_type='picture_book'`)
- **Surface:** REST API only this session — frontend UI ships in Session 3
- **Backend:** New `pages` table + 5 endpoints under
  `/api/books/{book_id}/pages*`. `Book.book_type` discriminator
  gates which routes apply (prose books reject every `/pages*` call
  with HTTP 400).
- **Last verified:** 2026-05-16 (initial ship; 35/35 pytest green;
  full backend suite 1770 pass)

## Prerequisites

- Bibliogon dev backend running (`make dev` or `make dev-bg`)
- Backend reachable at `http://localhost:8000`
- An HTTP client of choice (curl, HTTPie, Bruno, the FastAPI
  Swagger UI at `/docs`)
- No frontend prerequisites — this smoke is API-only

## Smoke-Test Steps

Each step is deterministic. Run in order; later tests assume the
earlier ones pass. Sample payloads use minimal valid shapes; copy
+ paste-friendly.

### Test 1: Create a picture-book

```http
POST /api/books
Content-Type: application/json

{
  "title": "Smoke Test Picture Book",
  "author": "Smoke Tester",
  "book_type": "picture_book"
}
```

**Verify:**
- HTTP 200 (or 201).
- Response body's `book_type` field equals `"picture_book"`.
- Capture the returned `id` as `BOOK_ID` for subsequent steps.

### Test 2: List pages on a fresh book returns []

```http
GET /api/books/{BOOK_ID}/pages
```

**Verify:**
- HTTP 200.
- Body equals `[]`.

### Test 3: Add three pages with different layouts

Issue three POSTs in sequence with the three core layouts:

```http
POST /api/books/{BOOK_ID}/pages
Content-Type: application/json

{"layout": "image_only", "text_content": null}
```

```http
POST /api/books/{BOOK_ID}/pages
Content-Type: application/json

{"layout": "text_under_image", "text_content": "Page 2 caption"}
```

```http
POST /api/books/{BOOK_ID}/pages
Content-Type: application/json

{"layout": "split_left_right", "text_content": "Page 3 caption", "speech_bubble_config": [{"x": 0.5, "y": 0.5, "text": "Hi!"}]}
```

**Verify (per response):**
- HTTP 201.
- `position` increments densely: 1, 2, 3.
- Capture each returned `id` as `PAGE_1_ID`, `PAGE_2_ID`, `PAGE_3_ID`.

### Test 4: List pages returns dense [1, 2, 3]

```http
GET /api/books/{BOOK_ID}/pages
```

**Verify:**
- HTTP 200.
- Body is a 3-element array.
- Positions are exactly `[1, 2, 3]` in array order.
- Element 0's id is `PAGE_1_ID`, element 1 is `PAGE_2_ID`,
  element 2 is `PAGE_3_ID`.

### Test 5: Reorder pages (reverse the order)

```http
POST /api/books/{BOOK_ID}/pages/reorder
Content-Type: application/json

{"page_ids": ["{PAGE_3_ID}", "{PAGE_2_ID}", "{PAGE_1_ID}"]}
```

**Verify:**
- HTTP 200.
- Response body is a 3-element array, positions `[1, 2, 3]` but
  with `PAGE_3_ID` now at position 1 and `PAGE_1_ID` at position 3.
- A follow-up `GET /api/books/{BOOK_ID}/pages` confirms the same
  order persisted to the DB.

### Test 6: PATCH a page's speech_bubble_config — JSON roundtrip

```http
PATCH /api/books/{BOOK_ID}/pages/{PAGE_2_ID}
Content-Type: application/json

{"speech_bubble_config": [{"x": 0.25, "y": 0.75, "text": "Oh look!"}, {"x": 0.75, "y": 0.25, "text": "A bird!"}]}
```

**Verify:**
- HTTP 200.
- Response body's `speech_bubble_config` is a 2-element array
  with the exact x/y/text values you submitted (JSON roundtrips
  through SQLite's `JSON` column).

### Test 7: Delete page 2; remaining pages dense-shift

After Test 5, the order is `PAGE_3_ID, PAGE_2_ID, PAGE_1_ID` at
positions `1, 2, 3`. Delete the middle page:

```http
DELETE /api/books/{BOOK_ID}/pages/{PAGE_2_ID}
```

**Verify:**
- HTTP 204 (empty body).
- A follow-up `GET /api/books/{BOOK_ID}/pages` returns a 2-element
  array with positions `[1, 2]` (dense — no gaps).
- `PAGE_3_ID` keeps position 1; `PAGE_1_ID` shifts from 3 to 2.

### Test 8: book_type immutability — PATCH /api/books rejects book_type change

```http
PATCH /api/books/{BOOK_ID}
Content-Type: application/json

{"book_type": "prose"}
```

**Verify:**
- HTTP 400.
- Response body's `detail` mentions `book_type` (the exact
  message is "book_type cannot be changed after creation" or
  equivalent — see the regression-pin test
  `test_patch_books_rejects_book_type_change`).
- A follow-up `GET /api/books/{BOOK_ID}` confirms `book_type` is
  still `"picture_book"`.

### Test 9: Prose-book gate — pages endpoints reject when book_type != picture_book

Create a prose book:

```http
POST /api/books
Content-Type: application/json

{
  "title": "Prose Control Book",
  "author": "Smoke Tester",
  "book_type": "prose"
}
```

Capture its id as `PROSE_BOOK_ID`. Then:

```http
GET /api/books/{PROSE_BOOK_ID}/pages
POST /api/books/{PROSE_BOOK_ID}/pages
  body: {"layout": "image_only"}
POST /api/books/{PROSE_BOOK_ID}/pages/reorder
  body: {"page_ids": []}
```

**Verify for each:**
- HTTP 400.
- Response body's `detail` explains that pages are picture-book-only.

## Stop conditions

Stop and investigate if ANY of:
- Test 1 returns a `book_type` that isn't `picture_book` — the
  field is being silently overridden by the API.
- Positions in Test 4 are not exactly `[1, 2, 3]` — the dense-
  position invariant is broken.
- Test 5's response indicates positions outside `[1, 2, 3]` — the
  two-phase reorder transaction is leaking sentinel positions.
- Test 6's roundtrip drops or transforms fields — JSON column is
  being misused (string instead of dict, or vice versa).
- Test 7's dense-shift leaves a gap (e.g. positions `[1, 3]`) —
  the on-delete shift logic is broken.
- Test 8 returns HTTP 200 — `book_type` immutability is no longer
  enforced; this is a regression of `ce642f3`.
- Test 9 returns HTTP 200 on any of the three calls — the
  picture-book gate is broken; prose books can grow page rows.

## Re-verification cadence

- After any commit that touches:
  - `plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/pages.py`
  - `backend/app/routers/books.py` (the PATCH endpoint)
  - `backend/app/models/__init__.py` `Book.book_type` or `Page` model
  - Alembic migrations under `backend/migrations/versions/`
- Before any release that includes Phase-4 work.
- During Session 3 (frontend) initial dev as a sanity baseline.

# Book metadata inventory (sales metadata gaps)

Generated: 2026-09-15

## What this is

A read-only snapshot of the sales-relevant metadata columns on every book in the library, so the gaps can be filled in **by hand**. Nothing here was auto-set, auto-guessed or auto-written: this file is a report, not a migration.

- **Source:** the agent-local database copy at `.agent-data/bibliogon.db` (made with `make agent-db`), not the live dev instance. No write, no migration, no server was run against it; the inventory is a pure `SELECT`.
- **Scope:** all 44 books with `deleted_at IS NULL`. No book is in the trash.
- **Intended use:** Aster fills the empty cells, then loads them back in. See "Loading the filled-in table back in" at the bottom for what the repo can and cannot do today.

### Reading the table

- `-` marks an empty value. NULL, an empty string and `[]` are all shown as `-`.
- `- (placeholder: ...)` marks a value that is technically present but carries no content: a JSON list holding only `null`s or only empty strings. These are empty in practice and are counted as empty in the statistics, but they are worth seeing because a plain overwrite may behave differently than on a true NULL.
- `MALFORMED JSON` marks a value that is not decodable as a JSON list. None occur in this snapshot.
- `keywords` is truncated for readability: at most the first 3 entries, at most 64 characters, with `...(+N)` naming how many further entries exist. The database holds the full list; this file does not.
- German titles keep their real umlauts. Nothing is transliterated.
- The prose in this file uses plain hyphens only, per the project rule. Three
  book titles (rows 5, 6 and 35) contain a real en-dash in the database. Those
  are reproduced verbatim, because a title rewritten for style would no longer
  match the book. The deviation is in the data, not in the writing.

### Known gap: there is no target-audience field

The `books` table has **no target-audience column** (no `target_audience`, no `audience`, no `reader_profile`). It is therefore absent from this inventory. That is a schema gap, not an inventory omission: target audience currently cannot be stored per book at all, only written into free-text fields such as `description`, `expose` or `notes`. Recording it properly would need a new column plus a migration.

## Fill statistics

Denominator is 44 for every row: all 44 non-deleted books.

| Column | Filled | Empty | Share filled | Note |
| --- | ---: | ---: | ---: | --- |
| `title` | 44 / 44 | 0 | 100% | Always present (NOT NULL). |
| `language` | 44 / 44 | 0 | 100% | Always present (NOT NULL). |
| `book_type` | 44 / 44 | 0 | 100% | Always present (NOT NULL), and `prose` for every book. |
| `genre` | 0 / 44 | 44 | 0% | Empty on every book. |
| `bisac_codes` | 0 / 44 | 44 | 0% | No usable value anywhere; the one non-NULL row holds `[]`. |
| `categories` | 0 / 44 | 44 | 0% | No usable value anywhere; the one non-NULL row holds `[]`. |
| `keywords` | 32 / 44 | 12 | 73% | The best-filled of the gap columns. (5 placeholder row(s) counted as empty). |
| `universal_link` | 0 / 44 | 44 | 0% | Empty on every book. |
| `asin_ebook` | 7 / 44 | 37 | 16% |   |
| `asin_paperback` | 7 / 44 | 37 | 16% |   |
| `asin_hardcover` | 7 / 44 | 37 | 16% |   |

## Inventory

| # | Title | Lang | Type | Genre | BISAC | Categories | Keywords | Universal link | ASIN ebook | ASIN paperback | ASIN hardcover |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Band 1: Die Offenbarung | de | prose | - | - | - | - | - | - | - | - |
| 2 | Biologische Souveränität | de | prose | - | - | - | CRISPR Gentherapie Genom Editing; biologische Souveränität Mensc... ...(+4) | - | - | - | - |
| 3 | Das Erwachen der Wächter | de | prose | - | - | - | Science Fiction Serie; Wächterchroniken Band 2; Enhanced Humans ...(+17) | - | - | - | - |
| 4 | Das lachende Pferd | de | prose | - | - | - | - (placeholder: null entries) | - | - | - | - |
| 5 | Das lebende Stimmrecht – Vom Untertan zum Auftraggeber | de | prose | - | - | - | Souveränität; Bürgerstaat; Machtumkehr ...(+9) | - | - | - | - |
| 6 | Das Politische Profil – Wie Staaten tragfähig gebaut werden | de | prose | - | - | - | politische Architektur; Staatsarchitektur; Governance Framework ...(+9) | - | - | - | - |
| 7 | Der selbstständige Sklave | de | prose | - | - | - | - (placeholder: empty strings) | - | - | - | - |
| 8 | Die Abenteuer von Fips | de | prose | - | - | - | - | - | B0GHZJY77H | B0GLZ3WQ8J | B0GQPN5TYG |
| 9 | Die Erben des Lichts | de | prose | - | - | - | Science-Fiction; posthumanismus; Kinder mit Fähigkeiten ...(+7) | - | - | - | - |
| 10 | Die Formbare Ewigkeit. Eine philosophische Reise zu Bewusstsein, Realität und Unendlichkeit | de | prose | - | - | - | Philosophie; KI; Existenz ...(+8) | - | - | - | - |
| 11 | Die Galaxis der Tränen | de | prose | - | - | - | Science-Fiction; Wächterchroniken; posthumanismus ...(+7) | - | - | - | - |
| 12 | Die Geister der Zeit | de | prose | - | - | - | Geist; Ewigkeit; Bewusstsein ...(+12) | - | B0GHQP2S6Q | B0GPWJH1JY | B0GPVT2CQY |
| 13 | Die Jäger und die Gejagten | de | prose | - | - | - | Science Fiction; Horror; Aliens ...(+27) | - | - | - | - |
| 14 | Die Schildmaid | de | prose | - | - | - | Sportthriller; Exoskelett; Cyborg ...(+16) | - | - | - | - |
| 15 | Die souveräne Zivilisation | de | prose | - | - | - | politische Philosophie; digitale Souveränität; Gesellschaftsvert... ...(+5) | - | - | - | - |
| 16 | Die Souveränität des Musters | de | prose | - | - | - | Digitale Unsterblichkeit; Mind Uploading; Bewusstsein und Identi... ...(+4) | - | - | - | - |
| 17 | Die Währung des Geistes | de | prose | - | - | - | Aufmerksamkeitsökonomie; Selbsthilfe; Philosophie ...(+7) | - | - | - | - |
| 18 | Erinnerung und Vergessen | de | prose | - | - | - | Philosophie; Bewusstsein; Vergessen ...(+8) | - | - | - | - |
| 19 | Globale Souveränität | de | prose | - | - | - | Globale Souveränität; Demokratiearchitektur; Digitale Bürgerrech... ...(+7) | - | - | - | - |
| 20 | KI für Einsteiger: Prompts gestalten ohne Programmierkenntnisse | de | prose | - | - | - | KI; künstliche Intelligenz; Prompt Engineering ...(+2) | - | - | - | - |
| 21 | Letzter Funke | de | prose | - | - | - | - | - | - | - | - |
| 22 | Metrics Probe2 | de | prose | - | - | - | - | - | - | - | - |
| 23 | Mit den Augen eines Vaters | de | prose | - | - | - | - | - | - | - | - |
| 24 | Rückkehr oder Befreiung | de | prose | - | - | - | Rekonsolidierung Gedächtnis Neurowissenschaft; Nietzsche ewige W... ...(+4) | - | B0GRWK48TP | B0GS1VWJLD | B0GS1M8LGW |
| 25 | Schatten über New Eden | de | prose | - | - | - | Science-Fiction-Romanze; dystopische Liebesgeschichte; verbotene... ...(+7) | - | - | - | - |
| 26 | Timmy und der Meister des Nasenbohrens | de | prose | - | - | - | Kinderbuch; Comic; Nasenbohren ...(+5) | - | - | - | - |
| 27 | AI for Everyone: Crafting Prompts Without Coding Skills | en | prose | - | - | - | AI; artificial intelligence; prompt engineering ...(+2) | - | - | - | - |
| 28 | Shadows over New Eden | en | prose | - | - | - | sci-fi romance; dystopian love story; forbidden love ...(+7) | - | - | - | - |
| 29 | The Adventures of Fips | en | prose | - | - | - | children's picture book forest animals; bedtime stories for kids... ...(+4) | - | B0GMD1MD21 | B0GMB2GVW7 | B0GQPDPHKH |
| 30 | The Awakening of the Guardians | en | prose | - | - | - | Science Fiction Series; Guardian Chronicles Volume 2; Enhanced H... ...(+17) | - | - | - | - |
| 31 | The Currency of the Mind | en | prose | - | - | - | attention economy; self-help; philosophy ...(+7) | - | - | - | - |
| 32 | The Formable Eternity: A Philosophical Journey into Consciousness, Simulation & Reality | en | prose | - | - | - | philosophy; AI; existence ...(+8) | - | - | - | - |
| 33 | The Ghosts of Time | en | prose | - | - | - | spirit consciousness mind philosophy; eternity immortality patte... ...(+4) | - | B0GTMWZDXL | B0GTY5QMN8 | B0GTTLCGCY |
| 34 | The Hunters and the Hunted | en | prose | - | - | - | Science Fiction; Horror; Aliens ...(+27) | - | - | - | - |
| 35 | The Laughing Horse – A Greek Tale for Kids | en | prose | - | - | - | - (placeholder: null entries) | - | - | - | - |
| 36 | El caballo que se reía | es | prose | - | - | - | - (placeholder: null entries) | - | - | - | - |
| 37 | IA para principiantes: Crear prompts sin saber programar | es | prose | - | - | - | IA; inteligencia artificial; prompt engineering ...(+2) | - | - | - | - |
| 38 | La Eternidad Formable | es | prose | - | - | - | filosofía; IA; existencia ...(+1) | - | - | - | - |
| 39 | La Moneda de la Mente | es | prose | - | - | - | economía de la atención; autoayuda; filosofía ...(+7) | - | - | - | - |
| 40 | Las aventuras de Fips | es | prose | - | - | - | - | - | B0GQHDJY6S | B0GQM3L74S | B0GQM1JW6F |
| 41 | IA pour tous : Créer des prompts sans compétences de codage | fr | prose | - | - | - | IA; intelligence artificielle; ingénierie de prompt ...(+2) | - | - | - | - |
| 42 | L'Éternité façonnable | fr | prose | - | - | - | philosophie; IA; existence ...(+1) | - | - | - | - |
| 43 | Le cheval qui riait | fr | prose | - | - | - | - (placeholder: null entries) | - | - | - | - |
| 44 | Les aventures de Fips | fr | prose | - | - | - | - | - | B0GGX8XP3F | B0GQGDFK37 | B0GQG5PTSV |


## Loading the filled-in table back in

What the repo already has, and what it can actually SET. Read from the code,
not inferred from the filenames.

| Candidate | Input | Can it set these columns? |
| --- | --- | --- |
| `scripts/bulk_import_books.py` (`make import-books`) | YAML catalog of git repo URLs | **No.** Create-only. It detects which catalog repos are already imported and imports only the missing ones via `POST /api/import/detect/git` + `/api/import/execute`; every duplicate is cancelled (`duplicate_action=cancel`). It never updates an existing book. |
| `scripts/import_portfolio_csv.py` (`make import-portfolio`) plus `POST /api/promotion/portfolio/import` | `books-list.csv` with `Title, Author, Language, Status, GitHub_URL, GitHub_Branch, eBook, Paperback, Hardcover, Universal_Link` | **Partly.** `apply_csv_rows` in `bibliogon_promotion/service.py` writes `Book.universal_link` directly, and `set_format_state` writes `asin_ebook` / `asin_paperback` / `asin_hardcover`, parsed out of the Amazon links with `asin_from_url`. It is idempotent and has a real dry run. It does **not** touch `genre`, `keywords`, `categories` or `bisac_codes`. |
| `PATCH /api/books/{book_id}` (`BookUpdate`) | one JSON body per book | **Yes, all of them,** but one book at a time. The schema carries `genre`, `keywords`, `categories`, `bisac_codes`, `universal_link` and all three `asin_*` fields. `bisac_codes` entries are format-validated per row (422 on a bad code). There is no bulk variant. |
| `backend/app/routers/bulk_delete.py` | list of ids | **No.** Delete only. |

Practical reading: the columns split in two.

1. `universal_link` and the three `asin_*` fields have a working bulk path
   today. Extend the existing `books-list.csv` and run
   `make import-portfolio-check CSV=...` first, then `make import-portfolio`.
   Matching is by git repo identifier first, title as fallback; an unmatched
   row makes the run exit non-zero instead of silently skipping.
2. `genre`, `keywords`, `categories` and `bisac_codes` have **no bulk path**.
   Today they are editable only per book, through the UI or a single
   `PATCH /api/books/{id}`. Filling 44 books by hand is 44 requests.

Nothing was built to close that gap as part of this inventory.

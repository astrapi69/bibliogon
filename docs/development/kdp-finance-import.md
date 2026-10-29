# KDP finance import: conventions and contracts (#1129)

Backend of the KDP report import in `plugin-kdp`
(`bibliogon_kdp/finance/`, routes under `/api/kdp/finance`). It brings
royalties, KENP reads, Amazon Ads spend and direct title costs together
into a contribution margin per title, language, format, marketplace and
pen name. The UI is a separate piece of work.

## What it deliberately does not do

- **No scraping**, not even through a third-party service. Fetching
  Amazon product pages with a bot breaks Amazon's terms. The risk is a
  closed KDP account, not a warning letter.
- **No conversion rate from impressions.** Impressions only measure paid
  traffic, and KDP does not provide organic traffic. The only conversion
  figure is `paid_click_to_order_rate` (ad orders per ad click), named
  after the channel it measures.
- **No KENP drop-off rate, no historical BSR, no keyword rank.** Amazon
  reports pages read, not readers. BSR and rank history need scraping or
  paid third-party data.

## Conventions

### Provisional and closed months

A month is **provisional** until 90 days after its last day and
**closed** after that (`money.PROVISIONAL_DAYS`). Every report group
carries `provisional`, and the response lists `provisional_months`.
Without this rule a month's figure would move every time someone looked
at it.

### Currency

- One **base currency** per evaluation (query parameter, default `EUR`).
- The rate is the **monthly rate** per (month, currency, base currency),
  stored in `finance_fx_rates`; its `source` field records where it came
  from.
- **Preferred source: the rate Amazon actually applied** (#1147). Import
  the payments report, then call `POST /api/kdp/finance/fx-rates/from-payments`.
  Each non-EUR payout covers one marketplace and one sales month and
  carries its rate (`payout = net x rate`), so it becomes that month's
  rate with source `KDP payment <no>`. Months without a foreign-currency
  payout need a rate entered by hand (`PUT .../fx-rates/{month}/{currency}`).
- Rates are **write-once**: overwriting a stored rate with a different
  value returns 409 unless `replace: true` is sent explicitly. That is
  what makes an old evaluation reproducible.
- Every group returns the rates it used in `fx_rates_used`.
- A missing rate is **never treated as 1.0**. The amount is left out of
  the sum, the group is flagged `incomplete`, and the pair is listed in
  `missing_fx`.

### KENP

Pages read are valued **month by month** with that month's per-page rate
(`finance_kenp_rates`, per month and marketplace). Summing pages across
months and multiplying by one rate is wrong because the KDP Select fund
rate changes monthly. A month without a rate is flagged in
`missing_kenp_rates`. It is never counted as 0 and never estimated.

### Costs and the margin label

Only two kinds of cost are recorded: direct costs per title (dated) and
ad spend (from the Ads report). The author's time is deliberately not
recorded.

`contribution_margin = net_revenue - ad_spend - direct_costs` is set
**only** when every title in the group has at least one direct cost
recorded. Otherwise it is `null`, `margin_label` is `net_revenue`, and
the note `net_revenue_without_costs` is returned. Net revenue is never
silently presented as a margin.

Direct costs have no format and no marketplace. Grouping by either puts
them in a `not_attributable` group instead of spreading them by a key
nobody chose.

### Ads attribution

Amazon attributes ad sales over a 14-day window and counts Kindle
Unlimited reads poorly, so campaigns for KU-heavy titles look worse than
they are. When ad spend is present the response carries the note
`ads_attribution_window`. The figure itself is not adjusted.

## Import semantics

- **Contract per report kind** (`columns.py`): `required`, `optional`
  and acknowledged-`ignored` headers. An unknown header or a missing
  required header fails the whole file (400) and names the column. A bad
  cell fails with its row and column. Nothing is dropped silently, except
  rows in which every cell is empty.
- **The newest download of a month wins.** An import replaces the stored
  lines of its scope: (channel, kind, format, month) for sales, and
  (marketplace, month) for ads. That is how a later download that now
  carries refunds corrects the month.
- **The same content twice changes nothing.** The new lines are compared
  with the stored scope first. When they are equal the result is
  `unchanged` and no row is written.
- **Titles match at read time** against `Book.asin_*` / `Book.isbn_*`.
  There is no second title register, and an ASIN added to a book later
  also attributes its older rows. Unmatched rows stay visible as
  `unassigned:<ASIN>`.
- `sales_channel` is part of every revenue row (`kdp` today), so another
  channel such as IngramSpark needs a parser, not a migration.

### Report kinds

| kind | form fields | notes |
|---|---|---|
| `kdp_royalty` | `book_format` (ebook/paperback/hardcover) | one KDP sheet per format; the eBook sheet has no format column |
| `kdp_kenp` | none | pages only, the rate comes from `finance_kenp_rates` |
| `amazon_ads` | `marketplace` | the advertised-product report; an Ads account belongs to one marketplace. A summary row spanning two months fails, because spend cannot be assigned to one of them |
| `kdp_payments` | `sheet` (optional) | the payments report ("Zahlungen"); see below |

### Payments report (#1147)

Verified against a real German-language download. It holds no per-title
data; it carries what the royalty reports lack - Amazon's applied
exchange rate and the withheld tax.

- **Layout:** one payment row per marketplace payout and sales month,
  followed by its detail rows (one per source: `Verkäufe`,
  `Taschenbuchverkäufe`, `Kindle+ Tantiemen`). `Währung` appears twice
  (marketplace currency, payout currency), so columns are read by
  position against the exact German header sequence. Another header
  (including an English download) fails loudly until its sequence is
  added from a real sample.
- **Checked per payment**, a deviation fails the import: the detail rows
  sum to the payment (accrued, tax, net); net = accrued - tax; detail
  rows share the payment's month and currency; a foreign-currency payout
  carries a rate and equals net x rate (within 0.02); a same-currency
  payout equals net and has no rate.
- **Stored** in `finance_payments` and `finance_payment_lines`; a newer
  download replaces a payment by its number, the same content twice
  writes nothing.
- **Used** for the exchange rates (above) and for `tax_withheld` in the
  evaluation: withheld tax carries only marketplace and month, lands in
  the `not_attributable` group for every other dimension, and reduces
  the contribution margin of the group it is in.

The royalty and KENP contracts still list the English headers; German
downloads of those reports need their real header rows before they can
be imported.

Accepted input is **XLSX** (read with `python-calamine`, #1132) or **CSV**
(comma, semicolon or tab, UTF-8 with or without a BOM). The format is
detected from the file content, not the filename. Both go through the
same contract:

- A workbook with more than one sheet needs the form field `sheet`.
  Without it, or with a name that does not exist, the import fails and
  lists the available sheets. Nothing is guessed.
- The header is the first of the first 10 rows that contains every
  required column, so a report-period line above the table is skipped.
  The response names it as `header_row`, and as `sheet` for a workbook.
  When no row qualifies, the first row is checked and its unknown and
  missing columns are reported.
- XLSX cells are converted to the exact text the strict parsers expect:
  whole numbers without a fraction, dates as ISO dates. A true/false
  cell, or a value outside the header columns, fails with its row.
- `33`, `33.0` and `33.00` count as one amount when checking for an
  unchanged re-import, so the same month imported first as CSV and then
  as XLSX is `unchanged`.

The header names in `columns.py` follow the KDP and Ads downloads as
known when they were written. **Check them against a real download
first.** If they differ, the import fails loudly and the contract needs
the new name.

### Refunds in the KDP reports

The royalty sheets carry `Units Refunded` and `Net Units Sold` per row.
A refund is booked in the month in which it happens, **not** in the
month of the original sale, and the report does not name the original
sale month. A refund can therefore not be moved back to the sale. What
the import supports is a newer download of the same month replacing the
older one, plus the provisional window above.

## Data protection

- Fixtures are synthetic: ASINs `B0000000xx`, ISBNs `97800000000xx`,
  titles "Example Title …". `tests/test_finance_fixture_guard.py` fails
  on anything else.
- `.gitignore` covers KDP/KENP/Sponsored-Products downloads and
  `bibliogon-finance*.json`. `backend/tests/test_finance_gitignore_guard.py`
  asks git itself.
- **Not in the `.bgb` backup - decided (#1131).** Finance data leaves the
  machine only through an explicit export, with the same reasoning that
  took the AI keys out of every backup (#985). The path is
  `GET /api/kdp/finance/export` and `POST /api/kdp/finance/restore`.
  `test_finance_data_is_not_in_the_bgb_backup` pins this decision.
- The Danger-Zone reset wipes these tables, and the backup-before-reset
  does not carry them. Export the finance data before a reset. The raw
  reports can always be imported again; costs and rates cannot. The UI
  has to offer the finance export in the pre-reset dialog, or at least
  point to it.

## Endpoints

| method | path | purpose |
|---|---|---|
| POST | `/api/kdp/finance/imports` | multipart `file` (XLSX or CSV), `kind`, `book_format`, `marketplace`, `sheet`, `dry_run` |
| GET | `/api/kdp/finance/imports` | import log |
| PUT | `/api/kdp/finance/kenp-rates/{month}/{marketplace}` | `{rate, currency}` |
| PUT | `/api/kdp/finance/fx-rates/{month}/{currency}` | `{rate, base_currency, source, replace}` |
| POST | `/api/kdp/finance/fx-rates/from-payments` | `{base_currency}`: Amazon's applied rates from imported payments; returns `written`, `unchanged`, `conflicts` (a differing stored rate is never overwritten) |
| POST, GET, DELETE | `/api/kdp/finance/costs` | direct title costs |
| GET | `/api/kdp/finance/report` | `group_by` (title, language, pen_name, format, marketplace, month, channel; comma-separated), `from_month`, `to_month`, `base_currency` |
| GET, POST | `/api/kdp/finance/export`, `/restore` | explicit export and restore |

Money crosses the API as decimal strings and is stored as exact decimal
text (`DecimalText`), never as a float.

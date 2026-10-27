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
  stored in `finance_fx_rates` (proposal: the monthly average. The
  alternative is the payout rate, and the table accepts either. Its
  `source` field records which one was used).
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

Accepted input is CSV (comma, semicolon or tab, UTF-8 with or without a
BOM). KDP offers its royalty downloads as `.xlsx`: XLSX support needs a
new dependency (`openpyxl`), which needs a decision first. Until then,
export the sheet to CSV.

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
- **Not in the `.bgb` backup** (pending the author's decision; proposal:
  explicit export only, with the same reasoning that took the AI keys out
  of backups in #985). The explicit path is `GET /api/kdp/finance/export`
  and `POST /api/kdp/finance/restore`.
- The Danger-Zone reset wipes these tables, and the backup-before-reset
  does not carry them. Export the finance data before a reset. The raw
  reports can always be imported again; costs and rates cannot.

## Endpoints

| method | path | purpose |
|---|---|---|
| POST | `/api/kdp/finance/imports` | multipart `file`, `kind`, `book_format`, `marketplace`, `dry_run` |
| GET | `/api/kdp/finance/imports` | import log |
| PUT | `/api/kdp/finance/kenp-rates/{month}/{marketplace}` | `{rate, currency}` |
| PUT | `/api/kdp/finance/fx-rates/{month}/{currency}` | `{rate, base_currency, source, replace}` |
| POST, GET, DELETE | `/api/kdp/finance/costs` | direct title costs |
| GET | `/api/kdp/finance/report` | `group_by` (title, language, pen_name, format, marketplace, month, channel; comma-separated), `from_month`, `to_month`, `base_currency` |
| GET, POST | `/api/kdp/finance/export`, `/restore` | explicit export and restore |

Money crosses the API as decimal strings and is stored as exact decimal
text (`DecimalText`), never as a float.

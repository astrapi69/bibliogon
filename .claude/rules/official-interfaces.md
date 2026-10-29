# Official interfaces only

Standing decision (Aster, 2026-10-29, #1149): Bibliogon reaches third-party
services only through official, documented, legal means. We stay out of
anything that makes us attackable when we can avoid it.

## Allowed
- Official, documented APIs, used within their terms (e.g. the Amazon Ads API,
  DeepL, the AI providers).
- Files the user exports themselves and hands to Bibliogon (KDP report
  downloads, the payments report, Medium's export).

## Forbidden
- Scraping or bot access to web pages (e.g. Amazon product pages, BSR, ranks).
- Reusing a user's login session or cookies to fetch data on their behalf -
  the way Publisher Champ reads KDP. Technically possible, still out.
- Undocumented internal endpoints of a web app.
- Any of the above through a third party (scraping services, cookie relays).

A competitor doing it, or a provider tolerating it, is not a permission. If
an approach might breach a provider's terms: ask first, do not build.

## Why
- **Account risk:** a breach of terms can close the user's account - for KDP,
  their income.
- **Legal surface:** we do not want to be attackable.
- **Stability:** undocumented interfaces change without notice.
- **Security:** stored sessions or cookies are full account access; credentials
  do not belong in Bibliogon's data or backups (#985).

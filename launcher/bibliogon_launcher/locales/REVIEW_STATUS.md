# Launcher i18n review status

This document tracks the per-language review state of the launcher's i18n catalogs. The machine-readable equivalent lives in each catalog's `_meta` block (when present); this file is the human-readable companion.

## Catalogs

| Code | Language | Status | Translator | Date | Notes |
|------|----------|--------|------------|------|-------|
| en | English | source / reference | maintainer | — | The reference catalog. Every other catalog mirrors its key set. |
| de | Deutsch | user-validated | maintainer | — | Native-speaker. Real umlauts (ä ö ü ß) per the project rule. |
| el | Ελληνικά | user-validated | Claude (Anthropic) + user review | 2026-05-07 | Monotonic Greek, polite-but-friendly 2nd-person singular. User is a native Greek speaker (rusty); reviewed before push. |
| fr | Français | user-validated | Claude (Anthropic) + user review | 2026-05-07 | Tutoiement (informal). User has 4 years of active French refresher; reviewed before push. |
| es | Español | user-validated | Claude (Anthropic) + user review | 2026-05-07 | Tuteo, neutral peninsular Spanish. User has 2 years of active Spanish learning; reviewed before push. |
| pt | Português | **pending native-speaker review** | Claude (Anthropic) | 2026-05-07 | Brazilian Portuguese (você, "aplicativo"). Best-effort translation; awaiting BR-PT speaker validation. |
| tr | Türkçe | **pending native-speaker review** | Claude (Anthropic) | 2026-05-07 | Sen-form informal, full Turkish character set (ı / İ / ş / ç / ğ / ö / ü). Awaiting native speaker. |
| ja | 日本語 | **pending native-speaker review** | Claude (Anthropic) | 2026-05-07 | Polite-neutral 〜です/ます form, kana + kanji mix, katakana for foreign loanwords ("Docker" stays Latin). Awaiting native speaker. |

## How the marker works

Each pending-review catalog carries a `_meta` block at the top of the JSON:

```json
{
  "_meta": {
    "review_status": "pending native speaker",
    "translator": "Claude (Anthropic)",
    "translation_date": "2026-05-07",
    "reference_lang": "en"
  },
  "...other keys": "..."
}
```

The runtime `i18n.t()` function looks up string keys directly, so `_meta` is silently ignored — the dict is data, not a translation entry. The parity tests in `launcher/tests/test_i18n_parity.py` (added in the same session) enforce two contracts:

1. Every catalog has the same content keys as `en.json` (no missing, no extra).
2. Every pending-review catalog (pt / tr / ja) has the `_meta.review_status == "pending native speaker"` block; user-validated catalogs (de / el / fr / es) do **not**.

This means a future native-speaker pass that fixes a translation but leaves the marker is caught by CI as "marker still present after review", and a native pass that updates the catalog without removing the marker still ships safely.

## How to submit corrections

The public call-for-reviewers lives at GitHub issue [#18](https://github.com/astrapi69/bibliogon/issues/18) (labeled `help wanted` + `good first issue` + `documentation`). If you found this file via that issue, welcome — the path below is the one the issue links to.

If you read one of the pending-review catalogs and find errors, the path is:

1. Fork the repo at <https://github.com/astrapi69/bibliogon>.
2. Edit the relevant `launcher/bibliogon_launcher/locales/{lang}.json` directly.
3. Remove the `_meta` block when the entire catalog has been reviewed (keep it if your pass was partial — add a Notes column entry to this file noting the partial state).
4. Open a PR. Tag it `i18n-{lang}` so the maintainer can route it.
5. The launcher i18n parity test will catch:
   - any key removal (catalog must keep parity with `en.json`)
   - any new key without an EN counterpart
   - any placeholder-set drift (`{port}` / `{version}` / `{path}` etc.)

For partial corrections (a few strings, not the whole catalog), open a PR with just the strings you are confident about and leave the `_meta` block in place. The next reviewer can build on top.

## Why these three are pending

The maintainer self-validates DE / EN / EL / FR / ES (native or active learner). PT / TR / JA need outreach — the work is best-effort and clearly marked rather than blocking the entire 8-language launcher rollout on three native-speaker contacts.

The decision to ship pending-review translations rather than wait for outreach is documented in the v0.30.0 session journal: shipped translations cover the language fallback at OS-locale auto-detect time (a Turkish OS user gets a launcher that mostly speaks Turkish instead of English-fallback), the marker makes the trust state explicit, and the runtime path (`i18n.t()`) is unaware of the marker. A native-speaker review only ever improves quality; it does not gate release.

## Audit log

| Date | Action | Catalog | Notes |
|------|--------|---------|-------|
| 2026-05-07 | initial fill | el | Greek added; user-validated |
| 2026-05-07 | initial fill | fr | French added; user-validated |
| 2026-05-07 | initial fill | es | Spanish added; user-validated |
| 2026-05-07 | initial fill | pt | Portuguese added; pending review |
| 2026-05-07 | initial fill | tr | Turkish added; pending review |
| 2026-05-07 | initial fill | ja | Japanese added; pending review |

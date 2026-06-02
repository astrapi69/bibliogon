# Backend i18n review status

This document tracks the per-language review state of the backend
i18n catalogs (`backend/config/i18n/{lang}.yaml`). The
machine-readable equivalent lives in each YAML file's top-level
`_meta:` block when present; this file is the human-readable
companion.

## Catalogs

| Code | Language | Status | Translator | Date | Notes |
|------|----------|--------|------------|------|-------|
| en | English | **source / reference** | maintainer | — | The reference catalog. Every other catalog mirrors its key set. No `_meta` block. |
| de | Deutsch | **maintainer-validated** | maintainer | — | Native-speaker authoritative. Real umlauts (ä ö ü ß) per the project rule. No `_meta` block. |
| es | Español | **full AI native-quality pass; native-speaker spot-check welcome** | Claude (Anthropic) | 2026-06-02 | Full sweep of all previously-passthru keys. Latin American neutral Spanish, "tú" form. `_meta` marker removed (no passthru-English namespaces remain). |
| fr | Français | **full AI native-quality pass; native-speaker spot-check welcome** | Claude (Anthropic) | 2026-06-02 | Full sweep. Metropolitan French, "vous" form, French typography (« » + spaced punctuation). `_meta` marker removed. |
| el | Ελληνικά | **full AI native-quality pass; native-speaker spot-check welcome** | Claude (Anthropic) | 2026-06-02 | Full sweep. Monotonic Modern Greek, polite register, Greek question mark `;`. `_meta` marker removed. |
| pt | Português | **full AI native-quality pass; native-speaker spot-check welcome** | Claude (Anthropic) | 2026-06-02 | Full sweep. European Portuguese (pt-PT: guardar / definições / ficheiro / base de dados). `_meta` marker removed. |
| tr | Türkçe | **full AI native-quality pass; native-speaker spot-check welcome** | Claude (Anthropic) | 2026-06-02 | Full sweep. Modern Turkish with correct vowel harmony. `_meta` marker removed. |
| ja | 日本語 | **full AI native-quality pass; native-speaker spot-check welcome** | Claude (Anthropic) | 2026-06-02 | Full sweep. Polite 〜です/ます; concise noun-form labels; full-width punctuation. `_meta` marker removed. |

> **2026-06-02 — Full native-quality translation sweep (I18N-FULL-SWEEP-01).**
> Every key that was still byte-identical to English across `es/fr/el/pt/tr/ja`
> (≈920–1000 keys per catalog, accumulated from v0.32–v0.44 feature work the
> per-namespace `_meta` markers had fallen behind on) was translated to native
> quality. Loanwords / proper nouns / format names (PDF, EPUB, Markdown, ISBN,
> KDP, Git, "Story Bible", brand names) and literal API field-names shown in the
> AI-template UI were intentionally kept verbatim. Placeholder sets ({count},
> {name}, …) preserved per key. The `_meta` passthru-marker blocks were removed
> from all six catalogs because no namespace is passthru-English any longer; the
> parity test (`test_review_status_marker_shape`) treats marker-absence as the
> maintainer-validated state. A native-speaker spot-check is still welcome — open
> a PR tagged `i18n-{lang}`.

## How the marker works

Each pending-review catalog carries a `_meta:` block at the top of
the YAML:

```yaml
_meta:
  review_status: "partial: pending native speaker for new namespaces"
  translator: "Claude (Anthropic)"
  translation_date: "2026-05-12"
  reference_lang: en
  pending_namespaces:
    - ai_template
    - bulk_ai_fill
    - comments

ui:
  dashboard:
    title: "..."
  ...
```

The backend's `i18n` loader (`backend/app/i18n.py`) and the
frontend's `useI18n` hook treat `_meta` as silent metadata —
no `t("_meta....")` lookup ever resolves to a UI string.

The parity tests in `backend/tests/test_i18n_parity.py` enforce
three contracts:

1. Every catalog has the same content keys as `en.yaml` (no
   missing, no extra).
2. The `_meta` block, when present, conforms to the documented
   shape (`review_status`, `translator`, `translation_date`,
   `reference_lang`, `pending_namespaces`).
3. `en.yaml` and `de.yaml` must NOT carry the marker.

This means a future native-speaker pass that fixes a namespace
but forgets to remove the `pending_namespaces` entry will not
break tests, but a maintainer doing the review can pop the entry
when satisfied; once `pending_namespaces` is empty, remove the
whole `_meta` block.

## How to submit corrections

The public call-for-reviewers can either reuse GitHub issue #18
(launcher i18n) or get its own follow-up; the backlog item
`I18N-NATIVE-REVIEW-V031-01` (P3) tracks the v0.31.0 namespaces.

If you read one of the pending-review catalogs and find errors:

1. Fork the repo at <https://github.com/astrapi69/bibliogon>.
2. Edit the relevant `backend/config/i18n/{lang}.yaml` directly.
3. After translating one of the three v0.31.0 namespaces,
   remove that name from `_meta.pending_namespaces`.
4. When all three are translated AND your pass covered the rest
   of the catalog too, remove the `_meta` block entirely.
5. Open a PR. Tag it `i18n-{lang}` so the maintainer can route it.

The parity test will catch:

- any key removal (catalog must keep parity with `en.yaml`),
- any new key without an EN counterpart,
- any placeholder-set drift (`{port}`, `{title}`, `{count}`, ...),
- any `_meta` shape regression.

## Why these three namespaces

`ai_template`, `bulk_ai_fill`, and `comments` shipped between
v0.30.0 and v0.31.0. Translation work for those domains is
specialised (AI-fill cost projections, comment moderation
language, template field-class semantics) and was deferred to
ship v0.31.0 on schedule rather than holding the release on six
native-speaker contacts. The launcher precedent
(`launcher/bibliogon_launcher/locales/REVIEW_STATUS.md`) covers
the analogous situation for the launcher itself.

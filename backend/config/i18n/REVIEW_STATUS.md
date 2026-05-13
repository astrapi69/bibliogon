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
| es | Español | **partial: pending native speaker for new namespaces** | Claude (Anthropic) | 2026-05-12 | Most of the catalog was user-validated against `LAUNCHER-I18N-NATIVE-REVIEW-01` precedent. The three v0.31.0 new namespaces (`ai_template`, `bulk_ai_fill`, `comments`) are still passthru English. |
| fr | Français | **partial: pending native speaker for new namespaces** | Claude (Anthropic) | 2026-05-12 | Same shape as `es`. Tutoiement (informal) elsewhere; new namespaces left in English. |
| el | Ελληνικά | **partial: pending native speaker for new namespaces** | Claude (Anthropic) | 2026-05-12 | Same shape as `es`. Monotonic Greek elsewhere; new namespaces left in English. |
| pt | Português | **pending native speaker** | Claude (Anthropic) | 2026-05-12 | Whole catalog is best-effort Brazilian Portuguese (você); the three new namespaces share the passthru-English state of the rest of the catalog. |
| tr | Türkçe | **pending native speaker** | Claude (Anthropic) | 2026-05-12 | Whole catalog is best-effort Turkish (sen-form); the three new namespaces share the passthru-English state. |
| ja | 日本語 | **pending native speaker** | Claude (Anthropic) | 2026-05-12 | Whole catalog is best-effort Japanese (polite-neutral 〜です/ます); the three new namespaces share the passthru-English state. |

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

# Library-First Audit — 2026-06-17

One-time audit of in-house utilities under `frontend/src/lib/` and
`frontend/src/shared/` (plus the backend analogues) against established
libraries, run under the new **Library-Grade + Library-First** principle
(see `docs/MODULE-ARCHITECTURE.md` and `.claude/rules/library-first.md`).

- **Parent issue:** #386
- **Scope:** documentation + audit only. No code changes here. Each
  REPLACE / CHECK recommendation is filed as a separate follow-up issue.
- **Method:** for every candidate, weigh bundle size, maintenance status,
  feature parity, and transitive dependencies against the in-house code.

## The 4-stage hierarchy this audit applies

Library-First is the third rung of a ladder walked top to bottom (full
definition in `docs/MODULE-ARCHITECTURE.md` / `.claude/rules/library-first.md`):

1. **Language** — native platform APIs (`Intl`, `crypto.subtle`, `URL`,
   `fetch`, `structuredClone`, …; Python `pathlib`, `dataclasses`, `json`,
   `hashlib`, `functools`).
2. **Framework** — React hooks/Context, Vite `define`, FastAPI `Depends`.
3. **Library** — npm/PyPI, only when 1+2 fall short; a new dep must clear
   >1000 weekly downloads, last update <6 months, bundle <100 kB for anything
   writable in <50 LOC.
4. **Build it yourself** — only when 1–3 don't fit, Library-Grade + cohesion
   <500 lines + cyclomatic complexity <20 + own test file + a PR documenting
   WHY.

A "KEEP" verdict below means the in-house code is already sitting at the right
rung (stage 1 wrapper, stage 3 wrapper, or genuine domain stage-4 with no
library that fits). A "REPLACE" means it sits at stage 4 while a lower stage
does the job.

## Verdict legend

- **REPLACE** — an established library does the job as well or better; the
  in-house code carries avoidable maintenance/correctness risk. File a
  follow-up.
- **KEEP** — building it in-house was the right call (the library is heavier
  than the function, the in-house code already wraps the platform/library, or
  the behaviour is domain-specific). Documented so the decision is not
  re-litigated.
- **CHECK** — borderline; a library exists with marginal benefit. File a
  low-priority follow-up to decide deliberately, do not block on it.

## Frontend — `frontend/src/lib/` + `frontend/src/shared/`

| Utility | Function | Library candidate | Verdict | Rationale |
|---|---|---|---|---|
| `lib/utils/markdownToHtml.ts` | Markdown → HTML (editor Markdown mode) | `marked` (**already a dependency**, used in `import/chapterImporters.ts`) | **REPLACE** | A self-maintained line-based parser reimplements what an already-installed, battle-tested library does. The bespoke `<figure>`/`<figcaption>` promotion is the only delta and is reproducible with a `marked` extension or a post-pass. Zero new bundle cost (already shipped). Follow-up #387. |
| `shared/utils/slugify.ts` | Title → URL/filename slug, **keeps** German umlauts | `slugify` (npm, 3M+/wk) | **KEEP** | The whole point is to keep `ä/ö/ü/ß` verbatim ("Über uns" → `über-uns`); `slugify` and `@sindresorhus/slugify` transliterate them away by default. 7 LOC, no platform gap. The library would change behaviour, not improve it. |
| `shared/utils/downloadBlob.ts` | `createObjectURL → <a download> → revoke` | `file-saver` (npm, 2M+/wk) | **KEEP** (resolved #388) | Evaluated #388: `file-saver`'s modern build IS the same `createObjectURL` + `<a download>` path; its only extra value is legacy fallbacks — IE `msSaveBlob`, old-Safari `FileReader` — for browsers this app already drops (stack requires Chrome 111+/Safari 16.2+ for `color-mix`/`dvh`). Files >2GB need StreamSaver, NOT `file-saver`. So the dep adds zero applicable edge-case coverage against a ~10-LOC helper. Hardened the helper (empty-filename → `"download"`) and removed the duplicate copy in `export/download.ts` (now re-exports the shared helper) instead. |
| `lib/utils/relativeTime.ts` | Locale-aware relative time | `date-fns/formatDistanceToNow`, `dayjs/relativeTime` | **KEEP** | Already built on the platform `Intl.RelativeTimeFormat` — native localisation for all 8 shipped locales with **zero** bundle cost and no per-locale import. A library here would be strictly heavier. This is the model the Library-First rule wants. |
| `lib/utils/textStats.ts` | Word/char count + reading time | `reading-time`, `word-count` | **KEEP** | ~10 LOC, locale-neutral, returns the exact `TextStats` shape the status bar needs. `reading-time` assumes English word boundaries and a fixed WPM; our 250-WPM constant is explicit and tunable. Library adds a dep for no parity gain. |
| `lib/utils/sentenceComplexity.ts` | Sentence split-candidate scoring + `stripHtml` | NLP libs (`compromise`, `sbd`); `striptags`/`sanitize-html` | **KEEP** | The score is a deliberately simple, author-explainable proxy (words + commas); a real NLP dep (100s of kB) is disproportionate. The local `stripHtml` is a small known regex on already-trusted server HTML, not a sanitiser — `dompurify` (already a dep) is the right tool only where untrusted HTML is rendered, which this is not. |
| `lib/utils/RingBuffer.ts` | Fixed-capacity FIFO buffer | `ring-buffer-ts`, `mnemonist/circular-buffer` | **KEEP** | ~50 LOC, fully typed, zero deps, single concern. A micro-library for this is more risk (supply chain) than the code it replaces. |
| `lib/utils.ts` (`cn`) | `clsx` + `tailwind-merge` class merge | — | **KEEP** | This *is* library usage — the shadcn/ui convention wrapping two installed libs. Not an in-house reimplementation. |
| `lib/lazyWithReload.ts` | `React.lazy` + retry + guarded reload | — | **KEEP** | Bespoke PWA stale-chunk recovery for `vite-plugin-pwa autoUpdate`. No library models this failure mode. |
| `shared/utils/swUpdateManager.ts` | SW waiting-worker detect + apply | `vite-plugin-pwa` `useRegisterSW` | **KEEP** | Thin layer over the installed `vite-plugin-pwa` runtime; the user-facing banner wiring is app-specific. Already library-backed underneath. |
| `lib/utils/pageTextContent.ts` | TipTap doc ↔ `text_content` (de)serialize | — | **KEEP** | App-bound to the TipTap doc shape + the `PageLayout` union; no general library applies. |
| `lib/utils/chapterGroups.ts` | Front/back-matter grouping | — | **KEEP** | Pure domain data + a filter; nothing to import. |
| `lib/bookLanguages.ts` | 8 endonym book-language defaults | — | **KEEP** | Curated domain vocabulary, not a generic ISO-639 list (intentionally endonyms, intentionally a fixed 8 + user additions). |
| `lib/chapterTypeLabels.ts` | `ChapterType` → translated label | — | **KEEP** | Maps a domain enum to i18n keys; no library scope. |
| `lib/utils/pageLayoutStyles.ts` | Picture-book layout style math | — | **KEEP** | Domain geometry; no library scope. |

## Backend — `backend/app/`

The prompt's three named backend candidates were checked against the code:

| Candidate | Finding | Verdict |
|---|---|---|
| Atomic YAML write | **No custom helper exists.** `services/app_settings.py` and `services/secrets_management.py` write YAML with a plain `open(...)`/`yaml.dump`, not a temp-file+`os.replace` atomic dance. There is nothing to *replace* — but the absence is itself a small robustness gap (a crash mid-write truncates the config). | **CHECK / follow-up #389** — introduce a single atomic-write helper (stdlib `tempfile` + `os.replace`, or the `atomicwrites`-style pattern) rather than per-call ad-hoc writes. Tracked separately; not a library swap. |
| Security-ignore parser | **No custom parser exists.** The security allowlist (`.security-ignore.yml`) is parsed by `scripts/security_ignore_args.py` as plain YAML — it is not a `.gitignore`-style glob matcher. The "ignore" greps were `# type: ignore` markers and `_write_gitignore()` in `git_book_serializer.py` (which only *writes* a static `.gitignore`, never matches against one). | **KEEP** — nothing to replace; no glob-matching reimplementation is present. |
| Slug generation | **Three small `_slugify`/`slugify` variants** exist with **intentionally different semantics**: `services/toc_validation.py` (GitHub-anchor style, NFD transliteration, em-dash handling — must match rendered anchors), `services/git_book_serializer.py` (filename stem), and `ai/review_store.py` (filesystem-safe report name). `python-slugify` could back the filename cases, but the toc-anchor variant must mirror GitHub's exact algorithm and a library swap risks anchor drift. | **CHECK / follow-up #390** — consolidate the two filename variants behind one helper (optionally `python-slugify`-backed); leave the anchor-matching variant alone. Low priority. |

## Summary

- **1 REPLACE** (high value, zero bundle cost): `markdownToHtml.ts` → `marked` (#387).
- **2 CHECK** (deliberate, low priority): backend atomic-write helper (#389);
  backend filename-slug consolidation (#390).
- **1 CHECK resolved → KEEP**: `downloadBlob` vs `file-saver` (#388) — evaluated;
  kept the native helper (file-saver adds only legacy-browser fallbacks this
  evergreen PWA doesn't need), hardened it + removed the duplicate copy.
- **Everything else KEEP** — and notably, the two strongest examples
  (`relativeTime.ts` on `Intl`, `cn` on `clsx`+`tailwind-merge`) are already
  exactly what Library-First prescribes: thin wrappers over the platform or an
  installed library, not reinventions.

The audit's broader takeaway: Bibliogon's `lib/`/`shared/` layer is mostly
**correctly** in-house (domain logic, platform wrappers, tiny zero-dep
primitives). The one real reinvention — a Markdown parser shadowing an
installed `marked` — is the kind of duplication the Library-First rule is meant
to catch at authoring time.

## Questions and assumptions

- **Follow-up issue numbers (#387–#390)** are referenced above; they are filed
  in the same session as this audit. If a number drifts (concurrent issue
  creation), the titles are the stable reference.
- **`marked`'s figure/figcaption parity** (the only behavioural delta vs the
  in-house parser) is assumed reproducible via a `marked` extension or a
  post-render pass; the follow-up issue owns verifying that before any swap.
  Conservative assumption: the swap is *not* trivial and must preserve the
  TipTap `imageFigure` round-trip (see `.claude/rules/lessons-learned.md`).

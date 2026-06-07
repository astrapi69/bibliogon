# Chat journal — 2026-06-07 (Maximal Offline: chooser + Medium import + AI + comments; #35 fix)

Continuation of the Maximal-Offline arc (carried over from 2026-06-06 after
P3c assets). One long CC session running in parallel with CCW (responsive +
docs). All work landed on `main`; deploy-pages auto-deploys each push. With
this session the **#34 program core is complete** — every offline feature
ships except the AI 1b template-fill port.

## 1. Export-engine chooser (53970493)

Closed the deferred P2 client-export follow-up. A `behavior.export_engine`
preference (auto/client/backend) lets the user pick which engine ExportPage
uses, instead of the implicit online=backend / offline=client switch.
`export/engine.ts` (`shouldUseClientEngine(engine, offline)` — offline always
client, online honours the preference), ExportPage reads the setting via the
seam (defensive default "auto" so a partial mock never breaks it),
VerhaltenSettings RadixSelect, i18n in 8 catalogs. No backend schema change
(behavior is a free dict). 8 helper tests.

## 2. Client-side Medium import (f7c1773e, 4 commits)

A faithful TS/DOMParser port of the backend Medium walker so the export ZIP
imports in the browser. **New dep `fflate`** (user-approved) for in-browser
unzip (browsers have no native ZIP-container decompression). `walker.ts` ports
the corpus-validated quirks (all `section-inner` lanes, `imageFigure` node,
`<br>`->`\n`, graf--title skip, comment heuristic); language detection is
Unicode-script (Greek/kana/Cyrillic -> el/ja/ru, Latin -> null -> default);
images keep their CDN src (client download is CORS-blocked).
`clientImport.ts`: parseMediumZip (preview) + importParsed (create articles
via the seam, dedup by canonical_url). MediumImportPage un-gated offline.
25 tests + offline E2E (zip -> preview -> import -> article in /articles).

## 3. AI via the user's own key — 1a (bb761161, 3 feat commits)

The backendless build now calls the AI provider DIRECTLY from the browser with
the user's key. `ai/llmClient.ts`: `aiChat(config, messages)` over the
OpenAI-compatible chat API (openai/google/mistral/lmstudio) + Anthropic's
`/messages` (system split out, `anthropic-dangerous-direct-browser-access`).
The config (incl. api_key) already persists to IndexedDB via the settings
seam — NO new table; online strips the key but online uses the backend AI.
`marketingPrompts.ts` ports `_MARKETING_PROMPTS` verbatim. Wired offline:
AiAssistantSettings "test connection" (browser ping) + book marketing generate
(html/backpage/bio/keywords). 12 unit tests + E2E (configure key -> test call
goes browser->provider, zero /api). **1b** (full template `aiFill`: template_
schema 801 + apply) is deferred — its own 2-3 session port. CORS per-provider
is a live-verify gap (needs a real key in a real browser).

## 4. git-sync credential 500 fix (#35) (be97295a + ruff-format follow-up)

User bug report: `PUT /api/git-sync/{id}/credentials` 500'd ("Konnte Repo-Token
nicht speichern"). Root cause: `credential_store._get_cipher` raised an
unhandled RuntimeError when `BIBLIOGON_CREDENTIALS_SECRET` was unset — which it
is by default (start.sh auto-generates `BIBLIOGON_SECRET_KEY`, not this
separate secret). Fix: a secret fallback chain
(`BIBLIOGON_CREDENTIALS_SECRET` -> `BIBLIOGON_SECRET_KEY` -> auto-generated
secret persisted in the data dir) so credential storage works out of the box;
plus the CWD-relative storage paths (`config/git_credentials`, `config/ssh`,
the credential_store default) now resolve via `app.paths.get_config_dir()`
(filesystem-isolation rule; None-default module attr keeps the test
monkeypatch). Backend-wide -> covers LAN/mobile too. Endpoint regression pin
(PUT -> 200 with no secret env) + fallback round-trip tests. Issue #35;
GitHub-issue-first discipline followed. (Caught a CI red afterward: I skipped
`pre-commit run --all-files` -> a ruff-format nit slipped through; one-line
hotfix. Now run --all-files before every backend push.)

## 5. Comments offline (8cd399c8, 4 commits)

The last P3 data entity. Dexie v8 `articleComments` table (the API
ArticleComment + a `deleted_at` for the trash state the API model hides);
CommentStorage seam (the 9 api.comments methods + an offline-only `create`);
DexieStorage does list+filter+limit, soft-delete, the full trash lifecycle
(listTrashed/restore/permanentDelete/emptyTrash/bulk), and reclassifyAsArticle
(builds an article from the comment via the articles seam). CommentsAdminSection
seam-routed (works offline; never was gated). **Data source:** the client
Medium import now CREATES comment-classified posts in the store (was skip), so
the admin is non-empty. 5 DexieStorage round-trip tests + offline E2E (import
-> comment in admin -> soft-delete -> trash -> restore, zero /api).

## Verification

Vitest 2740 -> ~2829 across the arc. Every push: tsc + full vitest + build
green; backend ruff + mypy + 133 credential/git/ssh tests for #35; i18n parity
51. CI + deploy green on all five ships. The offline E2E (`offline-pwa.spec.ts`)
gained asset, Medium-import, AI, and comments round-trips — all under the hard
zero-`/api` gate. Aster runs the E2E pre-release.

## Remaining (tracked in #34)

- **AI 1b**: full template `aiFill` offline (port template_schema + prompts +
  apply). The only offline feature left; a dedicated multi-session job.

## Multi-tool coordination notes

Ran in parallel with CCW (responsive-mobile + docs). CCW rebased its docs/
ROADMAP + 6 help pages + responsive editor sidebars onto my work cleanly;
both my commits are in origin/main history. One shared file (ComicBookEditor.tsx:
my P3c asset blob-URLs + CCW's collapsible sidebar) coexists without conflict.
The git-credentials fix is backend-wide so it also covers CCW's LAN/mobile
concern; the git-sync credentials UI responsiveness stays in CCW's lane.

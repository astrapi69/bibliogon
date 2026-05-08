# Session journal — 2026-05-08 — Medium-import MVP + Alembic logging fix

User dropped a 209-post Medium HTML export into `docs/medium-import/`
on the morning of 2026-05-08; previous-session audit identified the
`Article` + `Publication` + `ArticleImportSource` architecture as a
near-perfect fit for a Medium importer plugin. This session shipped
that plugin in 8 commits, then hit a real-runtime regression
("plugin doesn't load") that turned out to be an Alembic logging
silencing bug, fixed in commit 9. Doc sweep + push closed the day.

## 1. Pre-inspection (1 turn)

- Original prompt: extensive 8-question design brief + STOP gate
  before scaffolding.
- Goal: confirm plugin scaffolding pattern, model relationship
  shape, BeautifulSoup availability, and the correct dedup key
  before any code lands.
- Result: 5-decision report. Three notable findings:
  1. The audit had said "dedup on `Publication.url`", but
     `Publication` has no `url` column. The right dedup key is
     `Article.canonical_url` (real column on the model). Caught
     before commit 1.
  2. PluginForge `BasePlugin` uses `init(app_config,
     plugin_config)` to populate `self.config`; the constructor
     takes no args. First scaffold-test failed with `TypeError:
     takes no arguments` until I followed the BasePlugin contract.
  3. Plugin endpoint tests need `with TestClient(app) as c:`
     (per the lessons-learned audiobook entry); plugin routes
     only mount during the FastAPI lifespan. Module-scoped
     fixture adopted.

## 2. Commit 1: ArticleImportSource model + migration

- Goal: a parallel of `BookImportSource` for the Article side, so
  re-imports can detect duplicates and the user can ask "where did
  this article come from?".
- Schema choice surfaced + accepted by user: mirror BookImportSource
  exactly (`article_id` FK cascade, `source_identifier`,
  `source_type`, `format_name`, `imported_at`) plus three
  forward-looking fields: `import_metadata` (JSON Text),
  `importer_version` (str), `conversion_warnings` (JSON Text list).
  Skipped `imported_by` (single-user app) and `raw_source_path`
  (covered by `import_metadata.source_filename`).
- `article_id` is UNIQUE so the `uselist=False` relationship is
  enforced at the DB layer. NO unique on `(source_identifier,
  source_type)` - application-layer dedup keeps a future
  `--update` re-import flag flexible.
- Commit: `418b094`. 6 model tests, all green.

## 3. Commit 2: Plugin scaffold

- Goal: empty plugin shell that loads under the current backend
  lifespan and passes the plugin-lock pre-commit hook, with no
  import-pipeline logic yet.
- Wired path-dep into `backend/pyproject.toml`, added
  `medium-import` to `app.yaml.example` plugins.enabled, dropped
  the 8-language plugin.yaml + plugin.py + routes.py + Makefile
  + README.
- Commit: a7f1ac0. 5 plugin smoke tests; backend test count
  unchanged because the plugin's tests live in its own suite.

## 4. Commit 3: HTML→TipTap walker

- Goal: BeautifulSoup walker that maps every `graf--*` and
  `markup--*` class observed in the audit of 209 production
  posts to TipTap nodes.
- Critical detail: Medium duplicates the page `<h1>` as the
  first `graf--title` H3 in body. The walker skips exactly that
  one occurrence so the title doesn't render twice. Also:
  `graf--h3` -> TipTap heading level=2 (Medium maps user-typed
  H2 to graf--h3 in body since the actual H1 lives in the
  header).
- 25 walker tests against the 3 real fixtures (sample 01 simple
  English with code, sample 02 German with blockquote, sample
  03 English with mixed code blocks + inline code), plus 4
  synthetic edge-case tests (nested marks, list shapes, unknown
  block warning, empty body, br -> hardBreak).
- Commit: `b986397`. 30/30 plugin tests green on first run.

## 5. Commit 4: Image downloader + ArticleAsset

- Goal: per-image download via httpx, write to
  `{upload_dir}/articles/{article_id}/imported_image/{filename}`,
  one ArticleAsset row per file with `asset_type="imported_image"`,
  return a `cdn_url -> served_path` rewrite map applied to the
  TipTap doc before persistence.
- Backend-side `_ALLOWED_ASSET_TYPES` extended with
  `"imported_image"` so the existing serve-by-filename endpoint
  delivers downloaded Medium images.
- Per-image HTTP failures emit warnings but never abort the
  batch (one bad image must not punish the rest).
- Commit: `7bf959f`. +11 plugin pure-function tests + 4
  backend-side tests with a fake httpx.Client; backend total
  1308 -> 1318.

## 6. Commit 5: Bulk ZIP endpoint + dedup + provenance

- Goal: `POST /api/medium-import/import` accepts a ZIP and
  produces one `Article` + one `Publication` (platform=medium)
  + one `ArticleImportSource` per `posts/*.html` it finds.
- Per-post transactions: each post lives in its own
  `SessionLocal()` block. One bad post never rolls back the
  others.
- Dedup branch confirmed against `Article.canonical_url`.
- Plugin pyproject gained `python-multipart 0.0.27` (FastAPI
  requires it for `UploadFile`/`File`).
- Commit: `2adc21a`. +11 backend endpoint tests; backend total
  1318 -> 1329.

## 7. Commit 6: Round-trip smoke tests

- Original plan: "test: 3 sample posts as fixtures + edge cases".
  But commits 3-5 already exercised that with 25 walker + 11
  endpoint + 4 downloader tests against the 3 real fixtures.
  Reframed to cover the actual coverage gap.
- Goal: prove imported articles are usable through Bibliogon's
  existing API surface (list, fetch, trash/restore, Publication
  drift baseline, ArticleImportSource relationship).
- 5 tests pin the user-flow expectations; the most load-bearing
  is the `Publication.content_snapshot_at_publish ==
  Article.content_json` assertion, which is the regression pin
  for "every imported article would show up as out_of_sync on
  the drift dashboard from the moment it lands".
- Commit: `603fbed`. Backend 1329 -> 1334.

## 8. Commit 7: Bilingual help page

- Goal: `docs/help/{en,de}/import/medium.md` covering the user
  flow, what gets imported / what doesn't, re-import behaviour,
  post-import follow-ups, and limitations.
- Wired into `docs/help/_meta.yaml` under the existing Import
  group; mkdocs.yml regenerated via
  `scripts/generate_mkdocs_nav.py`.
- German prose uses real umlauts (UTF-8) per the lessons-learned
  rule; verified with both the umlaut-presence regex and the
  ASCII-transliteration suspect regex.
- `make verify-docs-discipline` passes (verify-mkdocs-nav +
  check-mkdocs-orphans).
- Commit: `35956c6`.

## 9. Commit 8: Backlog close + V2 followups

- Goal: full archive entry under
  `docs/roadmap-archive/2026-05.md` for `MEDIUM-IMPORT-MVP-01`,
  plus two new P2 backlog entries for V2 work.
- Backlog additions:
  - `MEDIUM-IMPORT-V2-01`: dry-run preview UI before bulk
    import. Trigger: first user report that the post-import
    archive flow is too tedious for archives with many junk
    drafts.
  - `MEDIUM-IMPORT-V2-02`: AI tag inference using the existing
    `backend/app/ai/` core module. Trigger: user reports the
    manual-tagging step is a bottleneck.
- CLAUDE.md plugins table gained `plugin-medium-import` row +
  the previously-missing `plugin-git-sync` row (the latter was
  flagged in the v0.30.0 competitive-analysis review as a docs
  gap).
- Commit: `cf61087`.

## 10. Diagnostic-fix turn ("plugin doesn't load")

- Original prompt: "The medium-import plugin doesn't load at
  runtime. Diagnose needed." with symptoms: `app.yaml` correct,
  container restarted, "Backend logs show NO plugin loading
  messages at all (only alembic plugins)", `/openapi.json`
  shows no `/api/medium-import/*` routes.
- Goal: diagnose + fix in a single commit; surface the root
  cause and add logging so future "is the plugin loading?"
  questions answer themselves.
- First hypothesis (wrong, but plausible enough to verify):
  container was restarted but not rebuilt, so the new path-dep
  isn't installed. Locally checked
  `entry_points(group="bibliogon.plugins")`: `medium-import`
  IS in the entry-point set; the package is correctly
  registered. Ruled this out for our local env.
- Real root cause: `migrations/env.py:18` calls
  `fileConfig(config.config_file_name)` unconditionally. Two
  side effects:
  1. `disable_existing_loggers=True` is the default;
     `app.main`'s logger gets disabled.
  2. The root-logger level resets to `WARNING` per
     `alembic.ini`'s `[logger_root]` section. Subsequent
     INFO lines are below threshold and dropped.
  Result: the plugin DOES load (routes mount, `/api/medium-
  import/health` returns 200 in a fresh TestClient
  reproduction), but every `logger.info(...)` from `app.main`
  AFTER `init_db()` vanishes. The user's symptom was a
  logging silencing, not a plugin-loading failure.
- Fix: gate `fileConfig` on `logging.getLogger().handlers`
  being empty. Standalone alembic CLI: no handlers, fires as
  documented. Embedded use through `init_db()`: handlers
  already attached, skip. The CLI path stays intact.
- Diagnostic enhancement requested by user landed alongside:
  three new helpers in `app.main`
  (`_discovered_entry_points`, `_enabled_plugins_from_config`,
  `_log_plugin_diagnostics_pre`/`_post`). Startup now emits
  3 INFO lines + WARNING-level lines for `get_load_errors()`
  and for the `enabled-vs-active` diff (with a rebuild hint).
  7 regression tests pin the log shape.
- Commit: `cdf385f`. Backend 1334 -> 1341.

## 11. Plugin config-file-location fix

- During the diagnostic turn the uvicorn smoke test surfaced a
  DEBUG line: `pluginforge.config: Config file not found,
  using empty defaults: backend/config/plugins/medium-import.yaml`.
- Original placement was
  `plugins/bibliogon-plugin-medium-import/config/medium-import.yaml`
  (mirrored KDP's local layout for the ZIP-build target).
  PluginForge actually reads from the backend's
  `plugins.config_dir` (set in `app.yaml` to
  `config/plugins`), so the user-meaningful settings
  (`download_images=true`, `image_download_timeout_seconds=30`,
  `skip_existing_canonical_urls=true`,
  `default_status=published`) were silently replaced with an
  empty dict at startup.
- Fix: copy the YAML to `backend/config/plugins/medium-import.yaml`.
  Plugin-side `config/` left in place for the ZIP-build
  target.
- Commit: `4a166bf`.

## 12. 502 report + push

- User reported HTTP 502 on every endpoint
  (`/api/articles`, `/api/i18n/de`, `/api/settings/app`, etc.)
  alongside a Bibliogon-generated bug-report payload.
- Reproduced backend startup locally via both `TestClient(app)`
  and `uvicorn app.main:app`; both succeed. All 11 plugins
  activate including medium-import; `/api/articles` returns
  200. Conclusion: the 502s are a runtime/deployment problem
  (container not running, proxy can't reach it, or the new
  Alembic migration crashed startup). Not a code bug.
- Surfaced concrete next-steps: `docker logs <backend-container>
  --tail 200` to find the lifespan traceback, or `docker
  compose build` (not just restart) if the path-dep wasn't
  picked up.
- User confirmed `docker compose down`, then asked for a
  step-by-step Medium-ZIP recipe.
- Push: `06f73ee..4a166bf` (13 commits) landed on origin/main.

## 13. Doc sweep (this entry)

- Goal: address "update the docs" + "step-by-step recipe" in
  one pass.
- Updated:
  - `docs/CHANGELOG.md`: new `[Unreleased]` block covering the
    Medium-import MVP + the Alembic-fileConfig fix.
  - `.claude/rules/lessons-learned.md`: two new top-of-file
    entries
    1. "Alembic `fileConfig` silences every existing logger" -
       canonical writeup of today's bug. The wrap-in-handler-
       check pattern generalises to any library that auto-
       configures logging on import in two contexts (CLI vs.
       embedded).
    2. "Plugin settings YAML lives in `backend/config/plugins/`,
       not in the plugin's own directory" - canonical
       writeup of commit 11's bug.
  - `docs/help/{en,de}/import/medium.md`: rewritten as a
    4-step recipe (get the export -> confirm backend is up ->
    run import via curl -> after-the-import follow-ups). Added
    explicit Troubleshooting section covering all three
    failure modes hit during today's session: enabled-but-not-
    loaded plugin, every-endpoint-502 (backend down), config-
    file-not-found.
  - `docs/API.md`: plugin-router table gains
    `medium-import` + previously-missing `git-sync` rows; one
    example for the `/api/medium-import/import` shape.
  - `docs/journal/chat-journal-session-2026-05-08.md`: this
    file.
- Final commit + push will land everything in one chunk.

## Statistics

- 11 commits across the day (8 MVP commits + Alembic-logging
  fix + config-file-location fix + this doc sweep, pending
  commit-and-push).
- Backend tests: 1308 -> 1341 (+33). Plugin tests: 0 -> 40
  (new `bibliogon-plugin-medium-import` suite). All green.
- Lines: roughly 250 walker LOC, 290 walker-test LOC, 250
  importer LOC, 200 endpoint-test LOC, 175 round-trip-test
  LOC, 50 KB fixture HTML, 90 LOC diagnostic helpers + 165
  LOC diagnostic-test LOC.
- Two real runtime bugs fixed alongside the MVP:
  1. Alembic `fileConfig` silencing every post-`init_db` log
     line (existed since the project's first Alembic setup;
     surfaced today because the new diagnostic logging made
     the silence obvious).
  2. Plugin config YAML at the wrong path (introduced in
     commit 2's scaffold; surfaced when uvicorn smoke-tested
     the load path during commit 9).

## What worked

- The pre-inspection STOP gate caught two design-doc errors
  (audit said "dedup on `Publication.url`"; BasePlugin
  constructor signature) before any scaffolding code touched
  the tree. Both would have been one-or-two-commit detours
  if discovered later.
- Reframing commit 6 from "more fixture coverage" to
  "round-trip via existing API surface" closed an actual
  coverage gap (the Publication drift-baseline regression
  pin) instead of duplicating earlier work.
- The "plugin doesn't load" diagnostic turn used the same
  evidence-first method as the test-isolation tripwire
  story: reproduce locally, confirm what works, narrow the
  hypothesis from "plugin not installed" -> "logging
  silenced" by tracing the actual log output instead of the
  reported symptom.

## What struggled

- First commit-9 attempt (just `disable_existing_loggers=False`)
  was incomplete because it didn't address the root-logger
  level reset. Caught by re-running the uvicorn smoke
  reproduction; the second iteration (gate the fileConfig
  call entirely) is the right shape.
- The plugin scaffold's config YAML went to the wrong path
  because I followed the KDP plugin's local-config layout
  without checking where PluginForge actually reads from.
  The DEBUG-level "config file not found" line was in the
  startup log all along; it just wasn't INFO and wasn't
  highlighted. Today's lessons-learned entry plus
  promotion-to-WARNING (which would have surfaced this
  earlier) is the next-prompt candidate if it bites again.

## Open questions / followups

- The user's runtime 502 wasn't diagnosed end-to-end; left
  in their hands with a list of `docker logs` / `docker
  compose build` next-steps. If it turns out to be a
  reproducible bug in our build path, that's a follow-up
  commit (rebuild docs / container-rebuild reminder hook /
  whatever the actual cause turns out to be).
- The MEDIUM-IMPORT-V2 entries in the backlog are gated on
  user reports. No commitment on when they ship.
- The plugin currently ships without an in-app frontend
  panel (manifest declares a `settings_section` slot, no
  React panel implementation). v1 ships as
  curl-against-the-API. Adding the panel is a 1-2 commit
  follow-up; not committed to a date.

# Plugin Metadata Pattern Audit — 2026-05-18

**Status:** Audit complete. STOP gate active: no code changes until user confirms D1–D5 + migration scope.

**Trigger:** User observation during plugin-comics Session 1: "plugin-comics has `plugin.yaml` but other existing plugins appear to use code-based metadata — inconsistent pattern is architecture-smell." Plus user-question about whether `app_name` / `app_id` scoping fields are needed.

**TL;DR:** The user's premise is partially wrong. Bibliogon has **THREE** distinct metadata sources per plugin, each with a different consumer + different lifecycle. The apparent inconsistency between plugins is real but is NOT what the user observed — the actual smell is that the 4 plugins shipping `plugins/.../plugin.yaml` **duplicate** content that already lives in `backend/config/plugins/<name>.yaml`. `app_name` / `app_id` are NOT needed (existing entry-point group scoping is sufficient). Recommendation: a 1-commit cleanup that documents the 3-source pattern explicitly + removes the duplicate `plugin.yaml` files from 4 plugin dirs where they redundantly mirror `backend/config/plugins/`. Optional follow-up to formalize "this plugin is ZIP-distributable" vs "bundled-only" as an explicit dimension.

---

## Track A — Per-plugin metadata inventory

12 plugins in the tree. Per-plugin sources audited via `grep -E "^\s*(name|version|api_version|license_tier|depends_on|description|display_name|author|app_name|app_id)\s*[:=]"` on every `plugin.py`, plus `cat` on every yaml.

### Source 1 — `plugin.py` class attributes (12 / 12 plugins, mandatory)

All 12 plugins define class attributes on their `BasePlugin` subclass:

| Field | All-12 default | Variations observed |
|---|---|---|
| `name` | unique slug (`"audiobook"`, `"comics"`, etc.) | each unique |
| `version` | `"1.0.0"` | uniform across all 12 (plugin versions are lock-stepped to app per release-workflow) |
| `api_version` | `"1"` | uniform |
| `license_tier` | `"core"` | uniform (all free during current phase) |
| `depends_on` | `[]` or `["export"]` | 4 plugins depend on export (comics, kdp, kinderbuch, audiobook implicitly via routes) |
| `description` | rarely present | only `git-sync` defines it |
| `display_name` | NEVER defined here | uniformly absent |
| `author` | NEVER defined here | uniformly absent |
| `app_name` / `app_id` | NEVER defined anywhere | **zero hits across all 12 plugins** |

Consumed by: pluginforge's `PluginManager` for activation order, dependency resolution, license-tier check, hook compatibility. Read at every backend startup via `importlib.metadata.entry_points()`.

### Source 2 — `backend/config/plugins/<name>.yaml` (12 / 12 plugins, mandatory at runtime)

Every plugin has a corresponding YAML file in `backend/config/plugins/`. This is the **canonical runtime UI-metadata source** PLUS the plugin's settings defaults. Shape:

```yaml
plugin:
  name: <slug>
  display_name:
    de: <localized>
    en: <localized>
    # ... 1-8 languages
  description:
    de: <localized>
    # ...
  version: "1.0.0"
  license_tier: core
  depends_on: [...]
  # optional: license, license_type, min_app_version, entry_point

settings:
  # plugin-specific user-editable settings
```

Plugin-by-plugin metadata coverage (full audit of `backend/config/plugins/*.yaml`):

| Plugin | `display_name` langs | `description` langs | `settings:` block |
|---|---|---|---|
| audiobook | 5 (de, en, es, fr, el) | 5 | yes |
| comics | 8 (full) | 8 (full) | yes (empty `{}`) |
| export | 4 (de, en, es, fr) | 2 (de, en) | yes |
| getstarted | 2 (de, en) | 2 (de, en) | yes |
| git-sync | — | — | (yaml not present — single exception) |
| grammar | 2 (de, en) | 2 (de, en) | yes |
| help | 2 (de, en) | 2 (de, en) | yes |
| kdp | 5 (de, en, es, fr, el) | 5 | yes |
| kinderbuch | 5 | 5 | yes |
| medium-import | 8 (full) | 8 (full) | yes |
| ms-tools | 2 (de, en) | 2 (de, en) | yes |
| translation | 2 (de, en) | 2 (de, en) | yes |

**Sub-finding A.1:** 11 / 12 plugins have a `backend/config/plugins/<name>.yaml`. `git-sync` is the one exception — the running backend logs the gap: `DEBUG [pluginforge.config] Config file not found, using empty defaults: backend/config/plugins/git-sync.yaml`. Functions because git-sync has no settings, but the missing display_name + description means the Settings UI shows just `git-sync` as the label (no i18n localization).

**Sub-finding A.2:** i18n coverage is wildly uneven. comics + medium-import ship full 8-language coverage; export ships 4, getstarted/grammar/help/ms-tools/translation ship only 2. This is a separate gap from the metadata-pattern question — it's an i18n-completeness drift.

Consumed by:
- Backend: `read_plugin_config_merged()` in `app/config_overlay.py` merges project-tree + user-overlay.
- Backend → frontend: `GET /api/plugins/list-discovered` returns per-plugin metadata (`license_tier`, `has_license`).
- Frontend: `PluginSettings.tsx` reads `meta.display_name` + `meta.description` via `getLocalized()` to render plugin cards.

### Source 3 — `plugins/bibliogon-plugin-<name>/plugin.yaml` (4 / 12 plugins, ZIP-build only)

Only 4 plugins ship a `plugin.yaml` AT THEIR REPO LOCATION (NOT in `backend/config/plugins/`):

| Plugin | Has `plugin.yaml` in repo? | Content vs `backend/config/plugins/<name>.yaml` |
|---|---|---|
| comics | YES | **Near-duplicate** (same display_name + description + version + license_tier) |
| kdp | YES | **Near-duplicate** |
| kinderbuch | YES | **Near-duplicate** |
| medium-import | YES | **Near-duplicate** |
| audiobook, export, getstarted, git-sync, grammar, help, ms-tools, translation | NO | n/a |

The 4 plugins' Makefile targets each carry a `build-zip` rule that packages `plugin.yaml` into the distributable ZIP:

```
# plugins/bibliogon-plugin-comics/Makefile (line 11-15)
@cd .. && zip -r $(PLUGIN_NAME)/dist/$(ZIP_NAME) \
    $(PLUGIN_NAME)/bibliogon_comics/ \
    $(PLUGIN_NAME)/plugin.yaml \   ← THE FILE EXISTS FOR THIS
    $(PLUGIN_NAME)/pyproject.toml \
```

Consumed by: ONLY `backend/app/routers/plugin_install.py`. The `_validate_plugin_zip()` function at line 115 reads `plugin.yaml` from an uploaded ZIP, validates the `plugin.name` field, then `_extract_plugin()` at line 175 reads the same file and forwards its content to `config_overlay.write_user_plugin_config(plugin_name, plugin_yaml)`. **So `plugin.yaml` in the repo dir is purely a ZIP-distribution payload — never read at runtime by any of the 4 plugins it's shipped with.**

---

## Track B — Identification fields (`app_name`, `app_id`)

**Zero plugins currently have `app_name` or `app_id` or any analogous scoping field.** Verified by:

```bash
grep -rn "app_name\|app_id" plugins/*/bibliogon_*/plugin.py plugins/*/plugin.yaml \
    backend/config/plugins/*.yaml
```

Returns no hits. Identification works via:

1. Plugin's `name` class attribute (slug, e.g. `"comics"`)
2. Entry-point group `"bibliogon.plugins"` in the plugin's `pyproject.toml`
3. Pluginforge's `PluginManager(entry_point_group="bibliogon.plugins")` discovers exactly the plugins in that group

This is **sufficient scoping** because:
- The entry-point group name (`bibliogon.plugins`) is already the "app scope". No two distinct apps would register plugins under the same group.
- Plugins import `app.*` from Bibliogon's backend (e.g. `from app.models import Book`), so they're functionally coupled to Bibliogon regardless of any explicit identifier.
- Pluginforge (per `.claude/rules/architecture.md`) is "application-agnostic" in principle, but the contract is: each application using PluginForge picks its OWN entry-point group name. Bibliogon picked `bibliogon.plugins`. That IS the app scope.

**Future hypothetical:** if Bibliogon plugins ever needed to be shareable across applications (e.g. an `export` plugin running under both Bibliogon and a hypothetical Bibliogon-Lite), the right scoping mechanism would be to register the plugin under **multiple** entry-point groups (`bibliogon.plugins` + `bibliogon-lite.plugins`), not to add an `app_id` field. The entry-point group is the architectural-scope primitive PluginForge already provides.

**Conclusion:** `app_name` / `app_id` add **no value** and would be ceremony with no consumer.

---

## Track C — YAML-vs-Code pattern analysis

The user's question framed this as YAML-vs-Code. The audit shows that's a false dichotomy. The right framing is **three sources with three distinct consumers**:

| Source | Consumer | Why YAML or why code? |
|---|---|---|
| `plugin.py` class attrs | pluginforge (Python runtime) | Code — pluginforge is a Python library reading Python class attrs. YAML would require a parse step that wasn't needed. |
| `backend/config/plugins/<name>.yaml` | Settings UI (i18n display) + plugin settings | YAML — i18n strings benefit from being declarative + externally parseable + non-Python-coder-editable. Settings defaults benefit from the same. |
| `plugins/.../plugin.yaml` | ZIP-installer at upload time | YAML — must be readable by the installer without `pip install`'ing the plugin first (chicken-and-egg). |

The three sources are NOT a smell — they're an architecturally correct separation. The smell is **content duplication** between source 2 and source 3 in the 4 plugins that ship both.

### Pattern-fit verification

For each source, does the type of content match the chosen format?

- Source 1 (class attrs) hold **identity + contract** data — slug, version, dependencies. These are mechanical / programmatic. Python class attrs are the right home.
- Source 2 (`backend/config/plugins/<name>.yaml`) holds **i18n display strings + user-editable settings**. YAML is the right home (declarative, externally parseable, non-developer-editable).
- Source 3 (`plugins/.../plugin.yaml`) holds the **same** i18n display strings the installer needs to seed source 2 with at ZIP-install time. YAML is the right format BUT the content is a duplicate. The right fix is to derive source 3 from source 2 at build time (`make build-zip` reads `backend/config/plugins/<name>.yaml` and writes it as `plugin.yaml` inside the ZIP).

---

## Track D — Single-source-of-truth analysis

Per Bibliogon's existing SSoT discipline (`.claude/rules/lessons-learned.md` "Single source of truth for version pins"): every duplicated metadata constant is a stale-pin bug waiting to happen.

The 4 plugins with `plugins/.../plugin.yaml` violate the SSoT rule when their content overlaps with `backend/config/plugins/<name>.yaml`. Concrete example from plugin-comics today:

| Field | `plugins/bibliogon-plugin-comics/plugin.yaml` | `backend/config/plugins/comics.yaml` | Drift risk |
|---|---|---|---|
| `name` | `comics` | `comics` | Same — low risk |
| `version` | `"1.0.0"` | `"1.0.0"` | Same — but two places to remember to bump |
| `license_tier` | `core` | `core` | Same |
| `display_name.de` | `"Comic"` | `"Comic"` | Same TODAY; will drift on translation edits |
| `description.de` | `"Comic-Authoring mit Panels und Sprechblasen (Phase 1: Grundgerüst)"` | `"Comic-Authoring mit Panels und Sprechblasen (Phase 1: Grundgerüst)"` | Same TODAY; **especially likely to drift** as Phase 2 lands and one place gets updated but not the other |
| `min_app_version` | `"0.36.0"` | `"0.36.0"` | Same — but the field is unused anyway (audit elsewhere today found zero consumers) |

The fields are duplicated **char-for-char**. There's no programmatic guard preventing drift. A future contributor editing translations in one file but not the other introduces silent drift.

Same drift opportunity exists for kdp, kinderbuch, medium-import. Each has the same pair of near-duplicate YAML files.

---

## Decision points (D1–D5)

### D1 — Which pattern is currently used by the majority of plugins?

**All 12 plugins use Pattern X** = (`plugin.py` class attrs for identity) + (`backend/config/plugins/<name>.yaml` for UI metadata + settings).

The visible inconsistency the user observed is at a different level: **4 / 12 plugins additionally ship `plugins/.../plugin.yaml` for ZIP-distribution**. That's not a metadata-pattern divergence — it's a distribution-shape divergence.

### D2 — Is plugin-comics an outlier, or is plugin-comics correct (and others should migrate)?

**plugin-comics is NOT an outlier on metadata pattern.** It joined the 4-plugin subset that also ships ZIP-distribution metadata (kdp, kinderbuch, medium-import). The pattern is consistent within that subset.

The relevant question is whether plugin-comics SHOULD ship a `plugin.yaml` in its repo dir at all. Two paths:

- **Path A (recommended):** plugin-comics is a Bibliogon-bundled plugin with no current need for third-party-ZIP distribution. Delete its `plugins/bibliogon-plugin-comics/plugin.yaml` AND its `make build-zip` target. Same recommendation applies symmetrically to kdp, kinderbuch, medium-import — none of them are currently ZIP-distributed, all are bundled in the repo + installed via path-dep.
- **Path B:** keep the ZIP-distribution surface as forward compatibility. Generate `plugin.yaml` at build time from `backend/config/plugins/<name>.yaml`. Remove the in-repo duplicate. The `make build-zip` target's substitution is straightforward.

**My recommendation: Path B.** Bibliogon's licensing infrastructure exists (currently dormant) and a future third-party-plugin marketplace is a documented possibility (see `CLAUDE.md` "Plugins" section). Preserving the ZIP-install code path is cheap; eliminating the duplicate authoring burden is the real win.

### D3 — `app_name` + `app_id` — do plugins need them?

**No.** Entry-point group `"bibliogon.plugins"` is the existing scoping primitive. Adding `app_name` / `app_id` to plugin metadata would create ceremony with no consumer. The future hypothetical of multi-app plugin sharing is correctly addressed by registering plugins under multiple entry-point groups, not by adding a per-plugin identifier.

### D4 — i18n strings: YAML or code?

**YAML wins.** All 11 / 12 plugins that ship UI strings ship them in `backend/config/plugins/<name>.yaml`. Plus `plugin.yaml` (where present) holds the same strings. Zero plugins hold UI strings in `plugin.py` class attributes.

The `backend/config/i18n/<lang>.yaml` catalogs are a DIFFERENT system — they hold Bibliogon-core UI strings (Dashboard, Editor, etc.), not plugin metadata. The two systems are complementary, not competing.

**Conclusion:** keep i18n strings in plugin YAML (`backend/config/plugins/<name>.yaml`). The current pattern is correct.

### D5 — Migration strategy if standardization is needed

Two distinct migration tracks emerge:

**Track 5A — Deduplicate `plugin.yaml` content (1 commit, S effort)**

For each of the 4 plugins with `plugins/.../plugin.yaml`:

1. Confirm `backend/config/plugins/<name>.yaml` carries the FULL metadata (it does for all 4 — verified in Track A's inventory).
2. **Option B1:** Delete `plugins/.../plugin.yaml` AND remove `make build-zip` from the plugin's Makefile. Cleanest, removes the ZIP path entirely. Reversible — the ZIP path can be reintroduced later if a third-party-plugin marketplace ships.
3. **Option B2 (recommended):** Replace each `plugins/.../plugin.yaml` with a symlink to `../../backend/config/plugins/<name>.yaml`. The symlink keeps the file accessible by `make build-zip` AND by `plugin_install.py`'s ZIP-load path, while preventing drift. Cross-platform caveat: Windows requires Developer Mode for symlink creation. Alternative: `make build-zip` copies `backend/config/plugins/<name>.yaml` to a tmp location named `plugin.yaml` and packages from there.
4. **Option B3:** Keep both files but add a pre-commit hook that asserts they're identical (`diff plugins/.../plugin.yaml <(yq '.' backend/config/plugins/<name>.yaml)`). Costs nothing at edit time but catches drift at commit.

My recommendation for Track 5A: **Option B2's "build-time copy" variant.** Zero symlink portability issues, single-canonical-edit-location enforced, ZIP path preserved. Touches 4 Makefiles + deletes 4 yaml files = 8-file diff, single commit.

**Track 5B — Add `backend/config/plugins/git-sync.yaml` for the missing plugin (1 commit, XS effort)**

git-sync is the 1 / 12 plugin lacking a `backend/config/plugins/git-sync.yaml`. The Settings UI shows the raw slug instead of a localized display name. Fix: ship the missing yaml with `name`, `display_name`, `description` in 2+ languages. Single file, ~10 lines.

**Track 5C — i18n completeness sweep (1 commit, M effort, defer to follow-up backlog)**

Per Sub-finding A.2, i18n coverage in `backend/config/plugins/<name>.yaml` ranges 2–8 languages. Bringing all plugins to 8-language parity is a separate hygiene sweep. File as `PLUGIN-METADATA-I18N-PARITY-01` (P3) — not part of this audit's scope.

---

## Recommended commit sequence (if user GOes)

| # | Commit | Files | Effort | Optional? |
|---|---|---|---|---|
| 1 | `refactor(plugins): deduplicate plugin.yaml via build-time copy from backend/config/plugins/` | 4 plugin Makefiles + delete 4 plugin.yaml files | S | No (if standardization confirmed) |
| 2 | `fix(plugin-git-sync): add backend/config/plugins/git-sync.yaml metadata` | 1 new yaml | XS | Yes (small follow-up) |
| 3 | `docs(rules): codify the 3-source plugin-metadata pattern in architecture.md` | 1 rules doc | XS | Yes (lessons-learned generalization) |
| 4 | `docs(backlog): file PLUGIN-METADATA-I18N-PARITY-01 (P3) — sweep 2-lang plugins to 8` | 1 backlog edit | XS | Yes (deferred) |

Within the 5–9 commit session stop-condition.

---

## Half-Wired-Lifecycle implications (per user's STOP-gate note)

The user flagged this as the 5th instance of Half-Wired pattern today. Let me check whether this is the same class.

The Half-Wired pattern fires when a state-write surface ships without its consumer (or vice versa). The plugin-comics `plugin.yaml` is NOT half-wired — it has a consumer (`plugin_install.py`'s ZIP path). What's actually happening is **silent-duplication**: the same content exists in two places without a deduplication mechanism.

This is closer to the **SSoT-violation** pattern documented in `.claude/rules/lessons-learned.md` "Single source of truth for cross-cutting concerns" than to half-wired. The fix shape is similar (deduplicate via tooling) but the framing differs.

**Pre-Inspection-Checklist additions (proposed for `.claude/rules/ai-workflow.md`):** when scaffolding a new plugin:

- Class attrs in `plugin.py` (`name`, `version`, `api_version`, `license_tier`, `depends_on`) ✓
- `backend/config/plugins/<name>.yaml` with `display_name` + `description` (i18n × all 8 catalogs to match medium-import's parity, NOT just 2 like the early plugins) ✓
- `plugins/.../plugin.yaml`: **DO NOT CREATE** if the bundled-only Path A is selected; OR derive from `backend/config/plugins/<name>.yaml` at build time per Path B.
- `backend/pyproject.toml` path-dep ✓
- `backend/config/app.yaml.example` enable-list (caught by today's audit, already in the Makefile-integration filing) ✓
- ci.yml + coverage.yml plugin matrix ✓
- Makefile targets (caught by today's `PLUGIN-COMICS-MAKEFILE-INTEGRATION-01` filing) ✓
- TestClient integration test ✓
- User-overlay enabled-list migration (separate filing pending: see Bug C investigation)

---

## Parallel-work safety

This audit is read-only. No code touched. Reviewing the working tree:

```
$ git status
clean
```

No conflicts with the parallel CC-session's KDP work (their `bad10fe` + `ca19b92` already on `origin/main`).

---

## Standing by for GO

User needs to confirm:

1. **D5 migration scope:** Path A (delete plugin.yaml + drop ZIP target) OR Path B (deduplicate via build-time copy)?
2. **Track 5B git-sync yaml:** ship as part of the same commit, or separate?
3. **Track 5C i18n-parity:** file as backlog item OR include in immediate cleanup?
4. **Rules doc update:** codify the 3-source pattern in `.claude/rules/architecture.md` as a sub-section, OR file as separate documentation backlog?

If GO with B + immediate 5B + defer 5C: ~3 commits, well within session limit.

If GO with A + immediate 5B + defer 5C: ~2 commits.

Audit doc complete at: `docs/audits/plugin-metadata-pattern-audit-2026-05-18.md`.

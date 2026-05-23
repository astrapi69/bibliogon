# About-Dialog Feature — Pre-Inspection Audit (2026-05-18)

**Status:** Audit complete. STOP gate active: no code until user confirms D1–D6 + scope selection.

**Goal:** ship an About-Dialog surface that shows app version, plugin list, donation channels, credits, system info.

**TL;DR:** No existing About-Dialog surface; clean greenfield. Settings has 8 tabs — adding a 9th `about` tab is mechanical. Frontend already has `__APP_VERSION__` build-time literal + the backend `/api/health` exposes version. **The one real architectural decision is the plugin-list endpoint shape — `/api/settings/plugins/discovered` already returns activation state but lacks `display_name` + `version`, so EITHER extend that endpoint OR add a fresh `/api/system/info`.** Recommended scope: 5-6 commits (NOT 8), skipping commit-hash injection for v1 (defer to follow-up if user demand). SupportSection is reusable as-is — no new shared component needed yet.

---

## Track A — Existing About-Pattern audit

### Settings tabs (the natural About home)

`frontend/src/pages/Settings.tsx` currently has 8 tabs declared in `VALID_SETTINGS_TABS`:

```
app | ai | author | authors_database | topics | plugins | comments | support
```

Each tab is rendered via Radix `Tabs.Trigger` + `Tabs.Content`. Mobile dropdown mirrors the same set. Deep-link via `?tab=app` (URL param routing). Adding a 9th tab `about`:

- Extend `VALID_SETTINGS_TABS` array.
- Add `tabDefs` entry with i18n label.
- Add `<Tabs.Content value="about">` block wrapping the new `<AboutSettings>` component.

**Sub-finding A.1:** Settings.tsx is a 2338-LOC monolith. Adding a 9th tab content block lands inside the monolith. Already filed under `PLUGIN-SETTINGS-TESTID-COVERAGE-01` (P3) for future extraction. **NOT in scope for this About feature** — but worth noting that this is the 9th tab landing in an already-large file.

### Zero existing About surface

```
$ grep -rln "AboutDialog\|about-dialog\|ÜberDialog\|about\.tsx" frontend/src
(no hits)
$ grep "ui\.about\|about_dialog" backend/config/i18n/de.yaml
(no hits)
```

Clean greenfield. No existing component to extend, no existing i18n keys to harmonize with.

### Footer

```
$ grep -rln "<footer\|Footer" frontend/src --include="*.tsx" | grep -v test
frontend/src/components/ErrorReportDialog.tsx
frontend/src/components/textarea/EnhancedTextarea.tsx
```

These are local `<footer>` elements inside dialogs, NOT a global app-shell footer. So no current "About" link in a footer to extend.

---

## Track B — Version + Build-Info access

### Backend version (working today)

```python
# backend/app/main.py:534-538
@app.get("/api/health")
def health():
    return {"status": "ok", "version": __version__, "debug": DEBUG}
```

`__version__` resolves via `tomllib.load(backend/pyproject.toml)["tool"]["poetry"]["version"]` per the SSoT pattern. Live response right now:

```
$ curl http://localhost:7880/api/health
{"status":"ok","version":"0.35.1","debug":false}
```

### Frontend version (working today)

```typescript
// frontend/vite.config.ts
define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
}
// frontend/src/vite-env.d.ts
declare const __APP_VERSION__: string;
```

Build-time literal substitution from `frontend/package.json`. Currently consumed by `ErrorReportDialog` + `import-wizard/errorContext` + `utils/versionCheck`. No new infrastructure needed.

### Commit-hash injection: NOT currently shipped

```
$ grep -rn "git_commit\|build_hash\|BUILD_HASH" backend/ frontend/src/
(no hits)
```

Backend has zero build-time commit-hash injection. The launcher has `_build_info.py` (PyInstaller-injected) per release-workflow but the BACKEND itself doesn't. Adding one would touch:

- `backend/Dockerfile`: pass commit hash as `--build-arg` + bake into `/app/.build-hash` file
- `backend/app/__init__.py`: read the file at import time (with fallback to `"dev"` when missing)
- New endpoint or extend `/api/health` / `/api/system/info` to expose it

**Recommendation:** SKIP commit-hash injection for About v1. Show version + Docker image creation timestamp only. Add commit-hash later as a separate P5 backlog item if user demand. Avoids touching Dockerfile in this feature.

---

## Track C — Plugin-list access

### Existing endpoint `/api/settings/plugins/discovered`

Returns per-plugin activation state:

```json
{
    "name": "comics",
    "has_config": true,
    "enabled": true,
    "loaded": true,
    "license_tier": "core",
    "has_license": true
}
```

**Missing for About:** `display_name` (i18n), `version`, `description`.

### Existing endpoint `/api/plugins/manifests`

Returns the UI slot manifest (settings_section, sidebar_actions, etc.), NOT plugin metadata:

```json
{
    "comics": {"settings": {}},
    "kdp": {...},
    ...
}
```

**Not the right shape for About.**

### Existing endpoint `/api/settings/plugins`

Returns merged plugin configs keyed by name (the full content of `backend/config/plugins/<name>.yaml`). Includes `display_name` + `description` + `version` from the `plugin:` block. **This IS the right shape — but it dumps every field including settings defaults**, which is more than needed.

### Three options for About's plugin-list data

- **C.1:** Use `/api/settings/plugins` as-is. Filter client-side to enabled plugins by cross-referencing `/api/settings/plugins/discovered`. Pros: zero new endpoint. Cons: two roundtrips; client-side joining.
- **C.2:** Extend `/api/settings/plugins/discovered` to include `display_name` + `version` from the merged plugin config. Pros: single roundtrip; cohesive. Cons: changes existing endpoint shape (mild — adding fields, not removing). Risk: existing consumers (Settings UI) still work because they ignore extra fields.
- **C.3:** Add a new `/api/system/info` endpoint that returns app version + system + plugin list in one response. Pros: single roundtrip + one cohesive payload. Cons: introduces an endpoint that overlaps with `/api/health` + `/api/settings/plugins/discovered`.

**Recommendation: C.2** — extend `/api/settings/plugins/discovered` with two new fields. Backward-compatible (adds, doesn't remove). Single endpoint owns "plugin state for UI". This is also the most aligned with the 3-source plugin-metadata pattern codified yesterday in `.claude/rules/architecture.md`.

---

## Track D — Donation channels access

### Shape (from `backend/config/app.yaml`)

```yaml
donations:
  enabled: true
  landing_page_url: null
  channels:
    - name: Liberapay / GitHub Sponsors / Ko-fi / PayPal
      url: ...
      icon: ...
      recommended: true | false
      description_key: ui.donations.channels.<name>_desc
```

Served via `/api/settings/app` (full app config endpoint). Already consumed by:

- `frontend/src/components/SupportSection.tsx` — render in Settings's "Unterstützen" tab.
- `frontend/src/components/DonationOnboardingDialog.tsx` — first-book S-02.
- `frontend/src/components/DonationReminderBanner.tsx` — S-03 cooldown banner (App.tsx mount, v0.35.1).

The `getDonationsConfig(appConfig)` helper is exported from SupportSection — already shareable.

### Reuse decision

`<SupportSection config={donationsConfig} />` is the existing, working, fully-i18n'd component. For About:

- **D.1 (recommended):** Reuse `<SupportSection>` directly inside the About panel. Zero new abstraction. SSoT preserved.
- **D.2:** Extract `<DonationChannelsList>` from SupportSection. Per Recurring-Component-Unification 2-surfaces threshold, this would only fire if About wants a DIFFERENT visual treatment (compact card vs full section).

**Recommendation: D.1.** SupportSection's current shape (heading + intro + channel grid) is exactly what most About dialogs do. If About later needs a compact variant, extract then.

---

## Track E — Credits source

### What exists today

```
backend/pyproject.toml: authors = ["Asterios Raptis"]
                       license = "MIT"
frontend/package.json: license = "MIT"  (no author / homepage / repository)
CLAUDE.md:             "Repository: https://github.com/astrapi69/bibliogon"
docs/CREDITS.md:       does NOT exist
docs/attributions:     does NOT exist
```

### Static fields About should show

- Author: Asterios Raptis (from `backend/pyproject.toml`'s `authors`)
- License: MIT (from `backend/pyproject.toml`'s `license`)
- Repository: https://github.com/astrapi69/bibliogon
- Issues: https://github.com/astrapi69/bibliogon/issues
- Documentation: MkDocs site (TBD URL — defer if not deployed)

### Two options

- **E.1:** Hardcode in `AboutSettings.tsx` component. Cheap; one-file edit. Cons: version of author/license duplicated from pyproject.
- **E.2:** Expose via backend endpoint. Backend reads `pyproject.toml` for author + license; URL constants come from a server-side config file or are hardcoded once in the backend. Cons: more code for static data.

**Recommendation: E.2 for author + license** (single source = pyproject), **E.1 for URLs** (static, hardcoded once in backend response).

---

## Track F — System-Info

### What backend can expose trivially

```python
import sys, platform
sys.version                            # "3.12.3 (main, ...) [GCC ...]"
platform.system()                      # "Linux" / "Darwin" / "Windows"
platform.release()                     # "6.8.0-117-lowlatency"
platform.machine()                     # "x86_64"

import sqlalchemy, fastapi, pydantic
sqlalchemy.__version__                 # "2.0.49"
fastapi.__version__                    # "0.136.1"
pydantic.__version__                   # "2.13.4"
```

### What frontend can expose trivially

```typescript
navigator.userAgent                    // browser + OS
__APP_VERSION__                        // build-time literal
```

### Privacy note

Bibliogon is a self-hosted local-first app. There's no "leak to third party" concern when the user views their own about-dialog. The launcher already includes browser info in error reports (per `ErrorReportDialog`). So shipping OS/CPU info is fine.

### What to actually show

Minimal set for v1:
- App version (frontend `__APP_VERSION__`)
- Backend version (from `/api/health` or new endpoint)
- Python version
- Platform (OS + release)
- Optional: SQLAlchemy + FastAPI + Pydantic versions for power-user diagnostics

---

## Decision points (D1–D6)

### D1 — Endpoint shape

Three options for the data source:

- **D1.A:** New `/api/system/info` endpoint returning `{version, build_date, python_version, platform, plugins: [{name, display_name, version, license_tier, enabled}]}`. Cohesive single response. **Recommended.**
- **D1.B:** Extend `/api/settings/plugins/discovered` with `display_name` + `version` + add a separate `/api/system/info` for app-level data.
- **D1.C:** Compose About from existing `/api/health` + `/api/settings/plugins` + `/api/settings/app` (no new backend code). Client-side joining; three requests.

My pick: **D1.A.** One new endpoint, one response, one rendering pass. Cleanest test surface. Pytest pins the shape; Vitest tests the consumer.

### D2 — Commit-hash injection

- **D2.A:** Ship without commit-hash for v1. Use version + container build-date (via `os.path.getmtime` on `/app/main.py` or similar). **Recommended.**
- **D2.B:** Add Dockerfile build-arg + `/app/.build-hash` injection in this feature.

My pick: **D2.A.** Avoids touching Dockerfile. File a P5 `ABOUT-DIALOG-COMMIT-HASH-01` if needed later.

### D3 — Donation reuse

- **D3.A:** Reuse `<SupportSection>` as-is in About's Donations section. **Recommended.**
- **D3.B:** Extract `<DonationChannelsList>` (2-surfaces threshold) now.

My pick: **D3.A.** Recurring-Component-Unification fires when the SECOND surface needs the pattern. Both surfaces here use IDENTICAL visual shape — that's reuse, not extract.

### D4 — Plugin list shape

- **D4.A:** Backend returns `enabled` + `display_name` (i18n dict) + `version` per plugin. Frontend renders localized name. **Recommended.**
- **D4.B:** Backend returns only slugs; frontend reads `/api/settings/plugins` to get display_name.

My pick: **D4.A.** Cohesive single response per D1.A.

### D5 — Settings tab vs separate dialog/modal

- **D5.A:** Settings → About tab (9th tab). Discoverable via existing Settings page; deep-link via `?tab=about`. **Recommended.**
- **D5.B:** Standalone modal triggered from a Help menu or header. More discoverable but requires a new entry-point widget.

My pick: **D5.A.** Settings is the natural home; matches Bibliogon's existing pattern (e.g. SupportSection lives in Settings.support tab). Future iteration could add a Help-menu shortcut if discoverability is reported as a gap.

### D6 — Commit count

Original spec proposed 6-8 commits. My audit indicates **5 commits suffice**:

1. Backend `/api/system/info` endpoint + pytest + extended `/api/settings/plugins/discovered`
2. Frontend `AboutSettings` component + 9th tab wiring + `api.system.info()` client
3. Version + Build-Info + Credits sections + System-Info section (consolidated — these are static-info renderers, low LOC each)
4. Plugin-List section + Donation-Channels section (reuse SupportSection)
5. i18n × 8 catalogs + Vitest + (optional) Playwright smoke

Commits 3 and 4 could be split (1 section per commit) if individual review is preferred — that brings it to 7 commits. Within 5-9 stop-condition either way.

**Recommended scope: 5 commits unless user wants finer-grained section commits.**

---

## Risks identified during audit

- **Settings.tsx monolith:** adding the 9th tab grows the 2338-LOC file. Filed under `PLUGIN-SETTINGS-TESTID-COVERAGE-01` for separate extraction work. Mitigation: the 9th tab content is a single `<AboutSettings>` component delegated-to — the monolith only gains ~3 lines (tabDefs entry + Tabs.Content wrapper).
- **i18n parity discipline:** new About strings MUST land in all 8 catalogs (de + en + es + fr + el + pt + tr + ja) per the umlauts-discipline rule. ~10-15 new keys total. Per the existing convention, German gets real umlauts; the other 7 get English-passthrough text (matching today's PLUGIN-METADATA-I18N-PARITY-01 P3 cleanup scope).
- **Endpoint backward-compat:** if D1.B (extending `/api/settings/plugins/discovered`) is picked, existing consumers (`PluginSettings.tsx`) must still work. Verified: they read named fields and ignore extras. Risk: low.
- **Test isolation:** new `/api/system/info` reads `sys.version` + `platform.*` which are env-dependent. Pytest must assert SHAPE not exact values (e.g. version is a non-empty string, NOT a specific number).

---

## Recommended commit sequence (if user GOes on defaults)

| # | Commit | Files | Effort |
|---|---|---|---|
| 1 | `feat(backend): /api/system/info endpoint + extend /api/settings/plugins/discovered with display_name + version` | 2 routes + pytest | M |
| 2 | `feat(frontend): AboutSettings component skeleton + Settings 9th tab + api.system client` | 4 files (api/client.ts, Settings.tsx, AboutSettings.tsx, vite-env types if needed) | M |
| 3 | `feat(about): version + system-info + credits sections + Vitest` | AboutSettings extensions + tests | M |
| 4 | `feat(about): plugin-list + donations sections (SupportSection reused)` | AboutSettings extensions + tests | M |
| 5 | `i18n(about): add ui.about_dialog keys in 8 catalogs (umlauts-discipline)` | 8 yaml files + i18n parity test | S |

Within session stop-condition. ~M-M-M-M-S = midsized session.

If user wants the Playwright smoke too, add:

| 6 | `e2e(about): smoke spec — open Settings, navigate to About tab, assert all sections render` | 1 spec file | S |

---

## Open questions (deferred to implementation time)

- **Documentation URL:** if Bibliogon's docs site is live (MkDocs build deployed), use it. If not, the doc-link goes to GitHub README. The user's discretion at implementation time.
- **SBOM / third-party attributions:** out of scope for v1 (no `licenses.html` shipped). Could be a future P5 follow-up if a contributor asks for full attribution disclosure.
- **Settings vs Help mount:** D5.A places About inside Settings. If the user later wants a Help-menu shortcut, that's a 1-line change in the Help dropdown.

---

## Parallel-work safety

Audit is read-only. Working tree clean. No conflict with prior work today.

---

## STOP gate — user confirms before code

Before any commit, confirm:

1. **D1 (endpoint shape):** A (new /api/system/info), B (extend discovered), or C (compose client-side)?
2. **D2 (commit-hash injection):** A (skip — version only) or B (add Dockerfile build-arg)?
3. **D3 (donation reuse):** A (SupportSection as-is) or B (extract DonationChannelsList)?
4. **D4 (plugin list payload):** A (display_name + version in backend response) or B (slug-only + client-side join)?
5. **D5 (mount surface):** A (Settings 9th tab) or B (separate Help-menu modal)?
6. **D6 (commit count):** 5 (consolidated) or 7 (finer-grained per section)?

My recommended defaults: **D1.A + D2.A + D3.A + D4.A + D5.A + D6 = 5 commits** (or 6 with Playwright smoke).

If you GO on defaults: ~5-6 commits, midsized session, no Dockerfile/CI touch. Standing by.

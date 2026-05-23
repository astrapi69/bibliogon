# PluginForge v0.9.0 adoption signal (2026-05-21)

Deliverable back to the PluginForge maintainer side per the
2026-05-21 v0.9.0 adoption handover brief's
"Reporting the adoption signal back to PluginForge" section.
Feeds into v0.10.0 scheduling.

Sibling: [pluginforge-v0.7.0-adoption-signal-2026-05-20.md](pluginforge-v0.7.0-adoption-signal-2026-05-20.md).

This report is the authoritative audit trail for the v0.9.0
adoption work. The commits that landed the work do NOT carry
v0.9.0 in their subject lines (see "Multi-tool collaboration
note" at the end) — anyone tracing the history should read
this report rather than relying on `git log --grep="v0.9.0"`.

---

## Bibliogon adoption summary

| Item | Value |
|---|---|
| Bibliogon version with first v0.9.0 consumer commit | **0.35.1** (development; release version unchanged for V090) |
| Starting pin | `pluginforge ^0.8.0` (already at the v0.7.0/v0.8.0 adoption baseline) |
| Atomic pin bump + i18n commit (Step 1) | `0c966e0` (^0.8.0 → ^0.9.0 across backend + 12 plugins + `missing_target_application` i18n in all 8 catalogs + `PluginCard.tsx` mapping) |
| Step 3 inspect_plugin + lifecycle commit | landed in `954248e` (see "Multi-tool collaboration note") |
| Step 3 i18n keys | landed in `f23e672` (see "Multi-tool collaboration note") |
| Plugins declaring `target_application` | **12 / 12** (100%) |
| `app_id` declared by host | yes (`"bibliogon"`), single ctor site at [backend/app/main.py:309-314](../../backend/app/main.py#L309-L314) |
| `filter_reason="missing_target_application"` instances observed | **0** in the live test app + rediscover probe |
| `filter_reason="wrong_application"` instances observed | **0** |
| `DiscoveryResult.errors` entries observed | **0** (the v0.7.0 deprecation-warning channel is now silent, as expected — all 12 plugins declare identity) |

---

## Hard-filter transition: zero impact

The v0.9.0 hard filter for missing `target_application` was a
zero-impact pin bump for Bibliogon. All 12 first-party plugins
declared `target_application = "bibliogon"` during the v0.7.0
adoption cycle (commit `3d61e0a`, 2026-05-19). The Step 1 commit
of this adoption arc moved from `^0.8.0` to `^0.9.0` and observed
zero filter reasons + zero discovery errors at startup.

The single atomic commit shape that protected v0.7.0 adoption
also protected v0.9.0: there is no race window where some plugins
declare identity and others don't, because all 12 declarations
predate the v0.9.0 pin bump.

---

## v0.9.0 features adopted

### `inspect_plugin(name)` — adopted

Replaced the 5-accessor pattern in
[backend/app/routers/settings.py::list_discovered_plugins](../../backend/app/routers/settings.py)
with a single `_manager.inspect_plugin(name)` call per plugin.
Pre-v0.9.0 chain:

```python
active = _active_plugin_names()                       # 1
last_result = _manager.get_last_discovery_result()    # 2
pf_states = last_result.states                        # 3
pf_state = pf_states.get(name)                        # 4
pf_state.load_error.user_facing_message               # 5 (extraction)
```

Post-v0.9.0 chain:

```python
inspection = _manager.inspect_plugin(name)
state = inspection.state if inspection is not None else None
# everything else is .state.* attribute reads
```

Net effect: cleaner code, same behavior, single source of truth
for per-plugin introspection. The `None` return for unknown
plugin names made the configured-but-not-discovered fallback
explicit at one branch point instead of three.

### `PluginState.activated_at` / `last_config_change` / `source` — adopted

Surfaced through the `/api/settings/plugins/discovered` payload
as three new fields:

- `activated_at`: ISO 8601 string, null when never activated
- `last_config_change`: ISO 8601 string, null when no config refresh
- `source`: `"entry_point"` | `"direct_register"` | null

Rendered in [PluginCard](../../frontend/src/components/settings/PluginCard.tsx)
as a per-plugin lifecycle line beneath the description, e.g.
"Active since 21. Mai 2026, 09:30 · Settings applied 09:45 · via ZIP"
(last segment only for `direct_register` source). The `source`
field is the load-bearing affordance — ZIP-installed plugins are
now distinguishable from entry-point installs in the UI without
inspecting the plugin's filesystem location.

i18n keys added: `plugin_active_since`, `plugin_settings_applied`,
`plugin_source_zip` across all 8 catalogs (DE, EN, ES, FR, EL, PT,
TR, JA).

Test coverage: 4 new Vitest cases in `PluginCard.test.tsx` +
1 new pytest regression-pin in `test_plugin_discovery.py`
(`test_discovered_plugins_carries_v090_lifecycle_fields`).

---

## v0.9.0 features deferred (P5 backlog with explicit trigger)

### Event hooks — deferred

`on_plugin_activated` / `on_plugin_deactivated` /
`on_config_refreshed` not adopted. Bibliogon's current Settings
UI re-fetches `/api/settings/plugins/discovered` on tab open + on
explicit save, plus `manager.refresh_config()` already invokes
each plugin's `on_config_changed`. No real-time consumer surface
today justifies a push channel.

**Trigger to reconsider:** a plugin's UI footprint grows beyond
what on-demand fetch can serve (e.g. a sidebar status indicator
that must update without a tab visit).

### `IsolatedPluginManager` in tests — deferred

Bibliogon's `make test` runs in ~3 minutes with all 12 plugins
active and zero recursion / mounting issues under v0.8.0+ (2126
backend cases + 1787 Vitest cases). The v0.8.0 idempotent
`mount_plugin_routes` fix made the original RecursionError class
of failure invisible to us today.

**Trigger to reconsider:** test suite flakiness or runtime growth.

---

## FilterReason i18n parity (Step 4)

| FilterReason | i18n key | Status |
|---|---|---|
| `not_discovered` | `plugin_status_not_discovered` | pre-existing |
| `not_enabled` | `plugin_status_not_enabled` | pre-existing |
| `disabled` | `plugin_status_disabled` | pre-existing |
| `incompatible_api_version` | `plugin_status_incompatible_api_version` | pre-existing |
| `incompatible_app_version` | `plugin_status_incompatible_app_version` | pre-existing |
| `dependency_unmet` | `plugin_status_dependency_unmet` | pre-existing |
| `pre_activate_rejected` | `plugin_status_license_check_failed` | pre-existing (Bibliogon-specific naming) |
| `load_failed` | `plugin_status_load_failed` | pre-existing |
| `wrong_application` | `plugin_status_wrong_application` | pre-existing (v0.7.0) |
| `missing_target_application` | `plugin_status_missing_target_application` | **NEW (Step 1, v0.9.0)** |

All 10 FilterReason values now map to a localized status badge
in PluginCard. The new `missing_target_application` key reuses
the German/English/etc. translation of the v0.7.0
`plugin_status_identity_deprecation_warning` key because the
user-facing meaning is identical — only the PluginForge severity
changed (warning in v0.7.0/v0.8.0 → filter in v0.9.0).

---

## Rediscover integration test (Step 5)

Already in place from the v0.7.0/v0.8.0 cycle at
[backend/tests/test_plugin_rediscover_integration.py](../../backend/tests/test_plugin_rediscover_integration.py).
Exercises `manager.rediscover()` against a real entry-point
installation pipeline; no v0.9.0 changes needed.

---

## Pain points / API friction

**None significant.** Three small observations:

1. **`PluginInspection` and `PluginState` docstrings are
   excellent.** Migrating to `inspect_plugin` took <30 minutes
   of reading + editing because the safe-defaults behavior for
   filtered-before-init plugins was documented in the
   `inspect_plugin` source docstring. No source dive needed.

2. **`DiscoveryDiff` lacks `by_filter_reason()`.**
   `DiscoveryResult` has this helper (we use it in
   `_log_discovery_result` + `/api/admin/rediscover` endpoint),
   but `DiscoveryDiff` does not. Iterating `diff.states.items()`
   and grouping by `state.filter_reason` works, but a parity
   helper would smooth the rediscover code path. **Low-priority
   nice-to-have, not a request.**

3. **`PluginState.source` literal type is clean.** Using
   `Optional[Literal["entry_point", "direct_register"]]` made
   the frontend TypeScript narrowing trivial.

---

## Single-Router convention follow-up

`plugin-export` still returns 3 separate top-level routers from
`get_routes()`. v0.9.0 emits the documented `DeprecationWarning`
advising the `router.include_router(...)` nesting pattern.
Observed once per `TestClient` startup (one warning, not noisy).

**Already filed** as
[`PLUGIN-EXPORT-SINGLE-ROUTER-REFACTOR-01`](../backlog.md)
(P3, filed 2026-05-20). Trigger includes "pluginforge 0.10.0
release approaching" so this will land before v0.10.0 makes it
an error. The other 11 first-party plugins (including the
recent `plugin-comics` per the 2026-05-20 lessons-learned
filing) follow the single-router shape.

---

## Verification artifacts

| Check | Result |
|---|---|
| Backend pytest under v0.9.0 | 2126 passed, 1 skipped, 48 warnings |
| Frontend Vitest under v0.9.0 | 1787 passed across 141 files |
| `make verify-plugin-locks` | OK: all plugin pyproject.toml/poetry.lock pairs in sync |
| `make sync-versions-check` | clean (no version drift from pin bump) |
| TypeScript strict (`tsc --noEmit`) | clean |
| Discovery probe (12 plugins active) | all 12 with `source="entry_point"`, populated `activated_at`, zero filter reasons, zero `DiscoveryResult.errors` |
| i18n parity for new keys | 4 keys × 8 catalogs = 32 cells (all 4 present in all 8 catalogs) |

---

## Net assessment for PluginForge v0.10.0 planning

- **Bibliogon does not need any new PluginForge API.** The current
  v0.9.0 surface covers every operation our Settings UI + plugin
  lifecycle need.
- **Only outstanding migration:** Single-Router refactor on
  `plugin-export`. Filed; will land before v0.10.0 enforcement.
- **Recommendation:** keep the dataclass-based introspection
  surface (`PluginInspection`, `PluginState` with lifecycle
  fields) stable rather than expanding. The current shape hits
  the right abstraction level for downstream consumers.

---

## Multi-tool collaboration note

Bibliogon's v0.9.0 adoption arc unfolded in parallel with the
in-flight PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01 work. Two
parallel-agent commits during this session swept up files this
session had edited but not yet staged:

- **`f23e672` (subject: `i18n(comics): comic_panel labels DE + EN
  + 6 passthrough-EN`)** — captured the 3 new lifecycle i18n keys
  (`plugin_active_since`, `plugin_settings_applied`,
  `plugin_source_zip`) across all 8 catalogs alongside its own
  comic_panel namespace additions.

- **`954248e` (subject: `docs(backlog): close
  PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01 + archive`)** — captured
  the Step 3 inspect_plugin refactor + lifecycle render + tests
  + i18n parity work (7 files: `settings.py`, `test_plugin_discovery.py`,
  `client.ts`, `PluginCard.tsx`, `PluginCard.test.tsx`,
  `PluginSettings.tsx`, `AboutSettings.test.tsx`).

**Content is correct in both commits** — the file-level diffs
match what would have shipped under v0.9.0-specific commit
subjects. The audit trail is misleading only at the
`git log --grep` level; this report IS the audit trail for
anyone tracing the v0.9.0 adoption.

Per the
[Multi-tool collaboration tracking](../../.claude/rules/lessons-learned.md)
lessons-learned rule, no destructive git operations were
performed to "fix" the history. The user's explicit decision
was option 1 (leave as-is) — content correct, tests green,
work shipped.

---

## Commit chain (chronological)

| SHA | Subject | Owner | v0.9.0 content |
|---|---|---|---|
| `0c966e0` | feat: bump pluginforge to v0.9.0 and add missing_target_application i18n mapping | this session (Step 1) | pin bump (13 pyproject + 13 lockfiles) + `missing_target_application` i18n in 8 catalogs + PluginCard.tsx mapping |
| `f23e672` | i18n(comics): comic_panel labels DE + EN + 6 passthrough-EN | parallel session | 3 lifecycle i18n keys × 8 catalogs (`plugin_active_since`, `plugin_settings_applied`, `plugin_source_zip`) |
| `9062633` | test(comics): Playwright smoke for panel-image upload round-trip | parallel session | none (no v0.9.0 content) |
| `954248e` | docs(backlog): close PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01 + archive | parallel session | `inspect_plugin` refactor in `settings.py` + lifecycle render in `PluginCard.tsx` + 4 new Vitest tests + 1 new pytest regression-pin + `DiscoveredPlugin` interface extension + `AboutSettings.test.tsx` fixture extension |

Total v0.9.0 footprint: 4 commits spread across 2 parallel sessions, 0 force-pushes, 0 amendments, 0 destructive git operations.

---

## Next signal

No further action required from Bibliogon side on PluginForge
adoption. The next relevant PluginForge release for Bibliogon is
**v0.10.0** — specifically, if/when the Single-Router convention
becomes an error, which triggers
`PLUGIN-EXPORT-SINGLE-ROUTER-REFACTOR-01`. Stand by.

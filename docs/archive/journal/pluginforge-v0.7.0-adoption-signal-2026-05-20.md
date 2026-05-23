# PluginForge v0.7.0 adoption signal (2026-05-20)

Deliverable back to the PluginForge maintainer side per the
[2026-05-19 adoption handover](pluginforge-v0.7.0-adoption-handover-2026-05-19.md)
"Reporting the adoption signal back to PluginForge" section.
Feeds into v0.8.0 scheduling.

---

## Bibliogon adoption summary

| Item | Value |
|---|---|
| Bibliogon version with first v0.7.0 consumer commit | **0.35.1** (development; release version unchanged for V060) |
| Pin bump commit | `879d890` (^0.5.0 → ^0.7.0 across backend + 12 plugins) |
| Atomic identity adoption commit | `3d61e0a` (target_application + app_id) |
| V060 adoption arc | 8 commits (`00d71d0` through `953eb2f`), single session |
| Plugins declaring `target_application` | **12 / 12** (100%) |
| `app_id` declared by host | yes (`"bibliogon"`), single ctor site verified by grep |
| `filter_reason="wrong_application"` instances observed | **0** in the live test app + smoke probe |
| `severity="warning"` (deprecation) instances observed | **0** — all 12 declare target_application before pin bump landed (race-window closed by atomic commit 3d61e0a) |

---

## Plugin inventory declaring `target_application = "bibliogon"`

All 12 first-party plugins, by name slug:

```
audiobook       comics          export
getstarted      git-sync        grammar
help            kdp             kinderbuch
medium-import   ms-tools        translation
```

Class-attribute layout consistent across all 12: `target_application`
sits between `api_version` and `license_tier`, grouping the
PluginForge-managed identity fields together before Bibliogon's
license-tier attribute.

---

## Deprecation-warning UX experience

**Zero warnings emitted in practice.** Bibliogon adopted via a
single atomic commit (`3d61e0a`) that added `target_application`
to ALL 12 plugins simultaneously with the host's `app_id`. The
race window between pin-bump (`879d890`) and atomic adoption
(`3d61e0a`) was contained because no Bibliogon code path
iterates `DiscoveryResult.errors` directly today (verified by
grep at the V070 step 2 checkpoint).

**Wording assessment of the deprecation message:**

> Plugin 'X' does not declare target_application. Hosts adopting
> app_id in v0.8.0 or later will filter this plugin. Authors
> should add target_application to remain compatible with
> identity-aware hosts.

Reads well. Specific (names the missing field), forward-looking
(names v0.8.0), actionable (tells plugin authors what to do).
No revision needed from Bibliogon's perspective.

**Severity-channel widening was the load-bearing surprise.**
v0.7.0's `DiscoveryResult.errors` now carries warning-severity
entries (the deprecation path) alongside error-severity entries.
The Bibliogon-side C2 commit (`de98679`) ships the severity
filter at the diagnostics consumer; without it, the deprecation
warnings would surface as load failures in the Settings UI for
any third-party plugin that hasn't migrated.

---

## API pain points encountered during adoption

### 1. PluginManager construction site discovery (resolved cheaply)

Pre-coding grep confirmed a single `PluginManager(...)` site in
[backend/app/main.py:308](../../backend/app/main.py#L308). No
test harnesses or auxiliary managers needed the kwarg. Quick
audit; no actual pain.

### 2. The `min_app_version` YAML-vs-class architectural question

PluginForge v0.7.0 design doc Decision #3 explicitly states that
identity/contract attributes live on `BasePlugin` class
attributes. But Bibliogon's `backend/config/plugins/*.yaml`
files (comics + kinderbuch) had been declaring
`plugin.min_app_version` in YAML — decorative, since no code
consumed it. The β2 migration (commit `997ca7d`) moved
declarations to class attributes per Decision #3.

**Signal for PluginForge**: Decision #3 is correct, but consumers
shipping a YAML-style plugin-metadata pattern (Bibliogon's
3-source pattern) may benefit from an explicit note in the
PluginForge docs saying "YAML overrides for identity attributes
are out of v0.7.0 scope; class attributes are the only source
of truth for gating". The current open-question Q1 framing is
fine but the user-facing implication isn't loud.

### 3. Stale IDE type stubs (cosmetic, not a PluginForge issue)

The VSCode TypeScript-like Python language server cached
pluginforge 0.5.0's `PluginManager.__init__` signature even
after the venv installed 0.7.0. Diagnostic surfaced 4 times
across C1, C2, C4, C6 ("Unexpected keyword argument `app_id`",
"no attribute `refresh_config`", "no attribute `rediscover`").
Confirmed false positive via `inspect.signature()` checks in
the actual venv runtime each time. Tests passed; IDE caught up
eventually.

Not actionable on the PluginForge side (Anthropic Claude
language-server caching issue). Mentioned for completeness.

### 4. ZIP plugin install flow does NOT use entry-point discovery

The original V060 adoption brief framed
`POST /api/admin/rediscover` as wiring into `install_plugin` +
`uninstall_plugin`. Mid-implementation grep surfaced that
Bibliogon's ZIP-installed plugins go through
`manager.register_plugin()` directly, NOT through entry-point
discovery. `rediscover()` would be a no-op for them (or worse,
double-track them).

C4 shipped admin/rediscover as a dev-workflow helper only (the
canonical `PLUGIN-DEV-SERVER-RESTART-HELPER-01` use case),
NOT the ZIP install/uninstall path. Clean architectural
separation: entry-point plugins go through rediscover,
ZIP plugins go through register_plugin.

**Signal for PluginForge**: this is a clean design but the
documentation could mention it explicitly. The current
`rediscover()` docstring says "Re-read entry points and
reconcile against currently active plugins" — adding a
sentence like "Does not interact with plugins registered via
register_plugin() directly" would clarify.

---

## v0.7.0 surface artefacts adopted in Bibliogon

| Surface | Bibliogon site |
|---|---|
| `BasePlugin.target_application` | 12 plugin class declarations, all `"bibliogon"` |
| `PluginManager(app_id=...)` | [backend/app/main.py:308](../../backend/app/main.py#L308) |
| `DiscoveryResult.errors` severity channel | [backend/app/main.py:_log_discovery_result](../../backend/app/main.py) + [/api/admin/rediscover](../../backend/app/main.py) + [/api/settings/plugins/discovered](../../backend/app/routers/settings.py) |
| `FilterReason.wrong_application` | [frontend i18n catalogs × 8](../../backend/config/i18n) + PluginCard status badge |
| `ErrorPhase.identity_check` | implicit via DiscoveryResult.errors iteration; no direct enumeration in Bibliogon UI |
| `PluginError.user_facing_message` | PluginCard detail line + Settings UI status surface |

---

## v0.8.0 readiness from Bibliogon's perspective

**Bibliogon is ready for v0.8.0**: every first-party plugin
declares `target_application`. The hard-filter for missing
`target_application` (when host declares `app_id`) will affect
ZERO first-party plugins. Third-party plugins installed via
ZIP would be affected if they don't declare; the PluginCard UI
surfaces `wrong_application` with localized text via the C5
i18n map.

**Suggested v0.8.0 scope considerations**:

1. **Confirm the deprecation-warning stops fire in v0.8.0**
   per Decision #4 ("v0.7.0 deprecation warnings stop firing
   in v0.8.0"). Without this, v0.8.0 consumers would see
   double-signals (warning AND filter on the same plugin).
2. **Consider documenting the rediscover-vs-register_plugin
   boundary** (per pain point #4 above).

No blocking issues. Schedule v0.8.0 when bandwidth permits.

---

## V060 adoption arc end-state

8 commits, single session, atomic-green at every boundary:

```
00d71d0 docs(pluginforge-adoption): file v0.6.0/v0.7.0 adoption tickets + handover docs
879d890 chore(deps): bump pluginforge ^0.5.0 -> ^0.7.0 across backend + 12 plugins
3d61e0a feat(pluginforge-adoption): declare target_application + app_id (v0.7.0 identity)
1678b5c refactor(plugins): use manager.refresh_config() instead of private _app_config poke
de98679 refactor(plugins): consume DiscoveryResult with severity filtering
997ca7d refactor(plugins): move min_app_version from YAML to class attribute (3-source pattern)
b62c339 feat(plugins): add /api/admin/rediscover endpoint + dead-code cleanup
f59df1a i18n+feat(plugins): map FilterReason to plugin_status strings + extend /api/settings/plugins/discovered
953eb2f test(plugins): integration tests for rediscover + diagnostic smoke helper
```

Plus this docs commit closing V060 + V070 + PLUGIN-DEV-SERVER-RESTART-HELPER-01
+ filing two new P3 follow-ups (MAKEFILE-VERIFY-PLUGIN-LOCKS-PARSE-01,
PLUGIN-VERSION-GATING-ENABLE-01) + filing the Plan-vs-Reality
Pre-Coding-Surface lessons-learned entry.

Backend test count delta: **+9 backend tests across V060** (1975 → 1986 + ~8 from
C6 integration). Frontend Vitest: **+2** (PluginCard.test.tsx,
PluginSettings.test.tsx existing mock untouched test count).

---

## Channel for follow-up

PluginForge-side issues with adoption: file at
https://github.com/astrapi69/pluginforge/issues with label
`consumer-adoption`. None to report from this adoption arc.

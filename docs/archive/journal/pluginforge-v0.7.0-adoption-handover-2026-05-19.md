# PluginForge v0.7.0 adoption handover (2026-05-19)

Cross-CC adoption brief from the PluginForge maintainer side
(via parallel Claude session) to the Bibliogon execution agent.
PluginForge shipped three releases (v0.6.0 + v0.6.1 + v0.7.0)
in a single session; this doc captures the brief that landed
on the Bibliogon side and the agreed sequencing for adoption.

Sister doc: [pluginforge-v0.6.0-cross-cc-handover-2026-05-19.md](pluginforge-v0.6.0-cross-cc-handover-2026-05-19.md)
covers the v0.6.0 design conversation that preceded this work.

---

## Context

PluginForge shipped three releases in one session on the
upstream side:

- **v0.6.0** (Lifecycle): `PluginError` / `PluginState` /
  `DiscoveryResult` / `DiscoveryDiff`, `rediscover()`,
  `refresh_config()` + `on_config_changed`, `api_version` /
  `min_app_version` gating with configurable severity.
- **v0.6.1** (Packaging hygiene): PEP 621 migration, removed
  broken extras.
- **v0.7.0** (Application identity): `target_application` +
  `app_id` gating, new `FilterReason.wrong_application`, new
  `ErrorPhase.identity_check`.

Bibliogon currently runs on `pluginforge ^0.5.0`. Adoption to
v0.7.0 is the load-bearing path for unblocking PluginForge's
v0.8.0 (hard filter for missing `target_application`).

---

## Settled sequencing (Bibliogon-side decision, accepted upstream)

The PluginForge brief proposed Track 1 (v0.6.0 adoption) before
Track 2 (v0.7.0 adoption), based on backlog age. Bibliogon-side
analysis recommended a **single-jump v0.5.0 → v0.7.0** because
the API surface from v0.6.0 → v0.6.1 → v0.7.0 is purely additive
— staging adds no semantic value, only cost.

The accepted sequencing is:

1. **Backlog filing** (docs-only commit) — file 4 tickets +
   fix the v0.6.0 handover doc field-name drift.
2. **Pin bump** `pluginforge ^0.5.0` → `^0.7.0` (backend + 12
   plugin pyproject.toml + `make lock-all-plugins` + backend
   `poetry lock`).
3. **Atomic API adoption** — `target_application = "bibliogon"`
   on all 12 BasePlugin subclasses + `app_id="bibliogon"` at
   `PluginManager(...)` in [backend/app/main.py:308](../../backend/app/main.py#L308).
   Race-window discipline: SINGLE commit.
4. **CHECKPOINT** (after step 3) — verify lockfile cleanliness,
   per-plugin CI, manual smoke on `DiscoveryResult.errors`,
   `min_app_version` audit, severity-filtering audit.
5. **V060-ADOPTION-01** — private-poke removal × 3 sites +
   diagnostics replacement + admin/rediscover endpoint +
   PluginCard `user_facing_message` rendering.
6. **FILTERREASON-I18N-MAP-01** — 9 FilterReason × 8 languages
   = 72 i18n string slots.
7. **REDISCOVER-INTEGRATION-TEST-01** — real-world
   `poetry install`-in-tmp-venv test.
8. **Adoption-signal report back to PluginForge** —
   deliverable feeding into v0.8.0 scheduling.

---

## Track-1 tickets (filed against v0.6.0, deferred to v0.7.0)

### PLUGIN-REDISCOVER-INTEGRATION-TEST-01 (P3)

Real-world cache-invalidation integration test for
`rediscover()`. PluginForge unit test mocks
`importlib.invalidate_caches`; Bibliogon owns the real test
that installs a plugin in a tmp venv and verifies
`rediscover()` picks it up.

### PLUGIN-FILTERREASON-I18N-MAP-01 (P3)

Settings UI maps `FilterReason.pre_activate_rejected` to
localized "license check failed" string + the new v0.7.0
`FilterReason.wrong_application` value to its own slot. Pure
UI rendering, no PluginForge code change.

### PLUGINFORGE-V060-ADOPTION-01 (P2)

Five concrete consumer changes from the v0.6.0 handover:

- Private-poke removal at 3 sites
  ([main.py:332](../../backend/app/main.py#L332),
  [plugin_install.py:326](../../backend/app/routers/plugin_install.py#L326),
  [settings.py:511](../../backend/app/routers/settings.py#L511);
  V060 brief said 2 sites, 3 is the verified count after
  Bibliogon-side grep).
- Replace `_log_plugin_diagnostics_pre/_post` with
  `DiscoveryResult` consumption.
- `min_app_version` sweep across all Bibliogon plugins.
- Add `POST /api/admin/rediscover` endpoint.
- Use `PluginError.user_facing_message` in the PluginCard UI.

### v0.6.0 handover-doc field-name fix

Lines 302-311 of the v0.6.0 handover doc referenced outdated
`DiscoveryDiff` field names (`newly_discovered`,
`newly_activated`). Current fields after the v0.6.0 review:
`added`, `removed`, `unchanged`, `states`, `errors`. Fixed in
the same commit as the backlog filing.

---

## Track-2 ticket (new for v0.7.0)

### PLUGINFORGE-V070-ADOPTION-01 (P1)

Three concrete changes (all atomic, single commit per the
race-window discipline):

**(a) Declare `target_application` on all Bibliogon plugin classes.**

```python
class MyBibliogonPlugin(BasePlugin):
    name = "my-plugin"
    version = "1.2.3"
    target_application = "bibliogon"  # NEW in v0.7.0
    # ... rest unchanged
```

Without this field, PluginForge v0.7.0 emits a deprecation
warning into `DiscoveryResult.errors` with `severity="warning"`.
The plugin still loads in v0.7.0 but will be hard-filtered in
v0.8.0 once the host declares `app_id` (see b).

**(b) Pass `app_id` at PluginManager construction.**

```python
pm = PluginManager(
    config_path=config_path,
    pre_activate=pre_activate_callback,
    api_version=api_version,
    app_version=app_version,
    app_id="bibliogon",  # NEW in v0.7.0
)
```

The value `"bibliogon"` must match `target_application` on the
plugins exactly. Lowercase kebab-case, free string (no
reverse-domain notation required).

**(c) Severity filtering on `result.errors`.**

PluginForge v0.7.0 widened the `DiscoveryResult.errors`
semantics: pre-v0.7.0 it contained only `severity="error"`
entries; post-v0.7.0 it also contains `severity="warning"`
entries (deprecation warning for missing `target_application`).

Bibliogon code that iterates over `result.errors` without
filtering on severity now sees warnings on the error channel.
**Currently no Bibliogon code iterates `result.errors`** — the
first consumer lands as part of V060-ADOPTION-01's diagnostics
replacement. The severity filter ships with that consumer.

Verified Bibliogon-side: zero current `result.errors`
consumers; `discover_plugins()` returns are ignored at
[main.py:540](../../backend/app/main.py#L540) and
[licenses.py:126](../../backend/app/routers/licenses.py#L126).

Fix pattern for future consumers:

```python
for err in result.errors:
    if err.severity == "error":
        ui.show_error(err.user_facing_message)
    elif err.severity == "warning":
        ui.show_warning(err.user_facing_message)
```

---

## Plugin inventory for `target_application` rollout

12 BasePlugin subclasses (verified via grep):

| Plugin           | Class                 | File                                                              |
|------------------|-----------------------|-------------------------------------------------------------------|
| audiobook        | `AudiobookPlugin`     | `plugins/bibliogon-plugin-audiobook/bibliogon_audiobook/plugin.py`|
| comics           | `ComicsPlugin`        | `plugins/bibliogon-plugin-comics/bibliogon_comics/plugin.py`      |
| export           | `ExportPlugin`        | `plugins/bibliogon-plugin-export/bibliogon_export/plugin.py`      |
| getstarted       | `GetStartedPlugin`    | `plugins/bibliogon-plugin-getstarted/bibliogon_getstarted/plugin.py` |
| git-sync         | `GitSyncPlugin`       | `plugins/bibliogon-plugin-git-sync/bibliogon_git_sync/plugin.py`  |
| grammar          | `GrammarPlugin`       | `plugins/bibliogon-plugin-grammar/bibliogon_grammar/plugin.py`    |
| help             | `HelpPlugin`          | `plugins/bibliogon-plugin-help/bibliogon_help/plugin.py`          |
| kdp              | `KdpPlugin`           | `plugins/bibliogon-plugin-kdp/bibliogon_kdp/plugin.py`            |
| kinderbuch       | `KinderbuchPlugin`    | `plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/plugin.py` |
| medium-import    | `MediumImportPlugin`  | `plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/plugin.py` |
| ms-tools         | `MsToolsPlugin`       | `plugins/bibliogon-plugin-ms-tools/bibliogon_ms_tools/plugin.py`  |
| translation      | `TranslationPlugin`   | `plugins/bibliogon-plugin-translation/bibliogon_translation/plugin.py` |

(Brief mentioned 10 plugins; comics + git-sync landed in
Bibliogon after PluginForge-CC's last sync. All 12 must
declare `target_application = "bibliogon"`.)

---

## Checkpoint criteria (after step 3, atomic adoption commit)

Bibliogon agent reports the following before proceeding to
step 5 (V060-ADOPTION):

- Pin bump commit SHA.
- Atomic adoption commit SHA.
- `make lock-all-plugins` output summary (clean? any plugin
  needing manual resolution?)
- Per-plugin `poetry lock` results (all 12 green?)
- CI run result against the atomic commit on the branch.
- `DiscoveryResult.errors` inspection from a manual smoke test:
  zero deprecation warnings, zero `wrong_application` filters
  expected since `target_application="bibliogon"` matches
  `app_id="bibliogon"`.
- `min_app_version` audit results: which plugins declare it,
  which values, which against current host version, any
  failures or near-misses.
- Severity-filtering audit: list of every site that iterates
  `result.errors`, with confirmation that each filters on
  severity (or explicit note that the site is read-only logging
  where filtering is unnecessary).

If all checkpoint criteria are clean, proceed to step 5
without further prompt. If anything is anomalous, report and
hold for guidance.

---

## Adoption-signal report (after step 7, deliverable to PluginForge)

When all five tickets close and Bibliogon runs stable on v0.7.0,
report the following back to PluginForge:

- Bibliogon version with the first v0.7.0 consumer commit.
- Number of Bibliogon plugins declaring `target_application`.
- Experience with the deprecation warning (wording clear? UX
  problems?).
- Any PluginForge bugs or API pain points encountered during
  adoption.

This feeds into PluginForge's v0.8.0 scheduling decision.

---

## Scope boundaries (where escalations belong)

PluginForge side will NOT handle:

- Bibliogon code changes (Bibliogon side; PluginForge reviews
  only if an API bug or misunderstanding is suspected).
- i18n strings for `FilterReason` in Bibliogon UI (Bibliogon
  side; PluginForge supplies English `user_facing_message`
  defaults only).
- Integration test infrastructure (Bibliogon side; PluginForge
  has its unit-test setup).
- v0.8.0 timing (PluginForge decides, based on adoption signal).

Escalation channel for unresolvable ambiguity:
https://github.com/astrapi69/pluginforge/issues with label
`consumer-adoption`.

Do NOT escalate: Bibliogon-internal architecture decisions, UI
wording, Bibliogon-side build problems.

---

## Sources of truth

- **Repo**: https://github.com/astrapi69/pluginforge
- **CHANGELOG**: https://github.com/astrapi69/pluginforge/blob/main/CHANGELOG.md
- **v0.7.0 design doc**: https://github.com/astrapi69/pluginforge/blob/main/docs/design/v0.7.0-application-identity.md
- **v0.6.0 design doc**: https://github.com/astrapi69/pluginforge/blob/main/docs/design/v0.6.0-plugin-lifecycle.md
- **Wiki**: https://github.com/astrapi69/pluginforge/wiki (fully updated to v0.7.0)
- **PyPI**: https://pypi.org/project/pluginforge/0.7.0/

---

## Status

**Current**: Backlog filed (this commit). Pin bump + atomic
adoption commit in flight as the next two commits this session.
Checkpoint follows step 3.

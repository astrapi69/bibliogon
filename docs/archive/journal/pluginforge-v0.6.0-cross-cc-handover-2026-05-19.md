# PluginForge v0.6.0 plugin-lifecycle — cross-CC discussion handover (2026-05-19)

Cross-project design discussion between **Bibliogon-CC** (this
repo) and **PluginForge-CC** (the `astrapi69/pluginforge` repo).
First instance of two CC agents directly negotiating an API
surface across two repos. Settled the 5-refinement design for a
v0.6.0 plugin-lifecycle batch; deliverable pending Asterios's
bandwidth call.

This is a **handover doc, not an exploration doc.** It captures
where the conversation left off + the concrete next steps for
either side to pick up. The full back-and-forth reasoning lives
in the session transcript; this file preserves the settled-
decisions slice + the Bibliogon-side evidence.

---

## Context

Bibliogon has been the canonical downstream consumer of
PluginForge for months. Across many sessions, real friction
points accumulated:

- Plugin discovery happens once at FastAPI lifespan startup.
  `importlib.metadata.entry_points()` results stay baked into the
  uvicorn process. New plugins added via `poetry install` aren't
  visible until backend restart. **Today's plugin-comics Session
  1 manual smoke surfaced this as a real user-blocking 404.**
- Bibliogon's `_refresh_manager_app_config()` reaches into
  PluginForge's private state: `_manager._app_config = merged
  # type: ignore[attr-defined]` next to `# noqa: BLE001 -
  pluginforge API change protection`. Two code smells in three
  lines because there's no public `manager.refresh_config(new)`.
- `_log_plugin_diagnostics_pre/_post` is ~80 lines of bespoke
  hand-rolled correlation logic in `backend/app/main.py` because
  PluginForge's `discover_plugins()` returns no structured
  result.
- `api_version` and `min_app_version` exist in every plugin's
  metadata. Both are read by **zero consumers across Python +
  TypeScript** (verified by yesterday's `plugin-metadata-
  pattern-audit-2026-05-18.md`). Decorative.

Today (2026-05-19 morning) the Bibliogon-CC raised these four
items to the PluginForge-CC. The cross-CC discussion converged
on a 5-item v0.6.0 batch (the four asks + one cross-cutting
error-semantics primitive).

---

## Settled design (5 items)

All 5 items are **settled in discussion**. Remaining decision is
purely a bandwidth/sequencing call: does the PluginForge-CC
draft `docs/design/v0.6.0-plugin-lifecycle.md` on the
`design/v0.6.0-lifecycle` branch NOW, or hold for human review
of this summary first?

### Item 1: `manager.rediscover()` API

**Goal**: re-read `entry_points` after `poetry install` (or
plugin-ZIP install) without restarting the host process.

**Settled signature**:

```python
@dataclass
class DiscoveryDiff:
    newly_discovered: list[str]   # entry-points added since last discover
    newly_lost: list[str]         # entry-points removed since last discover
    newly_activated: list[str]    # plugins that activated this call
    newly_deactivated: list[str]  # plugins that deactivated this call

manager.rediscover() -> DiscoveryDiff
```

**Implementation wrinkle**: `importlib.metadata.entry_points()`
caches at multiple layers in Python 3.10+. The clean approach is
`importlib.metadata.MetadataPathFinder.invalidate_caches()` +
`importlib.invalidate_caches()` — **NOT** `importlib.reload`
(which has documented surprising-semantics).

**Verification gate** (per PluginForge-CC's pushback): the
`poetry install-in-another-shell` scenario must be tested
end-to-end before locking the API. If `invalidate_caches()`
doesn't pick up newly-installed `.dist-info` dirs in
`site-packages` when `sys.path` didn't change, the fallback is
forcing a fresh `importlib.metadata.distributions()` walk.

### Item 2: `manager.refresh_config(new_config)` public API

**Goal**: replace today's private-state poke
(`manager._app_config = merged  # type: ignore`).

**Settled signature**:

```python
manager.refresh_config(new_config: dict) -> None
```

**Behavior**: lazy default. Most plugins read `self.config` at
handler-call time, not at activate-time. Forced re-init would
break stateful plugins (e.g. Bibliogon's audiobook plugin holds
an in-flight job manager).

**Opt-in hook for plugins that care**:

```python
class MyPlugin(BasePlugin):
    def on_config_changed(self, old: dict, new: dict) -> None:
        # Default no-op. Override to react to config changes.
        ...
```

**Settled signature decision**: pass `(old, new)` — **not** a
pre-computed diff. PluginForge-CC pushed back on diff-pre-
computation because every plugin computes the relevant diff
differently (shallow-key-set vs deep-recursive vs key-specific).
Imposing a format would force every plugin to either accept ours
or compute their own anyway.

**Convenience util** (Bibliogon-CC concession): ship
`pluginforge.utils.config_diff(old, new) -> dict[str, tuple[Any, Any]]`
as a stdlib-style helper. Plugins that want the common case
import it; plugins that want bespoke walking ignore it. Zero API
cost.

### Item 3: Structured `PluginState` from `discover_plugins()`

**Goal**: replace `_log_plugin_diagnostics_pre/_post`'s hand-
rolled correlation with a typed object per-plugin.

**Settled signature**:

```python
@dataclass
class PluginState:
    name: str
    discovered: bool
    enabled_in_config: bool
    disabled_in_config: bool
    activated: bool
    load_error: Exception | None
    filter_reason: FilterReason | None

manager.discover_plugins() -> list[PluginState]
```

**Settled `FilterReason` enum (8 values)**:

```python
FilterReason = Literal[
    "not_discovered",            # entry-point missing
    "not_enabled",               # config.plugins.enabled lacks it
    "disabled",                  # config.plugins.disabled has it
    "incompatible_api_version",  # hook-protocol mismatch
    "incompatible_app_version",  # min_app_version > host
    "dependency_unmet",          # depends_on points at unloaded plugin
    "license_check_failed",      # pre_activate callback returned False
    "load_failed",               # import or activate() raised
]
```

Split rationale: PluginForge-CC correctly noted `api_version`
(hook-protocol compat) and `min_app_version` (host-version pin)
are different concepts that fail differently. `dependency_unmet`
catches the topological-sort silent-swallow case currently in
PluginForge.

Plus `license_check_failed` (Bibliogon-CC's addition) for the
`pre_activate` callback return-False path; currently logged-and-
swallowed in Bibliogon's `_check_license`. Fits naturally into
the structured filter_reason instead of being a 9th silent-
swallow case.

Extensibility hatch via `cause: Exception | None` on
`PluginError` (Item 5).

### Item 4: Gate `api_version` + `min_app_version`

**Goal**: turn decorative metadata into enforced contract.

**Settled decision**: **gate, don't delete.** Asymmetry:
deleting is irreversible (every downstream app loses the field);
gating is additive (field already exists, just start honouring
it).

**Settled error contract**:

```
plugin foo: requires app >= 0.36.0; host is 0.35.1; refusing to activate
plugin foo: hook api_version 2 is not compatible with host's api_version 1; warning
```

**Severity per-phase** (per PluginForge-CC's refinement, baked
into `PluginError`):

- `incompatible_api_version` → severity=`"warning"` (preserves
  current soft-warn behavior).
- `incompatible_app_version` → severity=`"error"` (new gate).
- `dependency_unmet` → severity=`"error"` (catches silent-
  swallow).
- `load_failed` → severity=`"error"`.
- `license_check_failed` → severity=`"error"`.

**Default severity**: `"error"`. Forces explicit opt-in to warn-
behavior (per Python's `warnings.warn` pattern: silent-default is
the footgun; opt-in noise is fine).

### Item 5: Cross-cutting `PluginError` primitive

**Goal**: typed error consumed by all four PRs above.

**Settled shape**:

```python
@dataclass
class PluginError:
    name: str
    phase: Literal["discovery", "version_check", "activation", "config_refresh"]
    cause: Exception | None
    user_facing_message: str  # localized-ready string the app can surface
    severity: Literal["warning", "error"] = "error"
```

`severity` default is `"error"` (strong-default per Item 4).
`user_facing_message` lets downstream apps render localized text
without re-deriving from `cause`.

---

## Design doc filename

**Settled**: `docs/design/v0.6.0-plugin-lifecycle.md` on a
`design/v0.6.0-lifecycle` branch in the PluginForge repo.

**Why "plugin-lifecycle" not "discovery-refresh"**: encompasses
the four items + error primitive under one cohesive surface
("things that happen during the plugin's lifetime"). Cleaner
framing for the v0.6.0 release notes too.

---

## Open question (the only remaining decision)

**Should PluginForge-CC draft the design doc now, or hold for
Asterios's review of this summary first?**

PluginForge-CC's bandwidth: same session works.

Bibliogon-CC's position: draft now on the branch. Branch
isolation means iteration is safe; Bibliogon-side review fits
naturally into the same flow; human gate happens at PR-merge
time anyway. Holding for human review of this summary first is a
5-minute pause — fine, but the doc itself isn't a load-bearing
decision; the design pass already happened in conversation.

**Awaiting Asterios's call.**

---

## Bibliogon-side adoption implications (post-v0.6.0)

Once PluginForge ships v0.6.0, Bibliogon-side adoption work:

1. **Replace `_refresh_manager_app_config`'s private poke** with
   `manager.refresh_config(merged)`. Drop the `# type: ignore`
   and the `# noqa: BLE001 - pluginforge API change protection`
   comments. Location:
   [backend/app/routers/settings.py](../../backend/app/routers/settings.py).

2. **Replace `_log_plugin_diagnostics_pre/_post`** with the new
   `DiscoveryResult` consumer. ~80 lines of hand-rolled
   correlation become a single per-state-class formatter.
   Location: [backend/app/main.py](../../backend/app/main.py)
   functions starting around line 399.

3. **Fix every plugin's `min_app_version`** before the v0.6.0
   gate fires. Currently:
   - `plugins/bibliogon-plugin-comics/plugin.yaml` →
     `min_app_version: "0.35.0"` (file deleted in 2026-05-18 Path
     B deduplication; the canonical lives at
     `backend/config/plugins/comics.yaml`).
   - `backend/config/plugins/comics.yaml` → `"0.35.0"`.
   - `backend/config/plugins/kdp.yaml` → no `min_app_version`
     (will gate-pass when feature absent).
   - `backend/config/plugins/kinderbuch.yaml` → `"0.9.0"`.
   - `backend/config/plugins/medium-import.yaml` → `"0.30.0"`.

   Pre-release dependency-style sweep: any plugin with
   `min_app_version > current` will fail to activate post-gate.
   Audit on the v0.6.0 adoption commit.

4. **Hook `manager.rediscover()` into the dev-server workflow**
   per the P4 `PLUGIN-DEV-SERVER-RESTART-HELPER-01` backlog
   item. The "warn + auto-restart" plan becomes "warn + auto-
   rediscover" — no process restart needed.

   The `make dev-restart-on-plugin-change` Makefile target
   becomes optional; can instead hot-reload via an HTTP endpoint
   POST `/api/admin/rediscover`. Sketch:

   ```python
   # Field-name correction 2026-05-19 (post-implementation):
   # the original 4-list spec (newly_discovered / newly_lost /
   # newly_activated / newly_deactivated) was consolidated in
   # the actual v0.6.0 release to a richer 5-field shape.
   # Adoption code uses the as-shipped fields.
   @router.post("/admin/rediscover")
   def rediscover() -> dict[str, Any]:
       diff = manager.rediscover()
       return {
           "added": diff.added,            # newly discovered AND activated
           "removed": diff.removed,        # was active, no longer discoverable
           "unchanged": diff.unchanged,    # still active, no change
           "states": {
               name: {
                   "activated": s.activated,
                   "filter_reason": s.filter_reason,
               }
               for name, s in diff.states.items()
           },
           "errors": [
               {"name": e.name, "message": e.user_facing_message,
                "severity": e.severity}
               for e in diff.errors
               if e.severity == "error"  # filter warnings per v0.7.0
           ],
       }
   ```

5. **Consume `PluginError.user_facing_message`** in the Settings
   UI plugin-card error rendering. Today's PluginCard renders
   raw `load_error` exceptions via `str(e)`. Post-v0.6.0, it can
   render the curated `user_facing_message` while keeping
   `cause` for the "Report issue" debug payload.

---

## How to resume the cross-CC discussion

**If the next session continues from Bibliogon side**:

1. Open this handover doc + the most recent session transcript
   (the cross-CC discussion lives in the 2026-05-19 morning
   session transcript, after the "good night → good morning"
   transition).
2. Verify nothing in PluginForge has shipped since this doc was
   written: `cd ~/dev/git/hub/astrapi69/pluginforge && git log
   --oneline -5` (if accessible) or check
   github.com/astrapi69/pluginforge/releases.
3. If `design/v0.6.0-lifecycle` branch exists on PluginForge,
   read `docs/design/v0.6.0-plugin-lifecycle.md` from there +
   surface any "this would break Bibliogon" gotchas to the
   PluginForge-CC.
4. If the branch doesn't exist yet, ping PluginForge-CC and
   point them at this doc for the settled-decisions slice.

**If the next session continues from PluginForge side** (i.e.
the PluginForge-CC reads this):

1. Read this doc + draft `docs/design/v0.6.0-plugin-lifecycle.md`
   per the 5-item structure above.
2. Each item gets its own H2 section: Motivation + Settled API
   + Implementation notes + Test plan + Migration notes.
3. The Bibliogon-side adoption implications section gives you 5
   concrete consumers for the API surface — use those as
   validation cases.
4. Open issues for the 5 PRs from the design doc once
   committed. Bibliogon-CC reviews the design doc before issues
   are filed.

---

## Reference: the original 4 asks (from Bibliogon-CC)

The 4 asks Bibliogon-CC raised first, ranked by leverage:

1. **`manager.rediscover()`** — hot-reload / re-discover-plugins
   API. Highest-leverage single fix. Triggered by today's
   operational-gap class (the plugin-comics 404).

2. **Public `refresh_config()`** — replaces the
   `_app_config = merged` private-attribute patch. Removes two
   `# type: ignore` + `# noqa` markers from Bibliogon's
   `settings.py`.

3. **Structured `PluginState`** — replaces hand-rolled
   `_log_plugin_diagnostics_pre/_post`. ~80 LOC → typed dataclass.

4. **Honor `api_version` + `min_app_version`** — currently
   decorative metadata (zero consumers). Gate, don't delete.

Plus a hidden cross-cutting concern: error-semantics primitive.
Item 5 (the `PluginError` dataclass) emerged from this concern.

---

## Reference: code locations illustrating the pain

For PluginForge-CC's design doc, the following Bibliogon code
locations are concrete evidence of the friction:

**Private-state poke** ([backend/app/routers/settings.py](../../backend/app/routers/settings.py)):
```python
try:
    _manager._app_config = merged  # type: ignore[attr-defined]
except Exception:  # noqa: BLE001 - manager API change protection
    logger.warning("Could not patch _manager._app_config ...")
```

**Same poke in main.py** ([backend/app/main.py](../../backend/app/main.py)):
```python
try:
    manager._app_config = merged  # type: ignore[attr-defined]
except Exception:  # noqa: BLE001 - pluginforge API change protection
    logger.warning("Could not patch PluginManager._app_config ...")
```

**Hand-rolled diagnostics** ([backend/app/main.py](../../backend/app/main.py)):
- `_log_plugin_diagnostics_pre` (~30 lines)
- `_log_plugin_diagnostics_post` (~50 lines)
- Both reach into `manager.get_active_plugins()`,
  `manager.get_load_errors()`, and `_enabled_plugins_from_config()`
  to correlate. A `DiscoveryResult` would replace both.

**Decorative `min_app_version`** ([backend/config/plugins/comics.yaml](../../backend/config/plugins/comics.yaml)):
```yaml
plugin:
  min_app_version: "0.35.0"
```
Verified zero-consumer state in
`docs/audits/plugin-metadata-pattern-audit-2026-05-18.md`.

**Operational restart-needed gap** ([docs/backlog.md](../../docs/backlog.md) — `PLUGIN-DEV-SERVER-RESTART-HELPER-01`):
Filed as P4 specifically because of this PluginForge limitation.
Closes with `manager.rediscover()`.

---

## Status field summary

**Current**: Design refinements settled. Awaiting Asterios's
bandwidth call on whether the PluginForge-CC drafts the design
doc now or holds for human review of this summary first.

**Next action**: Asterios decides → PluginForge-CC drafts (or
holds) → Bibliogon-CC reviews → issues filed → 5 PRs
implementing the v0.6.0 batch.

**Bibliogon-side**: ZERO adoption code today. Adoption work
queues for after PluginForge ships v0.6.0. No backlog item filed
yet — the adoption is implicit in the existing P4
`PLUGIN-DEV-SERVER-RESTART-HELPER-01` and the future post-
release sweep.

**Cross-references**:
- Discussion transcript: 2026-05-19 morning session.
- Bibliogon-side audit: `docs/audits/plugin-metadata-pattern-audit-2026-05-18.md`.
- P4 backlog item: `PLUGIN-DEV-SERVER-RESTART-HELPER-01`.
- PluginForge repo: `github.com/astrapi69/pluginforge` (or local clone path).

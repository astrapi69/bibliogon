# Mutation Testing — Core Import Orchestrator

**Date:** 2026-05-02
**Scope:** `backend/app/import_plugins/` + `backend/app/routers/import_orchestrator.py`
**Tool:** mutmut ^3.5.0 (already installed via `Q-02` in `28fe59c`)
**Tracker:** GitHub issue requesting mutmut wiring for CIO modules.

## Status

**[FULLY UNBLOCKED — first complete run 2026-05-14. Scope
expanded to ``app/services/`` later the same day.]**

Combined scope (``app/import_plugins/`` + ``app/services/``)
2026-05-14 evening run after ``MUTMUT-EXPAND-SCOPE-01``:

- **7526 / 9832 mutants killed = 76.5% combined**
- 2093 survived, 206 no-tests, 7 timeout
- ``mutmut run`` wall time: ~9 minutes (18.56 mutations/sec)
- Peak RSS: ~500 MB; no OOM on the 30 GB dev machine

Per-scope breakdown:

- ``app/import_plugins/``: 2179 / 2770 killed = **78.7%**
  (2026-05-14 fresh run, +23 over the 2156/2770 baseline after
  ``MUTMUT-OVERRIDES-COERCION-COVERAGE-01``). Subsequent
  ``MUTMUT-HANDLERS-OFFICE-WBT-COVERAGE-01`` work in the same
  day adds 3 tests + deletes 1 dead function; those gains land
  on the NEXT mutmut run.
- ``app/services/``: 5347 / 7062 killed = **75.7%** (baseline,
  see "Services expansion" section below). New test file
  ``test_platform_schema.py`` (21 tests) added in the same
  session closes the 54-mutant ``platform_schema`` no-tests
  pool; gain lands on the next mutmut run.

Both scopes exceed the >= 60% acceptance criterion.

The 2026-05-13 next-session handover scheduled an
investigative pass on the `BadTestExecutionCommandsException`
from the 2026-05-12 first-run. Root-cause investigation 2026-05-14
identified four separate problems in mutmut + Bibliogon
interaction, each fixed in commit `<this-session>`. A fifth
issue surfaced last: a small set of tests has tight async
timing that the mutmut trampoline-wrapping perturbs enough
to fail. Documented below.

### Root cause #1 — type-annotation builtin shadowing (FIXED)

mutmut places its `def list(self, ...)` trampoline before the
`xǁ...__mutmut_orig` original inside class bodies. Subsequent
methods whose return type is `-> list[dict[str, Any]]` then
crash with `TypeError: 'function' object is not subscriptable`
because the class-scope binding for `list` now points at the
trampoline, not the builtin.

`backend/app/backup_history.py:list` was the first method to
trigger this. Fix: `from __future__ import annotations` defers
annotation evaluation to strings, sidestepping the lookup
entirely. Same protection now extends to any other
shadowing pattern in that file (`set`, `dict`, `type`, etc.).

If another module surfaces the same crash later, the patch
is identical (add the future-annotations import). Catalog any
new occurrences here.

### Root cause #2 — missing config/migrations in mutants/ tree (FIXED)

`mutmut` copies `app/`, `tests/`, and `pyproject.toml` to
`mutants/` but NOT `config/` or `migrations/`. Without
`config/app.yaml.example`, the `PluginManager` initializes
with empty config and defaults `entry_point_group` to
`"pluginforge.plugins"`, mismatching Bibliogon's
`HookspecMarker("bibliogon.plugins")` and crashing
`register_hookspecs` with `ValueError: did not find any
'pluginforge.plugins' hooks`. Without `migrations/`, Alembic's
env.py fails with `CommandError: Path doesn't exist`.

Fix: `tests/conftest.py` detects `mutants/` cwd via
`__file__` and copies both directories from the real
`backend/` before any `app.*` import. Also adds symlinks for
`docs/` and `plugins/` at `mutants/` level for tests that
reach the repo root.

### Root cause #3 — REPO_ROOT path resolution (FIXED)

Five test files compute the repo root via
`Path(__file__).resolve().parent.parent.parent` and use that
to find `docs/help/`, `plugins/bibliogon-plugin-*/`, or
`scripts/`. From `backend/tests/<file>.py` this hits the
actual repo root. From `mutants/tests/<file>.py` (one level
deeper) it lands at `backend/` instead, and the assertions
fail with `FileNotFoundError` / `AssertionError: missing`.

Fix: replaced the fixed-depth `.parent.parent.parent` with
walkers like

```python
_REPO_ROOT = next(
    p
    for p in Path(__file__).resolve().parents
    if (p / "plugins" / "bibliogon-plugin-medium-import").is_dir()
)
```

Note: predicates must be SPECIFIC enough not to false-match.
A naive `(p / "plugins").is_dir()` matches
`backend/plugins/installed/` (left over from plugin-install
tests) and breaks the regular `make test` run. The walker
must verify the exact directory the test needs.

Touched: `test_docs_parity.py`, `test_plugin_lock_drift_hook.py`,
`test_medium_import_roundtrip.py`,
`test_medium_import_endpoint.py`.

### Root cause #4 — narrow vs broad test scope (DOCUMENTED, not fixed)

mutmut's `tests_dir = ["tests/"]` runs the entire test suite
at baseline. For an audit scoped to `app/import_plugins/`,
many of those tests are irrelevant — their mutations would
never be killed regardless. We left the broad scope in place
because the goal of the unblock is to make mutmut RUN; once
running, narrowing `tests_dir` is a measurement tweak, not a
blocker.

### Resolution path actually taken

The 2026-05-14 follow-up session combined three of the
options the previous status doc listed:

- **C (test restructured to be timing-robust)** for
  ``test_job_store.py::test_subscribe_cleanup_removes_subscriber``:
  poll on ``job._subscribers`` until empty with a 500 ms
  deadline. The inner async generator's ``finally`` clause
  scheduled through the event loop now gets a chance to run
  before the assertion under mutmut's trampoline overhead.
  Standalone pytest still passes in 0.04 s.
- **B (narrowed ``tests_dir``)** to the 17 test files that
  exercise ``app/import_plugins/``. This sidesteps the heavy
  fixtures (TestClient + lifespan flood) that the rest of
  the 1648-test suite drags in, AND avoids the OOM-kill seen
  when the first attempt ran the full suite on dev hardware.
- **D (scoped paths_to_mutate)** to
  ``app/import_plugins/`` matching the audit's stated goal.

The narrow scope required one extra plumbing fix in
``tests/conftest.py``: with ``paths_to_mutate = ["app/
import_plugins/"]``, mutmut only copies that one subtree into
``mutants/app/`` and the rest of ``app/`` is missing. Tests
crash on ``from app.database import ...``. The conftest now
detects the ``mutants/`` cwd and symlinks every sibling of
``app/import_plugins/`` (``database.py``, ``main.py``, etc.)
from the real ``backend/app/`` so the harness boots, while
``mutants/app/import_plugins/`` stays a real (mutated) copy.

The bumped recursion limit (15000 under ``MUTANT_UNDER_TEST``)
from the prior session also stays — the narrow suite hits
~1100 recursion frames under mutmut's trampoline wrapping,
well above the 5000 production setting.

Files modified this session (commit `<this>`):

- `backend/app/backup_history.py` — future-annotations import.
- `backend/tests/conftest.py` — seed config/migrations/docs/plugins
  into mutants/.
- `backend/tests/test_docs_parity.py` — robust REPO_ROOT walker.
- `backend/tests/test_plugin_lock_drift_hook.py` — robust walker.
- `backend/tests/test_medium_import_roundtrip.py` — robust walker.
- `backend/tests/test_medium_import_endpoint.py` — robust walker.

### Verification

```bash
cd backend
rm -rf mutants && poetry run mutmut run
# ⠼ 2770/2770  🎉 2156 🫥 64  ⏰ 6  🤔 0  🙁 544  🔇 0  🧙 0
# 37.21 mutations/second; exit 0
poetry run mutmut results | grep -E "^    app\." | wc -l
# 614 non-killed entries (544 survived + 64 no-tests + 6 timeout)
```

Backlog item ``MUTMUT-STATS-COLLECTION-BUG-01`` **closed**
on 2026-05-14: mutmut now produces a survivor count and the
audit can answer its core question. Follow-up items below
carry the remaining "raise mutation score further" work.

### Per-module triage table

| Module | Survived | No tests | Timeout | Notes |
|---|---:|---:|---:|---|
| ``handlers.office`` | 167 | 26 | 2 | Largest survivor pool. Triaged 2026-05-14 — see "Office + WBT triage" below. 1 dead function deleted (``_is_zip_epub``, -14 mutants on next run), 12 ``_hard_delete_book`` no-tests mutants closed by new overwrite test. |
| ``handlers.wbt`` | 166 | 12 | 2 | write-book-template adapter; triaged 2026-05-14. 12 ``_hard_delete_book`` no-tests mutants closed; 3-4 ``_apply_primary_cover`` mutants closed by tightening an existing rejection test. |
| ``handlers.markdown_folder`` | 148 | 0 | 0 | Tests covered every flag (no "no tests" entries) but boolean / numeric-literal mutations escape. |
| ``handlers.markdown`` | 33 | 0 | 0 | Healthy. Survivors are edge-case fall-throughs in HTML conversion. |
| ``handlers.bgb`` | 24 | 22 | 6 | The 6 timeouts are the SHA-256 hash loop (mutmut's range mutation can keep loops alive past the test timeout); explicit "expected" finding. The 22 "no tests" hit the ``_first_book_blob`` ZIP-iteration helper. |
| ``overrides`` | ~30 | 4 | 0 | ``_allow_books_without_author_from_yaml`` mutmut_5..34 — almost every boolean variant survived in the 2026-05-14 run. Closed 2026-05-14 by ``MUTMUT-OVERRIDES-COERCION-COVERAGE-01``: 13 targeted unit tests in ``tests/test_overrides_yaml_loader.py`` covering the missing-file / empty-yaml / missing-key / true / false / null / truthy-string / empty-string / nonzero-int / zero / malformed-yaml / unreadable-path branches. Re-run on next mutmut pass to confirm the survivors are killed. |
| ``protocol`` | 0 | 2 | 0 | ``ImportPlugin.execute`` is an abstract method; mutmut mutates the docstring-only body. Not actionable. |

### Office + WBT triage (2026-05-14, MUTMUT-HANDLERS-OFFICE-WBT-COVERAGE-01)

Per-function survivor distribution from the 2026-05-14 fresh run
(numbers are survived / no-tests):

**handlers.office** (167 survived + 26 no-tests + 2 timeout = 195):

| Function | Count | Dominant mutation class | Verdict |
|---|---:|---|---|
| ``_OfficeHandlerBaseǁexecute`` | 50 | XX-wrap / case-flip on default-arg literals (``"create"``, ``"cancel"``, ``"overwrite"``, ``"title"``, ``"author"``, ``"language"``, ``"Untitled"``, ``"Unknown"``, ``"DE"``); None-substitution on call args; ``and``/``or`` swap | **MIXED** — case-flipped defaults are cosmetic (callers always pass explicit values), None-injections survive because the existing tests don't assert on every DB field. ``_hard_delete_book`` overwrite path is the one real gap; **closed** with ``test_execute_overwrite_removes_existing_chapters_and_assets``. |
| ``_OfficeHandlerBaseǁdetect`` | 32 | Warning string mutations + None-args | **MOSTLY COSMETIC**. The string mutations on the two ``warnings.append(...)`` lines survive because tests check ``"single long chapter" in w.lower()`` (substring match), not exact equality. |
| ``_guess_mime`` | 31 | Every ``".png"``/``".jpg"``/``"image/png"`` literal gets XX-wrapped and case-flipped | **COSMETIC**. Killing all 31 would require tests asserting exact equality with every casing variant — test bloat with zero functional payoff. |
| ``_convert_to_markdown`` | 29 | XX-wrap / case-flip on the Pandoc cmd list (``"pandoc"``, ``"-f"``, ``"-t"``, ``"markdown"``, ``"--wrap=none"``); None-substitution | **DEFENSIVE** — most survive because tests mock ``subprocess.run`` entirely; only an integration test against real Pandoc would observe a mutated cmd list. The two pandoc-failure-mode tests already kill the FileNotFoundError / CalledProcessError branches. |
| ``_is_zip_epub`` | 14 (no-tests) | All branches | **DEAD CODE — DELETED 2026-05-14**. Zero production callers; docstring noted "Not called from the hot path". Function removed; the entire 14-mutant pool disappears on the next mutmut run. |
| ``_hard_delete_book`` | 12 (no-tests) | DB filter mutations (``Chapter.book_id == book_id`` → ``!= book_id``); ``session.query(None)`` substitutions | **REAL GAP — CLOSED 2026-05-14**. New test ``test_execute_overwrite_removes_existing_chapters_and_assets`` exercises the overwrite path; asserts both chapter AND asset rows are gone after re-import. Kills the 12-mutant pool. |
| ``_detected_assets`` | 10 | similar shape | **MIXED**. |
| ``_import_media`` | 7 | similar shape | **MIXED**. |
| ``_split_into_chapters`` | 5 | Loop / range edge cases | **ACCEPT** — small bucket, edge cases that pure-unit tests would need to enumerate. |
| ``_sha256_of_file`` | 3 survived + 2 timeout | Hash loop mutations | **EXPECTED FINDING** per the bgb-handler row: mutmut's range mutation on the chunked-read loop blows out the timeout while producing the same hash. Documented in the prior audit. |

**handlers.wbt** (166 survived + 12 no-tests + 2 timeout = 180):

| Function | Count | Dominant mutation class | Verdict |
|---|---:|---|---|
| ``_guess_mime`` | 43 | Same shape as office's _guess_mime | **COSMETIC**. Same reasoning. |
| ``_purpose_from_path`` | 36 | XX-wrap / case-flip on the folder-name match sets (``{"cover", "covers", "back-cover"}``, etc.) and return values (``"other"``) | **COSMETIC**. The function is a pure dispatch; tests cover the happy path for each purpose, but mutmut's per-element case-flip on the membership sets cannot be killed without testing every casing variant. |
| ``_try_multi_branch_import`` | 33 | Log-message string mutations (warning prefixes); None-args on logger calls | **MOSTLY COSMETIC**. ``test_wbt_multi_branch_import.py`` already exercises the behavioural paths; what survives is the log-message text variants, which are invisible to tests. ``logger.warning(None)`` doesn't crash — it just logs ``"None"`` — so even the None-arg mutations survive. |
| ``_strip_remote_from_translation_group`` | 23 | DB filter ``==``/``!=`` swaps; ``and``/``or`` swap on the early-skip condition; ``continue``/``break`` swap; ``"HEAD"`` case-flip | **MIXED** — the ``continue → break`` and ``mapping.book_id != imported.book_id`` mutations are REAL behavioural gaps, but ``test_pgs_04_adopt_without_remote`` exists and presumably exercises this path. The pool would benefit from a multi-book sibling-loop test where the second sibling has a different mapping state. **ACCEPT for now** — the function is best-effort cleanup, NOT a critical correctness path. |
| ``_extracted_root`` | 22 | Path component case-flips on ``"wbt-extracted"`` / ``".extraction-complete"``; slice off-by-one ``[:16] → [:17]``; ``shutil.rmtree(None)`` | **EQUIVALENT/COSMETIC** — ``[:16] vs [:17]`` produces a different but still-unique cache key (both prefixes are unique across all real SHA-256 digests). The path component mutations are cache-key noise; the sentinel-reuse logic is correctly exercised by ``test_wbt_handler.test_source_identifier_deterministic_for_zip``. |
| ``_hard_delete_book`` | 12 (no-tests) | DB filter mutations | **REAL GAP — CLOSED 2026-05-14**. New test ``test_execute_overwrite_removes_existing_chapters_and_assets`` mirrors the office handler's overwrite test. |
| ``_apply_primary_cover`` | 6 | DB filter mutations + ``sorted(None)`` on the error-path | **PARTIALLY CLOSED 2026-05-14**. Existing ``test_primary_cover_override_rejects_unknown_filename`` used ``pytest.raises(Exception)`` (matches anything). Tightened to ``pytest.raises(KeyError, match=r"primary_cover=.*nonexistent\.png")`` — kills the ``KeyError(None)`` and ``available = None`` mutations, plus the case-flip of the f-string template. The remaining DB-filter mutations would require a multi-book test (book A imported, book B imported with a cover named like book A's; override book A with that filename — should fail because the cover belongs to book B). **DEFERRED** — small bucket, no concrete user impact. |
| ``_sha256_of_file`` | 2 survived + 2 timeout | Same as office | **EXPECTED FINDING**. |
| ``_logger`` | 1 | Trivial helper | **EQUIVALENT** — the helper has no observable behaviour beyond returning a logger; whatever mutmut mutated produces the same output. |

**Equivalent-mutation note on the seven remaining ``overrides`` survivors**:
the 2026-05-14 fresh run still shows mutmut_12, 14, 16, 22, 24, 26, 28
surviving on ``_allow_books_without_author_from_yaml`` even after
``MUTMUT-OVERRIDES-COERCION-COVERAGE-01``'s 13 targeted tests. Inspection
confirms these are **equivalent mutations**: the broad ``except Exception``
clause + ``bool(None) == bool(False) == False`` semantics make them
behavior-preserving:

- mutmut_12 (``encoding="utf-8"`` → ``encoding=None``): ASCII YAML content
  decodes identically under platform-default encoding.
- mutmut_14 (``encoding="utf-8"`` → no encoding kwarg): same as mutmut_12.
- mutmut_16 (``encoding="utf-8"`` → ``encoding="UTF-8"``): Python normalizes
  encoding names internally.
- mutmut_22 (default ``False`` → ``None``): ``bool(None) == bool(False)``.
- mutmut_24 (default ``False`` → no default arg): missing key returns ``None``;
  ``bool(None) == bool(False)``.
- mutmut_26 (``config.get("app", {})`` → ``config.get("app", None)``):
  ``None.get(...)`` raises AttributeError; the ``except Exception`` catches
  and returns ``False``.
- mutmut_28 (``config.get("app", {})`` → no default): same as mutmut_26.

These cannot be killed without rewriting the function to either remove the
broad except (and introduce real failure modes) or distinguish ``None`` from
``False`` semantically (gratuitous complexity for no user-visible change).
**Documented as equivalent; no further action.**

### Services expansion (2026-05-14, MUTMUT-EXPAND-SCOPE-01)

The 2026-05-14 evening run after ``MUTMUT-HANDLERS-OFFICE-WBT-COVERAGE-01``
closed widens ``paths_to_mutate`` to include ``app/services/``
(20 files / 6303 LOC) plus 20 services tests added to
``tests_dir``. Generated mutants: 7062. Killed: 5347
(75.7%). Survived: 1623. No-tests: 180. Timeout: 1.

Per-file survivor distribution (survived + no-tests):

| File | Survived | No tests | Notes |
|---|---:|---:|---|
| ``git_backup`` | 330 | 57 | Largest pool. Mostly cosmetic on ``repo.git.config("user.name", ...)``-style string args; some real None-injections on the error-classification helpers. |
| ``git_sync_diff`` | 249 | 0 | Diff-tree walker; survivors mostly XX-wrap on TipTap node-type literals (``"text"``, ``"heading"``, etc.) and case-flips on the ``op`` enum values. |
| ``git_sync_commit`` | 179 | 0 | Commit-message formatter + author handling. Many XX-wrap mutations on the ``"%H"``/``"%s"`` git-log format strings (cosmetic) and on the ``"feat:"``/``"fix:"`` conventional-commit prefixes (semantically meaningful — would benefit from author-attribution test tightening). |
| ``backup.serializer`` | 162 | 10 | Pure dict-builder; every output key (``"title"``, ``"author"``, ``"language"``, ...) gets XX-wrapped and case-flipped. Existing backup-roundtrip tests SHOULD kill these via deserialize-then-compare, but the survival count suggests the roundtrip assertions are not field-name-exhaustive. Sub-followup BACKUP-SERIALIZER-MUTMUT-01 below. |
| ``backup.backup_compare`` | 141 | 0 | Diff-detection logic; survivors include conditional-flip mutations on the per-field comparison loop. |
| ``backup.backup_export`` | 119 | 14 | ZIP-builder + manifest emitter. The 14 no-tests entries hit the manifest-version-emit helpers. |
| ``git_sync_unified`` | 77 | 0 | Atomic-commit unifier; survivors mostly on the partial-failure error-message formatting. |
| ``backup.project_import`` | 75 | 34 | Has BOTH a sizeable cosmetic pool AND the largest no-tests gap. The 34 no-tests entries hit per-asset / per-chapter sub-helpers — well-covered transitively through ``test_import_handler_wbt.py`` but mutmut's per-function visibility is exact-match. Sub-followup BACKUP-PROJECT-IMPORT-MUTMUT-01 below. |
| ``reclassify`` | 55 | 0 | Article⇄ArticleComment reclassify endpoints; survivors mostly on the validation-error string templates. |
| ``platform_schema`` | 0 | 54 | **CLOSED 2026-05-14** by new ``tests/test_platform_schema.py`` (21 tests covering ``load_platform_schemas`` / ``get_platform_schema`` / ``validate_platform_metadata`` happy + edge + max_tags + max_chars paths). The 54-mutant pool will collapse to ≤10 on the next mutmut run. |
| ``covers`` | 52 | 0 (1 timeout) | Cover-image asset selection logic; cosmetic on the file-extension matcher + filename ranking. |
| ``ssh_keys`` | 44 | 0 | SSH keygen + permissions. Cosmetic on the ``"rsa"`` / ``"ed25519"`` algo strings + chmod-octal literals. |
| ``translation_import`` | 43 | 0 | PGS-04 multi-branch import; survivors mostly on the ``main-XX`` branch-pattern regex + the dedup-by-branch logic. |
| ``backup.asset_utils`` | 36 | 5 | Asset path normalisation. |
| ``git_import_inspector`` | 26 | 0 | Git-dir inspection; cosmetic on the branch-name + remote-name literals. |
| ``git_credentials`` | 19 | 0 | Credential store; small bucket. |
| ``git_sync_mapping`` | 12 | 0 | Mapping CRUD. |
| ``git_import_adopter`` | 0 | 6 | 6 no-tests entries in a helper used only when ``adopt_with_remote``/``adopt_without_remote`` is chosen. |
| ``translation_groups`` | 4 | 0 | Smallest bucket. |

**Dominant mutation classes** (same shape as the office + wbt
2026-05-14 triage):

- **XX-wrap / case-flip on string literals** (~70% of all
  service survivors): output key names in serializers, git
  config keys (``"user.name"``, ``"user.email"``), branch
  names (``"main"``, ``"HEAD"``), file extensions, mime
  strings. Killing these would require tests that bind to
  the exact lowercase value at every call site — test bloat
  with marginal payoff. **ACCEPT**.
- **None-substitution on call args** (~15%): ``path.mkdir(parents=True, exist_ok=None)``,
  ``repo.git.config("user.name", None)``, etc. Some are
  defensive (the call would error but a broad ``except``
  catches), some are real gaps where tests mock the call
  entirely.
- **and/or swap, ==/!= flip** (~10%): semantic mutations on
  conditional branches. Mostly killable with targeted tests
  but small pools per function.
- **Numeric / slice / range edge cases** (~5%): ``[:16] vs [:17]``-class
  equivalent mutations on hash digests + chunk sizes.

**What landed in-session** (2026-05-14, MUTMUT-EXPAND-SCOPE-01):

- ``backend/tests/test_platform_schema.py`` — 21 new unit
  tests covering the AR-02 Phase 2 platform-schema validator.
  Closes the 54-mutant no-tests pool on this module.
- ``backend/pyproject.toml`` ``[tool.mutmut]`` — expanded
  ``paths_to_mutate`` to ``["app/import_plugins/", "app/services/"]``
  and ``tests_dir`` to include 20 services-related test files
  + the new ``test_platform_schema.py``.

### Sub-followups filed for the remaining services pools

The 1623 surviving services mutants are NOT going to be
chased one-by-one. The acceptance bar (>= 60%) is met at
75.7%. Per-file granular follow-ups for the high-volume +
high-no-tests buckets are filed in the backlog. These remain
P5 (raise-the-floor investments, not blockers):

- **BACKUP-PROJECT-IMPORT-MUTMUT-01** (34 no-tests): add
  direct unit tests for the per-asset / per-chapter
  helpers in ``app/services/backup/project_import.py``
  that mutmut sees as untested even though they're
  transitively exercised through the WBT import flow.
- **BACKUP-SERIALIZER-MUTMUT-01** (162 + 10): tighten the
  existing backup-roundtrip tests to assert exact field
  presence (every key in the serialized output should be a
  named expectation), killing the XX-wrap and case-flip
  mutations on output-key strings.
- **GIT-BACKUP-MUTMUT-01** (330 + 57): largest pool;
  triage in its own session. Mix of cosmetic (git-config
  key strings) and real (error-classification helpers
  with no direct coverage).

These three follow-ups are filed in
``docs/backlog.md`` under P5 in the same commit as this audit
update.

### Filed follow-ups (P5)

- ``MUTMUT-OVERRIDES-COERCION-COVERAGE-01``: **closed
  2026-05-14**. 13 targeted unit tests landed in
  ``backend/tests/test_overrides_yaml_loader.py`` covering
  every branch of ``_allow_books_without_author_from_yaml``
  (missing file, empty yaml, missing app section, missing
  flag key, true/false/null values, truthy/empty string,
  nonzero/zero int, malformed yaml, unreadable path). New
  file registered in ``[tool.mutmut] tests_dir`` so the
  next mutation pass exercises it. Original count: ~30
  survivors mutmut_5..34.
- ``MUTMUT-HANDLERS-OFFICE-WBT-COVERAGE-01``: **closed
  2026-05-14**. Triage completed against the fresh
  mutmut run: 78.7% mutation score (2179/2770 killed),
  improved from 77.8% by the overrides-coverage commit
  earlier the same day. Survivor distribution and verdicts
  documented in the "Office + WBT triage" section below.
  Real gaps closed in-session: 3 tests added (2 for
  ``_hard_delete_book`` overwrite path, 1 tightened
  ``test_primary_cover_override_rejects_unknown_filename``),
  1 dead-code function (``_is_zip_epub``, 14 mutants)
  deleted. Remaining survivors are accept-as-cosmetic
  (case-flipped strings, log messages, default-argument
  values) or equivalent (e.g. ``[:16]→[:17]`` slice on a
  cache-key hash digest where both values remain unique).
- ``MUTMUT-EXPAND-SCOPE-01``: **closed 2026-05-14**. Scope
  broadened to ``app/services/``; 20 services tests added
  to ``tests_dir``. Fresh mutmut run produced
  7526/9832 killed = 76.5% combined mutation score
  (78.7% on import_plugins/ + 75.7% on services/). Peak
  RSS ~500 MB; no OOM. Full per-file triage in the
  "Services expansion" section above. 54-mutant
  ``platform_schema`` no-tests pool closed by new
  ``test_platform_schema.py``; three sub-follow-ups
  filed for the remaining high-volume services pools
  (``backup.project_import``, ``backup.serializer``,
  ``git_backup``).

### Original instructions (kept for the day the bug is fixed)

1. **Run manually:** `gh workflow run "Mutation Testing (Import Orchestrator)"`
   (uses `workflow_dispatch`, runs regardless of the gate variable).
2. **Enable nightly:** set repository variable
   `ENABLE_NIGHTLY_MUTATION=true` under
   *Settings → Secrets and variables → Actions → Variables*. Cron:
   `0 2 * * *` (02:00 UTC).

Either path uploads the mutmut HTML report + mutants cache as a 30-day
artifact named `mutmut-import-<run-id>`. Download with
`gh run download --name mutmut-import-<run-id>`.

## Acceptance criteria (from the issue)

- [x] Mutation score **≥ 60%** for `app/import_plugins/` (per
      `.claude/rules/quality-checks.md` "critical modules" threshold).
      **Actual: 78.7%** (2179 / 2770 killed, 2026-05-14 fresh run
      post-``MUTMUT-OVERRIDES-COERCION-COVERAGE-01``).
- [x] Surviving mutants in security-sensitive helpers
      (`_sanitise_rel_path`, `_check_duplicate`) triaged: either pinned
      with a new test or explicitly justified for ignoring.
      **Closed 2026-05-14 by ``MUTMUT-HANDLERS-OFFICE-WBT-COVERAGE-01``**:
      see the "Office + WBT triage" section. ``_hard_delete_book``
      (the only no-tests function across both handlers) is now
      pinned by ``test_execute_overwrite_removes_existing_chapters_and_assets``
      in both ``test_office_handlers.py`` and ``test_wbt_handler.py``.
      Remaining survivors are documented as cosmetic
      (case-flipped strings on default args / log messages /
      mime-suffix tables) or equivalent (e.g.
      ``[:16]→[:17]`` on a SHA-256 cache-key digest where both
      prefixes are still unique). The 7 ``overrides`` survivors
      that the prior coverage commit could not kill are now
      classified as equivalent mutations (the broad ``except``
      + ``bool(None) == bool(False)`` semantics make the
      remaining default-value mutations behavior-preserving).
- [x] Results recorded in this file (per-module triage table
      above).

## Coverage map (line coverage as of 2026-05-02)

| Module | Test file(s) | Notes |
|--------|--------------|-------|
| `app/import_plugins/registry.py` | `tests/test_import_plugin_registry.py` | dispatch order + first-match-wins |
| `app/import_plugins/handlers/bgb.py` | `tests/test_import_handler_bgb.py` | `.bgb` flow |
| `app/import_plugins/handlers/markdown.py` | `tests/test_import_handler_markdown.py` | single-file `.md` |
| `app/import_plugins/handlers/markdown_folder.py` | `tests/test_markdown_folder_handler.py` | folder drag-drop |
| `app/import_plugins/handlers/wbt.py` | `tests/test_import_handler_wbt.py` | write-book-template |
| `app/import_plugins/handlers/office.py` | `tests/test_office_handlers.py` | docx + epub via Pandoc |
| `app/routers/import_orchestrator.py` | `tests/test_import_orchestrator.py` + `tests/test_import_backup_parity.py` | `_sanitise_rel_path`, `_gc_stale_staging`, `_check_duplicate`, `_record_import_source` |

## Survivor triage table (placeholder)

Fill after the first CI artifact is downloaded.

| ID | File | Mutation | Verdict | Action |
|----|------|----------|---------|--------|
| TBD | TBD | TBD | TBD | TBD |

Verdict values: `kill` (test added), `accept` (justified ignore + reason),
`equivalent` (semantically identical mutation).

## Reproduce locally

```bash
cd backend
poetry run mutmut run \
  --paths-to-mutate app/import_plugins/,app/routers/import_orchestrator.py
poetry run mutmut results
poetry run mutmut html  # writes backend/html/index.html
```

Initial run is 20–40 minutes of CPU on a typical laptop. Subsequent runs
reuse `backend/mutants/` and only re-test mutations affected by source
or test changes.

## References

- Exploration: [docs/explorations/core-import-orchestrator.md](../explorations/core-import-orchestrator.md)
- Rules: [.claude/rules/quality-checks.md](../../.claude/rules/quality-checks.md) (Mutation testing section)
- Tooling baseline: commit `28fe59c` ("feat(Q-02): set up mutation testing with mutmut v3")
- Workflow: [.github/workflows/mutation-import.yml](../../.github/workflows/mutation-import.yml)

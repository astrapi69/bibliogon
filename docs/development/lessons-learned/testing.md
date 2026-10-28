# Lessons learned: Testing

Test design, mocks, E2E and CI flakes, assertions that cannot fail.

Index of every entry: `.claude/rules/lessons-learned.md`. Moved here from that file unchanged (#1141).

## End-to-end behavior tests are not "kwarg passes through" tests

The MEDIUM-IMPORT-FRONTEND-UI-01 session (2026-05-09) shipped a Settings UI that wrote 4 user-toggleable settings to `backend/config/plugins/medium-import.yaml`. The plugin's `activate()` read them into `self._settings`. The test suite included a smoke test confirming `_settings == {"download_images": False}` was set correctly. **It all looked working.**

What was actually broken: `routes.py` called `import_zip(contents)` with no kwargs. None of the settings ever flowed from the plugin into the importer. Every import ran the hardcoded defaults — for the 209 articles already imported AND for the next year's worth of new imports if nobody had noticed.

The smoke tests passed because they only verified "the dict landed in `self._settings`". They never asserted the settings produced an observable behavioral difference at import time. The wiring gap was invisible to the tests because the tests were testing the wrong layer.

The fix in the `SETTINGS-WIRING-01` session establishes a hard rule: every settings flag MUST have at least one test that flips the flag to a non-default value and asserts an OBSERVABLE behavioral difference. Concretely:

- `default_status="draft"` → assert `Article.status == "draft"` after import
- `skip_existing_canonical_urls=False` → re-import the same archive and assert a DUPLICATE row appears in the DB
- `download_images=False` → assert the downloader function is NEVER called (capture all invocations) AND body URLs stay CDN-hosted in the persisted doc
- `image_download_timeout_seconds=7` → capture the kwargs passed to `download_images` and assert `timeout_seconds == 7.0`

The pattern that the smoke-test class followed:

```python
# WRONG: this passes whether or not the setting reaches import_zip
def test_setting_propagates():
    plugin = make_plugin({"settings": {"default_status": "draft"}})
    plugin.activate()
    assert plugin._settings["default_status"] == "draft"
```

The pattern the behavior tests follow:

```python
# RIGHT: this fails if the setting doesn't reach the importer
def test_setting_default_status_propagates_to_article(client, db):
    body = _post_zip_with_settings(
        client, _build_zip([fixture]), {"default_status": "draft"}
    )
    article = db.query(Article).filter(Article.id == body["imported"][0]["id"]).one()
    assert article.status == "draft"
```

The behavior test reaches through every layer the production request reaches through (HTTP endpoint → plugin config injection → settings translator → import_zip kwargs → service code → DB) and asserts at the OUTPUT. Smoke tests of intermediate layers are fine to add for diagnostic granularity, but they are NOT a substitute for at-least-one end-to-end behavior test per setting.

This rule generalizes beyond settings:

- Feature flag (`audiobook_overwrite_existing`, etc.) → at least one test flips the flag and asserts observable change in the produced artifact.
- New endpoint kwarg → at least one test passes a non-default value and asserts the behavior the kwarg controls.
- Plugin config → at least one test sets the value and asserts the consumer of that value behaves differently.

The 2026-05-09 retroactive fix added 6 such tests to `test_medium_import_endpoint.py`. The smoke-test pattern is not banned (it's still useful for diagnosing where in the chain a regression broke), but it cannot be the only coverage of a flag's behavior.

## React 18 dev-mode double-effect-mount strands `mockImplementationOnce`

React 18 in development mode (Strict Mode and/or its testing-library equivalent) deliberately mounts components twice and runs effects twice to surface non-idempotent setup. Combined with happy-dom + Vitest, the result is that a `useEffect` calling an API mock fires twice on the first render.

If the test sets `mockImplementationOnce(returnValue)` per test, the FIRST useEffect call consumes the implementation and the SECOND call falls through to the default `vi.fn()` (which returns `undefined`) — the component then sees the default empty state and the test fails on a stale assertion.

Fixes:
- **Use `mockImplementation(...)` (no `Once`).** The implementation persists across both effect mounts. Per-test `afterEach { mock.mockClear() }` (NOT `mockReset`) keeps the implementation alive across test boundaries while still resetting call history.
- **Set a default implementation in the `vi.mock` factory itself**, e.g. `getPlugin: vi.fn(async () => ({ settings: {} }))`. Tests that don't care about the response can rely on the default; tests that do override per-test via `mockImplementation`. `mockClear` (not `mockReset`) preserves the factory default between tests.

The `mockClear` vs `mockReset` distinction matters specifically because of the factory-default pattern: `mockReset` strips the factory's implementation and the next test starts with a vanilla `vi.fn()` returning undefined, which crashes the next render's `useEffect` chain with `Cannot read properties of undefined (reading 'then')`.

## XHR mocks need a function constructor, not an arrow

`vi.stubGlobal("XMLHttpRequest", vi.fn(() => fakeXhr))` fails at runtime with `TypeError: () => fakeXhr is not a constructor`. Arrow functions cannot be invoked with `new`.

The simple fix: stub with a regular function expression, which JS allows as a constructor: `vi.stubGlobal("XMLHttpRequest", function () { return fakeXhr; })`. The `return` of an explicit object from a constructor-called function replaces the implicit `this` instance, which is exactly what we want here — the test's pre-built `fakeXhr` object becomes the result of `new XMLHttpRequest()`.

Generalizes to any global that callers invoke with `new` (`WebSocket`, `Worker`, etc.). Stubbing such globals with arrow functions silently breaks; stubbing with a regular function or a class works.

## React `useEffect` deps + i18n test mocks: the `t` function isn't stable

Symptom: a component's fetch-on-open effect kept failing in tests
because the `setError` call in the rejection branch never landed.
Looked like a race condition but wasn't. The effect's dep array
included the i18n `t` helper:

```typescript
useEffect(() => {
    let cancelled = false
    api.something.fetch(...)
        .then(...)
        .catch((err) => {
            if (cancelled) return
            setError(...)
        })
    return () => { cancelled = true }
}, [open, kind, ids, t])  // <-- t here
```

In production the i18n provider memoises `t` so the dep is stable.
In the test setup, the i18n mock returns a fresh `t` function on
every render:

```typescript
vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k, fallback) => fallback, ...}),
}))
```

Result: every parent re-render produces a new `t`, so the effect
cancels its prior run and refetches. The rejection from the
previous run lands while the new run's `cancelled` closure is
still false, BUT the previous run set `cancelled=true` in its own
closure. The catch sees `if (cancelled) return` and bails out
before `setError` fires. The error never surfaces to the user.

Fix: omit `t` from the dep array when the request shape doesn't
actually depend on it (the fallback string in the toast was the
only consumer). Add an `eslint-disable-next-line` with a comment
explaining why:

```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [open, kind, ids])
```

Generalises to any hook function the i18n mock returns fresh per
render — `useDialog`, `useNavigate` (when its callback closure
captures state), etc. When a test fails because a state update
"never happens" but the production code looks correct, check the
effect dep array against the hooks consumed inside it.

The right fix is NOT to memoise the mock's `t` per-render (that
defeats the point of mocks). The right fix is to scope the
effect's deps to what genuinely affects the request.

## Run vitest from `frontend/`, not the repo root

Vitest's config lives in ``frontend/vite.config.ts``.
Running ``npx vitest run`` from the repo root finds no
config, defaults to the `node` environment, and produces
``ReferenceError: document is not defined`` across every
test that touches the DOM. In a real 2026-05-12 incident,
**101 of 120 test files failed** with this error before
I noticed the cwd was wrong — completely misleading red
flag suggesting something I'd just edited broke the entire
test environment.

Tells in the failure output:

- Per-file ``setup: 0ms`` (happy-dom didn't initialise).
- ``environment: 0ms`` in the summary line.
- The error itself: ``ReferenceError: document is not
  defined`` (or ``window`` / ``HTMLElement`` / similar).
- Files that passed earlier in the same session
  suddenly all fail.

Three reliable invocations:

- ``make test-frontend`` from anywhere (the Makefile
  cd's into ``frontend/`` before running vitest).
- ``cd frontend && npx vitest run`` — direct, fast,
  same result as the Makefile target.
- ``cd frontend && npx vitest run src/path/to/file.test.tsx``
  for a targeted re-run.

Failure modes:

- ``npx vitest run`` from repo root → no config found
  → wrong environment → 100% red flag on DOM-touching
  tests.
- ``poetry run vitest`` (mixed up with backend tooling)
  → vitest not in the Python venv → command-not-found.

Concrete rule: when a recent edit "breaks every vitest
file at once," check the cwd before suspecting the code.
A green run minutes ago in the same session and a red
run now with ``setup: 0ms`` is the cwd diagnostic, not a
regression.

## Radix DropdownMenu + happy-dom is brittle for Vitest

Surfaced 2026-05-14 across the v0.32.0 F2c (ArticleEditor
kebab) and F3 (Toolbar Copy chevron) sessions. Radix
DropdownMenu (`@radix-ui/react-dropdown-menu`) renders its
menu content through a portal and uses pointer events plus
focus-scope state for the open transition. happy-dom's
portal + focus-scope simulation is incomplete, so a Vitest
that mounts a component using DropdownMenu can:

- Render the trigger button correctly (works).
- Open the menu on `fireEvent.click(trigger)` —
  intermittent. Sometimes the menu content never lands in
  the DOM; sometimes it lands but `findByTestId` for an
  item inside `<DropdownMenu.Portal>` returns nothing.
- Throw `setState during render` from
  `@radix-ui/react-focus-scope` when both
  `fireEvent.pointerDown` + `fireEvent.click` fire in
  rapid succession (the workaround pattern most
  documentation suggests).

The F2c session burned ~30 min trying every combination of
`fireEvent.click`, `fireEvent.pointerDown` +
`fireEvent.pointerUp`, `userEvent.click`, and adding
`act()` wrappers. None of them produced a stable test.

Concrete rule for new Vitest files that exercise a Radix
DropdownMenu:

1. **Test the trigger button's existence** via
   `findByTestId` on the trigger. This works reliably and
   pins regressions where the trigger disappears entirely
   (e.g. the kebab gets accidentally hidden behind a
   conditional).
2. **Do NOT attempt to assert on the menu content** via
   `findByTestId` inside `<DropdownMenu.Portal>`. The portal
   timing in happy-dom makes this flaky. Defer the assertion
   to an E2E spec in a real browser.
3. **Test the action handler in isolation** when the
   handler is non-trivial — pass the handler in by prop or
   extract it from the component so the unit test can invoke
   it directly. The F3 Toolbar tests do this: the primary
   Copy button (not behind a portal) gets full Vitest
   coverage including clipboard write and toast assertions;
   the chevron dropdown's two items are covered only by the
   matching Playwright spec.

If a future test needs reliable DropdownMenu-open in unit
tests, consider:

- A test-only `defaultOpen` prop on the wrapping component.
- A controlled-open variant in production code that the test
  can force open.
- Switching to a non-portal alternative for the menu.

None of these is worth the complexity for the current use
cases; the E2E split is the cleaner answer.

## Module-level caches survive test boundaries (test isolation, in-memory edition)

Bibliogon's filesystem and DB test isolation is well-documented
in `CLAUDE.md` ("Test isolation" section) — the `BIBLIOGON_TEST=1`
+ `BIBLIOGON_DATA_DIR` chain plus the production marker tripwire
cover those layers. But **in-memory caches in service modules
have no equivalent guard**, and they survive ALL test boundaries
inside a single pytest process.

The 2026-05-14 platform_schema regression is the canonical
example. `app/services/platform_schema.py` decorates
`load_platform_schemas` with `@lru_cache(maxsize=1)` (intentional
— production wants the YAML read once at startup). The new
`tests/test_platform_schema.py` introduced fixtures that
monkeypatch `_SCHEMA_PATH` to a tmp file with a fake schema and
calls `load_platform_schemas.cache_clear()` once in an autouse
fixture. Symptoms:

- The autouse fixture cleared the cache **before** each test
  but not **after** — `return None` instead of `yield`.
- The fake-schema dict from the last test in the file got
  cached; monkeypatch reverted `_SCHEMA_PATH` at teardown but
  the LRU cache stayed populated.
- The NEXT test file that called `load_platform_schemas()` via
  the real `/api/article-platforms` endpoint hit the LRU cache,
  saw the stale fake dict, and 5 publications tests failed with
  `ResponseValidationError: 'twitter' missing display_name` (the
  shape `test_validate_max_chars_enforced` had written).

Caught only in CI (the local pytest invocation in the same
session ran `test_platform_schema.py` in isolation, missing the
cross-file poisoning). Fix: change the autouse fixture from
`return None` to `yield`, and clear the cache on both sides.

### Rule

Any service module that uses module-level mutable state visible
to multiple tests needs a teardown hook in the fixtures that
touch it. Concretely:

- `@functools.lru_cache` decorators → tests that monkeypatch the
  underlying read must `cache_clear()` in BOTH the setup AND the
  teardown of every fixture/test that touches them. The
  `yield`-based autouse fixture pattern is the simplest shape:
  ```python
  @pytest.fixture(autouse=True)
  def _clear_module_cache():
      module.cached_function.cache_clear()
      yield
      module.cached_function.cache_clear()
  ```
- Module-level globals (singletons, registries, dicts assigned
  at import time) → same shape, reset state in both directions.
- Class-level state on a service singleton → same.

### Anti-pattern

Setup-only cache clears (`return None` instead of `yield`) look
correct in isolation — the test file's own tests pass green —
but pytest runs all collected tests in one process. The cache
written by the LAST test in your file is what subsequent test
files see. The bug is invisible inside the file's own boundary,
which is exactly why CI catches it and local single-file runs
don't.

### Detection heuristic

When adding a new test file that fakes out a service module's
inputs, grep that service module for:
```
grep -E '@(lru_|.*_)cache|_cache *=|^[A-Z_]+ *= *' \
  backend/app/services/<module>.py
```

Any match is a candidate for state-survival-across-tests. Either
add the bidirectional `cache_clear()` fixture pattern, or
document why the state is OK to leak (rare, but
``platform_schema``'s `lru_cache(maxsize=1)` IS production
behaviour we wanted, so tests need to isolate, not remove).

### Pairs with

The existing `CLAUDE.md` "Test isolation" section covers
filesystem + DB. This rule covers the third layer: in-process
in-memory state. All three layers need explicit handling.

## Every bug-fix commit ships its regression-pin test

Established 2026-05-14 after the BulkActionBar selection-cleanup
fix (commit 02553fb) shipped with hook-level Vitest coverage but
NO E2E test for the user-facing flow that surfaced the bug.

### Rule

For every bug fixed, the following test coverage is MANDATORY,
not optional:

1. **Regression-pin unit test** at the layer the bug lived in
   (Vitest for frontend, pytest for backend). Asserts the bug's
   specific behaviour is correct. Named to reference the bug. A
   one-line comment in the test references the discovery context.

2. **Integration test if the fix crosses layers.** Frontend
   handler + API client + backend endpoint all exercised; state
   changes verified end-to-end.

3. **E2E Playwright test if the bug was user-facing smoke-
   discovered.** Replicates the exact user flow that surfaced
   the bug. Future-regression-prevention is the load-bearing
   value here.

4. **Cross-surface tests if the bug-class might exist
   elsewhere.** For an Articles bug, verify Books doesn't have
   the same. For a service-worker / routing bug, verify all
   parallel API surfaces have correct routes.

### Stop-condition

If a fix is shipped without the corresponding tests, that is a
**stop condition**: add the tests before closing the commit (or
in an immediately-following commit if the original is already
pushed). Tests don't ride in a follow-up "later" backlog item —
they ride with the fix.

### Retroactive application

When a previous bug-fix is found without regression-pin tests,
file a backlog item to add them. Don't let the gap survive into
the next release.

### Example application (2026-05-14 cycle)

| Bug | Tests shipped |
|---|---|
| BulkActionBar stale state (commit 02553fb) | Vitest hook tests (14 cases) ✓ ; E2E backfilled in a follow-up commit |
| Articles-Trash Restore (reported as SW bug) | Vitest hook tests for trash flow exist ; backend pytest tests pin /restore ; E2E positive regression-pin added (e2e/smoke/articles-trash.spec.ts) |
| Medium-import button state (phase-1 v0.32.0) | 2 Vitest tests pin success + failure paths ✓ |

### Why this rule earns the citation cost

The 02553fb regression — orphan selection ids after row-delete —
shipped to main with a Vitest-only safety net. The fix is correct
but the failure mode it prevents is a user-visible UI bug that
only manifests in a browser, not in a unit test. Without an E2E,
a future refactor (e.g. moving the selection hook into a context
provider, or changing the deletion order) could silently break
the wiring while the unit tests still pass — exactly the bug
class the original fix was meant to prevent. E2E coverage closes
that gap.

## Test-isolation discipline: never run integration smoke-tests outside pytest

The Bibliogon harness ships three protective layers against
test runs hitting production data:

1. ``BIBLIOGON_TEST=1`` env-var, set by
   ``backend/tests/conftest.py`` BEFORE any ``app.*`` import.
2. ``TEST_DATABASE_URL=sqlite:///:memory:`` env-var, set in
   the same place.
3. ``.bibliogon-production`` marker file in real data dirs,
   plus a session-scoped autouse tripwire that aborts the
   pytest run with ``returncode=2`` if it ever sees the
   marker.

**All three only fire under pytest.** A free-standing
``poetry run python -c "from app.main import app; ..."``
script bypasses every one of them — conftest never executes
for direct-Python invocations, so the FastAPI app points at
the real production DB at ``~/.local/share/bibliogon/bibliogon.db``.

### Concrete incident

2026-05-16, during Bug 10 Commit 1. A smoke-test of the new
``DELETE /api/comments/trash/empty`` endpoint was run via a
direct ``poetry run python -c "..."`` script (NOT pytest)
against ``TestClient(app)``. The script ran successfully ―
and emptied the user's real production ``article_comments``
table, hard-deleting all 61 soft-deleted comments in one
``empty_trash`` call. The 14:25 ``.bgb`` backup did not
carry comments (Bibliogon backup format only persists
Article + Publication + ArticleAsset), so .bgb-based
recovery was impossible.

The dev-mode context prevented worst-case impact: the data
was reproducible from the original Medium archive. **But
the discipline violation was real and the harness was
working correctly — the test script ran outside its scope,
not the harness failing.** Frame the incident as a process
breach, not a harness defect, so the project doesn't acquire
a "harness is unreliable" mental model.

### Rule

For any integration smoke-test against FastAPI ``TestClient``
or any code path that imports ``app.main`` /
``app.database`` / ``app.routers.*``:

- **Default**: write the smoke-test as a one-off pytest file
  under ``backend/tests/``. Conftest fixtures (session-scoped
  env-var setup + the marker tripwire) fire automatically.
  This is the right shape for anything more than a single
  trivial assertion.

- **Acceptable shortcut for trivial probes**: prefix the
  command with the env-vars manually:

  ```bash
  BIBLIOGON_TEST=1 TEST_DATABASE_URL=sqlite:///:memory: \
    poetry run python -c "..."
  ```

  Use only when the probe is genuinely a one-line check (e.g.
  "does this import succeed?"). Anything that makes API calls
  or mutates DB state must go through pytest.

- **NEVER**: bare ``poetry run python -c "from app.main
  import app; ..."``. The FastAPI app's lifespan fires
  ``init_db()``, which connects to the production DB via
  ``app.database.DATABASE_URL`` (resolved at import time
  from ``BIBLIOGON_DATABASE_URL`` / ``DATABASE_URL`` env
  vars — neither of which the bare command sets).

### Detection grep

For self-audit before running any one-off probe:

```bash
# Grep your own command history for bare python -c imports.
history | grep -E 'python -c.*app\.main|python -c.*import app'
```

If a hit lacks the ``BIBLIOGON_TEST=1`` prefix, do not run
it. Rewrite as a pytest file.

### Pairs with

- The existing CLAUDE.md "Test isolation" section documents
  the three-layer harness. This rule is the discipline that
  keeps the harness load-bearing — without it, the harness
  exists but isn't exercised on the paths that need it most.
- "Operational gaps masquerade as wired infrastructure" — same
  family. The harness is wired, but only triggered on the
  pytest path; a script outside that path is operationally
  unprotected even though the protection exists.

## Testid namespace pinning prevents silent E2E skips

Surfaced 2026-05-15 as the positive discipline derived from the
G2-F2 silent-skip incident (recorded inside
"Articles-vs-Books parallel-surface asymmetry"). The G2-F2 entry
documents what went wrong: ``book-card-{id}`` in the grid view
vs ``book-list-row-{id}`` in the list view; an E2E spec written
for one view-mode resolves all its testids cleanly when the
fixture happens to persist the same view-mode, and silently
finds nothing — passing on a no-op — when a different view-mode
persists. The bug was invisible for two release cycles.

This rule is the positive discipline that prevents the
recurrence: namespace your testids deliberately and exercise
every one positively in the E2E spec.

### Rule

For any non-trivial UI component that an E2E spec will drive
(wizards, multi-step forms, dialogs with multiple slots, bulk-
action bars, settings tabs):

1. **Choose a single namespace string at component creation
   time.** A 2-3 dot-prefix or hyphen-prefix that uniquely
   identifies the component family is enough:
   ``convert-to-book-wizard-{step}-{slot}``,
   ``article-bulk-{action}``,
   ``settings-tab-{tab-id}-{slot}``. Document the schema in
   the component's header docstring or a short JSDoc block
   above the first testid use site.

2. **Every interactive surface gets a testid in that
   namespace.** No exceptions for "the button is obvious".
   Buttons, inputs, selects, toggles, dropzones, drag
   handles, list rows — each addressable element has an
   id under the component's namespace.

3. **List every testid in the component's header comment
   or in a sibling ``*.testids.md`` file.** The list is the
   contract: it tells the E2E author what's pinned and tells
   future maintainers what they must keep stable when they
   refactor.

4. **The E2E spec exercises every testid in the namespace at
   least once positively.** "Positively" means
   ``await expect(page.getByTestId(...)).toBeVisible()`` —
   not a negative assertion like ``not.toBeNull()`` and not
   a fragile partial-match. The spec walks the happy path
   from first user surface to last, asserting each pinned
   testid resolves to exactly one visible element.

5. **When the namespace evolves, the spec's positive
   coverage walk is the safety net.** Renaming a testid or
   forgetting to apply the namespace to a new surface
   triggers a spec failure on the very next CI run — not
   a silent skip on the next view-mode flip.

### Concrete artefacts

- **First feature shipped under this discipline**: Phase 2 of
  the article-to-book conversion (commit ``9261acd`` for the
  component, commit ``7440564`` for the E2E spec). Component
  header docstring carries the namespace schema; E2E happy
  path positively asserts every step's slot resolves; 11
  Vitest specs cross-check the same testid names from a
  component-rendering angle.

- **Negative incident the discipline prevents**: G2-F2
  view-mode testid namespace split, documented in
  "Articles-vs-Books parallel-surface asymmetry"
  occurrence list.

### Anti-patterns

- **No namespace at all** — ad-hoc testids like ``submit-btn``,
  ``confirm``, ``ok``. Two sibling components collide; specs
  resolve to the wrong element. Cure: prefix.
- **Namespace drifts across view-modes / branches** — same
  visual concept, different testid in card vs list view, in
  draft vs published state, in mobile vs desktop layout. Cure:
  one testid per conceptual element regardless of which branch
  renders it. The E2E spec's positive walk would have caught
  the drift on the very next run.
- **Specs that only assert negatively** —
  ``await page.getByTestId(...).not.toBeNull()`` passes when
  the element doesn't exist at all. Cure: use ``toBeVisible``
  (or ``toHaveCount(1)`` when uniqueness matters).
- **Partial-prefix selectors that overmatch** —
  ``[data-testid^="book-card-"]`` matches both the root
  ``book-card-{id}`` AND every nested ``book-card-menu-{id}``.
  Documented earlier in "Prefix testid selectors match every
  nested testid that shares the prefix". The positive-coverage
  discipline complements that fix.

### Pairs with

- "Articles-vs-Books parallel-surface asymmetry" — the G2-F2
  occurrence list captures the negative side; this rule is
  the positive prevention.
- "Prefix testid selectors match every nested testid that
  shares the prefix" — same testid-discipline family,
  different failure mode.
- The two rules together cover the "namespace your testids +
  exercise them positively + don't overmatch with prefix
  selectors" trifecta.

## New-hook + new-mock-key contract drift in EXISTING test files

When a feature introduces a new hook (or new API client method,
or new behavior that depends on a mocked API), the new hook's
data contract is fresh — but the EXISTING test files that mock
that API are not automatically aware of it. If the existing mocks
return a response shape that doesn't include the new key/field
the new hook reads, the hook silently falls back to its hardcoded
default and consumer tests in those existing files assert against
the wrong state.

### Concrete incident

Bug 3 (2026-05-16, commit `5767289`) shipped a new
`useTrashViewMode` hook that reads
`ui.dashboard.articles_trash_view` from the mocked
`api.settings.getApp()` response. The companion test commit
(`8cf6ed0`) added an "AD-Trash view-mode default" test inside
the EXISTING `ArticleList.test.tsx`, but the existing
`vi.mock("../api/client", ...)` block was returning only
`{articles_view: "list"}`. The new hook looked for
`articles_trash_view`, found nothing, kept its hardcoded
`"grid"` initial state, and the test's "list visible by default"
assertion failed. The red was invisible at commit time of
`8cf6ed0` (we don't know whether the test author ran the full
suite then) and stayed red on `main` for 24+ hours until the
follow-up session's `make test` surfaced it. Fix (Bug 7,
2026-05-16, commit `5728e71`) extended the mock to include
`articles_trash_view: "list"`.

### Rule

When introducing a new hook or new API consumer that reads from
a key of an already-mocked API response, do BOTH of these in
the same commit:

1. **Grep every test file that mocks the same API** and verify
   the mock's return value includes the new key. Recipe:

   ```bash
   grep -rn 'vi\.mock.*api/client\|getApp:\s*vi\.fn' \
     frontend/src --include='*.test.ts*' \
     --include='*.test.tsx'
   ```

   Or, scoped to the specific API method:

   ```bash
   grep -rn '<METHOD_NAME>:\s*vi\.fn\|<METHOD_NAME>(' \
     frontend/src --include='*.test.*'
   ```

2. **Run the FULL `make test` before commit-time green-claim**,
   not just the targeted file you just wrote. A new hook
   transitively touches every file whose consumers render it;
   targeted-only verification misses cross-file failures.

### Why this trap is easy

The new test the author writes for the new hook is green —
they mock what the new hook reads. But the *existing* test
file (the one that's been working for months) keeps its old
mock. The author often doesn't think to revisit it because
"that test doesn't touch the new feature." It does, transitively,
via the shared component (here, the `ArticleList` page renders
both `useViewMode` and the new `useTrashViewMode` simultaneously).

### Pairs with

- The CLAUDE.md "make test must stay green after every change"
  rule is the parent discipline; this rule is the concrete
  failure mode that violates it most quietly.
- "End-to-end behavior tests are not 'kwarg passes through'
  tests" — both rules pin "test the OBSERVABLE OUTPUT through
  the full component tree", not just the new code's inputs.

## Playwright-visible ≠ User-visible: assert bounding-box dimensions for CSS-collapse class bugs

Filed 2026-05-20 from Phase 1 of PLUGIN-COMICS-PHASE-1-MULTI-
PANEL-LAYOUTS-01.

Playwright's ``toBeVisible()`` returns true when:

- the element exists in the DOM
- ``computed-style.display !== "none"``
- ``computed-style.visibility !== "hidden"``
- ``opacity > 0``
- the element has non-zero size **on at least one axis**

**A CSS-collapsed element with height: 0 to ~10px will still pass
``toBeVisible()`` if it has any width.** The element is technically
visible in the layout — it just renders as an invisible strip that
the user cannot interact with or perceive as a UI affordance.

This is the trap that made the Multi-Panel-Bug uncatchable by
existing E2E coverage:

- ``comic-panel-bubble-crud.spec.ts`` asserted
  ``await expect(panel).toBeVisible()`` on the second panel.
- Pre-Phase-1, the 2nd panel collapsed to ~0-10px height
  (implicit CSS-grid auto-row collapse).
- The element existed; had `display: block`; had non-zero
  width — so ``toBeVisible()`` returned **true**. The spec
  passed; the bug shipped; the user reported it.

### Rule

When the E2E spec is about **"this element renders correctly /
visibly to the user"**, do NOT rely on ``toBeVisible()`` alone.
Add a bounding-box dimension assertion:

```typescript
const bbox = await element.boundingBox();
expect(bbox).not.toBeNull();
expect(bbox!.height).toBeGreaterThan(50);   // or width, or both
```

Pick the dimension threshold to differentiate "rendered
correctly" from "CSS-collapsed strip" without being brittle to
viewport variations:

- For full-height panels in an ~800x800 canvas: **>50px** is
  safe (correct height is ~400px for grid_2x2; bug shipped at
  ~0-10px).
- For headers / toolbars: **>20px** typical.
- For modal dialogs: **>200px** typical.

### When to apply

- Any layout-bug class where CSS-collapse / margin-collapse /
  flex-collapse / grid-collapse is the failure mode.
- Any spec asserting "panel / card / tile renders visibly" —
  the visual-correctness contract requires dimensional check,
  not just `toBeVisible()`.
- After a real-user report of "X is too small / collapsed / not
  showing" — file the regression-pin with the dimension
  assertion, NOT just `toBeVisible()`.

### When NOT to apply

- For "this element exists somewhere in the DOM" intent:
  `toBeVisible()` or even `expect(...).toHaveCount(1)` is right.
- For "click target reachable" intent: `toBeEnabled()` is
  more precise.
- For tooltip / popover / async-load: `toBeVisible()` paired
  with `findByTestId` (the auto-waiting variant) is correct;
  the dimension check is overkill.

### Concrete artefact

The Phase 1 C5 spec (`e2e/smoke/comic-book-multi-panel-layout.spec.ts`)
ships 4 cases, 2 of which use the bounding-box-dimension
pattern:

```typescript
const bbox = await panels.nth(i).boundingBox();
expect(bbox).not.toBeNull();
expect(bbox!.height).toBeGreaterThan(50);
```

This regression-pin catches the Multi-Panel-Bug. A future
contributor restoring the pre-Phase-1 single_panel-default
behavior breaks the bounding-box assertion on the 2nd panel.

### Pairs with

- "Stale-bundle is the most common false-positive on post-ship
  user reports" (this file) — same family. Both are about
  diagnostic discipline when production reports contradict
  passing tests.
- "Testid namespace pinning prevents silent E2E skips" (this
  file) — namespace pinning prevents the test from running
  against wrong elements; dimension assertions prevent the test
  from accepting a wrong-rendering of the right element.

## Piping a gate through `| tail` masks its exit code (false green)

Surfaced twice in the 2026-05-30 theme/release session. Running a
gate command piped into `tail` (or any pipe) reports the PIPE's exit
status, not the command's. `tail` almost always exits 0, so a
**failed** `make release-test`, `make test`, or
`npx playwright test` looks green:

```bash
# WRONG — exit code is tail's (0), even when release-test FAILED
make release-test 2>&1 | tail -40
# (also true for run_in_background wrappers ending in `| tail`)
```

Both incidents this session showed a background task "completed
(exit code 0)" while the actual command had failed — the
`--project=screenshots` run (browser not installed; 30 failed) and
`make release-test` (verify-docs-completeness FAIL on stale version
headers). In both cases the real failure was only visible by reading
the full output, not the reported exit.

For any GATE whose pass/fail matters (tests, release-test, lint,
playwright), capture the real exit code:

- zsh: `cmd ... | tail -40; echo "EXIT=${pipestatus[1]}"` (note
  `pipestatus`, not bash's `PIPESTATUS`; this shell is zsh).
- Or redirect to a file and check `$?` directly, then tail the file:
  `cmd > /tmp/out.log 2>&1; echo "EXIT=$?"; tail -40 /tmp/out.log`.
- Or grep the output for the failure markers (`FAIL`, `failed`,
  `Fehler`, `Error`) in addition to trusting the exit.

Never declare a gate green on the strength of a `| tail`-piped run
alone. The cost is a released tag built on a failed gate.

## Coverage Illusion: passing tests != working feature

Filed 2026-06-02 during the v0.45.0 release hardening, after a
"Verlauf (Writing-History) button does nothing" report landed on a
feature that already had passing Vitest coverage.

A large test count can be green while the feature is broken when the
tests exercise mocked internals or component wiring instead of the
real contract the user touches. Concretely, the WritingHistoryModal
had tests asserting the component mounts and renders, yet the modal
was invisible in the real app because it referenced two CSS classes
(`radix-dialog-content` / `radix-dialog-overlay`) that were never
defined in `global.css` — so `Dialog.Content` rendered with no
`position: fixed`, no `z-index`, no backdrop, dropping into document
flow off-screen. happy-dom/jsdom do not apply `global.css` and do not
compute layout, so a `findByTestId("...-modal")` assertion passes
whether or not the modal is actually visible. The component test
could never have caught a pure CSS-visibility regression.

### Rule

After every bug fix, ask: **would the NEW test have FAILED before the
fix?** If not, the test proves nothing — rewrite it to exercise the
path that was actually broken, or (when the failure mode is outside
the unit-test runtime, e.g. CSS layout / z-index / real-browser
behaviour) ship a Playwright spec flagged for Aster to run.

### What each bug class needs (no mocks on the critical path)

- **UI wiring** (click -> state -> render): a render-and-interact
  test (Vitest) asserting the visible outcome, not just that a
  handler was called.
- **UI visibility** (CSS positioning, z-index, overlay, layout): a
  Playwright spec — Vitest/jsdom cannot see it. Mark it "Aster must
  run" in the release gate; that is mandatory, not deferred.
- **API contract** (endpoint returns wrong data / missing
  validation): a `TestClient` test calling the REAL endpoint with the
  exact triggering input, asserting the response — not a mocked
  router or a service-function unit test.
- **Data integrity** (backup/cascade/restore): build the full object
  graph, perform the operation, assert EVERY related record — not a
  single-table happy path.
- **Security** (traversal / XSS / token replay): attempt the EXACT
  exploit and assert rejection.

### Diagnostic corollary

When a feature is reported broken but its tests are green, do NOT
assume the report is wrong AND do NOT assume the tests are right.
Run the real-path integration test (or write one). Two honest
outcomes: (a) it passes -> the break is in a layer the test can't
reach (CSS/browser/config/stale bundle), document precisely what is
verified vs what needs browser repro; (b) it fails -> you found the
real bug and now have the regression pin. Either way the integration
test is the arbiter, not the green unit-test count.

### Pairs with

- "End-to-end behavior tests are not 'kwarg passes through' tests"
  (this file) — same family; that rule is the settings-flag instance.
- coding-standards.md "Test Quality Rule" — the forward-looking
  discipline this incident motivated.
- release-workflow.md "Pre-Release Gate: Aster E2E Confirmation" —
  the process gate that makes the Playwright half mandatory.

## A layout assertion whose bound comes from the box under test cannot see the bug

Filed 2026-10-09 (#1003) after the same fault shipped twice in one file,
three releases apart.

**First instance.** `e2e/smoke/dashboard-header-single-line.spec.ts`
graded the header's height at every viewport width against its height at
`REFERENCE_WIDTH` (1440px). When the header wrapped at 1440 itself, the
reference WAS the wrap, so every comparison passed. #971 is the bug that
walked through it.

**Second instance.** The fix for that replaced the relative sweep with an
"absolute" assertion - and compared the header's height against the
tallest visible control INSIDE the same header, plus the header's own
padding. A control that wraps its label becomes two lines tall, so the
bound grew by exactly the amount it was meant to catch:

| | header | tallest control | assertion (padding 24, tolerance 8) |
|---|---|---|---|
| nord, pre-fix | 76px | ~52px (wrapped) | `76 <= 52 + 24 + 8` → passes |
| nord, post-fix | 62px | ~38px | `62 <= 38 + 24 + 8` → passes |

Green in both states. Three CI runs on the pre-fix component came back
green and were initially misread as the smoke environment rendering
differently from the visual one (#995, filed on that premise and
retitled). Closed by #1001 with a bound taken from each control's own
computed line-height.

### The rule

Before writing a layout assertion, ask: **can the right-hand side move
when the bug appears?** If yes, the assertion is inert. This is not
specific to heights or to that file - it applies to any width, overflow
or position pin:

- "the panel is no wider than its container" - if the bug widens both.
- "the row is no taller than its tallest cell" - if the bug grows a cell.
- "the sidebar takes at most half the grid" - if the bug grows the grid.

Two shapes are safe:

- **A constant from the design.** `.headerInner` is capped at
  `max-width: 1100px`; that number is in the stylesheet, not in the
  measurement, so an assertion against it holds.
- **A value computed from the element's own typography.** Line height,
  padding and border come from computed style and cannot change because a
  sibling wrapped. The #1001 check is `content-box height <= ~1.6 line
  heights` per control: one line carrying an icon sits at 1.0-1.3, two
  lines at 2.0.

### Why it survives review

Both versions read as careful, and the second looks like the textbook fix
for the first - it swapped a relative comparison across widths for an
absolute one at a single width. The self-reference moved from "across
runs of the same measurement" to "within one measurement", which is
harder to see and produces identical green.

The failure message helps it hide: three values (`header`, `tallest`,
`padding`) read like an independent calculation, when two of the three
come from the box being measured. A message that names the offending
elements instead of reciting arithmetic is harder to write and easier to
audit.

### Pairs with

- "Playwright-visible != User-visible: assert bounding-box dimensions for
  CSS-collapse class bugs" (this file) - that rule says measure the
  dimension rather than trusting `toBeVisible()`; this one says where the
  number you compare it against may come from.
- `coding-standards.md` "A red-pin claim needs the red run linked" -
  #995's three green runs are what finally exposed this, and only because
  someone ran them instead of asserting the red.

## CI-only frontend flake: identical bundle, green one push, red the next

Filed 2026-06-06 (P3c). A docs-only commit (journal markdown, zero
frontend change) failed the CI "Run Vitest" step on a storyboard
annotation assertion (`expected vi.fn() to be called with [...] / Number
of calls: 0`) while the IMMEDIATELY PRIOR commit — same frontend bundle —
passed CI, and a local `vitest run` of the suspected files passed 3/3.
Identical code, green→red across two pushes = a flaky test, not a
regression.

Triage recipe when CI frontend goes red but you suspect a flake:
1. Compare against the prior commit's CI: if the frontend bundle is
   identical (e.g. a docs-only commit) and that run was green, it's a
   flake by construction.
2. Reproduce locally in a loop (`for i in 1 2 3; do vitest run <files>;
   done`). Consistently green locally ⇒ CI-only flake.
3. `gh run rerun <id> --failed` to restore green on main.
This flake class is the documented React-18 double-effect-mount /
non-stable-mock family (see "React 18 dev-mode double-effect-mount
strands mockImplementationOnce" + "React useEffect deps + i18n test
mocks" in this file). Re-run clears the red; the underlying mock-
stability fix in the specific storyboard test is separate, lower-tier
work — do not bundle it into an unrelated feature.

## A format/behavior change must reach its E2E specs in the same change, or the gate silently rots

Filed 2026-06-18 during the v0.56.0 release. Cutting v0.56.0 revealed the
E2E smoke gate had been effectively red since ~v0.53.0 - and nobody noticed
because the v0.52.0-v0.55.0 tags were cut but never *published*, so the red
nightly gate never blocked a release that someone was actually watching.

Root cause of the bulk of the red: a shipped behavior change whose E2E specs
were never updated. The Settings full-backup + selective-export switched from
imageless JSON to a `.bgb` ZIP carrying images (#341, ~v0.53.0), but three
smoke specs (including the release-blocker BACKUP-AKZEPTANZTEST) still asserted
`.json`. They had been failing every nightly for multiple release cycles.
Same class as the #342 change (hide the Writing-Goal widget without sessions)
breaking the writing-history back-button spec that navigated via that widget.

This is the E2E-shaped sibling of the existing "End-to-end behavior tests are
not 'kwarg passes through' tests" and "Half-wired feature lifecycle" rules:

- When you change a user-observable output (download filename/format, a
  conditional render gate, a testid, a route), grep `e2e/` for specs that
  assert the OLD shape and update them in the SAME change. A `.json -> .bgb`
  switch must update every spec that checks the download suffix; a
  "hide widget unless sessions exist" gate must update every spec that
  navigates via that widget.
- A red nightly gate that "blocks nothing" is not harmless - it is technical
  debt that compounds until a release actually needs the gate (here, v0.56.0),
  at which point you pay all of it at once. Treat a red scheduled gate as a
  real signal even when no release is imminent.

### Diagnostic heuristic: rotating failure-set = flake; consistent = real

When an E2E suite is red across several runs, compare the FAILING SET run to
run, do not just count failures:

- **Failures that recur in every run** (same specs each time) are
  deterministic = real bugs / stale specs. Fix these. In v0.56.0 these were:
  article-list-page testid (a DropZone refactor dropped the root testid,
  cascading ~22 specs), export-500 (CI runner lacked Pandoc), the three
  `.bgb` stale specs, authors-db below-fold, editor-overlay click-point,
  writing-history widget-gate.
- **Failures that rotate** (a different subset each run, each passing on
  retry) are non-deterministic = flakes. Do NOT chase them per-run; file a
  stabilization epic (here #436) and triage by flake-rate, not by whichever
  run you happened to look at.

Corollary: a count like "30 failing specs" is misleading. One root cause
(a dropped root testid) cascaded into ~22; one env gap (no Pandoc) into 6.
Always find the shared upstream cause before treating failures as N
independent bugs - and read the page snapshot: in v0.56.0 the app rendered
fine, only the testid was gone, which immediately ruled out an
"app-won't-load" cascade.

## E2E baseline-normalisation must be on the context, not the page (multi-tab)

Filed 2026-06-18 (#441, the standout takeaway of the E2E flake-stabilisation
session). The base fixture suppressed the auto-opening onboarding dialogs
(donation, AI-setup wizard) via `page.addInitScript(...)` on the default
`page`. A multi-tab spec (content-safety's 409-conflict two-tab race) opens
its tabs with `const tab = await context.newPage()` — those pages do NOT
inherit a script registered on the default `page`. In CI (fresh data dir →
AI reported not-configured) the AI-setup wizard then auto-opened in the tabs
and its Radix dialog overlay (`<div data-state="open" aria-hidden="true">`)
intercepted every click in that tab, hard-failing all retries. It passed
locally only because the local backend doesn't trigger the wizard — the
classic "passes locally, fails in CI" trap.

Rule: any E2E baseline-normalisation that must hold for EVERY page in a test
(onboarding/notification suppression, feature flags, locale, seeded
localStorage, route mocks) belongs on `context.addInitScript` /
`context.route`, never on a single `page`. `context.addInitScript` is
evaluated in every page the context creates, including `context.newPage()`
tabs and popups; `page.addInitScript` covers only that one page. Put it in
the shared fixture so multi-tab specs are covered by construction.

Detection: grep specs for `context.newPage()` / `newContext()`; if any exist,
the fixture's init scripts and `route` mocks must be context-scoped or those
tabs run un-normalised.

Diagnosis method that found it: the CI **trace screenshot** showed the open
"KI-Assistent einrichten" modal covering the editor — per the existing
"Playwright-visible != user-visible" rule, looking at the rendered frame beat
guessing from the error text (which only named an anonymous
`data-state=open aria-hidden` div).

## A behavior refactor that removes a UI affordance must update the E2E specs in the SAME change

Filed 2026-06-20 (#473 + #451, repaired in `d6745ea4`). The Settings
**auto-save-on-change** refactor (`afee7a50`, #473) removed the manual
"Speichern" buttons; the per-provider dynamic-model work (#451) changed the AI
settings shape. Four smoke specs still clicked a "Speichern" button (or asserted
the old model/key order) and broke — the refactors merged without carrying their
specs along, so the E2E gate was red on already-merged work.

This is the same class as the existing v0.56.0 rule "A format/behavior change
must reach its E2E specs in the same change, or the gate silently rots" — here
the changed output is a **removed control** rather than a changed filename. When
a refactor removes or renames an interactive affordance (a Save button, a tab, a
testid, a field order), grep `e2e/` for specs that drive the OLD affordance and
update them in the same change:

```bash
grep -rln "Speichern\|getByRole('button', { name: /save/i })" e2e/
```

A removed "Save" button means the spec must assert the **auto-save** behavior
(change a field → reload → value persisted) instead of clicking a button that no
longer exists. Pairs with "Coverage Illusion" — the auto-save behavior needs a
real change-then-reload assertion, not just "the button is gone".

## E2E flake-sweep taxonomy: the recurring anti-pattern classes

Filed 2026-06-24, synthesising the v0.56.0 → post-v0.57.0 sweep
(#436/#438/#440/#441/#442; residual #534/#535/#536). When a Playwright smoke
gate goes intermittently red, the failures cluster into a small set of recurring
anti-pattern classes. Diagnose by class, not spec-by-spec:

1. **Fixed-timeout waits** (#438). A spec uses `waitForTimeout(N)` / an
   arbitrary sleep instead of waiting on the actual condition. Flakes the moment
   the machine is slower than N. Fix: deterministic waits — `toHaveURL`,
   `expect.poll`, `findByTestId` (auto-waiting), `toBeVisible`. Never an
   absolute sleep.
2. **Stale-spec drift** (#440). A shipped behaviour/format change never reached
   the spec: `.json → .bgb` download suffix, a changed default content-type, a
   removed Save button. The spec asserts the old shape and fails forever. This
   is the dedicated rule "A format/behavior change must reach its E2E specs in
   the same change" — fix the spec in the same change that ships the behaviour.
3. **Overlay / detach races** (#440, #534). A content-loading overlay (or a
   re-render that detaches the node) intercepts the click, or the element is
   detached mid-action. Fix: wait for the overlay to be gone / the target to be
   stable before interacting; assert the post-condition.
4. **Per-page baseline normalisation in multi-tab** (#441/#442). Onboarding
   suppression / route mocks registered on the default `page` don't reach
   `context.newPage()` tabs. Dedicated rule: "E2E baseline-normalisation must be
   on the context, not the page" — use `context.addInitScript` / `context.route`.

Diagnostic discipline that ties them together (each its own existing rule):
**read the CI trace screenshot** (`gh run download <id>` → the spec's
`trace.zip` → latest `resources/*.jpeg`) to see the rendered frame, because
"Playwright-visible != user-visible"; **rotating failure-set across runs = flake,
consistent-set = real**; and stale-bundle is the most common post-ship
false-positive. The residual per-attempt flakes that survive a class-by-class
sweep are absorbed by `retries:2` in the Playwright config — only re-investigate
a spec that regresses to failing ALL attempts, not one that fails one attempt and
passes on retry.

## E2E isolation: distinguish infra-accumulation from data-leak before re-isolating

Filed 2026-06-24 (`docs/audits/e2e-isolation-audit-2026-06-22.md`). A directive
to "make every E2E test run isolated — own data per spec, no shared state, green
in any order" reads like a call for a per-worker-backend rewrite. The audit-first
response found the opposite: **data isolation already worked**, and the flakes
were **infra accumulation in the single long-lived backend, not cross-test data
contamination**.

The evidence-based distinction:

- **Data isolation (already solid):** an autouse `resetDatabase` fixture calls
  `DELETE /api/test/reset` (wipes 19 content tables FK-safe) + `resetSettings()`
  before every test, and specs seed their own data. So there is no data-level
  order dependency in serial runs — wiping-before-each + self-seeding gives
  order-independence for free.
- **Infra accumulation (the real cause):** one backend process (port 8000)
  serves all ~142 specs, so its in-memory `lru_cache`s, the module-level
  `job_store` singleton, orphaned upload/asset files, and the growing SQLite
  file + WAL all accumulate across the run — late tests hit a heavier, slower
  backend and flake on timing, not on leaked rows.

Rule: when asked to "isolate the tests", map the actual shared-state surfaces
first (which reset per test? which accumulate?) before choosing a fix. The cheap,
correct fix is usually to **close the accumulation gaps** (reset the caches/job
store, vacuum or recreate the DB file, clean orphan uploads, guard the
non-`ui`-settings reset) — not an expensive per-worker-backend re-isolation of
data that is already isolated. The unguarded surfaces (non-`ui` settings keys, a
lingering job, a colliding upload filename) are latent, not live — pin them with
a shuffled-order CI variant rather than rewriting the harness. Same "measure
before you restructure" discipline as the "Audit findings need
production-vs-dev environment classification" rule.

## A retry that destroys the state it is retrying can only ever pass on its first attempt

Filed 2026-10-09 (#747/#1020), sibling to "A layout assertion whose bound comes
from the box under test cannot see the bug" - same family: an assertion whose
own machinery defeats it, producing a result that reads as evidence and is not.

The shape. An offline E2E needed to prove a published row flips to
`out_of_sync` once the article moves. Typing fires a 1s autosave, so the
obvious guard against a slow write was to poll:

```ts
await expect.poll(async () => {
    await page.reload();                      // <- destroys unsaved content
    await panel.waitFor({state: "visible"});
    return driftWarning.count();
}, {timeout: 45_000, intervals: [1_000, 2_000, 3_000, 5_000]}).toBeGreaterThan(0);
```

A reload discards whatever has not been persisted. So if the first attempt
races the debounce, the typed text is gone for good and every later attempt
re-reads the same empty state. The poll cannot converge: it has exactly one
chance, and the retries only make the failure take longer to arrive.

Worse than useless - actively misleading. The failure reads
`expect(received).toBeGreaterThan(expected) / Received: 0` after 45 s of
apparent patience, which invites "the feature is broken" rather than "the test
cannot observe the feature". It got that reading from me: I reported the
offline write as not landing. It lands. Widening one wait from 1.5 s to 2 s and
dropping the poll turned the same spec green.

The second defect compounded it: the 45 s poll sat inside Playwright's 30 s
default test timeout, so it was cut off mid-flight and could never have spent
its budget anyway. `test.setTimeout()` is required whenever a single step's
budget approaches the per-test one.

### The rule

Before wrapping anything in `expect.poll` or a retry loop, ask: **does the
retry re-observe the same state, or re-create it?** A retry is only valid when
the state it reads is independent of the reading.

- Safe to retry: reading a DOM node, an API response, a file on disk, a job
  status - repeated reads of a thing that exists either way.
- NOT safe to retry: anything whose attempt mutates or discards what it is
  waiting for. A reload of a page holding unsaved state. A navigation away and
  back. A click that consumes a one-shot token. A read of a queue that pops.

When the state is destructible, do not retry - make the one attempt
deterministic and assert the outcome. Here: wait out the debounce (a constant,
not a race), reload once, then assert in the order that names the cause - did
the content survive, and only then did the status flip.

### Make a failure name its own cause

Two assertions where the first can only fail for one reason beats one
assertion that two different bugs can produce. The passing version asserts the
typed sentence survived the reload BEFORE asserting drift, so a red run says
either "the write never landed" or "it landed and the rule did not fire" -
never "0, work out why". Both messages also carry the console collected for
the test, because `performSave` logs the real error there before deciding
whether to toast.

### Pairs with

- "A layout assertion whose bound comes from the box under test cannot see the
  bug" - that one is a comparison that moves with the bug; this one is a retry
  that erases it. Both produce confident, wrong green or red.
- `coding-standards.md` "A red-pin claim needs the red run linked" - the
  discipline that catches both, since neither survives actually reading the run
  it claims.

## A parity record taken below the API boundary cannot see what the route supplies

Filed 2026-10-10 (#1042), from my own regression in #1041.

Recording the original's behaviour and asserting the port reproduces it is a
strong technique - it caught a real divergence in #1036 and two live bugs in
#1041. It has one blind spot, and I walked straight into it.

`styleFindings.parity.json` records `check_style(text, language)` - the
library function, with its own defaults. But the editor does not call the
library function; it calls `POST /api/ms-tools/check`, and that route
resolves the thresholds first:

```
request override > Book.ms_tools_* columns > plugin YAML > code defaults
```

So the port reproduced the recorded output exactly, 27 cases green, while
ignoring every tier of that resolution. The record could not see the gap
because the parameter is computed one layer above the thing being recorded.

### The rule

When recording a reference implementation for a port, record **at the
boundary the consumer actually calls**, not at the function that does the
work. If that is impractical - the route needs a DB, a session, a running
app - then enumerate what the boundary adds on top of the function and pin
each item separately. Concretely, before declaring a port faithful, read the
route handler and ask of every argument: *where does this value come from,
and does my port have an equivalent source?* Three answers are legitimate:

- **the port reads the same source** (here: the book's columns come through
  the storage seam, so there was no excuse),
- **the source has no browser equivalent** (the plugin YAML; a backendless
  build ships none), which is a decision to state, not an omission to leave
  implicit,
- **the caller supplies it** (the request override), which the port's own
  signature must then accept.

### Why reading the handler is not optional

The gap was invisible from every direction I had looked: the function
signature has defaults, so calling it with two arguments compiles and runs;
the record is derived from the same call shape, so it agrees; and the
frontend type did not even carry the columns, so nothing failed to
type-check. Only the route reads them. Fifteen lines of `routes.py` would
have shown it before the merge instead of after.

### Pairs with

- "End-to-end behavior tests are not 'kwarg passes through' tests" - same
  family, one layer out: that rule is about asserting a flag's observable
  effect, this one is about which layer you record as the reference.
- "Pre-Inspection MUST audit all callers of a touched endpoint" - the
  caller-side twin. This is the producer side: audit what the endpoint does
  to its inputs before mirroring the function behind it.

## An assertion on a function's return value is not an assertion on the artifact its consumer reads

Filed 2026-10-10 (#742), third in the family with "A layout assertion whose
bound comes from the box under test cannot see the bug" and "A retry that
destroys the state it is retrying". Same shape every time: the assertion is
careful, reads as evidence, and cannot observe the defect.

`bubbleSvg` returns both the SVG markup and the `width`/`height` pdfmake
should size the node with. svg-to-pdfkit lays the drawing out from the
markup's own attributes; pdfmake sizes the box from the numbers. A mismatch
between them squashes the outline inside a correctly sized box - the exact
bug worth a test. The test I wrote:

```ts
const out = bubbleSvg(SPEECH, rect)!;
expect(out.width).not.toBeCloseTo(out.height, 6);   // both from the return
expect(out.svg).toContain('preserveAspectRatio="none"');
```

I then broke the markup on purpose - `height="${viewBoxSize * scaleX}"`,
one axis' scale on both - and the test stayed green. It was reading the two
numbers that were still right and never looking at the string that was
wrong.

The fix is one line, and it is the whole lesson: assert the two agree.

```ts
expect(out.svg).toContain(`width="${out.width}" height="${out.height}"`);
```

### The rule

When a function returns both a rendered artifact and metadata about it, the
test has to read the **artifact the consumer consumes**. Asserting the
metadata proves the metadata, which is usually the half that was already
correct - the artifact is where the string-building happens and therefore
where the typo lives.

Concretely, ask of each assertion: *which of these two values does the thing
downstream actually read?* Then assert on that one, and assert that the
other agrees with it. Instances to expect:

- SVG, HTML or Markdown returned beside its measured dimensions.
- A filename returned beside the bytes (the bytes carry the format; a test
  on the extension proves nothing about the encoder).
- A query string returned beside the parsed params it was built from.
- A serialised payload returned beside the object it came from - the
  parity-record lesson above is this one at the recording layer.

### How it survives review

The weak and the strong version differ by one line and both read as
deliberate. What makes the weak one weak is invisible without asking which
field has a consumer, and the green run is identical. So the only reliable
detection is the one that caught it here: break the production code in the
precise way the test claims to prevent, and watch. If it stays green, the
test is measuring the wrong surface - whatever its name says.

### Pairs with

- `coding-standards.md` "A red-pin claim needs the red run linked" - this is
  what that discipline is for. Three of #742's tests were confirmed red
  against deliberate breaks; this one was the fourth, it passed, and it did
  not deserve to.

## A wait whose condition an empty list satisfies reports green before anything ran

Filed 2026-10-15 (#1117), third in the family with "A layout assertion whose
bound comes from the box under test" and "A retry that destroys the state it is
retrying". Same shape every time: the checking mechanism satisfies the claim by
itself, and the result reads as evidence.

`gh pr checks <n>` is GraphQL-backed and refused in a Claude Code session (HTTP
403), so waiting for CI means writing the loop by hand over the REST check-runs.
The obvious loop:

```bash
until [ -z "$(gh api "repos/O/R/commits/$SHA/check-runs" \
  --jq '.check_runs[] | select(.status != "completed") | .name')" ]; do sleep 25; done
echo "all green"
```

Run that straight after a push and it prints `all green` immediately. No check
run exists yet, the list is empty, the filter matches nothing, and "no
non-completed checks" is not "all checks completed". A direct read a moment
later said `mergeable_state: "unstable"` with thirteen checks at
`conclusion: null`.

It fired twice in one session, both times on a PR I was about to merge.

### The rule

Wait for something that must be PRESENT, never for the absence of something:

```bash
until [ "$(gh api repos/O/R/pulls/$N --jq .mergeable_state)" = "clean" ]; do
    failed=$(gh api "repos/O/R/commits/$SHA/check-runs" \
      --jq '[.check_runs[] | select(.conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out")] | length')
    [ "$failed" = "0" ] || { echo "FAILED: $failed"; break; }
    sleep 25
done
```

`mergeable_state == "clean"` cannot be produced by an empty list, and the
inner check means a real failure breaks out instead of running to the timeout.
When the run id is known, `gh run watch <id>` is the shorter answer; a
`workflow_dispatch` run attaches its check to the commit, so it shows up on the
PR as well.

### Generalises to

Any gate-watching loop, and any assertion over a collection the producer fills
later:

- `until [ -z "$(... | grep pending)" ]` over a job list, a queue, a deploy's
  pods, a migration's rows.
- `expect(errors).toEqual([])` where `errors` comes from a scan whose own setup
  can silently find no files - the second assertion that the existing
  `publicOrigin.guard.test.ts` carries ("scans the files it claims to scan")
  exists for exactly this.
- A `--jq` filter whose path is wrong: a typo'd key yields nothing, which is
  indistinguishable from "nothing matched".

The cheap discipline: before trusting such a loop, assert the collection is
non-empty, or wait on a positive state field instead.

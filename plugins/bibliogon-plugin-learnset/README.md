# Learnset plugin (Phase 1)

Exports a book as a schema-validated adaptive-learner learn set (alc
content-repo ZIP layout). Design and decisions of record:
`docs/explorations/book-to-learnset-export.md`.

## Vendored engine artifacts

`learn-content-engine` ships to npm only - it has no PyPI distribution and its
`pyproject.toml` declares no build backend, so a pinned Python dependency is
not possible. The artifacts are vendored under `bibliogon_learnset/vendor/`:

| File | Purpose |
| --- | --- |
| `lesson.schema.json` | per-lesson validation |
| `content-manifest.schema.json` | set manifest validation |
| `lce_schema.py` | the engine's own validator |
| `engine-version.txt` | the pinned upstream version |

Every export stamps `metadata.generated_by`, `metadata.engine_version` and
`metadata.schema_version` into the manifest, so a produced set records which
engine it was built against.

## Drift guard

```bash
make verify-learnset-schema     # or: python3 scripts/check_learnset_schema_drift.py
```

Fetches the pinned npm release and byte-compares each vendored artifact
against it. Runs nightly in CI (`nightly.yml`, job `learnset-schema-drift`),
deliberately not as a pull-request gate.

## Desktop-only

The export is gated desktop-only (`learnset-export` in the `DESKTOP_ONLY` set).
ZIP assembly and schema validation happen server-side in Python, so there is no
browser path. This is a recorded Maximal-Offline exception, see
`.claude/rules/architecture.md`.

## Tests

```bash
make test-plugin-learnset
npx playwright test --project=smoke e2e/smoke/learnset-export.spec.ts
```

# Coverage Baseline — 2026-06-10

Source: the green `coverage.yml` CI run for commit `dccfeaa6`
(run 27276766398), pulled via `gh run download --name backend-coverage`
/ `--name frontend-coverage`. The coverage tooling already existed before
this baseline (pytest-cov dep + `@vitest/coverage-v8` + the
`make test-coverage*` targets + `coverage.yml`); this document is the
first recorded whole-project baseline and the reference point for setting
a target later.

How to reproduce locally (heavy — prefer the CI artifacts):

```
make coverage-backend     # alias of test-coverage-backend -> htmlcov/
make coverage-frontend    # alias of test-coverage-frontend -> frontend/coverage/
```

## Backend (Python, `app/`)

- **Overall line coverage: 89.6%**
- Lowest modules (>= 15 lines):
  - `routers/audiobook.py` — 60.9% (409 lines)
  - `logging_config.py` — 69.0% (29 lines)
  - `services/git_sync_mapping.py` — 73.3% (60 lines)
  - `routers/licenses.py` — 73.8% (84 lines)
  - `paths.py` — 74.4% (39 lines)
  - `routers/article_export.py` — 76.8% (95 lines)
  - `routers/article_bulk_export.py` — 77.2% (123 lines)
  - `main.py` — 77.8% (406 lines)
  - `voice_store.py` — 78.3% (60 lines)

Plugin packages are measured per-plugin in the same CI run (separate
`bibliogon-plugin-*-coverage` artifacts); they are not folded into the
backend `app/` number above.

## Frontend (TypeScript, `src/`)

- **Overall statement coverage: 72.3%** (10059 / 13909 statements)
- Lowest modules (>= 20 statements):
  - `AudiobookSettingsPanel.tsx` — 0.0% (38)
  - `ElevenLabsKeyPanel.tsx` — 0.0% (43)
  - `GoogleCloudTTSPanel.tsx` — 0.0% (50)
  - `AudiobookPlayer.tsx` — 2.3% (128)
  - `AudiobookJobContext.tsx` — 3.4% (118)
  - `useWebSocket.ts` — 7.5% (40)
  - `import.ts` — 9.7% (31)
  - `AudioExportProgress.tsx` — 12.0% (75)
  - `useKeyboardShortcuts.ts` — 20.0% (35)

## Next steps

- **No CI threshold is enforced yet** — this baseline is for orientation;
  a target is set in a later session once the gaps are triaged.
- Backend target: hold >= 89% and lift the audiobook/export router gap;
  `routers/audiobook.py` (60.9%, 409 lines) is the single biggest
  absolute hole.
- Frontend target: lift from 72% — the audiobook UI cluster
  (`Audiobook*`, `ElevenLabsKeyPanel`, `GoogleCloudTTSPanel`,
  `AudioExportProgress`) is near-zero and accounts for most of the gap;
  these are backend-plugin UIs, so an integration/E2E pass is the right
  lever rather than shallow unit tests.
- The per-module coverage HTML lives in the CI artifacts
  (`backend-coverage` -> `htmlcov/index.html`, `frontend-coverage` ->
  `index.html`); pull them with `gh run download` rather than running the
  heavy local coverage build.

# Dependency Update — 2026-06-10

Routine dependency-currency sweep (frontend + backend). Issue #52.
Branch `chore/deps-update-2026-06-10`. Method: assess → patch/minor batch →
majors individually (test between) → pip-audit remediation (#47).

## Updated

### Step 2 — patch + minor (one batch, commit `1730b225`)

Both suites green: frontend `tsc` + 2943 Vitest + `vite build`; backend
2578 pytest.

| Package | From | To | Notes |
|---------|------|----|-------|
| react / react-dom | 19.2.6 | 19.2.7 | patch |
| react-router-dom | 7.16.0 | 7.17.0 | minor |
| vite | 8.0.14 | 8.0.16 | patch |
| vitest / @vitest/coverage-v8 | 4.1.7 | 4.1.8 | patch |
| @types/react | 19.2.15 | 19.2.17 | patch |
| @types/node | 24.12.4 | 24.13.1 | in-range minor |
| happy-dom | 20.9.0 | 20.10.2 | minor |
| pdfmake / pdfkit | 0.3.9 / 0.18 | 0.3.10 / 0.19 | export lib (patch) |
| aiohttp | 3.13.5 | 3.14.1 | **#47** (CVE-2026-34993, CVE-2026-47265) |
| pip | 26.1.1 | 26.1.2 | **#47** (PYSEC-2026-196) |
| cryptography | 48.0.0 | 48.0.1 | patch |
| starlette | 1.2.0 | 1.2.1 | patch |
| beautifulsoup4 | 4.14.3 | 4.15.0 | minor |
| mutmut | 3.5.0 | 3.6.0 | dev minor |
| ruff | 0.15.15 | 0.15.16 | dev patch |
| idna, pydantic-core, + dev transitives | | | in-range |

### Step 3 — majors, individually (one commit each)

| Package | From | To | Commit | Validation |
|---------|------|----|--------|-----------|
| @vitejs/plugin-react | 5.2.0 | 6.0.2 | `07fef61e` | tsc + 2943 Vitest + build |
| @types/node | ^24 | ^25 (25.9.2) | `a3abcf9f` | tsc clean (no lib cascade) + Vitest; runtime stays Node 24 |
| mypy | ^1.20 | ^2.1.0 | `8a553a03` | `mypy app/` clean (130 files); dev-only |
| uvicorn[standard] | ^0.46 | ^0.49 (0.49.0) | `9b2b68b1` | 2578 pytest |

### Step 4 — pip-audit #47 (commit `f42687bf`)

aiohttp + pip remediated in Step 2, so their `--ignore-vuln` entries
(CVE-2026-34993, CVE-2026-47265, PYSEC-2026-196) were removed from
`ci.yml` and the `audit-backend` Make target. Only weasyprint's
CVE-2025-68616 remains ignored (deferred — see below). #47 stays open.

## Deferred (NOT updated — with reasons)

Each filed as a backlog item; held with a documented reason.

| Package | Available | Why deferred |
|---------|-----------|--------------|
| **dompurify** | 3.4.7 → 3.4.9 | 3.4.8+ drops the **leading top-level element** of the input under happy-dom, breaking `sanitizeAmazonHtml` + the HTML-preview sanitizer (10 Vitest failures). Pinned exact `3.4.7`. Needs real-browser verification (could be a happy-dom-only artifact) + happy-dom/dompurify investigation. `DEPS-DOMPURIFY-3.4.8-REGRESSION-01`. |
| **@radix-ui/* family** | various minors | The 2.1.17 / 2.3.0 / 1.2.9 releases **exact-pin `@radix-ui/react-popper@1.3.0`**, which has a "Maximum update depth exceeded" infinite loop in its ref-setting under React 19.2.7 (crashes every Radix popper surface: dropdown/select/tooltip). The whole family is blocked until popper 1.3.x is fixed; bump the family together then. `DEPS-RADIX-POPPER-1.3.0-LOOP-01`. |
| **katex** | 0.16.47 → 0.17.0 | Math rendering (node-based math shipped in editor v3). A render regression is not catchable by Vitest (Coverage Illusion); needs visual verification. `DEPS-KATEX-0.17-01`. |
| **elevenlabs** | 0.2.27 → 2.52.0 | Massive API rewrite (0.2 → 2.52). The audiobook plugin's tests mock the TTS engine, so green pytest would NOT validate it. Needs a dedicated session with a real ElevenLabs API call. `DEPS-ELEVENLABS-2.X-01`. |
| **weasyprint** | 66.0 → 69.0 | #47 (CVE-2025-68616). 66 → 68+ is a render-risky major (picture-book / comic PDF export); requires manual PDF visual comparison, not possible headless here. Tracked in **#47**. |
| **python-multipart** | 0.0.27 → 0.0.32 | Out-of-caret; blocked by plugin `medium-import` pinning `^0.0.27`. Needs a coordinated plugin-constraint bump (two-installation-paths rule: re-lock plugin lockfiles). `DEPS-PYTHON-MULTIPART-0.0.32-01`. |
| **@types/dompurify** | (latest 3.0.5 < current 3.2.0) | "Latest" is older than installed — deprecated stub package (dompurify ships its own types). No action. |

## Audit results after the sweep

- **npm audit** (`--audit-level=high`): 0 vulnerabilities.
- **pip-audit** (`--skip-editable`): 1 known advisory remaining —
  weasyprint CVE-2025-68616 (deferred, ignored in the gate).

## Special-caution packages (per #52) — status

- **TipTap** (v3.26.0): untouched (no bump — freshly migrated).
- **React** (19.2.x): patch-only (19.2.6 → 19.2.7), not jumped to 20.
- **Vite**: patch-only (8.0.14 → 8.0.16), no major; build verified.
- **Dexie** (4.4.2): untouched (exact-pinned; schema-versioning caution).
- **Export libs** (pdfmake patch applied): Vitest export-engine tests pass.
  A full 7-format export E2E (Playwright) is the visual gate — flagged for Aster.

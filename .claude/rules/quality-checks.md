# Quality checks and test strategy

## Quick check after every change

### 1. Run the tests

```bash
# Everything at once (MUST be green before every commit)
make test

# Individually when targeted:
make test-backend           # pytest backend (78 tests)
make test-plugins           # all plugin tests (125 tests)
make test-plugin-export     # export only (23 tests)
make test-plugin-grammar    # grammar only (7 tests)
make test-plugin-kdp        # KDP only (10 tests)
make test-plugin-kinderbuch # kinderbuch only (8 tests)
make test-frontend          # Vitest (21 tests)

# E2E (needs a running app)
make dev                    # start the app
npx playwright test         # 52 E2E tests
```

### 2. Type check

```bash
# Frontend: TypeScript compiler
cd frontend && npx tsc --noEmit

# Backend: mypy (optional, not set up yet)
# cd backend && poetry run mypy app/
```

### 3. Manually check the rules

Go through this checklist before committing:

- [ ] No `any` in TypeScript without a comment
- [ ] No fetch() calls outside of api/client.ts
- [ ] No browser dialogs (alert, confirm, prompt); use AppDialog
- [ ] No hardcoded strings in the UI; use the i18n YAML
- [ ] New UI elements work in all 6 theme variants (3 themes x light/dark)
- [ ] CSS uses variables, no hardcoded colors
- [ ] No em-dash in code or text
- [ ] Conventional Commit message (feat:, fix:, refactor:, ...)

---

## Test strategy

### Test pyramid

```
      /    E2E     \        Playwright (52 tests)
     / ------------ \       Few, critical user flows
    / Integration    \      pytest + TestClient (65 tests)
   / ---------------- \    API endpoints with real DB state
  /    Unit Tests      \    pytest + Vitest (69+ tests)
 / -------------------- \  Business logic in isolation
/   Mutation Testing      \ mutmut (Python) + Stryker (TypeScript)
 --------------------------  Verifies that tests actually catch bugs
```

### Unit tests (Backend - pytest)

**What to test:** service logic, conversions, validations, mappings.
**What NOT to test:** FastAPI routing (integration tests cover that).

**Where:** `backend/tests/` and `plugins/{name}/tests/`

**Example - new service:**
```python
# plugins/bibliogon-plugin-export/tests/test_tiptap_to_md.py

def test_heading_conversion():
    """H2 node becomes ## in Markdown."""
    tiptap_json = {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 2},
             "content": [{"type": "text", "text": "Title"}]}
        ]
    }
    result = tiptap_to_markdown(tiptap_json)
    assert result.strip() == "## Title"

def test_image_roundtrip():
    """Image survives import -> export."""
    md_input = "![Alt Text](assets/figures/image.png)"
    html = markdown_to_html(md_input)
    tiptap_json = html_to_tiptap(html)
    md_output = tiptap_to_markdown(tiptap_json)
    assert "image.png" in md_output
```

**Naming convention:** `test_{what_is_tested}.py`, functions: `test_{scenario}()`

**When to write new tests:**
- New service or new function: at least a happy path + one error case.
- Bug fix: failing test first, then fix.
- Import/export logic: test roundtrips (input -> transformation -> output -> compare).

### Unit tests (Frontend - Vitest)

**Status:** set up, 21 tests active (happy-dom, Node 18 compatible).

**What to test:** API client functions, utility functions, complex hooks.
**What NOT to test:** simple components that just render (E2E tests cover that).

**Where:** next to the file: `api/client.test.ts`, `hooks/useI18n.test.ts`

**How to run:**
```bash
make test-frontend          # all frontend tests
cd frontend && npx vitest   # watch mode
```

**Example:**
```typescript
// src/api/client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { fetchBooks, createBook } from './client'

describe('API Client', () => {
  it('fetchBooks returns book list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: '1', title: 'Test' }])
    })
    const books = await fetchBooks()
    expect(books).toHaveLength(1)
    expect(books[0].title).toBe('Test')
  })
})
```

### Integration tests (Backend - pytest + TestClient)

**What to test:** API endpoints with real DB state, plugin interaction.
**Difference from unit tests:** here FastAPI runs via TestClient with a real SQLite DB (in-memory).

**Where:** `backend/tests/test_api.py`, `backend/tests/test_phase4.py` (already exist)

**Example:**
```python
# backend/tests/test_api.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_and_export_book():
    """Create a book, add a chapter, export it."""
    # Create book
    resp = client.post("/api/books", json={"title": "Test", "author": "A"})
    assert resp.status_code == 200
    book_id = resp.json()["id"]

    # Add chapter
    resp = client.post(f"/api/books/{book_id}/chapters",
                       json={"title": "Chapter 1", "content": "{}"})
    assert resp.status_code == 200

    # Trigger export
    resp = client.get(f"/api/books/{book_id}/export/epub")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/epub+zip"
```

**When to write new integration tests:**
- New API endpoint: happy path + error case (404, 422).
- Plugin installation: ZIP upload -> plugin active -> endpoint reachable.
- Import: a real write-book-template project -> all chapters, assets, metadata correct.

### E2E tests (Playwright)

**What to test:** critical user flows from the author's perspective.
**Where:** `frontend/tests/` or `e2e/` (52 tests exist)

**Existing coverage:**
- Dashboard: create, delete, backup/import a book
- Editor: create, edit, sort chapters, metadata
- Export: pick a format, export, download the file
- Settings: plugins, licenses, language, theme
- Navigation: every page reachable, links work

**When to write new E2E tests:**
- New plugin with UI: at least one flow (enable plugin -> use feature).
- New dialog/modal: open, fill the form, submit, check the result.
- Regression: when a UI bug is found, write an E2E test for it.

**Example:**
```typescript
// e2e/export.spec.ts
import { test, expect } from '@playwright/test'

test('export book as EPUB with manual TOC', async ({ page }) => {
  await page.goto('/books/test-book-id')

  // Open the export dialog
  await page.click('[data-testid="export-button"]')
  await expect(page.locator('.export-dialog')).toBeVisible()

  // Pick EPUB, enable manual TOC
  await page.click('[data-testid="format-epub"]')
  await page.check('[data-testid="use-manual-toc"]')
  await page.click('[data-testid="export-start"]')

  // Verify the download
  const download = await page.waitForEvent('download')
  expect(download.suggestedFilename()).toContain('.epub')
})
```

### Mutation testing (Backend - mutmut)

**Purpose:** checks whether the tests actually catch real bugs. mutmut changes the source code (mutants) and checks whether at least one test fails. Surviving mutants reveal gaps in test quality.

**Status:** to be set up. Dev dependency via Poetry.

**Setup:**
```bash
cd backend
poetry add --group dev mutmut
```

**pyproject.toml configuration:**
```toml
[tool.mutmut]
paths_to_mutate = "app/"
tests_dir = "tests/"
runner = "python -m pytest"
dict_synonyms = "Struct,NamedStruct"
```

**For plugins separately:**
```toml
# plugins/bibliogon-plugin-export/pyproject.toml
[tool.mutmut]
paths_to_mutate = "bibliogon_export/"
tests_dir = "tests/"
runner = "python -m pytest"
```

**How to run:**
```bash
# Full backend (slow, nightly or manual)
cd backend && poetry run mutmut run

# Just one module (faster, targeted)
cd backend && poetry run mutmut run --paths-to-mutate app/services/

# Just one plugin
cd plugins/bibliogon-plugin-export && poetry run mutmut run

# Show results
poetry run mutmut results

# Surviving mutants in detail
poetry run mutmut show <id>

# HTML report
poetry run mutmut html
```

**When to run:**
- After bigger refactorings (check whether the tests still hold).
- Before a phase is declared complete.
- Nightly in the CI pipeline (later).
- When coverage is high but confidence in test quality is low.

**How to act on the results:**
- Surviving mutants in critical code (services, conversions): add tests.
- Surviving mutants in trivial code (logging, formatting): ignore, no test bloat.
- Mutation score as a guideline: >= 60% for core modules (app/services/, plugin logic), no hard gate.
- Include `mutmut results` in the session summary when it was run.

**Test the critical modules first:**
1. `plugins/bibliogon-plugin-export/bibliogon_export/tiptap_to_md.py` - conversion logic
2. `plugins/bibliogon-plugin-export/bibliogon_export/scaffolder.py` - project structure
3. `backend/app/services/` - core business logic
4. `backend/app/licensing.py` - security-critical

**Reference prompt for Claude Code:**
```
I want to integrate mutmut (mutation testing) into this project.

Steps:
1. Analyze the existing pyproject.toml and the current test structure
2. Add mutmut as a dev dependency via Poetry
3. Configure mutmut in pyproject.toml (paths_to_mutate, tests_dir, runner)
4. Run a first mutmut run and show me the results
5. If tests are missing or mutants survive, propose concrete improvements

Important: use Poetry for everything, no pip calls.
```

### Mutation testing (Frontend - Stryker Mutator)

**Purpose:** same principle as mutmut, but for TypeScript/React. Stryker Mutator is the equivalent for the JS/TS ecosystem.

**Status:** to be set up (Vitest is already running, Stryker can build on it).

**Setup:**
```bash
cd frontend
npm install -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker
```

**stryker.config.json:**
```json
{
  "$schema": "https://raw.githubusercontent.com/stryker-mutator/stryker/master/packages/core/schema/stryker-core.json",
  "testRunner": "vitest",
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "mutate": [
    "src/api/**/*.ts",
    "src/hooks/**/*.ts",
    "src/components/**/*.tsx",
    "!src/**/*.test.*",
    "!src/**/*.spec.*",
    "!src/test/**"
  ],
  "reporters": ["html", "clear-text", "progress"],
  "htmlReporter": {
    "fileName": "reports/mutation/index.html"
  },
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": null
  }
}
```

**How to run:**
```bash
# Full run (slow, nightly or manual)
cd frontend && npx stryker run

# Just one directory
cd frontend && npx stryker run --mutate "src/api/**/*.ts"

# Just one file
cd frontend && npx stryker run --mutate "src/api/client.ts"
```

**Test the critical frontend modules first:**
1. `src/api/client.ts` - all API calls, error handling
2. `src/hooks/useI18n.ts` - i18n logic
3. `src/hooks/useTheme.ts` - theme logic
4. Utility functions

**Reference prompt for Claude Code:**
```
I want to integrate Stryker Mutator (mutation testing) on the frontend.

Steps:
1. Vitest is already running. Install @stryker-mutator/core, @stryker-mutator/vitest-runner, @stryker-mutator/typescript-checker
2. Create stryker.config.json (mutate: src/api/, src/hooks/, src/components/, checkers: typescript, testRunner: vitest)
3. Run a first stryker run on src/api/client.ts and show the results
4. If mutants survive, propose concrete tests
```

---

## Automation (still to build)

### Recommended Makefile extensions

```makefile
# Frontend type check
check-types:
	cd frontend && npx tsc --noEmit

# Backend mutation testing (nightly/manual)
mutmut-backend:
	cd backend && poetry run mutmut run

mutmut-export:
	cd plugins/bibliogon-plugin-export && poetry run mutmut run

mutmut-results:
	cd backend && poetry run mutmut results

mutmut-html:
	cd backend && poetry run mutmut html
	@echo "Report: backend/html/index.html"

# Frontend mutation testing (nightly/manual)
stryker:
	cd frontend && npx stryker run

stryker-api:
	cd frontend && npx stryker run --mutate "src/api/**/*.ts"

# All checks together (before push)
check-all: test check-types
	@echo "All checks passed."

# Everything together
test-all: test test-frontend
	@echo "All tests passed."
```

### CI pipeline (later, when GitHub Actions is set up)

```
1. make check-types        # TypeScript compiler
2. make test-backend       # pytest backend
3. make test-plugins       # pytest plugins
4. make test-frontend      # Vitest
5. make dev-bg             # start the app
6. npx playwright test     # E2E
7. make dev-down           # stop the app

Nightly (separate, slower):
8. make mutmut-backend     # mutation testing backend (Python)
9. make mutmut-export      # mutation testing export plugin (Python)
10. make stryker           # mutation testing frontend (TypeScript)
```

---

## Priority for the next improvements

1. **Set up mutmut** - mutation testing for backend and export plugin
2. **Set up Stryker** - mutation testing for the frontend (Vitest is already running)
3. **make check-all** - a single command for everything before push
4. **Roundtrip tests** - import -> editor -> export -> epubcheck for every book format
5. **Set up mypy** - type checking for the Python backend
6. **CI pipeline** - GitHub Actions with all checks + nightly mutmut/Stryker

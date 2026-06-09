# Chat Journal — Session 2026-06-09

Two arcs: an **E2E hardening pass** (offline-gate coverage + a deterministic
de-flake of the smoke suite) and the **v0.48.0 "Maximal Offline" release** —
the ninth release in two weeks and the largest in the project's history.

## Arc 1 — E2E: offline-gate coverage + smoke de-flake

Started from the 2026-06-09 handover (HEAD `8ae5b1bd`). Baseline green: tsc
clean, Vitest 2876. The recommended task was extending the offline `/api`-abort
gate; that pulled in a multi-round flake hunt as the user re-ran
`--project=smoke` between fixes.

### 1. Offline-gate coverage (`4102ae40`)

Extended `e2e/smoke/offline-pwa.spec.ts` (the hard `route.abort('**/api/**')`
zero-`/api` gate) to visit the surfaces gated in `d9dc0693` but never
exercised — Settings > Danger-Zone (reset disabled), Settings > Backups
(`OfflineFeatureNotice`), and a book's Metadata tab (kdp/git-sync mount fetches
skipped, no error toast). 3 new cases, all riding the existing gate. Verified
3/3.

### 2. De-flaking the smoke suite (one root-cause class, six fixes)

Each `--project=smoke` run surfaced a different-looking flake; all but one
turned out to be the **same class: an async mount-load clobbering a user action
during the load window.** Worked them one at a time, each reproduced + fixed +
verified at `retries=0`:

- **getstarted** (`b0a60a6d`): `useBookTypes()` resolving after the step-2 nav
  bounced the step back to 1, dropping the sample-button row. Added the
  `waitForLoadState("networkidle")` settle the sibling tests already used.
  Verified 3× repeat-each.
- **cover-upload** (`9523038c`): NOT the documented cold-compile flake — a
  deterministic test race (5/5). The spec clicked `metadata-save` then
  immediately `page.goto`'d; `click()` resolves on dispatch, so the navigation
  killed the async `books.update` Dexie write mid-flight and `cover_image`
  never persisted. Fixed by waiting for the save to complete (button re-enable)
  before navigating. Diagnosis kept it out of CCW's asset/DexieStorage lane —
  no app change. Verified 5/5 + full offline suite 16/16.
- **view-mode parity** (`2fec64da`): `useViewMode` starts `"grid"` then applies
  the stored value on mount; a toggle made during that window was reverted.
  Added a `userTouchedRef` guard (both `useViewMode` + `useTrashViewMode`).
  Verified 8/8.
- **picture-book + comic add-page** (`b2513739`, `817c5bad`): PageEditor /
  ComicBookEditor had no loading flag, so an add-page click during the mount
  `pages.list` load fired and the late list-resolve clobbered the optimistic
  page. Added a `loading` flag + `PageThumbnails.addDisabled` (Playwright's
  `click()` auto-waits for enabled → all add-page sites fixed, no test edits).
  Verified picture-book 13/13, comic 11/11.
- **article cluster** (`9680051f`): the big one. `app.yaml` defaults
  `books_view: grid` but **`articles_view: list`** — so the article list
  rendered grid first then switched to list on mount, detaching the
  bulk-action-bar / checkboxes / convert-button mid-interaction (this is why
  Books selection always passed and Articles always flaked). Proven
  pre-existing by running the same specs at the pre-change commit (`9523038c`)
  — they failed there too, with a *different* set each run. Fixed by deferring
  the article-row render until the view mode resolves. App-side; `ArticleList`
  was otherwise untouched.
- **convert-to-book wizard** (`662519c0`): the residual after the article fix —
  the `{force:true}` click on the RadixSelect sort option left the listbox
  OPEN, keeping the step-0 footer button shifting ("not stable"). Closed it
  (Escape; value already committed) before advancing.

Combined: the full article cluster went from 4–8 random failures/run to
**34/34 (×2, retries=0)**.

### 3. Process notes

- Diagnosed via pre-change-commit comparison (rule out my work) + failure
  page-snapshots (duplicate "Select all" → view switch; open `listbox` →
  wizard).
- Killed stray `:8000` backends mid-hunt (user-authorised, CCW idle) — did NOT
  fix the flakes, confirming real test issues, not environment.

## Arc 2 — Release v0.48.0 "Maximal Offline"

All work since v0.47.0 (111 commits) shipped as one release after Aster's
E2E gate (0 failures, 0 retries).

### 4. Version bump + changelog

- Hand-edited only `backend/pyproject.toml` → `make sync-versions` (21 files);
  `sync-versions-check` + `verify_version_pins.sh 0.48.0` exit 0
  (`78d52f89`).
- `changelog/releases/v0.48.0.md` (publish-ready, prerequisites blocks
  included) + `docs/CHANGELOG.md` (`b2b91a7a`). Verified no schema migrations
  since v0.47.0.

### 5. `make release-test` caught four pre-existing gate-blockers

The mandatory local gate (the v0.26.x-hotfix-prevention discipline) failed
three times in a row, each on a real pre-existing issue from the
repository-pattern migration / new export engine — fixed in turn:

- **mypy** (`d0caa1a0`): bulk repo returned SQLAlchemy `.all()` (Any) from a
  `list[Any]` fn.
- **ruff-format** (`e0c865b3`): 12 repository-migration files landed
  unformatted.
- **doc version headers** (`4c83f52f`): README/README-de/CLAUDE.md/ROADMAP/
  backlog still said v0.47.1 (`verify-docs-completeness`); bumped + demoted the
  CLAUDE.md v0.47.1 block.
- **hardcoded-hex** (`50eb2c2e`): the new client-export engine
  (`formatHtml.ts`/`formatPdf.ts`) styles standalone exported documents that
  can't use app `var(--token)` — allowlisted (the documented path).

`make release-test` then **EXIT 0** (backend pytest + Vitest 2876 + tsc + ruff
+ mypy + pre-commit + verify-docs-discipline + verify-docs-completeness +
verify-theme + verify-plugin-locks + launcher build). None of the gate-fixes
touched frontend behaviour, so the E2E gate stayed valid.

### 6. Tag + publish + monitor

- `make release-tag VERSION=0.48.0` — pushed main (6 commits) + tag `v0.48.0`
  (pre-push pre-commit clean).
- `make release-publish VERSION=0.48.0` →
  https://github.com/astrapi69/bibliogon/releases/tag/v0.48.0
- **CI all green** (monitored to completion): Launcher macOS/Linux/Windows
  (6 artifacts + `.sha256` attached), Release Gate, Deploy app → GitHub Pages,
  CI (main push). Deploy Docs already current (v0.48.0 help pages from
  2026-06-07). The prior red CI on `662519c0` was the same mypy/ruff drift the
  gate-fixes resolved — main is green again.

## Session summary

- **Commits:** 14 (8 E2E/app de-flake + offline-gate, 6 release).
- **Release:** v0.48.0 published; tag + 6 launcher artifacts live; all CI green.
- **Tests:** Vitest 2876 (unchanged); the smoke suite is now deterministically
  green at `retries=0` across the previously-flaky article/picture-book/comic/
  view-mode/getstarted/convert-to-book cluster.
- **Key wins:** found + fixed two genuine pre-existing product bugs (the
  `articles_view: list` grid→list flash; the view-mode toggle-during-load
  revert) that had only ever surfaced as "flaky tests"; the release gate caught
  four pre-existing CI-red blockers before they shipped.

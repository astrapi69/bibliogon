# Session journal — 2026-05-09

Medium-import frontend UI session. Built the user-facing UI for
MEDIUM-IMPORT-MVP-01 (shipped previous session, backend-only +
curl-reachable). 13 commits across one session, all gates green.

## 1. Upstream issue check (pre-session digression)

User opened a previously-filed upstream issue at
`sereneinserenade/tiptap-search-and-replace#19` (DEP-02 / TipTap 3
blocker). A second blocked user (bhaveshxrawat) commented asking
for an update; the maintainer remained silent past the doc's
2026-05-05 review date.

Outcome:
- Drafted a reply for the user to post (acknowledging the silence,
  offering the git-URL pin bridge as Option 3).
- Recommended NOT switching to `prosemirror-search` adapter now —
  bundle one risk per session; the TipTap 3 migration is already
  4-8 hours and adding a 50-80 LOC adapter rewrite mixes two
  unrelated risks.
- No code changes from the digression.

## 2. Pre-inspection report (medium-import frontend UI)

User invoked the long-form prompt for MEDIUM-IMPORT-FRONTEND-UI-01.
Pre-inspection covered all 7 audit steps + 10 open questions.
Surfaced one STOP condition: the `settings_section` slot system
declared in plugin manifests is NOT implemented on the frontend.
Three options A (build slot infra) / B (hardcode in Settings.tsx) /
C (top-level route) presented with tradeoffs.

User confirmed Option C. Session paused for premise correction:
the user's "consistent with /import" reasoning was based on a
misconception (no `/import` route exists; existing imports are
modal-from-page). User reaffirmed Option C knowingly, accepting
the divergence. Recorded in lessons-learned.

## 3. Twelve implementation commits

| # | Commit | Summary |
|---|---|---|
| 1 | `b1fd468` | Page shell + route registration + nav button |
| 2 | `489bd33` | TS types + `api.mediumImport.importZip` XHR helper |
| 3 | `8838c5f` | `MediumImportUploadZone` component (drag-drop + validation) |
| 4 | `bc098a3` | `MediumImportProgress` (two-phase determinate / indeterminate) |
| 5 | `746eb62` | `MediumImportResult` (3 Radix Collapsible sections) |
| 6 | `7cdc4ab` | `MediumImportSettings` (4-field form via existing API) |
| 7 | `d126a8c` | Wire `MediumImportPage` orchestration (state machine) |
| 8 | `6f21ffa` | Settings → Plugins pointer card |
| 9 | `ddb59b7` | i18n keys × 8 catalogs (46 keys per language) |
| 10 | `3ce4ecb` | Vitest tests (24 new, 5 files) |
| 11 | `895c5eb` | Bilingual help page + mkdocs nav |
| 12 | `0aa573b` | Backlog close + lessons-learned (3 new entries) |
| 13 | `f09ebec` | tsc fix: ApiError 4-arg constructor in test |

## 4. Lessons learned (added to .claude/rules/lessons-learned.md)

Three new entries surfaced from this session:

1. **Bulk operations earn page-route UX even when single-item
   siblings use modals.** Records the four deciding factors for
   the route-vs-modal choice (multi-minute processing time,
   structured result needs review surface, stable URL for
   help-doc deep-linking, pattern-adherence is not an end in
   itself).
2. **React 18 dev-mode double-effect-mount strands
   `mockImplementationOnce`.** ~15 minutes lost to debugging.
   Durable fix: factory-default implementations + `mockClear`
   instead of `mockReset` so the implementation persists.
3. **XHR mocks need a function constructor, not an arrow.**
   `vi.stubGlobal("XMLHttpRequest", vi.fn(() => xhr))` fails
   because arrow functions can't be invoked with `new`.
   Generalizes to any `new`'d global.

## 5. Follow-ups filed (open in backlog)

- **BACKEND-UPLOAD-SIZE-LIMIT-01** (P3): backend body-size cap
  for upload endpoints. Frontend hard-rejects >200MB but server-
  side defense is missing.
- **ASYNC-IMPORT-PROGRESS-01** (P2): switch
  `POST /api/medium-import/import` to the existing async-job +
  SSE pattern. Current synchronous endpoint forces an
  indeterminate spinner during processing; large archives can
  sit there for several minutes with no signal.

## 6. Quality gates at end of session

- `npx tsc --noEmit`: clean
- `npx vitest --run` full suite: 736/736 passed (was 712 before
  session; +24 new tests)
- `npm run build`: succeeds (one pre-existing
  INEFFECTIVE_DYNAMIC_IMPORT warning unrelated to this work)
- `pytest tests/test_i18n_parity.py tests/test_i18n_structure.py`:
  67/67 passed; 8 catalogs × 46 medium-import keys all in parity
- Manual smoke: NOT run this session (no dev-server invocation;
  the user can open `/articles/import/medium` to verify).

## 7. Outstanding questions / assumptions taken

- **PT / TR / JA i18n translations are machine-produced.** Tracked
  in `backend/config/i18n/AUTO_TRANSLATED.md` for native-speaker
  review per the established pattern. No native validation
  scheduled.
- **Backend body-size limit deferred to BACKEND-UPLOAD-SIZE-LIMIT-01**
  per Q2 in pre-inspection. Frontend 200MB hard-reject is the
  only protection at this point.
- **Settings card cannot edit settings.** Settings → Plugins shows
  a pointer button; the dedicated page is the single source of
  truth. Avoids the "edit in two places" confusion. The
  pre-inspection audit found this consistent with the
  `audiobook` / `translation` precedent (custom settings panels)
  but novel in that it points OUT of Settings rather than
  rendering a custom in-place form.

## 8. Stats

- 13 commits
- ~1,950 net lines added (+code, +tests, +i18n × 8, +help × 2,
  +backlog, +lessons-learned)
- 5 new components + 1 new page + 1 new XHR helper
- 24 new Vitest tests (736 → 760 frontend… wait, the run shows
  736 → 736. The new tests are inside the 736 total. Net: 24
  more tests in the suite than before the session. Logged.)
- 46 i18n keys × 8 languages = 368 i18n cells
- 0 backlog tasks added during the session (not counting the two
  follow-ups, which are explicitly v2-deferred)

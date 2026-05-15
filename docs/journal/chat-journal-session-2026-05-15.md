# Chat Journal — 2026-05-15

## Session theme

Continuation of yesterday's UX-Full-Audit. Resumed at Group 2
(Dashboards) and walked through Groups 2, 3, 4, 5 in a single
extended session, ending with the audit close-out + backlog
filings + lessons-learned + CLAUDE.md fixes.

## Sequence

1. **Setup** — re-verified dev backend + frontend running with the
   209-corpus from yesterday persisted (198 articles + 11
   ArticleComments + 2 books survived the overnight server restart
   thanks to the constant `BIBLIOGON_DATA_DIR`).

2. **Group 2 (Dashboards)** — Articles + Books dashboards, both
   trash views, Comments Admin, Medium Import. 6 findings: 4
   IMPROVEMENT + 2 DEFER, 0 BLOCKER. Discovery: 4th occurrence of
   the Articles-vs-Books asymmetry pattern (ArticleFilterBar
   inline vs Books' shared DashboardFilterBar). Commit
   `f33b8e2`.

3. **Group 3 (Settings)** — 7 tabs + AI panel + plugin
   enable/disable + theme switcher + keyboard nav. 8 findings: 1
   BLOCKER-candidate-elevated-to-IMPROVEMENT-elevated + 4 other
   IMPROVEMENT + 3 informational. Major discovery:
   `PluginSettings` inline function (~200 LOC in Settings.tsx) has
   **zero data-testids** for the plugin enable/disable flow — the
   biggest gap in the audit so far. Coupled with G3-F2
   (AuthorSettings same shape) and G3-F8 (Settings.tsx 2338 LOC
   monolithic) into a single backlog item.

4. **PC crash** between Group 3 close + Group 4 start. State
   intact (everything was committed up to `f33b8e2`). Resume took
   one command verification.

5. **Group 4 (Cross-Cutting)** — toast pattern, dialog pattern,
   loading state, empty state, dark mode + theme tokens, i18n,
   keyboard nav, hardcoded strings. 4 findings: all IMPROVEMENT.
   Discovery: 99 of 159 `notify.error` callsites bypass the
   structured `ApiError`-with-Report-Issue affordance. Plus 111
   `var(--token, #hex-fallback)` callsites — same theme-token-
   completeness bug class fired in v0.31.0 Pre-Release Audit.
   Plus CLAUDE.md docs are stale on theme count ("3 themes" vs
   actual 5). Commit `8807a84`.

6. **Group 5 (Synthesis)** — Articles-vs-Books parity matrix
   (13 surfaces compared), final severity rollup, pattern-class
   causality observation (monolithic → blocks extraction →
   duplication → asymmetry), audit acceptance-criteria check.
   Audit flipped from 🚧 IN PROGRESS to ✅ COMPLETE. Commit
   `5056254`.

7. **Backlog filings** — 12 items: 2 P2-elevated
   (`PLUGIN-SETTINGS-TESTID-COVERAGE-01`,
   `NOTIFY-ERROR-APIERROR-COVERAGE-01`) + 10 P3 IMPROVEMENT
   covering G1/G2/G3/G4 findings. G4-F3 (CLAUDE.md drift) NOT
   filed — fixed inline in the audit-close commit chain. Backlog
   31 → 43 (+12). Commit `3b69cd2`.

8. **Lessons-learned** — 4 new sections:
   - Articles-vs-Books parallel-surface asymmetry (5 occurrences,
     quarterly hygiene rule)
   - Inline-component duplication as upstream cause of asymmetry
     (cause-effect chain documented; extraction = parity
     insurance)
   - Periodic theme-token completeness audit as pre-release
     hygiene (RECURRING-ISSUE-CLASS; grep recipe included)
   - User-perceived bug ≠ code bug: the perception-lag class
     (from Bug A; verify Network tab + backend state BEFORE
     patching)

   Commit `2b95af4`.

9. **CLAUDE.md + architecture.md theme-count fixes** (this commit):
   - CLAUDE.md: "3 themes x light/dark" → "5 themes x light/dark
     (10 variants)"
   - architecture.md: "3 themes: Warm Literary, Cool Modern, Nord
     (6 variants)" → "5 themes: Classic, Cool Modern, Nord,
     Notebook, Studio (10 variants)" + audit recipe to verify the
     count.

## Audit final state

- **23 findings**: 0 BLOCKER / 3 IMPROVEMENT-elevated (P2) / 13
  IMPROVEMENT (P3) / 7 DEFER-or-INFO.
- **Audit doc**: `docs/audits/ux-full-audit-2026-05-14.md` (✅
  COMPLETE).
- **Screenshots**: `docs/audits/ux-full-audit-2026-05-14-screenshots/`
  (26 PNGs across 3 group walks).
- **Specs**: `e2e/tests/ux-audit-group{1,2,3}.spec.ts` (Group 4
  was code-grep-based, no spec file).
- **Acceptance criteria**: all met (every surface walked, every
  cross-cutting concern checked, all findings have evidence +
  severity + suggested resolution, well under the 30-finding
  stop-condition).

## Pattern-class observations promoted to lessons-learned

| Pattern | Occurrences | Rule write-up |
|---|---:|---|
| Articles-vs-Books asymmetry | 5 across 2 release cycles | parity verification step + quarterly hygiene |
| Monolithic-component-extraction-gap | 2 (Settings.tsx, ArticleList.tsx) | extract at >50 LOC OR logical sub-feature boundary |
| Theme-token completeness | 2 across 2 release cycles | pre-release hygiene audit, not ad-hoc |
| Perception-lag UX bugs | 1 (Bug A) | verify Network tab + backend BEFORE patching |

## Top-priority backlog items from this audit

1. **PLUGIN-SETTINGS-TESTID-COVERAGE-01** (P2-elevated) — release-
   gate before v0.33.0; hotfix-promotion if plugin bug reported
2. **NOTIFY-ERROR-APIERROR-COVERAGE-01** (P2-elevated) — 62% of
   error paths bypass structured rendering; user-impact on bug
   reporting
3. **THEME-TOKEN-COMPLETENESS-AUDIT-01** (P3, recurring-issue-
   class) — 111 callsites to audit against per-palette
   definitions
4. **RESTORE-UX-FEEDBACK-01** (P3, from yesterday) — optimistic
   update + clearer post-restore feedback

## Multi-tool tracking note (parking for future)

Yesterday's late-day pause signal ("au revoir") was a session-end
intent that Claude Code continued past (not catastrophic — the
autonomous work was correct — but for multi-tool workflow
clarity, when the user signals session-end, CC should also pause
unless explicitly directed otherwise).

Today's session was explicit-resume; the symmetry signal would
have been useful yesterday. Worth folding into the existing
"Multi-tool collaboration tracking" lessons-learned section if
the pattern recurs.

Filed for now: not yet a lessons-learned because one occurrence;
will add the symmetric pause-points note if a second instance
surfaces.

## Commits today

| Commit | Description |
|---|---|
| `f33b8e2` | Group 2 (Dashboards) |
| `8807a84` | Groups 3 + 4 (Settings + Cross-Cutting) |
| `5056254` | Group 5 (synthesis + audit close) |
| `3b69cd2` | Backlog filings (12 items) |
| `2b95af4` | Lessons-learned (4 sections) |
| **this** | CLAUDE.md theme fix + journal entry |

6 commits, all pushed to `origin/main`. Audit deliverable
complete + actionable.

## Resume notes for future audits

The 2026-05-14/15 UX-Full-Audit is a reusable template:

1. **Pre-Inspection STOP gate** (5 questions, Q1-Q6 from the
   yesterday's pre-inspection message) before any walkthrough.
2. **One Playwright spec per surface group** (G1 + G2 + G3
   shipped; G4 was code-grep-based; G5 is synthesis).
3. **Audit-B style** (running backend + corpus + Playwright)
   beats Audit-A (code-reading only) for catching runtime UX
   issues — the Group 3 testid-asymmetry findings would have
   been undetectable without running the walkthrough.
4. **Backlog filings AFTER audit close**, not during —
   cross-cutting findings (Group 4) re-prioritize earlier groups.
5. **Pattern-class observation** promoted to lessons-learned at
   close-out, not mid-audit. Yesterday's "park it for later"
   pattern proved correct: by Group 5, two pattern classes had
   compounded with a cause-effect link.

Resume cost for the NEXT periodic UX audit:
- Setup: ~30s (dev backend + corpus already imported)
- Walk: ~3-4 hours for fresh ground; less if re-walking against
  the now-existing parity matrix
- Pattern-class tally: pre-existing in lessons-learned; new
  occurrences extend the count, no fresh write-up needed.

Session closing.

# AI workflow (summary)

Binding rules only. Full text: `docs/development/rules/ai-workflow.md` - read it
for audits, archival, the journal format and the priority tiers. This summary
must not contradict it (#1143).

## Session start
Read `docs/ROADMAP.md`, `git log --oneline -10`, check CI on `develop` (`gh run list --branch develop --limit 3`). No local full suite.

## Interpreting "continue" / "next item"
Name the first open ROADMAP item and wait for confirmation.

## GitHub issue discipline
Issue first, after a duplicate search; a bug found while fixing another gets its own issue. Every fix closes its issue via `Closes #N`; no manual close without a commit reference.

## Order for new features
Plugin or core? Follow existing patterns. Schema -> service -> route -> API client -> UI (grep for an existing UI pattern first). Unit and integration tests, a Playwright smoke spec for UI features, i18n in every catalog, conventional commit.

## Order for new plugins
`plugins/bibliogon-plugin-{name}/` with entry point, `{Name}Plugin(BasePlugin)`, `backend/config/plugins/{name}.yaml`, `routes.py`, tests, Makefile `test-plugin-{name}` + coverage target in the aggregates (enforced by `test_makefile_plugin_targets.py`), enable in `app.yaml`. UI is a core-frontend change gated on the plugin.

## Order for changes
Read the existing tests, change, adjust tests, keep CI green; run only touched test files locally.

## Not allowed (AI-specific)
No new dependencies, architecture changes, PluginForge edits or plugin-structure changes without asking. No code "for later". Never weaken or delete tests to get green. No custom TipTap extension before checking for an official one. No `HTTPException` from services. Do not guess in autonomous mode - stop and document.

## Current state
Version and plugin catalog: CLAUDE.md. Release content: docs/CHANGELOG.md. Test counts: `docs/audits/current-coverage.md`. ChapterTypes: the enum in `backend/app/models/__init__.py`.

## Test coverage audits
After big feature phases, before a release, quarterly. Format and archive rules in the full text; update `docs/audits/current-coverage.md` immediately when closing gaps.

## Where coverage runs
On CI (`coverage.yml`), not locally; `make test-coverage` is opt-in.

## Single source of truth for volatile statistics
Counts live in one place (coverage doc, enum, i18n directory, CLAUDE.md plugin table). Reference them; never copy the number.

## Numeric claims verification
Every number reported anywhere (docs, commits, PRs, chat) comes from running the authoritative command in this session, or is marked "approximate / as of <date>". User-provided numbers are a starting point, not a fact.

## Communication
Direct and factual. Say so when something violates the architecture; mark suggestions as suggestions.

## Self-clarification rule
Answer from repo evidence, else park with `<!-- TODO(clarify): ... -->` and the conservative assumption, else stop and ask only if it blocks. Every final report lists "Questions and assumptions".

## Documentation protocol
Session journal in `docs/journal/`. CHANGELOG at phase end; the release changes only the CLAUDE.md version line. CLAUDE.md max 8000 characters (`test_claude_md_budget.py`), no release summaries or test counts. ROADMAP/backlog hold open items by tier P0-P5; closed items are archived in the same commit (`make archive-task`). A new lesson goes into `docs/development/lessons-learned/<topic>.md`, its title into `.claude/rules/lessons-learned.md`. Rule files in `.claude/rules/` are loaded every session: keep them summaries, detail goes to `docs/development/rules/` (`test_rule_summaries.py`).

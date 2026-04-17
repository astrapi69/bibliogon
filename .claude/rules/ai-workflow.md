# AI Workflow

## Session start

On the first message of a session:
1. Read docs/ROADMAP.md (current state, open items).
2. Review recent changes: git log --oneline -10
3. Run make test (establish a green baseline).
   Only then start on the task.

## Interpreting "continue" / "next item"

When the user says "continue", "next item", "go on" or similar:
1. Read docs/ROADMAP.md, section "Next steps".
2. Name the first open item (unchecked checkbox).
3. Wait for confirmation, do NOT start implementing immediately.

## Order for new features

1. Check whether the feature belongs in a plugin or in the core.
2. Look at existing patterns (e.g. how plugin-export is structured).
3. Schema/model first (Pydantic schema or TypeScript interface).
4. Backend logic (service module, then route).
5. Frontend (extend API client, then UI).
6. Write unit and integration tests (pytest, Vitest).
7. Playwright smoke tests for UI features: for every new UI feature write at least one spec under `e2e/smoke/`. Must cover: happy path, relevant viewport sizes (600/800/1080 for layout-critical features), data-testid selectors (no brittle CSS selectors). Claude Code WRITES the specs, Aster RUNS them. No feature counts as done without a smoke test.
8. Add i18n strings in all 8 languages (DE, EN, ES, FR, EL, PT, TR, JA).
9. Conventional commit.

## Order for new plugins

1. Create the plugin folder: plugins/bibliogon-plugin-{name}/
2. pyproject.toml with entry point: [project.entry-points."bibliogon.plugins"]
3. Plugin class: {Name}Plugin(BasePlugin) with name, version, depends_on.
4. YAML config: backend/config/plugins/{name}.yaml
5. Hook implementations (if needed, new hook specs in hookspecs.py).
6. routes.py for API endpoints.
7. Frontend manifest via get_frontend_manifest() (UI slots).
8. Tests in plugins/{name}/tests/.
9. Enable the plugin in config/app.yaml under `enabled`.

## Order for changes

1. Read and understand the existing tests.
2. Implement the change.
3. Adjust or extend the tests.
4. Make sure `make test` stays green.

## Not allowed (AI-specific)

For code-level prohibitions (fetch, console.log, Tailwind, etc.) see coding-standards.md and architecture.md.

Additionally for the AI:
- Introduce new dependencies without asking first.
- Change architectural decisions (e.g. replace SQLAlchemy, replace TipTap).
- Change PluginForge code from inside Bibliogon (separate repo!).
- Change the plugin structure (BasePlugin, hook specs) without asking.
- Generate code "for later". Only what is needed now.
- Delete, comment out or weaken existing tests to make `make test` green.
- Build custom TipTap extensions without first checking whether an official one exists.
- Throw HTTPException from service functions. Services use BibliogonError subclasses (see code-hygiene.md).
- In autonomous mode, guess when something is unclear. Prefer to stop and document the uncertainty.

## Current state

See architecture.md for architectural details. Additionally note:
- Version: 0.17.0 (one-click launcher install/uninstall across Windows/macOS/Linux, auto-update check with opt-out, cleanup retry, activity log, manuscripta 0.9.0 + Pillow 12).
- Tests: see `docs/audits/current-coverage.md` for current counts. `make test` covers backend+plugins+Vitest, E2E is separate.
- 26 ChapterTypes (3 marketing types in audiobook-export skip list by default).
- 15 official TipTap extensions + 1 community (@pentestpad/tiptap-extension-figure).
- 24 toolbar buttons in the editor.
- Deployment: Docker Compose, port 7880, install.sh one-liner.
- IMPORTANT: Before writing custom code, ALWAYS check whether a TipTap extension or library already exists.
- IMPORTANT: See lessons-learned.md for known pitfalls (TipTap, import, export).

## Test coverage audits

### When to run

- **After a major feature phase** (3+ new modules or endpoints): run a focused audit on the changed areas.
- **Before a release**: run a full pyramid audit covering all levels (unit, integration, E2E).
- **Quarterly**: run a full audit even without a release to catch organic drift.
- **On request**: when the user asks for a coverage check or gap analysis.

### Format

Audits follow the structure in `docs/audits/current-coverage.md`:

1. **Coverage map** - table per pyramid level (backend unit, plugin unit, integration, frontend unit, E2E). Each row: module/endpoint, test file, coverage rating (HIGH/MEDIUM/LOW/NONE).
2. **Prioritized gap list** - categorized as Critical (A/B), Standard (C), Nice-to-have (D). Critical = regression pinning or data integrity. Standard = normal coverage for untested modules. Nice-to-have = unlikely edge cases.
3. **Summary statistics** - tested/total counts per level, overall coverage percentage.

### File location conventions

```
docs/audits/
  current-coverage.md            # always the latest audit
  history/
    2026-04-12-coverage.md       # snapshot frozen at audit date
    2026-MM-DD-coverage.md       # subsequent snapshots
```

- `current-coverage.md` is overwritten on every audit.
- Before overwriting, copy the previous version to `history/YYYY-MM-DD-coverage.md`.
- History files are never modified after creation.

### Delta tracking

Every audit must include:
- **Baseline**: the test counts at the start of the audit period.
- **Current**: the test counts after all changes.
- **Delta**: explicit +N per suite (e.g., "Backend: 244 -> 308, +64").
- **Gaps closed**: list of items that moved from "untested" to "tested" since the last audit.

When closing gaps in a session, update `current-coverage.md` immediately - do not wait for the next full audit.

## Single source of truth for volatile statistics

Numbers that change with every feature or test session live in ONE canonical location. Other documentation references that location instead of duplicating the number.

| Statistic | Canonical location | Example reference |
|-----------|-------------------|-------------------|
| Test counts, coverage percentages, pyramid stats | `docs/audits/current-coverage.md` | "See docs/audits/current-coverage.md for test statistics." |
| ChapterType list and count | `backend/app/models/__init__.py` (the `ChapterType` enum) | "See the ChapterType enum in models for the full list." |
| Supported i18n languages | `backend/config/i18n/` (the directory listing) | "See config/i18n/ for supported languages." |
| Plugin catalog | `CLAUDE.md` plugin table | Reference CLAUDE.md or `config/plugins/`. |

**Never duplicate** these numbers in CLAUDE.md, README.md, ROADMAP.md, CONCEPT.md, rule files, or release notes. Historical documents (CHANGELOG, chat journals) are exempt because they record what was true at a point in time.

**Rationale:** duplicated numbers drift out of sync within one session. A single source is always correct because there is only one place to update.

**When writing documentation:** if you need to mention a count, write the principle or the reference, not the number. Example: "Bibliogon supports multiple languages (see config/i18n/)" instead of "Bibliogon supports 8 languages".

## Communication

- Direct, factual, no sugar-coating.
- If something is unclear: ask, do not guess.
- If something violates the architecture: say so, do not silently work around it.
- Suggestions are welcome, but mark them as suggestions.

## Documentation protocol

Every session is documented. This is mandatory, not optional. The documentation serves as a retrospective and as a knowledge base for future sessions.

### Chat journal (docs/journal/chat-journal-session-{YYYY-MM-DD}.md)

Every relevant step of the work is recorded. Format per entry:

```markdown
## {No}. {Short title} ({HH:MM})

- Original prompt: what was said/asked
- Optimized prompt: how it could have been phrased more precisely
- Goal: what should be achieved
- Result: what was actually done
- Commit: {hash} (if code was changed)
```

At the end of every session: a summary with statistics (commits, tests, new/changed files, main results).

**What belongs in the journal:**
- Every implemented change (feature, fix, refactoring)
- Architectural decisions and their rationale
- Problems that came up and how they were solved
- Prompt optimizations (original vs. better wording)

**What does NOT belong in the journal:**
- Small talk, repetitions, typo fixes

### When to update CLAUDE.md

CLAUDE.md is loaded on EVERY prompt. It has to stay lean (target: under 8000 characters, ~2000 tokens). Only content that is ALWAYS relevant:

- Project description, repository, version, pointers to ROADMAP/CHANGELOG/API
- Pointer to .claude/rules/ with short descriptions
- Tech stack keywords (no package version numbers)
- Architecture summary in 2-3 sentences
- Makefile targets
- Session-start checklist
- Data model in short form
- Plugin table (name, tier, dependency, short description)
- Directory structure, top level only
- Core conventions (max 10 bullets)
- Overall test counts

Update when:
- A plugin is added, removed, or its tier changes
- A new dependency joins the tech stack
- Test counts have changed substantially
- New Makefile targets
- Data model changes (new fields, new ChapterTypes)
- Version bumped

NOT in CLAUDE.md:
- Full directory tree down to the file level (-> becomes redundant with file exploration)
- Complete package tables with version numbers (-> package.json/pyproject.toml)
- Every API endpoint individually (-> docs/API.md)
- Completed phase details (-> docs/CHANGELOG.md)
- Detailed deployment instructions (-> README.md)
- Migration status tables (-> historical, belongs in the CHANGELOG)

### When to update docs/CHANGELOG.md

- IMMEDIATELY when a phase is completed. Do not accumulate in CLAUDE.md.
- New entry at the TOP with phase number, version, description.
- Format: bullet-point list of the main changes, structured the same way as existing entries.
- After the entry: set the CLAUDE.md version to the new version, update test counts.

### When to update docs/API.md

- New endpoint added
- Endpoint removed or renamed
- Query parameters changed

### When to update docs/ROADMAP.md

- New open task
- Task completed (checkbox)
- Phase planned or prioritized

### When to update CONCEPT.md

- Architectural decision made or changed
- New plugin in the catalog (planned or implemented)
- Open question answered or new one raised
- Business model or licensing changed
- Tech stack change (new library, framework swap)
- UI strategy changed (new slots, new libraries)

### When to update lessons-learned.md

- New pitfall discovered (bug caused by a wrong pattern)
- Workaround found for a library limitation
- Import/export edge case solved
- CSS/TipTap specificity problem solved

### End-of-session flow

1. Write a chat-journal entry covering all changes from the session.
2. At phase completion: extend docs/CHANGELOG.md, bump the CLAUDE.md version.
3. Check whether CLAUDE.md, CONCEPT.md, ROADMAP.md, API.md or lessons-learned.md need updates.
4. Commit everything: `docs: update chat journal and documentation`
5. For larger milestones: add a summary with statistics to the journal.
6. For a release: follow release-workflow.md step by step. Do not improvise the release process.

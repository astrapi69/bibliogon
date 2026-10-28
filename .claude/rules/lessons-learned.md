# Known pitfalls and patterns (index)

These rules come from real development and solve problems that would otherwise come back over and over.
The titles below are the rules. The full entry - incident, reasoning, detection recipe - lives in
`docs/development/lessons-learned/<topic>.md` under the same heading; read it before working in that area
(`grep -n "<title words>" docs/development/lessons-learned/*.md`).

This file is loaded into every session, so it holds titles only (#1141). A new lesson goes into the
matching topic file, and its title goes here as one line.

## Testing - [testing.md](../../docs/development/lessons-learned/testing.md)

- End-to-end behavior tests are not "kwarg passes through" tests
- React 18 dev-mode double-effect-mount strands `mockImplementationOnce`
- XHR mocks need a function constructor, not an arrow
- React `useEffect` deps + i18n test mocks: the `t` function isn't stable
- Run vitest from `frontend/`, not the repo root
- Radix DropdownMenu + happy-dom is brittle for Vitest
- Module-level caches survive test boundaries (test isolation, in-memory edition)
- Every bug-fix commit ships its regression-pin test
- Test-isolation discipline: never run integration smoke-tests outside pytest
- Testid namespace pinning prevents silent E2E skips
- New-hook + new-mock-key contract drift in EXISTING test files
- Playwright-visible ≠ User-visible: assert bounding-box dimensions for CSS-collapse class bugs
- Piping a gate through `| tail` masks its exit code (false green)
- Coverage Illusion: passing tests != working feature
- A layout assertion whose bound comes from the box under test cannot see the bug
- CI-only frontend flake: identical bundle, green one push, red the next
- A format/behavior change must reach its E2E specs in the same change, or the gate silently rots
- E2E baseline-normalisation must be on the context, not the page (multi-tab)
- A behavior refactor that removes a UI affordance must update the E2E specs in the SAME change
- E2E flake-sweep taxonomy: the recurring anti-pattern classes
- E2E isolation: distinguish infra-accumulation from data-leak before re-isolating
- A retry that destroys the state it is retrying can only ever pass on its first attempt
- A parity record taken below the API boundary cannot see what the route supplies
- An assertion on a function's return value is not an assertion on the artifact its consumer reads
- A wait whose condition an empty list satisfies reports green before anything ran

## Frontend - [frontend.md](../../docs/development/lessons-learned/frontend.md)

- TipTap image node in Bibliogon is `imageFigure`, not `image`
- TipTap editor
- TypeScript 6 no longer auto-includes all `@types/*`
- `@types/node` major bumps cascade into tsconfig `lib`
- Vite 7 requires Node 20.19+ / 22.12+
- Vite 8 migration (DEP-09 + SEC-01)
- Global CSS rules: distinguish viewport containers from app container
- Split-button (default + chevron disclosure) for primary + alternative outputs
- Workbox "No route found" is benign info, not a bug indicator
- Periodic theme-token completeness audit as pre-release hygiene
- Menu-Dialog Lifecycle: do not `preventDefault` inside `onSelect`
- CSS-first beats per-component fixes for visual consistency
- Store IndexedDB binary as ArrayBuffer, not Blob (fake-indexeddb round-trip)
- Service-worker intercept is the right tool for non-React-owned URLs — but is untestable in the SW-less dev E2E
- react-router setSearchParams: multiple calls in one tick clobber (stale snapshot)
- God-Folder relocation: ship re-export shims first, remove them in a later batch, keep the CSS module beside the component
- Prettier is configured but ungated — respect each file's existing style, never mass-reformat
- Two state machines for one save: the one that reports success is not the one on screen
- A Node builtin in a browser bundle fails at runtime, and a Node-hosted test suite cannot see it

## Backend, data and configuration - [backend.md](../../docs/development/lessons-learned/backend.md)

- Alembic `fileConfig` silences every existing logger
- Plugin settings YAML lives in `backend/config/plugins/`, not in the plugin's own directory
- Alembic migration + fresh test DB
- Config migration (bool -> enum)
- Async in the FastAPI lifespan
- Deployment
- Licensing
- Code structure
- Plugin settings: visible or INTERNAL, never hidden
- Diagnostic features must fail open
- Filesystem isolation: production data lives outside the project tree
- User-overlay merge semantics + migration discipline for config-version changes
- Single-Router-Per-Plugin convention
- CRUD shipping: List endpoint is non-optional
- A security property that only holds while an optional plugin is enabled is not held
- A write path that enumerates fields diverges from the read path that does not

## Import and export - [import-export.md](../../docs/development/lessons-learned/import-export.md)

- Medium HTML exports strip every SEO meta tag
- Walker iterating repeated containers: prefer `find_all` over `find`
- Pandoc raw-HTML pass-through is format-specific
- manuscripta v0.8.0 migration: source_dir + run_export + strict_images
- Import (write-book-template)
- Export
- HTML-to-Markdown conversion
- Export semantics audit: "comprehensive export" usually means "your data only"
- A plugin test suite that reads Chapter.content needs an HTML-imported-chapter fixture

## Features and product behaviour - [features.md](../../docs/development/lessons-learned/features.md)

- Bulk-operation limits should be per-operation cost-profile
- Bulk-action UX: action-bar + selection-hook decoupling stays useful
- Bulk operations earn page-route UX even when single-item siblings use modals
- Voice dropdown: NO engine-agnostic fallback
- Audiobook progress dialog: the SSE listener belongs in the context, not in the component
- Generated audiobook files must be persisted
- ElevenLabs API key does NOT belong in .env
- Audiobook export is async with SSE progress
- Content-hash sidecar files as a "was this already processed?" pattern
- AI Review extension (v0.20.0)
- German content uses real umlauts
- AI-prompts embedded in data files beat per-call system-prompts for portability
- Three-workflows-share-one-format pattern (UI side)
- SSE-in-context-not-in-modal (re-validated)
- User-facing time estimates must scale with input size or be omitted
- Destructive row-actions must reconcile collection state
- Articles-vs-Books parallel-surface asymmetry
- Half-wired feature lifecycle: a state-write without its inverse-mutation OR its state-consumer is purgatory, not a feature
- Inline-component duplication is the upstream cause of parallel-surface asymmetry
- Intentional asymmetry between Articles and Books must be documented
- German typographic quotes in YAML: all-or-nothing, never mixed
- Inserting an i18n key into a block that already exists elsewhere → duplicate YAML mapping key
- "Provider X is CORS-blocked in the browser" must be proven with a live preflight, not assumed
- A pinned default model id rots when the provider retires it — derive or refresh it
- One key column per provider — a single `api_key` field clobbers other providers on switch

## Dependencies, versions, CI and release - [dependencies-release.md](../../docs/development/lessons-learned/dependencies-release.md)

- Commit ordering for breaking-change dependency upgrades
- CI vs local environment drift
- Dependency currency in active development
- Release-cycle dependency review
- install.sh VERSION drift
- Single source of truth for version pins
- Single-source-of-truth for cross-cutting concerns: closed-set vs open-set discovery
- Hotfix cluster tag policy
- Subsystem lock-step + tooling, not checklists
- Two installation paths diverge: `make test` vs per-plugin CI
- `poetry update` vs `poetry lock` semantics
- Transitive deps can surface high-risk packages from low-risk direct bumps
- External GitHub Action major-version drift
- A pushed SHA can silently fail to trigger CI — re-trigger, don't wait
- Library-first beats a custom launcher: thin wrapper + config over re-implementation
- A library "extra" can multiply frozen-binary size — opt out unless the feature earns it
- A "cleanup" verb whose scan can reach the live data dir must be left unconfigured
- `poetry install` plus a prefix cache key is a growing environment, not a reproducible one

## Process, audits and collaboration - [process.md](../../docs/development/lessons-learned/process.md)

- User impression of scope is anchored on what they noticed, not what's broken
- Atomic commits are bounded by "green individually", not "one thing"
- Doc files: existence is not discoverability
- Doc values: read from code, not from memory
- Docs are specification, not a wish list
- Help system: single source of truth
- General patterns
- Review architectural decisions before implementing
- Real-world data audit BEFORE implementation prevents spec-vs-reality drift
- Operational gaps masquerade as wired infrastructure
- Schema "preserved" / "always set" claims must survive real-data audit before becoming spec
- Audit findings need production-vs-dev environment classification before urgency-tier
- Real-corpus audit catches arithmetic drift before it ships
- Multi-tool collaboration tracking: re-sync before accepting new orders
- User-perceived bug ≠ code bug: the perception-lag class
- Exploration docs need a Pre-audit section before any architecture proposal
- Pre-Inspection MUST audit all callers of a touched endpoint, not just the primary surface
- Pre-Coding-Reality-Check: re-audit at the keystroke, not just the audit
- Architecture-doc consultation is part of Pre-Inspection, not post-implementation discovery
- Foundation-Override extension: Half-Wired-Visible-in-Production triggers P1
- Periodic backlog re-prioritization discipline (4-Axes audit pattern)
- Stale-bundle is the most common false-positive on post-ship user reports
- Plain `git status` before every commit, especially in Multi-Tool-Coordination sessions
- Audit-Methodology: design-intent-axis as 5th-Axis or Override-Filter
- Never `rm -rf` a path you did not create - especially shared `.claude/worktrees`

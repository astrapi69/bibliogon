# Lessons learned: Process, audits and collaboration

Pre-inspection, audits, scope, docs discipline, git hygiene, multi-tool work.

Index of every entry: `.claude/rules/lessons-learned.md`. Moved here from that file unchanged (#1141).

## User impression of scope is anchored on what they noticed, not what's broken

User reported "einige" (a few) Medium articles imported with truncated content. Spotted ONE specific article. Systematic survey before patching revealed 117/209 (56%) had content loss; 9 imported with literally zero text. The user's "einige" was based on how many articles they happened to notice during normal use, not a count of the broken set.

Same session: user reported "some German articles correctly detected as German". DB inspection showed 207 English + 2 German rows, both German rows with `updated_at > created_at` — the user had manually corrected those two. The walker did no language detection at all. The user's "correctly detected" was a false memory of their own manual edits.

Rule:

- When a user reports a bug with quantitative scope ("a few", "most", "sometimes"), treat the count as a starting hint, not authority. Run a systematic survey (DB query, corpus sample, log scrape) BEFORE scoping the fix. The actual scope can easily be 10x what the user noticed.
- When a user reports MECHANISM ("X is detected as Y"), trust the SYMPTOM but verify the mechanism in code. Users are reliable observers of "it doesn't work as I expected"; their inferences about WHY are often shaped by hopeful priors ("surely there's some detection somewhere"). Read the code path before acting on the inference.
- The pre-inspection report must include the survey results when the user's report was quantitative. "User said few; survey shows N=X" is a separate bullet, not a parenthetical. The discrepancy itself is information.

## Atomic commits are bounded by "green individually", not "one thing"

- The "atomic commit" rule is "each commit is the smallest reversible unit that leaves the tree green", not "each commit does one conceptual thing". When splitting a change creates a broken intermediate state - e.g. the source change deletes a function the existing tests still import - the split is wrong. Combine the pieces into one commit.
- Concrete example: a refactor that renames an exported helper. The source edit and the test edit MUST land together; otherwise either the source commit fails because tests still import the old name, or the test commit fails because the new name does not exist yet. Splitting along conceptual lines ("source change" / "test update") here produces a commit series that cannot bisect cleanly.
- Conceptual split is a goal; green-individually is a hard constraint. When they conflict, the constraint wins.

## Doc files: existence is not discoverability

- When you add a new help page under `docs/help/{lang}/`, verify it appears in `docs/help/_meta.yaml`. The MkDocs nav generator (`scripts/generate_mkdocs_nav.py`) reads that file as the single source of truth; pages not listed there are unreachable from the side nav even though direct URLs and in-text links still work. We hit this with `ai.md` and `developers/plugins.md` - both had been merged for several releases but never showed up in the in-app help panel or the public docs site nav.
- Rule: file existence is not user discoverability. After creating a new help page, the same commit (or a paired one) must add the entry to `_meta.yaml` with a sensible icon and the appropriate placement among siblings.

## Doc values: read from code, not from memory

- Any specific number, threshold, default value, dropdown range, or feature flag mentioned in the docs MUST come from the code or config that defines it (`backend/config/app.yaml`, `backend/config/i18n/*.yaml`, the schema, the source of the relevant function), not from memory or approximation.
- If a value isn't easily findable in code, that is a signal to flag the question, not to guess. Wrong defaults in user docs erode trust faster than missing docs do.
- Example: trash auto-delete default came from `backend/config/app.yaml.example` (`trash_auto_delete_days: 90`); the configurable range came from the `trash_days_*` keys in `backend/config/i18n/*.yaml`. Both are single sources of truth that the docs cite without duplicating.

## Docs are specification, not a wish list

- If a feature is in the help, it must exist in the code. Feature audits after every large docs addition are mandatory.
- Features that are not yet implemented but are described in the docs must be marked with `> Planned for a future version`. Do not promise what isn't there.
- Build an audit table with the current state, run a gap analysis in A/B/C categories, then implement. No blind coding.

## Help system: single source of truth

- Help content lives in `docs/help/`, not in plugin code. Both the in-app Help plugin and MkDocs read the same Markdown files.
- `docs/help/_meta.yaml` is the single source of truth for navigation. `scripts/generate_mkdocs_nav.py` converts it into the MkDocs format.
- Markdown rendering on the frontend via `react-markdown` with `remark-gfm` + `rehype-slug` + `rehype-autolink-headings`. Never `dangerouslySetInnerHTML` for user content.
- MkDocs dependencies live in `docs/pyproject.toml` (its own venv), not in the backend venv. `make docs-install` / `docs-build` / `docs-serve` from the root.
- Context-sensitive help via `<HelpLink slug="export/epub"/>` - opens the HelpPanel directly on the relevant page.

## General patterns

- Before writing a custom implementation: check whether a library/extension already solves it.
- On CSS problems: check specificity first (.ProseMirror context).
- On import problems: check whether the source format (Markdown) is converted to HTML correctly.
- On export problems: check whether HTML is converted back to Markdown correctly.
- Test roundtrips: import -> editor -> export -> epubcheck.

## Review architectural decisions before implementing

From the V-02 incident: there was a near-implementation of a
backup-compare feature (V-02) that would have been built in
parallel with the already-planned Git-based backup feature. Only
by cross-checking against todo-prompts.md did the conflict
become visible.

Rule: before implementing a larger architectural decision, check:
1. ROADMAP entries in the area
2. todo-prompts.md for already-planned changes
3. docs/journal/ for earlier discussed decisions

On a conflict between a user instruction and documented planning:
STOP and explicitly ask the user which version applies.
Never build parallel systems that are already slated for deletion.

## Real-world data audit BEFORE implementation prevents spec-vs-reality drift

MEDIUM-COMMENTS-IMPORT-01 shipped with a three-criteria
detection heuristic in the original spec: body_length < 500
chars **AND** empty subtitle **AND** no structural elements.
Pre-inspection ran that heuristic against the actual 209-file
Medium export in the user's home directory before any code
landed. Two findings forced a spec revision:

1. **6 / 209 matched the original three-criteria heuristic.**
   That seemed reasonable on paper.
2. **The user's own reference comment case** ("Thanks for
   pointing that out — you're right, the link was missing.")
   was a **false negative**. The audit dug deeper: Medium
   auto-fills the `data-field="subtitle"` section with the
   second paragraph of the reply body when the author wrote
   no explicit subtitle. So the "empty subtitle" criterion
   never holds for those auto-filled cases, even though they
   are unambiguously comments.

Dropping the empty-subtitle criterion lifted detection from
**6 / 209 to 8 / 209** with zero new false positives across
the corpus. The two cases the original spec would have missed
both carry Medium's auto-filled subtitle.

The lesson generalizes:

- **Specs that predict a data shape are predictions, not
  contracts.** A heuristic that looks principled on paper can
  silently miss the cases that matter once you point it at
  real data.
- **Run the audit against actual data BEFORE writing code,
  not after.** "After" means the code is committed, possibly
  shipped, and the regression is harder to undo than to
  prevent. The medium-import walker session (2026-04-23) had
  the inverse cost: a `find` vs `find_all` bug silently
  truncated ~33% of imports for an entire release cycle, and
  the fix needed a one-off data-fix script + a regression-pin
  test. The MEDIUM-COMMENTS-IMPORT-01 audit caught the same
  class of bug BEFORE landing — no data-fix script needed,
  no production rows mis-classified.
- **The audit input doesn't have to be production data.** In
  the MEDIUM-COMMENTS-IMPORT-01 session, the production DB
  was empty (the user had cleared it), so the audit ran
  directly against the raw Medium HTML export in the user's
  Downloads directory. Working from the source bytes instead
  of the parsed-and-imported rows is often cleaner: the audit
  isolates the heuristic from walker / importer drift.
- **Surfacing the audit in the pre-inspection report** is
  what makes the decision visible. Without the report saying
  "6 / 209 under the spec, 8 / 209 with empty-subtitle
  dropped, the user's own reference case is in the missing
  2," the spec would have been confirmed unchanged. The
  report makes the discrepancy a decision point instead of an
  implementation surprise.

Concrete rule: when a feature ships with a heuristic, a
detection rule, a threshold, or any other prediction about
data shape, run the prediction against real data in
pre-inspection. Report counts + sample cases. Treat the spec
as the starting hypothesis, not the final design.

## Operational gaps masquerade as wired infrastructure

The 2026-05-12 test-infrastructure audit surfaced a concrete
example: the mutmut workflow at
``.github/workflows/mutation-import.yml`` had been WIRED in
the repo for 10 days (since 2026-05-02, commit ``28fe59c``)
but had NEVER produced a successful run. The nightly cron
was gated by the ``ENABLE_NIGHTLY_MUTATION`` repo variable
(not enabled); no maintainer had manually
``workflow_dispatch``-ed the workflow either. The audit
trigger was the first invocation.

The job completed in 1m12s (vs. 20-40min expected) because
``mutmut run`` errored during its initial
``run_stats_collection`` phase with
``BadTestExecutionCommandsException``. The exact pytest
invocation mutmut used (``--rootdir=. --tb=native -x -q
tests/``) succeeded cleanly when run by hand — so the
failure was inside mutmut's own pytest plugin, not pytest.
But until the workflow was actually triggered, this bug was
invisible: the YAML existed, the audit-doc
(``docs/audits/mutmut-2026-05-02-import.md``) carried the
note "TBD — pending first CI run", and the AGAR-feeling of
having mutation-testing-infra was at full strength.

The lesson generalizes:

- **"Wired" ≠ "working".** A workflow / hook / cron /
  scheduled job that was committed without being executed
  end-to-end is a hypothesis, not a feature. Audits should
  validate that wired infrastructure actually runs to
  completion, not just that the YAML / config exists.
- **The right time to flip such switches is at wire time,
  not at audit time.** A maintainer who wires mutmut /
  Hypothesis / any new pipeline should
  ``workflow_dispatch`` the workflow at least once before
  declaring the work done, and surface the artifact + result
  in the same PR / commit. The 2026-05-02 mutmut wiring
  shipped without this validation; the bug then lay dormant
  for 10 days.
- **Audits that find these gaps are doing their job.** The
  audit didn't fail to "implement mutmut"; it accurately
  reported that the wired mutmut workflow is operationally
  blocked, which is a more useful data point than another
  abstract "we should adopt mutmut" recommendation.

Concrete rule: when wiring a new CI workflow, schedule it,
or otherwise add infrastructure that runs on a delayed
trigger (nightly cron, on-tag, on-paths-only, gated by repo
variable), trigger it manually at least once in the same
session, download the artifact, and confirm the result is
what you intended. Document the first run's outcome in the
PR description or the related audit doc. A workflow that
ships without a known-good first run is technical debt
masquerading as feature delivery.

## Schema "preserved" / "always set" claims must survive real-data audit before becoming spec

MEDIUM-COMMENTS-IMPORT-01 shipped with prose in three
places (model docstring, English help doc, German help doc,
archive entry) describing the ``ArticleComment.responds_to_url``
field as "preserved for orphans + for future re-linking"
or "preserves the comment's own canonical URL." Both shapes
imply the field carries data. Reality, verified after the
fact: the v1 Medium importer sets the field to ``None``
universally (line ``responds_to_url=None`` in
``plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/importer.py``),
and the pre-inspection audit on the user's 209-file export
already showed Medium's HTML carries no parent-reference
data to extract.

The drift was caught after the feature shipped, not before:

- Sometime AFTER MEDIUM-COMMENTS-IMPORT-01 closed, a smoke
  check surfaced 8 imported comments all with
  ``responds_to_url`` ``None``. The user asked to correct
  the spec.
- The factual error in the help docs was a separate
  mis-statement: the English wording conflated
  ``responds_to_url`` with the comment's own
  ``canonical_url``, which is a different field entirely.
  The pre-inspection had distinguished them but the help
  doc author (Claude Code, same session) merged the two
  concepts in the user-facing prose.

Two distinct anti-patterns surfaced:

1. **"Future-compatible" prose presented as current
   behaviour.** "Preserved for orphans" is true for the
   schema (the column is nullable, the storage path
   exists), but FALSE for the user's actual data (every
   row has ``None``). When the gap is 100%, calling the
   field "preserved" is misleading: the user reads the doc
   and expects data they will never find. Either say
   "reserved for future importers; v1 imports always
   ``NULL``", or say nothing and let the type signature
   carry the meaning.

2. **Help-doc prose drifting from importer-comment prose.**
   The importer comment in ``_persist_comment`` correctly
   said "responds_to_url is left NULL too in v1 (no
   inference); future importers that DO carry a parent
   reference can populate it." The help docs in the same
   commit chain disagreed. Single-pass authoring across
   three places drifted in two of them.

Concrete rules:

- When a schema field's actual production value is
  always-NULL / always-empty / always-zero for the only
  v1 use case, the docstring must say so explicitly.
  Pretending the field is populated leaks the schema's
  forward-compatibility ambition into the user's
  expectations.
- Help-doc prose that names a field MUST be cross-checked
  against the importer / writer code that populates it.
  A 30-second grep for the field name in the importer
  catches the drift; this audit caught it weeks later.
- When a pre-inspection audit produces a "Medium doesn't
  carry X" finding, every doc surface that mentions X in
  the resulting code should explicitly reference the
  audit finding. The audit is the spec.

## Audit findings need production-vs-dev environment classification before urgency-tier

Surfaced during the v0.31.0 pre-release verification (2026-05-13).

The D2 verification audit reported "GET /api/backup/export
returns HTTP 500 with `PermissionError: 'config/backup_history.json'`
in Docker" and classified it as a data-loss-class release-
blocker. The technical finding was correct: the path was a
CWD-relative literal that violated the explicit
"Filesystem isolation: production data lives outside the
project tree" rule. But the urgency classification was
overstated by one environment-class. The actual breakdown:

- **Dev Docker** (the `docker-compose.yml` bind-mount path
  `./backend:/app`): the bind mount inherits the host's UID,
  so the container's `bibliogon` user cannot write to the
  project tree. The endpoint crashes; the bug is real for
  every contributor who runs `docker compose up` from the dev
  compose.
- **Production Docker** (`docker-compose.prod.yml`, no bind
  mount on `/app`): the Dockerfile does
  `RUN groupadd -r bibliogon && useradd -r -g bibliogon
  bibliogon && mkdir -p /app/data && chown -R bibliogon:bibliogon
  /app` then `USER bibliogon`. The container's user OWNS the
  entire `/app/` tree including `config/`. The CWD-relative
  write happens to land in a writable directory. The bug
  **never fired in production**.

The fix still ships (defense-in-depth + the filesystem-
isolation rule still applies + alignment to a consistent
behaviour across both environments), but the urgency tier is
"correct architectural cleanup" not "data-loss class
release-blocker". Verification command for any future audit
that suspects a Docker write-path failure:

```bash
docker exec <prod-container> sh -c \
    "ls -la /app/<the-path-under-suspicion> && \
     touch /app/<dir>/probe-write && rm /app/<dir>/probe-write && \
     echo WRITABLE || echo READONLY"
```

This separates "broken in dev only" from "broken in prod
also" before scope-setting any fix.

**Rule for future audit reports**: when a finding is "X
crashes with PermissionError in Docker", the audit MUST
distinguish which Docker setup (dev with bind mount vs prod
with named volume) before assigning urgency. The same code
path can be fatal in one and harmless in the other. Audit
reports that omit the environment distinction will lead to
either over- or under-urgent triage.

**Concrete artefact from the v0.31.0 cycle**: the Phase 2
path-isolation fix (commit `a341b57`) is correct, ships,
and is properly motivated by the architecture rule. But the
"prod blocker" framing was wrong — it was a dev-environment
blocker AND an architecture-consistency improvement, NOT a
production data-loss bug. The broader fix for the 10+
remaining `_base_dir / "config" / "app.yaml"` writes in
`backend/app/routers/settings.py` was deferred as
`PROD-WRITES-ARCHITECTURE-01` (P3) on the same reasoning:
production is fine, dev quirk eventually deserves the
broader cleanup but not at v0.31.0 release-blocker urgency.

## Real-corpus audit catches arithmetic drift before it ships

Surfaced 2026-05-14 in the v0.32.0 F2a session. My
pre-inspection report told the user the v2 heuristic
produced "197 Articles / 12 Comments" on the 209-file
corpus. The verification step — running the COMMITTED
walker against the corpus — produced 198 / 11.

The discrepancy: the audit script reported "11 comments"
in its summary; I computed `209 - 11 = 197` in the report
text. Off-by-one arithmetic; the audit script's data was
correct. The same drift bled into the audit doc and the
docstring (both said "197/12" until the verification
caught it).

Concrete rule:

- **Always run a verification pass against the COMMITTED
  code** before propagating numbers into docs, docstrings,
  and CHANGELOG entries. A `verify_committed.py` that
  asserts on the expected counts is the right shape — if
  the assertion fails, the wrong numbers cannot land.
- **Match every quantitative claim against an
  authoritative source** (the audit script, the test
  output, a `git ls-files | wc -l` count). Recomputing
  from a different number that "should be" related is the
  failure mode this rule prevents.
- **Treat docstrings + docs as ONE artifact**. If the
  docstring says "197/12" and the audit doc says "197/12",
  they're not two confirmations of the same truth — they're
  two copies of the same draft. The verification step is
  the only independent witness.

Pairs with the existing "Numeric claims verification" rule
in `.claude/rules/ai-workflow.md`: that rule covers the
broader case (any number in any document); this one is the
specific tactic that catches arithmetic drift in a
multi-doc rollout of the same finding.

## Multi-tool collaboration tracking: re-sync before accepting new orders

When an external agent (e.g. a separate planning session, the
user's "Claude planning" workspace) loses sight of git state, the
executor agent (Claude Code working in the repo) MUST explicitly
re-sync before accepting new orders. Status corrections mid-
session prevent compound stale-state from creating phantom work.

### Concrete trigger (2026-05-14)

A consolidated v0.32.0 UX-Polish session plan arrived after the
v0.32.0 release tag had already shipped (commit `a432a77`)
including Phases B–F as "pending". All five phases had actually
shipped before the tag:

- Phase B (BulkActionBar selection cleanup): `02553fb` +
  `926decb`
- Phase C (Heuristic v2): `95c72c8`
- Phase D (Reciprocal reclassify endpoints): `3288ba5`
- Phase E (UI reclassify actions): `bb4a820`
- Phase F (Copy split-button): `3cedf78`

The plan was self-consistent but acted on a stale view of repo
state. Without a sync gate, the executor would have re-implemented
shipped features.

### Rule

Before starting any non-trivial session (especially one whose
plan was written by a different agent / a different session):

1. **`git log --oneline -<N>`** where N covers the time gap
   since the plan was written. Look for commit messages that
   match the planned work items.
2. **`grep -rln '<feature name>'`** for each pending item. A
   recent match in production code (not just tests/docs)
   suggests the work shipped.
3. **Reconcile**: if items appear shipped, report back to the
   planner with the commit hash + verification artifact (test
   pass count, audit-doc reference, etc.) BEFORE starting any
   re-implementation work.

### How to surface a status correction

Don't quietly skip items the planner thought were pending —
explicit "STOP — status correction" with a table of:
- What the plan called pending
- Commit hash where it actually shipped
- Verification artifact (test count, audit-doc reference)

This way the planner can re-prioritize the remaining work
deliberately rather than discover at end-of-session that 4 hours
of work was already done.

### Pairs with

The existing "Numeric claims verification" and "Audit findings
need production-vs-dev environment classification before urgency-
tier" rules. All three share the same root cause: acting on a
mental model that doesn't match the current state. The fix in
all cases is "verify against the authoritative source before
acting".

## User-perceived bug ≠ code bug: the perception-lag class

Surfaced 2026-05-14 when "Articles-Trash Restore button broken"
turned out to be a **419ms click handler with subtle post-restore
feedback**, not a functional failure.

### The pattern

A user reports "feature X doesn't work" or "X is broken" + cites
a console message or symptom as evidence. The diagnostic chain
that follows often surfaces multiple non-bugs before reaching the
real cause:

1. **Surface symptom** the user actually noticed (visual lag,
   missing feedback, console warning).
2. **Diagnostic gut-read** (often workbox messages, network 404s,
   etc.) that look causal but aren't.
3. **Actual cause** which is usually a UX-quality issue, not a
   functional break.

Bug A's progression (2026-05-14):

- User report: "Articles-Trash Restore broken; workbox blocks"
- My audit: SW config is symmetric for books/articles; workbox
  "No route found" is benign info, not blocking
- Manual smoke: restore POST fires, backend processes, frontend
  reloads — backend confirms article is restored
- **Actual cause**: 419ms click-handler + post-restore feedback
  too subtle (stay-in-trash-view + transient toast + filtered-out
  row vanishing). User-perceived "broken" = user-perceived "lag
  + no clear success signal".

### Rule

**Before patching a code bug, verify the bug is in the code
layer the user thinks it is.** Specifically:

1. **Check the Network tab + backend state FIRST.** If the
   action's backend artifact exists (article restored, book
   created, etc.), the user's symptom is at a different layer.
2. **Console messages are diagnostic clues, not bug citations.**
   Workbox passthrough logs, React StrictMode warnings, and
   browser violation reports often accompany correct behavior.
   Verify the cited message is causal, not coincidental.
3. **Re-frame "doesn't work" as "what did the user actually
   observe?"** vs "what diagnostic message did the user notice?".
   The two often diverge; the second can mask the first.

### The audit-tier output

Perception-lag bugs ARE real UX bugs — they degrade users' trust
even when the code is correct. But they belong in a different
backlog tier than functional regressions: **IMPROVEMENT (UX
performance)**, not BLOCKER. The filed
``RESTORE-UX-FEEDBACK-01`` (P3, optimistic update + post-restore
feedback) is the proper response. Promoting it to BLOCKER would
have made the audit miss the real lesson — which is that
perception is a UX dimension worth fixing, even when nothing is
broken.

### Pairs with

The "Audit findings need production-vs-dev environment
classification before urgency-tier" rule. Same family: separating
"this looks scary" from "this is actually broken" requires
verifying against authoritative sources before urgency-triage.

## Exploration docs need a Pre-audit section before any architecture proposal

Surfaced 2026-05-18 from the Comic-Foundation exploration
reframe. The first-draft `docs/explorations/comic-foundation.md`
(stub commit `de83dcc`) proposed extending the Picture-Book
`speech_bubble` PageLayout with a multi-bubble array. The user
critique caught a foundational conflict: `Book.book_type`
already reserves `"comic_book"` at the schema layer for a
future separate `plugin-comics` (see
[backend/app/models/__init__.py:72-75](../../../backend/app/models/__init__.py)
+ [docs/explorations/children-book-plugin.md:13-23](../../../docs/explorations/children-book-plugin.md)).
The reframe moved Comic-Foundation work to plugin-comics scope.

The architectural conflict was visible in the codebase in two
places (the model comment + the parent exploration doc). The
stub doc was 95 lines and skipped both. The canonical
exploration-doc structure (per `children-book-plugin.md`)
opens with a **Pre-audit: current state of the moving parts**
section precisely to surface these constraints. The stub
had no Pre-audit section.

### Rule

Any exploration doc that proposes a NEW architecture / NEW
schema / NEW plugin / NEW feature surface MUST include a
**Pre-audit section** before any proposal. Concrete
requirements:

1. **Audit the existing schema** (`backend/app/models/__init__.py`,
   relevant plugins' models, Alembic migrations) for
   reservations, discriminators, or fields that constrain the
   proposed shape. Quote the constraints with file:line
   citations.
2. **Audit parent exploration docs** (cross-referenced in
   the new doc's domain) for prior decisions that the new
   work inherits OR conflicts with.
3. **Audit related backlog items** for the architectural
   commitments they imply.
4. **Audit the lessons-learned rules** for prior incidents
   in the same area.
5. State the audit findings BEFORE the architecture proposal.
   If a conflict is found, the proposal section explicitly
   reconciles with the constraint OR documents why the
   constraint is being overridden.

The Pre-audit section is to architecture proposals what the
Pre-Inspection step is to feature implementations: a forcing
function to check the existing state before committing to a
new direction.

### Detection heuristic

When reviewing an exploration doc:

- Does it have a "Pre-audit" or equivalent section?
- Does it cite specific file:line references for prior
  architectural commitments?
- Does the architecture proposal reconcile with those
  commitments?
- Are related rules / memory entries / lessons cross-
  referenced?

If any answer is "no", the doc is at risk of repeating the
2026-05-18 Comic-Foundation reframe pattern: ship a thin
stub, propose a direction, get critiqued, reframe.

### Concrete cost saved by the Pre-audit step

The Comic-Foundation reframe required:

- One critique pass (~30 min) to catch the conflict
- One doc rewrite (95 lines → 736 lines) to install proper
  framing
- One backlog migration (2 items archived, 1 item re-scoped,
  1 new item filed)

All of which would have been avoided if the stub had opened
with: "Pre-audit finds `book_type = 'comic_book'` reservation;
multi-bubble work must live in plugin-comics, not extend
picture-book." That sentence is a 30-second grep at the
moment of writing — vs a half-day of rework after the fact.

### Multi-tool collaboration amplifier

The 2026-05-18 incident also illustrates the multi-tool
collaboration drift pattern (per the existing
"Multi-tool collaboration tracking" rule). The stub was
drafted from a Strategic-Advisor session ("Claude in chat",
parallel to the execution session). The execution session
had visibility into the codebase but accepted the chat-
session's framing without running the Pre-audit. Both
sessions missed the `comic_book` reservation; only the
critique pass caught it.

Implication: when a parallel-agent / chat-session hands off
a spec for an exploration doc, the execution session MUST
NOT skip the Pre-audit on the assumption that the chat-
session already did it. Each session validates its own
audit independently.

### Pairs with

- "Multi-tool collaboration tracking: re-sync before
  accepting new orders" — same family. Multi-tool drift
  amplifies this risk: a parallel-planning agent may not
  have visibility into the schema reservations the
  execution agent has.
- "Real-world data audit BEFORE implementation prevents
  spec-vs-reality drift" — runtime-data analog of this
  schema-state analog.
- "Schema 'preserved' / 'always set' claims must survive
  real-data audit before becoming spec" — schema-claim
  analog.
- `ai-workflow.md` Pre-Inspection step — implementation
  analog. Pre-audit is the doc-writing analog.

### Anti-pattern

Treating an exploration doc as a brainstorm-dump that
someone else will audit later. The audit IS the doc's job.
A 95-line "brainstorm dump" stub that pushes the audit cost
downstream generates more total work than a 400-line proper
doc with the audit upfront — by the cost ratio observed in
this incident (30 seconds vs. half a day).

## Pre-Inspection MUST audit all callers of a touched endpoint, not just the primary surface

Surfaced 2026-05-19 during the PDF-BLEED-MARKS-01 Pre-Inspection
when a half-wired surface from the just-shipped PDF-KDP-FORMATS-01
was discovered: BookMetadataEditor's Design-tab Export-PDF button
called the same export endpoint but passed empty query params,
silently ignoring the format dropdown that PDF-KDP-FORMATS-01 had
added to PageEditor. PDF-KDP-FORMATS-01's own Pre-Inspection had
scoped the feature-area (PageEditor + the dropdown) but had NOT
grep'd for ALL call sites of `api.documentExport.download(bookId,
"pdf", ...)`. The second caller existed in BookMetadataEditor's
Design tab since Session 6 Commit 5 (2026-05-17); the dropdown's
new query-param contract bypassed it because PDF-KDP-FORMATS-01
shipped the dropdown ONLY at PageEditor.

This is a class of half-wired bug that the existing "Half-wired
feature lifecycle" rule doesn't fully cover. That rule fires
when a state-WRITE has no consumer, OR a state-MUTATION has no
inverse. This new class fires when a NEW query param on an
EXISTING endpoint is wired at SOME callers but not ALL — the API
keeps working at the un-updated caller (empty params silently
fall back to defaults), but the user-visible feature is invisible
from that surface.

### Rule

Pre-Inspection for any feature that adds a new query param to an
existing API endpoint (or extends an endpoint's contract) MUST
explicitly grep for ALL call sites of that endpoint and report
them in the audit findings. Each caller is classified as:

- **Will-receive-feature:** caller updated in the same session to
  thread the new param.
- **Half-wired risk:** caller NOT updated; new feature silently
  invisible from that surface. Surface as STOP-condition trigger
  for explicit triage.

### Detection grep at Pre-Inspection time

For any new query-param feature on the export endpoint:
```
grep -rn "api\.documentExport\.download\|api\.<endpoint>\.<method>" \
  frontend/src/ --include='*.tsx' --include='*.ts' | grep -v '\.test\.'
```

For any new query-param on a non-API surface (e.g. shell-pipeline,
queue worker, scheduled job), grep for the function-name or the
endpoint URL string equivalently.

### Mitigation strategies

- **(Preferred when 2+ surfaces exist) Extract a shared
  component / helper FIRST**, then ship the new feature at the
  shared site. The Recurring-Component-Unification Rule from
  coding-standards.md applies here — 2 callers of the same
  endpoint shape often share enough UI to extract. PDF-BLEED-
  MARKS-01 C2 demonstrated this: `PictureBookPdfExportControls`
  encapsulated the format dropdown + bleed checkbox + Export-PDF
  button, mounted at BOTH PageEditor + BookMetadataEditor in the
  same session.
- **(When extraction isn't justified) Ship the new query param at
  every caller in the same session**, even if the secondary
  caller's UI is minimal. Half-wired callers shipping after the
  primary creates the silent-fall-through bug class.
- **(When extraction must be deferred) File an explicit follow-up
  backlog item with a load-bearing trigger.** Per the
  "Half-wired feature lifecycle" rule: the deferred work needs
  a tracked ID + concrete trigger, NOT a docstring TODO.

### Generalises to

- New query params on ANY existing endpoint.
- New kwargs on ANY existing service function.
- New required headers / metadata on ANY existing API call shape.
- New CLI flags on ANY existing command (multiple call sites in
  the codebase wrap subprocess invocations).

The discipline: Pre-Inspection's grep step is non-optional when
the work touches an existing contract. Anything less ships a
half-wired secondary surface as a side-effect.

### Concrete artefact

- PDF-KDP-FORMATS-01 (commits `60ff913` + `c96a1fc` + `b6eaf2c`):
  shipped the format dropdown in PageEditor only. Half-wired
  surface latent at `BookMetadataEditor.tsx:144-165` +
  `:484-528`.
- PDF-BLEED-MARKS-01 (this session) Pre-Inspection discovered the
  surface + the C2 extraction closed it as a Recurring-Component-
  Unification side-effect. Same shared component now serves
  PageEditor + BookMetadataEditor; format AND bleed selections
  cascade between the two surfaces via localStorage.

### Pairs with

- "Half-wired feature lifecycle" — covers the state-write-without-
  consumer family. This rule covers the new-query-param-with-
  partial-caller-coverage family.
- "Articles-vs-Books parallel-surface asymmetry" — covers same-
  named feature at 2 surfaces drifting. This rule covers a SHARED
  feature at 2 surfaces but the new contract only being honoured
  by one.
- Recurring-Component-Unification Rule in coding-standards.md —
  often the right tool for the mitigation.

## Pre-Coding-Reality-Check: re-audit at the keystroke, not just the audit

Audit-First Pre-Inspection is a strong discipline; it catches
class of bug A (committed plan misses an existing-state
constraint). But Pre-Inspection is necessarily LIMITED — the
auditor has finite time and greps the obvious surfaces. Even a
high-quality audit can ship a commit plan that, when reached
during implementation, turns out to deviate from optimal
reality in a small but meaningful way.

The Pre-Coding-Reality-Check rule fires AT the keystroke: BEFORE
writing the first line of code for a committed-plan step,
re-grep the immediate touch-surface one more time. The marginal
cost is seconds; the value is catching the cases the audit
missed.

### Three observed instances (2026-05-20 V060 adoption arc)

| Instance | What the plan committed to | What the keystroke-time grep found |
|---|---|---|
| **PDF-KDP-FORMATS-01 → PDF-BLEED-MARKS-01** | Ship format dropdown at PageEditor only | BookMetadataEditor Design tab is a second caller of the same export endpoint with empty query params (half-wired surface) — closed via shared-component extraction |
| **V060 C4: hot-reload on install/uninstall** | Wire `rediscover()` into `install_plugin` + `uninstall_plugin` | ZIP plugins bypass entry-point discovery entirely (go through `register_plugin()` directly). `rediscover()` would be a no-op there. Wiring is architecturally inapplicable. |
| **V060 C5: extend errors vs new states endpoint** | Choose between `/api/plugins/errors` extension or new `/api/plugins/states` | `/api/settings/plugins/discovered` ALREADY exists and is conceptually the per-plugin-state endpoint; both audit-committed options would create parallel duplication. Third path (γ) extending the existing endpoint is strictly better. |

Three instances in one session is sufficient recurrence to
formalize the pattern.

### Rule

For any commit whose plan was committed during a prior audit
(Pre-Inspection, design review, multi-session work, brief from a
parallel agent), the FIRST action at implementation time is to
re-grep the immediate touch-surface for:

- **Existing endpoints / functions / components** whose name or
  scope overlaps with what the plan proposes to create. (C5
  pattern: a parallel surface already exists.)
- **Architectural assumptions in the plan** that depend on how
  upstream/downstream code paths flow. (C4 pattern: the wiring
  the plan assumed is inapplicable.)
- **Half-wired siblings** — other callers of the same contract
  the plan is changing. (PDF-KDP-FORMATS-01 pattern: a second
  caller exists and would be skipped without the audit step.)

If the grep surfaces ANY of the three, STOP and surface to the
user with the finding + a proposed scope revision. Do NOT
silently descope or rescope; the user's commit-plan approval
was based on the prior audit's information state.

### Implementation: 30-60 seconds, not 30 minutes

This is NOT a re-run of the full Pre-Inspection. It's a quick
ground-truth check at the keystroke:

```bash
# Pattern for "is there a parallel surface I'm missing"
grep -rln "<endpoint-name>\|<function-name>" backend/app/ frontend/src/

# Pattern for "does the architectural assumption hold"
grep -rln "<assumed-mechanism>" backend/app/ | head -5

# Pattern for "what other callers exist"
grep -rln "<api-call-name>" frontend/src/ --include="*.tsx" | grep -v test
```

Total time: under a minute per commit. If the greps return
zero unexpected hits, proceed with the plan as committed.

### Pairs with

- "Pre-Inspection MUST audit all callers of a touched endpoint"
  — that rule fires at AUDIT time (early). This rule fires at
  CODE time (keystroke-time). Together they form a two-stage
  filter: audit catches the obvious, keystroke catches the
  audit's blind spots.
- "Half-wired feature lifecycle" — instances #1 and #3 of the
  three above both involve half-wired surfaces. The Pre-Coding
  step is the cheap mechanism for spotting them BEFORE the
  half-wired ships.
- "Multi-tool collaboration tracking: re-sync before accepting
  new orders" — same family of "audit-first; trust but verify"
  discipline. Multi-tool work is especially prone to plan-vs-
  reality drift because each agent has partial visibility.

### Anti-pattern

Treating the audit's commit plan as immutable. The audit is the
starting point, not the contract. A keystroke-time grep finding
that surfaces an architectural conflict is NOT scope creep — it's
the audit's blind spot being caught one stage later. Silently
descoping or rescoping to avoid the surface message produces
either a half-wired ship (instance #1) or a parallel-duplicate
ship (instance #3) or an inapplicable wiring ship (instance #2).
All three are real regressions; the surface message is the
cheap prevention.

## Architecture-doc consultation is part of Pre-Inspection, not post-implementation discovery

Filed 2026-05-22 from the KDP-PUBLISHING-WIZARD-01 Phase 1
session. Two Pre-Inspections back-to-back missed
``docs/architecture/state-machines.md`` even though the doc
was explicitly relevant. Recorded as single-instance
observation per the "single instance is incident, not
pattern" discipline; promote to pattern if a second
instance surfaces.

### What happened

The Pre-Inspection (Track 2 — frontend wizard-component audit)
compared the codebase's three existing wizards:

- ``ConvertToBookWizard`` — hand-rolled ``useState`` + step-
  index, ~1430 LOC
- ``AiSetupWizard`` — same shape, simpler, ~342 LOC
- ``ImportWizardModal`` — XState v5 machine + actor pattern,
  340 LOC machine + 403 LOC modal

The audit recommended ``ConvertToBookWizard``'s shape because
the new KDP wizard "has linear steps (no branching)". That
inference was wrong on the merits — branching isn't the only
criterion — but it was load-bearing in the implementation
plan, which then locked in ``useState`` for C0-C5.

After C2 shipped, the user surfaced
``docs/architecture/state-machines.md``. The doc lists 5
explicit trigger criteria for choosing XState v5; the KDP
wizard satisfies all 5:

1. 3+ states with multiple incoming transitions
2. Async side effects gated by state (3 API calls, one per
   step)
3. Guards or invariants across transitions
4. Reset/retry semantics
5. Future flows likely to branch (Phase 2 adds pricing + ARC)

The audit's frontend-component-tree grep did not reach the
architecture-doc directory.

### Mitigation that resolved THIS incident

User adjudicated path (γ): finish Phase 1 hand-rolled,
file ``KDP-WIZARD-XSTATE-MIGRATION-01`` as a P3 backlog
item paired with Phase 2. Both honored: session instruction
ships, architecture doc gets the migration at the natural
seam where branching pressure forces it.

The cost of the wrong-pattern Phase 1 ship: zero behavioral
defect, ~3-4 hours of future migration work (covered by the
filing).

### Recipe for future Pre-Inspections

Pre-Inspection's component-audit track MUST grep
``docs/architecture/`` for any doc whose topic matches the
component class being audited. Two-line grep:

```bash
grep -rln "<component-class-keyword>" docs/architecture/ docs/rules/ 2>/dev/null
ls docs/architecture/
```

The second command (literal ``ls``) is the cheap insurance —
six directories' worth of files in ``docs/architecture/``
can be skimmed in 30 seconds. If a doc's filename obviously
matches the component class (e.g. ``state-machines.md`` when
designing a wizard), it must be read before scoring component
candidates.

### Adjacent risk: parallel-agent specifications

The Phase 1 session prompt was authored by Strategic-Advisor
2026-05-23 (a parallel agent). It explicitly said "follow
ConvertToBookWizard as canonical reference". That directive
held weight in the executing session and was an additional
factor against the architecture-doc consultation: the
executor agent was treating the parallel-agent's spec as
authoritative.

Per the existing "Multi-tool collaboration tracking: re-sync
before accepting new orders" lessons-learned rule, the
executor must verify the spec against the codebase state
INCLUDING architecture docs. Specs written without
architecture-doc awareness produce the wrong-pattern
recommendation regardless of how authoritative they appear.

### Pairs with

- "Pre-Coding-Reality-Check: re-audit at the keystroke" (this
  file) — same family. The keystroke-time grep catches the
  audit-blind-spot one stage later; the recipe above prevents
  the blind spot at audit time.
- "Multi-tool collaboration tracking: re-sync before accepting
  new orders" (this file) — same family. The architecture doc
  is one of the things the executor must verify against, not
  just commits + open issues.

## Foundation-Override extension: Half-Wired-Visible-in-Production triggers P1

Filed 2026-05-20 from the backlog re-prioritization audit
(`docs/audits/backlog-reprioritization-2026-05-20.md`, commit
`281a6f6`).

The original Foundation-Override (in `ai-workflow.md` "ROADMAP
priority tiers" + the 4-Axes audit methodology) auto-promotes
items to P1 when **A2 = 5** (blocks 3+ items OR is upstream-
blocker). The audit's apply phase surfaced a gap: items that
score below 17 in raw 4-Axes totals but produce a **user-
visible half-wired state in production** deserve the same P1
override.

### Concrete case that triggered the extension

`PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01` scored 16 (A1=4 + A2=4
+ A3=4 + A4=4). The strict Foundation-Override didn't fire
(A2=4 < 5). But the item closes the **degraded "no comic pages
yet" state** that `ComicBookEditor` surfaces in production
today: users can create a comic_book, the editor mounts, but
they cannot add pages because plugin-kinderbuch's pages router
gates on `book_type='picture_book'`. The half-wired state is
visible to every user who tries to author a comic.

Score-only methodology would have kept this at P2; the user-
visible half-wired criterion bumps it to P1 because the cost
of leaving it is paid by every user, not just the developer.

### Extended override rule

**P1 override fires when ANY of:**

1. **A2 = 5** (original criterion: blocks 3+ items OR upstream-
   blocker), OR
2. **Half-Wired-Visible-in-Production**: the item closes a
   half-wired feature that is currently shipping in production,
   user-visible, and degraded.

Half-Wired-Visible-in-Production criterion checks:

- The half-wired feature is **already in production** (i.e. the
  write-surface OR the partial-state shipped to users; it's not
  a pre-ship gap)
- The user-side **observes the broken-ness** (not just
  developers; not just CI; not just future-state assumptions)
- The item closes the read-surface, inverse-mutation, or
  blocker that would make the feature whole

### Distinction from "Half-Wired-Feature-Lifecycle" rule

The existing "Half-wired feature lifecycle" lessons-learned
entry (this file) covers PREVENTION: don't ship state-write
without state-consumer; don't ship Create+Update+Delete without
Read.

This new override covers CLEANUP-PRIORITY: when a half-wired
feature DID ship (often during a feature-rush or a deliberate
in-stages decision), the closure item gets P1 priority instead
of falling into normal-tier work.

The two rules are complementary:

- Prevention rule fires AT DEVELOPMENT TIME (Pre-Inspection
  catches the gap).
- Override rule fires AT BACKLOG-PRIORITIZATION TIME (closure
  item gets P1).

### Counterexamples (when override does NOT fire)

- A half-wired feature that's **not yet shipped** (dev branch
  only) is NOT under this override. Use the prevention rule
  instead.
- A half-wired feature that's shipped but **not user-visible**
  (e.g. an internal admin tool only Aster uses) does NOT trigger
  P1 — production-visible means user-visible.
- A half-wired feature whose closure scope is **multi-session
  XL work** (e.g. KDP-Wizard's wizard surfaces) gets the
  normal-tier treatment because P1 implies "do soon" and the
  multi-session shape can't honor that semantic.

### Pairs with

- `ai-workflow.md` "ROADMAP priority tiers" (the original
  Foundation-Override definition lives there)
- "Half-wired feature lifecycle: a state-write without its
  inverse-mutation OR its state-consumer is purgatory, not a
  feature" (this file) — prevention sibling

## Periodic backlog re-prioritization discipline (4-Axes audit pattern)

Filed 2026-05-20 from the audit's apply-phase retrospective.

Backlog priorities are assigned at filing time. Over weeks-to-
months of organic growth they drift from current strategic-
state — items filed early under "next direction" lose
relevance; speculative items mature into actionable; effort-
estimates calibrate against shipped work. Single-author projects
accumulate this drift faster than multi-author ones because
nobody else re-reads the backlog from scratch.

The 2026-05-20 audit revealed:

- 24 of 67 active items had a tier mismatch under current
  4-Axes scoring (~36%)
- 4 items were archive candidates (work shipped or
  semantic-duplicate)
- 4 items had body-vs-section priority inconsistencies
- 1 item had non-standard ID format
- 2 audit-body candidates were stale references to already-
  archived items

### Trigger criteria for the next audit

Schedule a re-prioritization session when **any of**:

1. **Substantial growth** since last audit: >= 20 new items
   filed
2. **Major phase close**: Phase 4 wraps; v1.0 cut; multi-session
   feature ships (e.g. Comics-Session-N + Mobile-Sync-N)
3. **Strategic-direction shift** explicitly declared by user
   (e.g. "we pivoting from picture-book to fiction")
4. **Quarterly cadence**: ~3 months since last audit even
   without strong trigger

### Audit deliverable shape

The audit's output is a SINGLE READ-ONLY document at
`docs/audits/backlog-reprioritization-YYYY-MM-DD.md`. Structure:

- Summary statistics (item count, distribution, changes
  proposed)
- Top-10 action list (highest-priority items)
- Cluster identification (items that ship together for less
  cost)
- Full re-prioritization table (per-item 4-Axes scoring)
- Archive candidates
- Open Questions for user-decision
- Methodology limitations

The deliverable is **NOT** an apply commit. The apply phase is
separate, follows user-adjudication of Open Questions, and is
its own multi-commit session.

### Audit-vs-Apply separation

Three reasons to keep audit + apply as separate sessions:

1. **User-adjudication latency**: Open Questions may take days
   to resolve. The audit doc captures the audit-state at a fixed
   commit; the apply phase consumes the adjudication.
2. **Audit doc as historical record**: even after apply lands,
   the audit doc documents WHY the changes were made. Future
   contributors (or LLMs) revisit it.
3. **Atomic commits**: audit = 1 commit (the doc); apply =
   N commits (per-cluster). Separating them keeps each commit
   focused.

### 4-Axes scoring shape (canonical)

Each item scored 1-5 across:

- **A1 User-Visible-Impact**: does shipping it produce user-
  visible value?
- **A2 Foundation-Impact**: does it unblock other items?
- **A3 Strategic-Alignment**: does it match current-quarter
  direction?
- **A4 Effort-Discounted-Value**: effort inverse-weighted by
  value

Sum is 4-20. Tier-map: 17-20 P1, 13-16 P2, 9-12 P3, 5-8 P4, 4
P5. Plus the Foundation-Override (now extended; see prior
section).

### Anti-pattern: priority-as-filed without re-audit

Priorities assigned at filing time + never re-audited produces
predictable drift:

- P3 grows to dominate the backlog (default-priority bias)
- P5 accumulates trigger-gated speculative items that never
  fire
- New users / fresh contributors / future-sessions can't tell
  what's important
- The "next session" decision happens by recency-bias rather
  than score

The periodic audit forces a fresh look. The cost is small
(1-2 hours per audit) and amortizes across many sessions
that follow.

### Pairs with

- `ai-workflow.md` "ROADMAP priority tiers" (the canonical
  tier semantics)
- `ai-workflow.md` "Continuous-archival rule" (the daily-
  hygiene sibling; re-prioritization is the periodic sibling)
- "Foundation-Override extension" (this file) — the override
  that the audit-methodology consumes

## Stale-bundle is the most common false-positive on post-ship user reports

Filed 2026-05-20 from the PAGES-CRUD-01 → Add-Panel cycle. After
a frontend-touching ship, if the user immediately reports the
just-shipped feature "doesn't work", **stale-bundle (η class) is
more likely than regression (β) or real-bug (ε)**. Cheap pre-check,
mandatory before any deeper investigation.

### The exact sequence that fired this rule

The PAGES-CRUD-01 close shipped a Create-First-Page button.
The very next user-action — Add Panel — was reported "geht nicht".
Live Playwright Chromium + ``getComputedStyle`` + full-page
screenshot all agreed: panel renders at 822×822 with the
auto-select highlight active. User's manual-test reported a
10px collapse. The reported book ID didn't exist in the dev DB.
The most-likely cause was a browser session running pre-ship JS
that wouldn't have shown the new visual feedback paths.

### Verification recipe (run BEFORE opening an investigation)

1. **Confirm HEAD.** ``git log --oneline -3`` matches the ship.
2. **Hard-reload + disable cache.** Browser DevTools → Network →
   "Disable cache" checkbox → ``Ctrl+Shift+R``. Confirm fresh
   bundle in Network tab.
3. **Reproduce on a fresh entity** (new comic_book, new page,
   etc.) — not the user's possibly-corrupted pre-ship row.
4. **Only then** open the investigation taxonomy (α-η).

### Diagnostic-Layer-Disagreement is data, not contradiction

When Playwright + getComputedStyle + screenshot agree, AND
manual-test disagrees, the disagreement points to *stale bundle*
or *data-corruption* or *environment-specific*, NOT "Playwright
is wrong". Treat agreement-across-three-DOM-layers as the
authoritative signal; the manual report is the input that
triggered investigation, not the verdict.

### Audit-First holds under user-pressure

When a user re-classifies a finding ("you're wrong, it IS a real
bug"), the right response is **demand evidence first** (computed
height, screenshot, HEAD SHA), THEN re-open the investigation.
Skipping straight to deeper investigation on a re-classification
risks shipping fixes for bugs that don't exist. The audit
discipline holds regardless of who's pushing back.

### Pairs with

- "User-perceived bug ≠ code bug: the perception-lag class"
  (this file) — the parent pattern; stale-bundle is a frequent
  perception-driver.
- "Pre-Coding-Reality-Check: re-audit at the keystroke" (this
  file) — same verify-before-act discipline, applied to the
  responding-to-a-bug-report surface.

## Plain `git status` before every commit, especially in Multi-Tool-Coordination sessions

Filed 2026-05-21 from a concrete incident during Phase 2
PANEL-CONFIG-01 C7. `git status` filtered by path (e.g.
`git status docs/`) hides files that are STAGED but live
outside the filter scope. In multi-tool-coordination
workflows where a parallel session can leave pre-staged
files in the index without committing them, the next
`git add <other-path>` + `git commit` will absorb those
pre-staged files silently — they end up in your commit
under your subject line, even though you never touched
them.

### Concrete incident

Phase 2 C7 (`954248e`) was intended to ship 2 docs/*
files. A paused parallel session (PluginForge v0.9.0
follow-up) had left 7 files staged in the index. The
filtered `git status docs/` showed only the 2 docs
files as not-yet-staged; the 7 already-staged files
outside docs/ were invisible. `git commit` shipped all
9 under the `docs(backlog): close ...` subject line.
Full audit-trail at
`docs/archive/journal/c7-absorption-note-2026-05-21.md`.

### Rule

Run **plain `git status`** (no path filter, no
`--porcelain`-but-grep) immediately before every
`git commit`. Read the FULL index state — both
"Changes to be committed" (staged) AND "Changes not
staged for commit" (unstaged). If either section
contains files you did not intend to ship in this
commit, STOP and reconcile before committing.

In single-tool workflows the discipline catches the
occasional stale staging from your own prior session.
In multi-tool-coordination workflows (parallel CC
sessions, user-side commits interleaving with
assistant commits) the discipline is load-bearing:
silent absorption of a parallel session's in-flight
files is the failure mode.

### Detection-vs-prevention

This rule is prevention, not just detection. A
post-commit audit can catch absorption (`git show
--stat HEAD` after each commit) but cannot un-ship it
non-destructively once pushed; force-push amendments
are destructive per CLAUDE.md safety rules. The pre-
commit `git status` check is the only point in the
workflow where absorption is cheap to prevent.

### Explicit-paths discipline (addendum 2026-05-23)

Filed alongside GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 C5
per user-directive: explicit-paths-staging is canonical
pattern for Multi-Tool-Coordination sessions, NOT an
ad-hoc-bypass for individual incidents.

**Rule:** during ANY session where parallel-session work
is in flight (staged renames, modified files, untracked
files NOT authored by the current session), every
`git add` invocation MUST name files individually by
absolute or relative path. The following commands are
FORBIDDEN in this context:

- `git add -A`
- `git add .`
- `git add --all`
- `git add <directory>/` where the directory contains
  parallel-session work

The shape is:

```bash
# CORRECT — explicit paths, file-by-file
git add backend/config/i18n/de.yaml backend/config/i18n/en.yaml
git add frontend/src/pages/GetStarted.tsx

# WRONG — absorbs parallel session's work
git add .
git add backend/  # may absorb parallel session's backend changes
```

**When to apply:**

The discipline fires whenever the pre-commit `git status`
shows EITHER staged files OR modified-unstaged files OR
untracked files that the current session did NOT author.
Concretely: any file in the index/working-tree that
wasn't touched by the current session is parallel-session
work and must be left alone.

**Concrete artefacts:**

- MULTI-PAGE-NAVIGATION-01 C5 (commit `90888df`,
  2026-05-23) — staged 3 files explicitly; left 3
  parallel-session HOOKSPEC files unstaged.
- GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 C1-C5 (commits
  `75f2ef6..(C5)`, 2026-05-23) — every commit's
  `git add` named files individually; 14 staged-renames
  + 3 modified docs + 1 untracked from a parallel session
  remained untouched throughout all 5 commits.

**Pairs with:**

- "Multi-tool collaboration tracking: re-sync before
  accepting new orders" — session-start sibling.
- The parent rule above (Plain `git status`) — the
  status-check is the trigger; explicit-paths is the
  action-shape that prevents the absorption.

**When this rule does NOT fire:**

Single-tool sessions where the entire working tree is
the current session's work. `git add -A` is fine there
(modulo the existing CLAUDE.md "stage specific files
to avoid sensitive files" rule which is about
security-class artefacts, not Multi-Tool-Coordination).

### `git add <paths>` does not scope the commit (addendum 2026-10-09)

Explicit-paths staging answers "what enters the index".
It says nothing about "what leaves it", and a pathless
`git commit` ships the WHOLE index - including anything
staged earlier in the session and then forgotten.

The shape, twice in one session on the same branch:

```bash
git checkout FETCH_HEAD -- docs/screenshots/*.png   # stages 5 files
# ... minutes of other work ...
git add e2e/feature-screenshots/capture-features.spec.ts
git commit -m "test(e2e): ..."      # ships the spec AND the 5 PNGs
```

Both commits were honest about the spec change and
silent about five binaries, which is worse than a messy
commit: the message is now a false description of the
diff, and a reviewer reading the subject has no reason
to look.

The mechanical safeguard is to name the paths on the
COMMIT, not only on the add:

```bash
git commit -F - -- e2e/feature-screenshots/capture-features.spec.ts
```

`git commit <paths>` commits exactly those paths and
leaves the rest of the index alone, so a stale staged
file cannot ride along no matter how long ago it was
added. `git checkout <tree> -- <paths>` and
`git restore --source` both stage what they write, which
is the most common way a file ends up staged and
forgotten.

The parent rule (plain `git status` before every commit)
catches this too - and did not, both times, because the
status check ran earlier in the chain rather than
immediately before the commit. Run it as the line above
the commit, not as the line above the work.

### `git status --short` hides the one line that mattered (addendum 2026-10-10)

The parent rule says PLAIN `git status`, and the word is
load-bearing. `--short` (and `-s`, and `--porcelain`) print
the file table and omit the header - which is where the
branch name lives.

A whole feature went to the wrong branch behind that
omission. The sequence: branch from `develop`, stash the
work to go handle another PR, come back, `git checkout
<branch> && git rebase develop`, then - later, after another
`git checkout develop` for the other PR's merge - `git stash
pop` and keep working. The pop restored the files; it did not
restore the branch. Every `git status --short` from then on
showed exactly the right files and never said `On branch
develop`.

The commit landed on local `develop`. The follow-up `git push
-u origin <branch>` then SUCCEEDED, pushing the branch at its
real head, which carried none of the work - and a push that
pushes nothing prints nothing alarming. The workflow
dispatched against that branch failed with `Error: No tests
found`, which reads like a config problem and is actually
"the file is not in this commit".

Two things follow:

- **Run `git status` with no flags as the line above the
  commit.** The file table is the part a `--short` run gives
  you; the header is the part that catches a branch you did
  not mean to be on. `git branch --show-current` answers the
  same question in one line when the table is noise.
- **After `git stash pop`, re-check the branch.** A stash is
  branch-agnostic by design: it pops wherever HEAD happens to
  be, and the working tree afterwards looks identical either
  way. Any `checkout` between the stash and the pop is a
  place this can happen.

Cheap to repair while nothing is pushed: `git reset --hard
origin/develop` on the polluted local branch after
cherry-picking the commit where it belongs. The repair cost
scales badly the moment that `develop` gets pushed, which is
the version of this worth preventing.

### Pairs with

- "Multi-tool collaboration tracking: re-sync before
  accepting new orders" (this file) — same family.
  That rule covers session-start re-sync; this rule
  covers commit-time re-sync. Both prevent silent
  drift between parallel agents.
- "Hotfix cluster tag policy" (this file) — same
  spirit. The cost of preventing a bad commit is
  always lower than the cost of recovering from it
  non-destructively.

## Audit-Methodology: design-intent-axis as 5th-Axis or Override-Filter

Filed 2026-05-23 from two RCU-audit incidents within 48 hours.
The 4-Axes scoring (Site-count, Drift-Risk, Extraction-Ease,
Downstream-Value) carries an implicit implementation-identity-
bias: scores HIGH on byte-identical clones, but misses cases
where the cloning is INTENTIONAL per documented design-intent.

### Two evidence-cases

1. **useSelection<T>() (score 16) — DEFERRED-PERMANENT.**
   Three byte-identical hooks; `diff` returned only doc-
   comment differences. But those doc-comments contained
   the anti-extraction-rationale at [useBookSelection.ts:7-10](../../../frontend/src/components/book/useBookSelection.ts#L7-L10):
   *"Kept as a separate hook (rather than a generic
   `useSelection`) so that future per-entity divergence ...
   lands in one place without a cross-entity refactor."*
2. **AUTHOR-DATALIST-EXTEND-EDITORS-01 — DEFERRED UX-
   ADJUDICATION.** The pair-shipping intent proposed
   REPLACING existing Pattern B (closed-list profile-select)
   with Pattern A (datalist + free-text) at editor surfaces
   — a UX trade-off (safety vs flexibility), not a
   mechanical migration.

Both were caught by Pre-Coding-Reality-Check, NOT by the
audit. An audit-methodology that scored design-intent
explicitly would have caught them upstream.

### Mitigation: override-filter (preferred over 5th-axis)

Future audits apply BEFORE 4-Axes scoring: grep doc-comments
for design-intent markers ("Kept as separate", "deliberate.*
separate", "not extract", "intentional", "no synthetic
merge"). Matches are filed as candidates but excluded from
the ranked extraction sequence until explicit user-
adjudication.

Override-filter chosen over a 5th-axis because the grep
takes seconds while carrying a 5th axis through every
candidate's scoring adds methodology overhead for marginal
benefit. Recipe lives in the audit's 2026-05-23 footnote.

### Pairs with

- "Pre-Coding-Reality-Check: re-audit at the keystroke" (this
  file) — keystroke-time safety net for any audit that
  already missed the design-intent marker.
- "Recurring-Component Unification Rule"
  (`coding-standards.md`) — the 2-surfaces threshold the
  4-Axes scoring derives from; design-intent is the override
  to that threshold.
- `docs/audits/recurring-component-audit-2026-05-21.md`
  footnotes 1 + 5 — the two concrete incidents driving this
  filing.

## Never `rm -rf` a path you did not create - especially shared `.claude/worktrees`

Filed 2026-06-18. While diagnosing a (false-positive) cohesion failure I ran
`rm -rf .claude/worktrees 2>/dev/null && echo "..."` "to test" - the `&&`
construct executed the `rm`, deleting the working checkout of a PARALLEL
session's git worktree (`docs/configuration-local-paths-419`).

Recovered with no real loss: the worktree's branch + its one commit were on
`origin` (and already merged to develop via its PR), and `.git/worktrees/`
metadata survived (only the checkout dir was removed), so
`git worktree prune` + `git worktree add <path> <branch>` rebuilt it. Only
uncommitted changes in that worktree would have been unrecoverable.

Rules this reinforces:

- A destructive `rm`/`git clean`/`git reset --hard` must never be hidden
  inside a diagnostic `&&`/`||` chain "just to test". If you would not run
  the `rm` on its own line with intent, do not chain it.
- `.claude/worktrees/` is SHARED multi-session state (the user runs parallel
  sessions in isolated worktrees). Never delete, prune, or `rm` anything
  under it without confirming which session owns it. The cohesion check
  scanning into `.claude/worktrees/` was a tooling false-positive, not a
  reason to delete the directory.
- Pairs with the existing memory `[[feedback_parallel_session_shared_head]]`
  and the "Plain git status before every commit" rule: parallel-session work
  is live and must be treated as untouchable unless you created it.

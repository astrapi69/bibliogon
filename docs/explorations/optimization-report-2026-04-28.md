# Bibliogon optimization report — 2026-04-28

Author: Claude (CC), post-v0.24.0 release.
Audience: future Aster + future CC.
Purpose: opinionated prioritized list of what to invest in next.
Not a roadmap commitment — input for the next planning round.

Tone is direct on purpose. Numbers verified at the time of writing
per `ai-workflow.md` rules; re-verify before acting on stale data.

---

## State at v0.24.0

- 1197 backend + plugin pytest, 664 frontend Vitest, 19 smoke specs.
- 10 first-party plugins, all MIT, all free.
- 5 AI providers (anthropic, openai, google, mistral, lmstudio).
- 8 UI languages, help only DE+EN.
- 3 launchers shipped (Win/macOS/Linux), all unsigned.
- Article authoring + Publications + drift detection shipped.
- Plugin-git-sync PGS-01..05 + 3 follow-ups shipped.
- DEP-02 (TipTap 3) + SEC-01 (vite-plugin-pwa) upstream-blocked.

Strong codebase. The gaps below are mostly polish + adoption +
defensive hygiene, not architectural debt.

---

## Top 5 quick wins (each 1-3 days)

### 1. .bgb integrity check — actual checksums

Two competitive reports both claimed `.bgb files contain ... checksums`.
They don't. Manifest exists, no SHA. For a backup format used by
sensitive manuscripts this is a real gap. Add a `checksums` block
to `manifest.json` (sha256 per file), verify on import, surface
mismatches as a typed `BackupIntegrityError`. ~1 day.

Why: one of the few places where the marketing claim is currently
ahead of the code. Easy to close. Strengthens institutional-user
pitch.

### 2. KDP color-profile validation

Cover validator currently checks dimensions + DPI. Both reports
implied color-profile enforcement; KDP actually rejects RGB covers
on print uploads. Add a Pillow ICC-profile read + warn-if-RGB for
`book_type=paperback`. ~1 day.

Why: matches KDP's actual gate. One more reason to use the plugin
instead of guessing.

### 3. Local pre-commit catches the CI failures

v0.24.0 release was held up by ruff format + mypy red on `main`.
Pre-commit hooks exist but ruff format wasn't running on edits — it
only runs on staged files, and mypy isn't in the hook list at all.
Add `mypy app/` as a hook (with paths-to-mutate guard so it stays
fast). Document the install step in `make install`. ~0.5 day.

Why: every CI red blocks release. Local catches every push. We
already hit this twice this cycle.

### 4. Article validation log priming

AR-01 validation log is the gate for AR-03+ platform APIs. The log
file at `docs/journal/article-workflow-observations.md` is empty.
Aster cross-posts; just write down what hurts each time. Three
entries unblock AR-02 platform-API priorities.

Why: passive task that's blocking active planning. Two-line entries
per real publication beat zero entries waiting for perfection.

### 5. README screenshot refresh

README still shows the v0.21.x dashboard. Screenshots referenced in
`docs/help/SCREENSHOTS-TODO.md` haven't been re-shot since articles
landed. Fresh screenshot of the article editor + publications
panel. Github landing page is the conversion funnel for non-
technical users. ~0.5 day.

Why: free conversion lift. Visual is the first impression; the dash
hasn't matched reality for two minor versions.

---

## Medium-term investments (1-2 weeks each)

### M-1: Frontend smoke depth

19 smoke specs is shallow given 11 plugins + 6 page types. Articles
have 2 specs. Books have 4. Settings has 1. Trash flow has 1. Real
regression risk lives in cross-plugin paths (article -> publish ->
back to editor; book -> export -> reimport). Triage existing specs,
identify the 5 highest-risk untested cross-plugin flows, write specs
for each. Don't go for total coverage; go for the flows where a
silent break costs the user data.

### M-2: Help docs in 8 langs (auto-translated, human-verified DE/EN)

Help only DE+EN. The other 6 UI langs land users on English help.
Pipeline: render help markdown → DeepL via existing translation
plugin → publish to `docs/help/{lang}/` with `AUTO_TRANSLATED.md`
banner. UI labels + help content stay in lockstep. ~1 week. Risk:
auto-translated technical text drifts; mitigate by re-running on
help-content commits (CI hook).

### M-3: Mobile read-only / triage view

Bibliogon has no mobile story. Reedsy has it. Atticus has it.
Full mobile authoring is out of scope; mobile triage (read article
status, mark a publication verified, see drift flags) is in scope.
Existing React + Radix already responsive-capable. Audit what
breaks below 600px viewport. Patch the 5 most-broken page layouts.
~1 week.

Why: defends the "I write everywhere" pitch without adding native
app surface.

### M-4: One-click installer beyond Docker

Launcher exists but still assumes Docker on the host. Docker
Desktop install on Windows is itself a multi-step process for
non-technical users. Two paths:

- **Path A:** Docker-bundled installer (Windows MSI or macOS pkg)
  that installs Docker Desktop + Bibliogon together. Larger
  surface, more breakage modes, but matches "Atticus-easy".
- **Path B:** Tauri shell that bundles backend (Python via PyOxidizer
  or similar) + frontend without Docker. Was previously ruled out;
  may need re-evaluation now that articles + publications widen
  the user base.

Pick one. ~2 weeks for Path A, ~3-4 weeks for Path B.

### M-5: Plugin marketplace UX

Plugin install via ZIP works but there's no discovery surface.
Settings > Plugins lists only what's already installed. Add a
"Browse plugins" tab that reads from a curated `plugins.json` URL
(self-hosted on github.io). v1 catalog = the 10 first-party plugins
with descriptions + screenshots. Future: community submissions.
~1 week.

Why: extensibility is the differentiator vs Scrivener/Atticus/Vellum
but unless the user can find the plugins, the differentiator is
invisible.

---

## Strategic questions to resolve

These aren't "do X tomorrow"; they're "decide before next big
investment".

### S-1: AR-03+ platform APIs — start with which platform?

When AR-01 data lands, the question becomes which platform's API to
wire first. Medium killed its API; Substack has none; X requires
paid tier; LinkedIn API is enterprise-only; dev.to + Mastodon +
Bluesky are the realistically-implementable ones. The cheapest
v1 may be "scheduled clipboard" (generate platform-specific
markdown + open the platform's compose URL with prefilled body).
Not a real API integration but solves 80% of the workflow at 5%
of the cost.

### S-2: Bibliogon as CMS?

Articles + Publications + drift detection inch toward a CMS shape.
If the user base reports cross-posting as the core pain, the next
big move is a publish queue + cron-driven verify-live + RSS
generation. Resist if the user base reports book authoring as the
core pain.

The validation log (AR-01) decides this. Don't pick before the
data lands.

### S-3: Shared author profile across books + articles

Author entity exists in settings. Books carry a copy. Articles
carry a copy. Drift between the three is already a thing (saw it
in qwen's "verify with vendor" pricing claim — same pattern). Move
to a single `Author` row referenced by both `Book.author_id` and
`Article.author_id`. Migration is straightforward. The blocker is
the .bgb format — older backups need a translation layer. ~1 week
of careful work; don't do it under release pressure.

### S-4: Test pyramid balance

1197 backend vs 664 frontend is a 1.8x imbalance. Per the coverage
audit guidance, frontend should not be subordinate. Frontend has
~70 components and 664 tests; that's ~9 tests per component.
Healthy by line count, but the cross-component flows are
under-tested (M-1 above is the smoke half of this). The unit test
half: identify the 10 most-used components and ensure each has at
least 1 happy + 1 error test. Most are already there; spot-fill the
gaps.

---

## Maintenance sweeps (do in batches, not as standalone work)

- **MAINT-A:** plugin pyproject lockfile drift. Path-installed
  plugins cache transitive deps in backend's `poetry.lock`. After
  any plugin pyproject change, run `poetry lock` + `poetry install`
  in backend too. Lessons-learned already captures this; just don't
  forget.
- **MAINT-B:** UI string sweep. With 8 langs + frequent feature
  churn, the i18n YAML files drift. Run a "missing key in lang X"
  check across all 8 langs and surface unfilled keys as a CI
  warning (not error).
- **MAINT-C:** dependency currency. Run `poetry show --outdated` in
  backend + every plugin + launcher; `npm outdated` in frontend.
  Apply patch + minor bumps as a single chore commit. Defer major
  bumps (DEP-02 etc.) to dedicated sessions.
- **MAINT-D:** dead settings audit. `architecture.md` says no
  hidden settings; reality drifts. Annual audit: every key in
  `config/plugins/*.yaml` either has a UI surface or a `# INTERNAL`
  comment.
- **MAINT-E:** smoke catalog freshness. `docs/manual-tests/` index
  references specs; verify each referenced spec still exists.

Bundle these into one "spring cleaning" commit per minor release.

---

## What NOT to optimize (resist temptation)

These look like obvious wins but cost more than they return.

### Real-time collaboration

Reedsy has it. Bibliogon doesn't. Adding it would require
operational-transformation infrastructure, server state, and a
fundamental shift away from local-first. Wrong move. The local-
first pitch is the differentiator; collab is the wrong audience.

### iOS / Android native app

Tempting because Reedsy + Atticus have mobile. Native apps =
separate codebase, separate release cycle, separate testing matrix.
Better to invest M-3 (mobile responsive triage) first and see if
demand warrants more.

### Premium plugin tier

Licensing infrastructure exists but is dormant
(`LICENSING_ENABLED = False`). Turning it on creates two-tier
ecosystem complexity for negligible revenue. Donations-first
strategy already in `docs/explorations/donations-ux.md` is the right
path. Revisit only when the user base is order-of-magnitude larger.

### Custom editor framework

TipTap + DEP-02 friction is real but not architecturally damaging.
Replacing TipTap with a custom editor would burn a quarter of dev
time to land where TipTap 3 lands for free. Wait for upstream.

### Cloud sync

WebDAV/Nextcloud sync plugin sounds appealing but every user who
asks for it actually wants the simpler thing: a "make sure my git
backup ran" badge. PGS-02..05 already covers the actual workflow.

### Visual polish parity with Vellum

Vellum runs Mac-only with hand-curated templates by a small team
that does nothing else. Competing on polish means hiring a designer.
Compete on extensibility instead — let users + community add
templates via plugins.

---

## Top 3 if I had one week

If I had to pick three things from the above for a single
focused week:

1. **Quick win #1: .bgb checksums.** Closes a marketing gap, real
   integrity improvement, ~1 day.
2. **Medium-term M-1: smoke depth on 5 cross-plugin flows.**
   Highest regression risk per hour. ~2-3 days.
3. **Quick win #5: README screenshot refresh.** Free conversion
   lift, blocks marketing campaign for v0.24.0 if not done. ~0.5
   day.

Total: ~4 days. Leaves 1 day buffer for whatever surfaces during
M-1.

---

## Anti-recommendations

Things explicitly not in this report that someone might ask about:

- **Don't pin DEP-02 timeline.** Already deadline 2026-05-05;
  fallback path documented. Doing more planning around it now
  doesn't help.
- **Don't write Scrivener migration guide yet.** No requested user
  has it. Speculative work. Wait for one user to ask.
- **Don't deepen audit infrastructure.** The current
  `docs/audits/current-coverage.md` cadence is right. More tooling
  is overhead.
- **Don't design plugin marketplace v2 features.** v1 (M-5) is a
  static `plugins.json`. Don't pre-design submissions, ratings,
  versioning. Ship v1, learn, iterate.

---

## Closing observation

Bibliogon is in a comfortable post-feature-burst state. The biggest
risk now isn't missing features — it's losing the discipline that
got it here:

- One commit per logical change.
- Every release green.
- Documentation in lockstep with code.
- Lessons-learned captures pain so it doesn't recur.

Optimization should reinforce that discipline, not weaken it. The
quick wins above are concrete; the strategic questions are
deliberately undecided. Pick from this list when planning time
arrives, not from a what-shipped-recently bias.

# Bibliogon v0.24.0: Authoring Software That Behaves Like Software

*Version control, multi-language sync, drift detection, and a plugin
system — applied to the workflow of writing books and articles.
Now with first-class article support.*

---

When self-publishing tools rebuild the same workflow primitives that
software engineers have had for thirty years — version control,
branching, merge conflicts, content drift — and call them new, they
look more like inherited assumptions than purposeful design.
Bibliogon takes the opposite stance: assume an author wants Git, a
typed schema, a plugin API, and reproducible builds; then make the
authoring affordances ride on top.

v0.24.0 (released 2026-04-28) is the first version where that stance
covers both books and articles. The article authoring layer
inherits the same machinery the book layer already had: a per-book
Git repository, three-way smart-merge with per-chapter conflict UI,
automatic multi-language linking via branch names, and content
drift tracking. None of these are bolted on after the fact —
they're shared primitives.

This piece is a competitive analysis. The format below is what I
ran through internally before writing: claims first, sources next,
verdict last.

---

## What v0.24.0 actually ships

Five things land together in this release. Each is a small thing on
its own. The combination is what matters.

**Article authoring as a first-class feature.** A new `Article`
entity sits alongside `Book`, with its own editor, status lifecycle
(`draft → ready → published → archived`), SEO metadata, topic
dropdown, and tag list. Articles are standalone documents, not book
chapters. They share the same TipTap-based editor as books but with
plugin gating: a `contentKind` prop selects which extensions and
which AI prompts apply to the current document. A book chapter and
a blog post live in the same UI but get different tooling.

**Publication tracking with content-snapshot drift detection.**
Each `Publication` row links an article to an external platform
(Medium, Substack, X, LinkedIn, dev.to, Mastodon, Bluesky, or a
custom platform), captures a snapshot of the article body at
publish time, and on every read flags the publication as
`out_of_sync` if the live article diverges from the snapshot. The
platforms are defined as YAML schemas — adding a new platform is a
data edit, not a code change.

**Editor-parity Phase 1-3.** The shared editor extracted into a
reusable component, ms-tools quality checks running per-article
(no code change required — the existing endpoint already accepted
an article ID), translate-article wired through the existing
translation provider abstraction, and article export to Markdown,
HTML, PDF, and DOCX. Articles now have feature parity with books
on every editor surface that makes sense.

**Save as new chapter.** Third option in the chapter conflict
dialog: when a save races a competing edit, the user can keep their
local version, take the server version, or fork the local version
into a fresh chapter inserted directly after the current one.
Closes a real data-loss vector — the conflict dialog previously
forced an either/or choice.

**Plugin-git-sync follow-ups.** Per-book PAT credential isolation
(the token never lands in `.git/config`), `mark_conflict` resolution
in the smart-merge diff (write both versions as a visible conflict
block), and surfaced "skipped branches" reporting in multi-language
imports. These are sharper edges on the v0.23.0 git-sync rollout
that close real workflow gaps.

In numbers: 1197 backend + plugin tests pass, 664 frontend Vitest
tests pass, 19 Playwright smoke specs cover critical user flows,
73 commits since v0.23.0, four new Alembic migrations.

---

## The five differentiators no competitor has

I've spent the last week reading what Scrivener, Atticus, Vellum,
and Reedsy Studio actually do, then verifying what Bibliogon
actually does in code. The five things below are not marketing
spin — they are observable in the repository at
`github.com/astrapi69/bibliogon` and trivially absent from the
competition.

### 1. Per-book Git repository as a native primitive

When an author opens a book in Bibliogon, that book has a `.git`
directory. The frontend Git Backup dialog exposes commit, push,
pull, branch, sync status, and force-push (with a confirm). The
plugin-git-sync plugin layers on top: import an existing
write-book-template Git repository, sync edits back as Markdown
chapters, run a three-way smart-merge when the local DB and the
remote repo have both moved.

This isn't "cloud backup with extra steps." It's actual Git, with
remotes pointing at GitHub or GitLab or a self-hosted Gitea, with
PAT-based authentication that uses one-shot pushurl injection so
the token never lands in `.git/config`, with SSH key generation
built into the settings panel.

No other authoring tool exposes these primitives. Scrivener stores
.scriv bundles in Dropbox. Atticus stores in its cloud. Vellum
stores in a proprietary local format. Reedsy Studio stores on
their servers. Bibliogon stores in Git, the user's choice of host,
encrypted with the user's keys.

### 2. Branch-driven multi-language linking

PGS-04 in v0.23.0 added an `Article.translation_group_id` (and
`Book.translation_group_id`) column. A repository with branches
named `main`, `main-de`, `main-fr`, `main-es` gets imported as four
linked books — one per branch — automatically grouped by a shared
UUID. The Translation Links panel in the metadata editor surfaces
the group: clickable language badges that navigate between
siblings, an unlink button, and an Add to group flow that lists
every other book.

This is what authors maintaining translated editions actually need:
each language is a real book in its own right, but the relationship
is preserved and editable. No master-translation hierarchy. Flat
peer linking.

I have not seen any other authoring tool support this. The closest
analogues are CAT tools (translation memory software) — but those
treat each language as a derived view of a source, which is exactly
the wrong model for trade authors who localize aggressively.

### 3. Three-way smart-merge with per-chapter conflict UI

PGS-03 in v0.23.0 ships a real three-way diff service. When the
local DB and the remote repo both moved since the last sync, the
merge UI classifies each chapter into one of nine states:
unchanged, remote_changed, local_changed, both_changed,
remote_added, local_added, remote_removed, local_removed,
or — added in PGS-03-FU-01 this cycle — `mark_conflict` (write both
versions as a visible conflict block) and `renamed_*` (paired
remove + add with matching body).

The user resolves each row with a Keep / Take / Mark dropdown. The
backend applies the resolutions, bumps the imported-commit SHA,
and the next diff starts fresh.

This is version control for authors. Not "auto-saved revisions"
(Scrivener), not "cloud history" (Reedsy), not "multiple drafts in
folders" (Vellum). Real merge resolution at the chapter level.

The fact that this also exists for the in-app conflict dialog
(PS-13 "Save as new chapter," shipped this cycle) means the same
philosophy applies even to the routine case where two browser tabs
race a save.

### 4. Multi-provider AI with per-book cost tracking

Bibliogon's AI module supports five providers: Anthropic, OpenAI,
Google, Mistral, and LM Studio (for local models via Ollama-style
endpoints). The provider list is in `backend/app/ai/providers.py`
and adding a new one is a 20-line preset definition.

The integration tracks token usage per book — `Book.ai_tokens_used`
is a column, not an audit log. Cost estimates are computed from
provider-specific pricing tables, surfaced in the AI panel, and
exportable for tax / accounting purposes (writers who treat
AI-assisted drafting as a deductible expense have asked for this).

Reedsy's AI features are tied to a single provider on their
servers. Atticus has limited AI assistance. Scrivener and Vellum
have none. None of them expose the cost.

The per-book scoping matters because writers using local LLMs for
privacy and cloud LLMs for quality can quantify the difference. A
chapter drafted on a local Llama vs the same chapter rewritten via
Claude is a measurable choice, not a vibe.

### 5. Plugin architecture with a separately-distributed framework

PluginForge — the plugin framework Bibliogon uses — is a separate
PyPI package (`pluginforge==0.5.0`). Bibliogon depends on it; the
package itself is application-agnostic and could power other
plugin-based Python apps. The architecture decision was to keep
the framework outside the app boundary so it survives Bibliogon
version churn and so plugin authors have a stable target.

Inside Bibliogon, the plugin system handles ten first-party
plugins: audiobook (TTS via manuscripta), export (EPUB/PDF/DOCX),
getstarted (onboarding tour), git-sync (write-book-template repo
import), grammar (LanguageTool), help (in-app help), kdp (cover +
metadata validation), kinderbuch (children's-book layouts),
ms-tools (style + sanitization), translation (DeepL + LMStudio).
All MIT-licensed, all currently free. Third-party plugins install
via ZIP through Settings.

No competitor ships a plugin system. This is the long-term moat.
Closed ecosystems have a feature ceiling defined by their
maintainers. Bibliogon's ceiling is defined by what Python +
FastAPI + React can do.

---

## Comparison matrix (verified)

The matrix below excludes claims either competitive analysis I've
seen got wrong — Bibliogon's `.bgb` backups have a `manifest.json`
but no checksum verification, the KDP plugin validates cover
dimensions and DPI but not color profile, and the test counts I
list are the ones I ran today.

| Criterion | Bibliogon v0.24.0 | Scrivener 3 | Atticus | Vellum | Reedsy Studio |
|-----------|-------------------|-------------|---------|--------|---------------|
| Pricing | MIT, free | ~$59 USD per platform | $147 lifetime | $199-$249, Mac only | Free + premium |
| Platforms | Linux, Windows, macOS via Docker + native launcher | Win, Mac, iOS | Web + PWA | Mac only | Web only |
| Offline | Full | Full | Limited (PWA) | Full | None |
| Books | Yes | Yes | Yes | Yes | Yes |
| Articles, first-class | **Yes** | No | No | No | No |
| Per-book Git | **Yes** | No | No | No | No |
| Multi-language linking | **Yes (branch-driven)** | No | No | No | No |
| Three-way merge | **Yes (per chapter)** | No | No | No | No |
| Drift detection (publications) | **Yes** | No | No | No | No |
| Multi-provider AI + cost tracking | **5 providers, per-book tokens** | None | Limited | None | Limited |
| Plugin architecture | **PluginForge, 10 plugins** | None | None | None | None |
| KDP cover validation | Dimensions + DPI | No | Manual | No | No |
| Real-time collaboration | None | None | None | None | **Yes (premium)** |
| UI languages | 8 | macOS spell-check | English | English | English |
| Open source | **MIT** | No | No | No | No |
| Test count | 1197 backend + 664 frontend | Closed | Closed | Closed | Closed |

Bold marks where Bibliogon stands alone. Two columns where it
clearly loses are real-time collaboration (Reedsy wins) and
zero-friction onboarding (Atticus and Reedsy win).

---

## Where Bibliogon loses

Honest assessment, written from the same repository state as the
above.

**Onboarding friction.** Docker on the host is a real barrier for
non-technical users. The native launcher (`launcher/`) helps —
v0.17 shipped Windows / macOS / Linux PyInstaller binaries with
auto-update — but the launcher still assumes Docker is installed.
"Install Docker Desktop" is a multi-step process that an author
who just wants to write a book should not have to learn. This is
solvable; it isn't solved yet.

**Visual export polish.** Vellum's PDFs are typeset to a standard
that nobody else hits. Bibliogon's PDFs are functional and pass
KDP's print-ready check, but they don't have hand-curated
templates by a designer who does nothing else. This is a deliberate
trade-off (extensibility over polish), and it's the right trade-off
for the user base, but it's worth saying out loud.

**Mobile authoring.** There is no story. Reedsy works in mobile
browsers. Atticus is browser-based. Bibliogon's React UI degrades
below 600px viewport in non-trivial ways. A read-only triage view
for status checks and publication verification would close most of
the gap; a full mobile editor probably never makes sense.

**Real-time collaboration.** Reedsy uses operational transformation
to allow multiple users to work on a manuscript at the same time.
Bibliogon is local-first by design — the entire architecture would
have to shift toward server-mediated state to support this. The
plugin-git-sync workflow (commit → push → coauthor pulls) is the
local-first equivalent, but it requires Git fluency.

**Ecosystem maturity.** Scrivener has fifteen years of community
templates, video tutorials, and third-party integrations. Bibliogon
has eight months of active feature development and a plugin
framework that, while documented, has zero published third-party
plugins yet. This is a function of time, not architecture.

---

## Who should use Bibliogon

The five differentiators above are filters, not advertisements.
They name the audience.

**Multi-format authors.** Writers who publish books and articles in
the same workflow. Bibliogon is currently the only tool that
treats both as first-class.

**Translators and multilingual authors.** Anyone maintaining
parallel editions in three or more languages. Branch-driven linking
plus the translate-article endpoint is a pipeline, not a feature
list.

**Technical authors and small publishers.** People who have
hit a feature wall in a closed tool and wanted to build the missing
piece. Bibliogon's ZIP-installable plugin system is the only path
of its kind in this space.

**Privacy-conscious or institutional users.** Authors handling
sensitive manuscripts, archival concerns, no-SaaS policies. Local
SQLite plus encrypted credentials plus user-controlled Git remotes
is a substantively different security model than any competitor.

**AI-aware authors.** Writers who want provider choice, local LLM
support, and observable cost tracking. This is the audience that
will adopt local Llama for the first draft and a frontier model
for the final pass — and want to see the difference in tokens.

The audience for whom Bibliogon is the wrong choice is also clear.
Authors who want one-click setup and don't care how the tool works
will pick Atticus or Reedsy. Authors who want the most polished
print PDF on macOS will pick Vellum. Authors who want real-time
co-editing with their editor will pick Reedsy. Authors who have
ten years of muscle memory in Scrivener and don't see a reason to
move will stay there. None of these are wrong calls. Bibliogon
isn't trying to be the universal choice.

---

## What's next

The article authoring track ships AR-01 Phase 1, AR-02 Phase 2,
AR-02 Phase 2.1, and Editor-Parity Phases 1-3 in v0.24.0. The
unchecked items are AR-01 validation log (passive — fills as the
feature is used), AR-03+ platform APIs (blocked on the validation
data showing which platforms actually matter), and a handful of
deferred polish items.

The plugin-git-sync track is feature-complete through PGS-05.
PGS-02-FU-01, PGS-03-FU-01, and PGS-04-FU-01 closed in this
release.

DEP-02 (TipTap 2 → 3 migration) is upstream-blocked and tracked.
SEC-01 (vite-plugin-pwa CVE chain) is dev-only exposure with
production bundle clean. Both have a fallback path.

The next planning round will pick from the optimization report at
`docs/explorations/optimization-report-2026-04-28.md`. Top
candidates: `.bgb` integrity checksums, frontend smoke depth on
cross-plugin flows, help docs in all 8 UI languages, and a mobile
read-only triage view.

---

## Try it

- **Latest release:** [github.com/astrapi69/bibliogon/releases/tag/v0.24.0](https://github.com/astrapi69/bibliogon/releases/tag/v0.24.0)
- **Documentation:** [astrapi69.github.io/bibliogon](https://astrapi69.github.io/bibliogon/)
- **Source:** [github.com/astrapi69/bibliogon](https://github.com/astrapi69/bibliogon)
- **Issues and feature requests:** GitHub Issues

The repository ships a Makefile target for every common workflow:
`make install` for first-time setup, `make dev` for local
development, `make test` to run the full test suite, `make prod`
for the Docker Compose deployment.

If you write books, articles, or both — and you've ever felt like
your authoring tool should behave more like the rest of your
software stack — give it an evening.

---

*Bibliogon is MIT-licensed and developed in the open. Every
contributor commit is visible in the repository. The v0.24.0
release is the work of one solo developer (Asterios Raptis,
human, Greek-German, Linux user) plus AI assistance through
Claude Code. The competitive comparison above was drafted
collaboratively and verified against the actual repository state
on 2026-04-28.*

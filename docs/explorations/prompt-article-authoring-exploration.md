# Write exploration document: Article Authoring in Bibliogon

## Context

Bibliogon is positioned today as a **book authoring tool**. Aster
(the project lead and primary user) has started writing articles
about Bibliogon on Medium, Substack, and LinkedIn as part of
project outreach. The manual cross-posting workflow surfaced a
potential product expansion: could Bibliogon itself be the tool
used to author those articles?

This exploration documents the idea WITHOUT committing to an
architecture or implementation. The goal is to capture the
thinking at a moment when the product-scope question has become
real, so that later decisions are informed by structured analysis
rather than impulse.

**Distinct from the children-book-plugin exploration:** that
document was "architecture decided, implementation deferred."
This document is earlier in the lifecycle: **"idea captured,
validation needed before any architecture decision."**

---

## Scope

Single file to create:
`docs/explorations/article-authoring.md`

Single commit:
`docs(explorations): article authoring as a potential Bibliogon feature`

No code changes. No ROADMAP entries. No plugin scaffolding. No
architecture committed.

Target length: 200-300 lines. Longer than children-book-plugin
because the scope question is still open and multiple options
need genuine comparison. Shorter than 400 lines because it is
exploration, not specification.

---

## Document structure

### Section 1: Origin of the idea

Brief context on how this idea surfaced:

- Aster publishes Bibliogon release articles on Medium
- Cross-posting to Substack and LinkedIn requires manual rework
  (SEO metadata, preview images, different lengths, platform-
  specific framing)
- During the v0.19.1 article workflow, the thought surfaced:
  "This is the kind of structured, AI-assisted, multi-format
  publishing workflow Bibliogon already solves for books.
  Could it solve it for articles?"

The idea is worth documenting because it represents a potential
product-scope shift: from "book authoring tool" to "content
authoring tool." That is not a trivial rebrand; it has
architectural, positioning, and business-model consequences.

### Section 2: What articles share with books

Non-trivial overlap:

- Structured prose as primary content
- Metadata (title, subtitle, tags, author, date)
- Rich text editor (TipTap already works)
- AI assistance (review, style, grammar)
- Versioning (draft → revision → published)
- Language support (i18n)
- Export to multiple formats

These overlaps explain why Bibliogon looks like a plausible host
for article authoring. Roughly 60-70% of the book infrastructure
applies without modification.

### Section 3: What articles do NOT share with books

Significant divergences that matter:

- **Scale:** articles are 800-2500 words; books are 30,000-100,000+
- **Iteration speed:** articles have fewer drafts, shorter feedback
  cycles, faster publication
- **Publication target:** articles go to web platforms (Medium,
  Substack, dev.to, personal blog) with platform-specific metadata
  requirements (SEO title/description, tags, canonical URLs,
  Open Graph data). Books go to KDP, IngramSpark, etc.
- **Cross-posting:** articles are often published on multiple
  platforms with slight variations. Books are published once per
  edition per platform.
- **No chapters:** articles are single-document, not multi-
  chapter. Bibliogon's ChapterType enum with 31 values is
  irrelevant.
- **No ISBN, no DOI, no audiobook version, no KDP cover
  validation.** Articles have their own metadata ecosystem
  (URL slugs, canonical URLs, Open Graph tags).
- **Comment/discussion integration:** platforms like Medium,
  Substack, dev.to have native comment systems. Books do not.
- **RSS/Atom feeds:** articles live in a syndication ecosystem.
  Books do not.
- **Much shorter lifecycle:** an article is written in hours,
  published in days, relevant for weeks. A book is written in
  months, published once, relevant for years.

### Section 4: User's current article workflow

Document what Aster does TODAY when writing a Bibliogon article,
based on the v0.19.1 experience (this is inferred from the
conversation; the exploration can use this as a best-effort
baseline and mark it as "needs validation with actual observation"):

1. Write draft in chat with AI assistant
2. Get feedback, iterate
3. Copy final version to a local markdown file
4. Generate images via Midjourney with separate prompts per
   platform aspect ratio
5. Copy to Medium, fill in SEO title + description (platform-
   specific), pick tags
6. Adapt for Substack (add preamble, adjust CTA, re-copy)
7. Adapt for LinkedIn (shorten dramatically, write inline post
   text)

Estimated total time per article: 1-3 hours depending on length
and number of platforms.

Flag in the document: this workflow description is based on a
single observed release cycle. Validation would improve accuracy.

### Section 5: Pain points that a tool could address

Categorize pain points by whether they are tool-solvable or
workflow-solvable:

**Tool-solvable (automation potential):**
- SEO metadata templates per platform (Medium wants X, Substack
  wants Y)
- Variable substitution for titles/descriptions per platform
- Image aspect ratio regeneration from a single prompt
- Cross-post tracking (which version is live where, last
  updated when)
- Archive/history of all published articles
- Reusable preambles, CTAs, signatures

**Workflow-solvable (process, not code):**
- Consistency of voice across platforms
- Timing of cross-posts (Substack first, Medium 24h later, etc.)
- Tag/topic strategy over time
- Audience-specific framing decisions

The tool-solvable category is where a Bibliogon feature could
add value. The workflow-solvable category cannot be automated
meaningfully.

### Section 6: Three architectural options

Three genuine options, each with honest pros/cons. No
recommendation yet; that would be premature.

#### Option A: Article as a new book_type in core

Extend the existing `book_type` discriminator with value
`"article"`. Article-specific fields (platforms, canonical URL,
publication status per platform) live on the Book model as
nullable additions.

**Pros:**
- Minimal new code; reuses 100% of editor, AI, export
  infrastructure
- Single data model, single frontend, single CRUD path
- Lowest risk of scope drift or architectural duplication
- Feature can be disabled trivially (hide in create-book UI)

**Cons:**
- Book model accumulates fields irrelevant to prose-book authors
  (platform metadata, SEO fields, cross-post tracking)
- Database schema grows in a way that conflates two product
  concerns
- Positioning ambiguity: "Bibliogon for books and articles" is
  harder to communicate than "Bibliogon for books"
- If articles ever outgrow books as a use case, the primary
  product identity becomes unclear

#### Option B: Article as a plugin

New plugin `plugin-article` (or `plugin-writing`, `plugin-blog`)
that extends Bibliogon with article-specific functionality.
Declares own routes, own DB tables (if needed), own UI components.
Reuses core editor and AI.

**Pros:**
- Clean separation of concerns; book workflow untouched
- Matches existing plugin architecture pattern (9 plugins proven
  out)
- Optional for users who don't write articles
- Future commercial tier possible (plugin licensing infrastructure
  exists)
- Rebranding "Bibliogon" is not required; articles become "another
  thing Bibliogon can do via plugins"

**Cons:**
- Duplication risk: editor state, autosave, version history, i18n
  have to be thought through for a "book-like but not a book"
  artifact
- Plugin adds complexity for 1-2 user benefit until adoption grows
- Book-vs-article mode switching in the UI needs UX design
- `plugin-article` depends on core editor features that may change
  without considering article use cases

#### Option C: Article as a separate sister project

New repo (`github.com/astrapi69/bibliographon` or similar), shares
editor and AI libraries as extracted packages, but has its own
product identity, own database, own deployment.

**Pros:**
- Clearest product positioning: Bibliogon stays a book tool,
  sister project is an article tool
- No risk to Bibliogon's current identity or codebase
- Can experiment with different architectures (e.g., no Docker
  requirement, different storage backend) without breaking
  Bibliogon
- Future community: article authors and book authors may be
  different audiences; separate projects let them have separate
  communities

**Cons:**
- Massive duplication of effort: two deployments, two CI
  pipelines, two documentation sites, two release cadences
- Extracting shared libraries is real work that has not been
  done yet; current code is not structured for extraction
- Brand dilution: two projects mean twice the marketing surface
  to maintain
- Aster is one developer; maintaining two projects simultaneously
  is not realistic without significantly slowing both

#### Comparison: none yet

The three options trade off along three axes:

- **Code-change cost:** A < B < C (lowest to highest)
- **Positioning clarity:** C > B > A (highest to lowest)
- **Maintenance burden:** A < B < C

No option dominates. Decision requires validation data first.

### Section 7: Questions that must be answered before choosing an option

The questions are grouped by urgency:

**Must answer before any architecture commitment:**

1. **Frequency:** How often will Aster actually write articles?
   Once per release (every 2-3 weeks)? Weekly? Daily? The
   answer drives whether any tool investment pays off.

2. **Pain-point reality:** What is the actual time cost of the
   current manual workflow? The estimate "1-3 hours per article"
   is a guess. Actual measurement across 3-5 real articles is
   needed.

3. **Generalizability:** Is the article workflow only valuable
   to Aster, or is it a pattern shared by other technical
   writers / indie developers / open-source maintainers?

**Should answer before significant investment:**

4. **Platform scope:** Which platforms must be supported?
   Medium + Substack + LinkedIn cover 80% of current needs.
   Adding dev.to, Hacker News, personal blog, Mastodon changes
   the feature surface meaningfully.

5. **Metadata strategy:** Platform-specific metadata (Medium
   SEO, Substack sections, LinkedIn hashtags) is where most of
   the manual effort sits. Is the value in automating this, or
   is the current manual workflow good enough?

6. **Publishing automation:** Is the goal authoring + manual copy,
   or authoring + automated API-based publishing (Medium API,
   Substack API, LinkedIn API)? The second is significantly more
   complex.

**Can defer until later:**

7. **Monetization:** If plugin-article matures, is it free or
   paid? This ties into the dormant licensing infrastructure.

8. **Audience:** Who are article authors on Bibliogon beyond
   Aster himself? Understanding the target audience affects
   features.

### Section 8: Validation plan

Before any architecture decision, recommend a 4-week observation
period:

- **Week 1-4:** Continue manual workflow. Keep a
  `docs/journal/article-workflow-observations.md` log. Each
  article gets an entry with: time spent per step, specific
  pain points, repeated patterns, recurring workarounds.
- **End of month:** Review the log. Classify pain points by
  tool-solvable vs workflow-solvable. Identify patterns that
  repeat across 3+ articles (signal for automation value).
- **Decision:** Based on logged data, decide whether to pursue
  Option A, B, C, or none. If none, archive this exploration
  as "investigated and deferred."

Without this observation data, any choice between A/B/C is a
guess about a use case not yet understood.

### Section 9: Triggers for revisiting

Revisit this exploration if:

- Aster's article frequency stabilizes at more than 2 per month
  for 3+ consecutive months
- Aster consistently spends more than 2 hours per article on
  cross-posting work alone
- A collaborator or community member requests article-authoring
  features
- Substack, Medium, or another platform opens an API that would
  make automated publishing substantially easier than it is today
- A business case emerges for monetizing an article-authoring
  plugin (e.g., a paid tier with scheduled publishing)

Without one of these triggers, the exploration stays as-is and
article writing continues manually.

### Section 10: Out of scope

Explicitly NOT addressed in this exploration:

- Architecture specification (premature)
- Data-model proposals (premature)
- UI mockups (premature)
- Session breakdown (premature)
- Plugin scaffolding (premature)
- ROADMAP entries (not ready)
- Competitive analysis against dedicated tools like Ghost,
  Notion, Hugo, etc. (future work if Option C is ever taken
  seriously)

This document captures the idea, not the plan. Any of the above
becomes relevant only AFTER validation data justifies deeper
investment.

### Section 11: Cross-references

- `docs/explorations/children-book-plugin.md` — architectural
  precedent for a deferred feature
- `.claude/rules/architecture.md` — plugin architecture rules
- `backend/app/models/__init__.py` — Book model; where `book_type`
  would be extended under Option A
- The v0.19.1 Medium article at
  `docs/blog/2026-04-20-bibliogon-v0-19-1-medium.md` — the
  article that triggered this exploration

---

## Out of scope for this session

- Any code changes
- Any ROADMAP changes
- Any plugin scaffolding
- Any architecture commitments

This session produces one markdown file. One commit. Nothing else.

---

## Closing checklist

Before committing, confirm:

- [ ] Document is 200-300 lines
- [ ] All three architectural options (A, B, C) are presented
  with genuine pros and cons
- [ ] No option is recommended; the decision is explicitly
  deferred pending validation
- [ ] Validation plan (Section 8) is concrete and time-bound
- [ ] Triggers for revisiting (Section 9) are specific and
  observable
- [ ] Out of scope (Section 10) is explicit
- [ ] No code changes, no ROADMAP entries, no plugin creation
- [ ] Single commit with the specified message
- [ ] `make test` still passes (sanity; should be unaffected)

If during writing you find a section genuinely impossible to
write (e.g., validation plan infeasible, or one of the three
options is not actually viable on closer inspection), STOP and
flag it before committing rather than silently adjusting.

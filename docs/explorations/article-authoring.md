# Article Authoring and Publication Workflow Exploration

Status: Exploration. No architecture committed, no implementation scheduled.
Last updated: 2026-04-21
Revived when: validation data (see Section 12) justifies deeper investment.
Source prompt: [archive/prompt-article-authoring-exploration-v2.md](archive/prompt-article-authoring-exploration-v2.md)

---

## 1. Origin

Bibliogon positions itself as a book authoring tool. Aster has started
publishing Bibliogon-related articles on Medium, Substack and LinkedIn
as project outreach. Each platform carries its own metadata schema,
format expectations, and social ecosystem. Cross-posting is manual,
repetitive, and error-prone: a friend-link changes on one platform,
the Substack mirror goes stale, and nothing in the current toolchain
notices.

During the v0.19.1 release article the thought surfaced: the entire
authoring-plus-publication pipeline could itself be a Bibliogon
feature. Scope: content types, multi-platform publications, promo
posts, lifecycle state across the fan-out.

This document freezes the thinking so future decisions are
structured instead of impulsive. Exploration, not specification.

---

## 2. What the feature should do

**Dashboard entry-point.** New button peer to "New Book". Label
undecided: "New Article", "New Post", "New Publication", "New
Short-form". Trade-off: specificity vs coverage. UX work decides.

**Content-type selection dialog.** Modal analogous to `CreateBookModal`.
User picks type (article, blogpost, tweet, later additions); modal
branches on required fields. Each type carries own default length,
metadata schema, default publishing targets.

**Content entity.** Analogous to `Book`: id, title, author, language,
timestamps. Plus type-specific fields (Section 5). Editor reuses TipTap
with type-aware config: tweet caps 280 chars, article allows full
toolbar.

**Publication targets.** User declares platforms. Each target is a
`Publication` entity with platform, status, platform-specific metadata
(SEO title/description, tags, canonical URL, featured image,
scheduled_at, published_at, published_url, friend_link). Multiple
publications per piece are the norm.

**Promo posts.** Each main piece supports N promo posts linking to
the primary platform. Each carries platform, text, tags, schedule,
published_url. Distinct from main content: about it, not variants.
Modeling question in 7.2.

**Lifecycle tracking.**
- Main content: idea -> draft -> review -> finalized -> archived
- Per publication: planned -> scheduled -> published -> out-of-sync
- Per promo post: draft -> scheduled -> published

Out-of-sync is the key new state: editor must surface "Medium version
edited three days after publication, Substack is behind".

---

## 3. What this shares with book authoring

- TipTap JSON content and editor (same extensions, same toolbar)
- AI assistance (review, style, grammar) from AI Review extension
- i18n (8 languages wired)
- Autosave, IndexedDB recovery drafts, versioning
- Metadata fields (title, author, language); genre -> topic/category
- Export to Markdown and HTML for platform hand-off

Estimated reuse: 50-60%. Lower than first impression because workflow
diverges past the editor itself.

---

## 4. What this does NOT share with book authoring

- **No chapters.** Articles, blogposts, tweets are single-document
  artifacts. The 31-value ChapterType enum does not apply.
- **No ISBN, KDP, audiobook, cover validation.** Books carry retail-
  publication context; articles do not.
- **Multi-platform publication is default.** Books publish to one
  distribution channel per format. Articles publish to 2-5+ platforms
  simultaneously with per-platform variation.
- **Promo-post ecosystem.** Books do not need X threads driving
  traffic to themselves.
- **Shorter lifecycle.** Article: hours/days to write, weeks relevant.
  Book: months to write, years relevant.
- **Scale per artifact.** Article 800-2500 words, tweet <280 chars,
  book 30,000+ words.
- **SEO is primary metadata.** Books carry ISBN and catalog codes.
  Articles carry SEO title/description, tags, canonical URL, Open
  Graph data, all platform-specific.
- **No front matter, back matter, part, TOC.** All book-specific.

---

## 5. Content types and their schemas

**Article (long-form).** 800-3000 words typical, full TipTap
formatting. Platforms: Medium, Substack, dev.to, personal blog.
Metadata: title, subtitle, SEO title/description, tags, reading-time,
canonical URL, featured image, excerpt. Default promo: X thread,
LinkedIn post.

**Blogpost (medium-form).** 400-1500 words, shorter and more
conversational. Platforms: personal blog, LinkedIn long-form,
Substack. Metadata: title, SEO description, tags, featured image.
Default promo: X single post or short thread.

**Tweet (short-form).** <280 chars or N-of-M thread. Plain text,
mentions, hashtags, optional media. Platforms: X, Mastodon, Bluesky.
Metadata: hashtags, mentions, reply-to URL, thread position. No
promo posts (tweet IS a promo form).

**Open question.** Are three enough? LinkedIn long-form differs from
generic blogpost (inline body, no link preview). Instagram captions
have own line-break and hashtag culture. Thread-length pieces sit
between tweet and article. Each new type doubles schema surface and
UI branching. MVP stays at three until usage data lands.

---

## 6. Publication targets for MVP

**Medium.** Required: SEO title/description, tags (up to 5),
canonical URL, featured image, subtitle. Publishing: manual
copy-paste (Medium API deprecated for new apps). Typical: long-form.

**Substack.** Required: section (multi-section newsletters),
subtitle, preview text, featured image. Publishing: manual (API
requires paid tier + partner approval). Typical: articles,
blogposts, newsletter issues.

**X (Twitter).** Required: 280 char main or thread, hashtags, media,
reply-to. Publishing: manual or X API v2 (dev account, rate limits,
paid tier for meaningful access). Typical: tweets, threads, promo.

**LinkedIn.** Required: inline body (no link preview by default),
tags, industry, optional media. Publishing: manual or LinkedIn API
(OAuth, rate-limited, limited posting scope). Typical: blogposts,
article promo.

**Out of MVP.** Facebook, Instagram, Mastodon, Bluesky, personal
blog (static site), RSS, Hacker News, dev.to, Hashnode, Threads,
Reddit. Designed when usage data justifies.

**Metadata-as-data question.** Each platform schema lives
somewhere: hardcoded Pydantic, YAML reference, or user-editable
templates. Static-in-code ships fastest; YAML lets contributors add
platforms without Python changes; user-editable pushes to UX.

---

## 7. Open architectural questions

Questions present a recommendation for analysis, not a prescription.

### 7.1 Content-type vs platform

- **Independent axes.** Content type (article/blogpost/tweet) is
  WHAT. Platform (Medium/Substack/X) is WHERE. Tweet-type today only
  goes to X, but content and platform stay separable.
- **Conflated.** Tweet is both a type and an implicit platform.
  Medium article bakes Medium into the type.

Recommendation: **independent axes**. Type drives structure (length,
formatting, char limits); platform drives distribution metadata. A
tweet can cross-post to Mastodon and Bluesky without a new type per
platform. Cost: slightly more modeling upfront.

### 7.2 How to model promo posts?

- **Option A - Fields on the article.** `article.promo_x`,
  `article.promo_facebook`. Simple reads; every new platform is a
  schema migration.
- **Option B - Separate promo-posts table.** Linked to article, each
  row has platform, text, tags, schedule. Scales but duplicates
  publication concerns.
- **Option C - Unified Publications table.** Every outbound piece is
  a Publication with platform, status, URL, metadata, content. Main
  article and X promo-post share one table, differ in platform and
  content length.

Recommendation: **Option C**. Simplest model, handles everything.
Cost: query complexity when "main vs promo" needs surfacing;
solvable with a discriminator column.

### 7.3 Status and lifecycle granularity

- **Minimal.** One status on article (draft/published/archived).
  Loses per-platform state entirely.
- **Balanced.** Status on article plus status per publication.
  Matches actual fan-out.
- **Maximal.** Editorial workflow with approval states, scheduled
  pipeline, cross-post delays, reminders. Fits a newsroom.

Recommendation: **Balanced**. Matches one-person-shop reality.
Maximal is over-engineered when author, editor, and publisher are
the same human.

---

## 8. Architectural options for implementation

No final recommendation yet; validation data drives the choice.

### Option A: Extend Book model with content_type

Add `content_type` column to `Book` ("book", "article", "blogpost",
"tweet") plus nullable article-specific fields. Frontend branches
on content_type.

**Pros:**
- Minimum new code
- Unified editor and CRUD
- Feature flag trivially disables it
- Export plugin untouched for books

**Cons:**
- Book model accumulates nullable article-only fields (SEO,
  publications, promo posts)
- Schema conflates two product concerns; migrations affect both
- Positioning ambiguity: "Bibliogon does books AND articles"
- Per-book features (KDP, audiobook, ISBN) need null-guards where
  article-type rows exist

### Option B: New Article entity + plugin-article

Separate Article entity in core or in a dedicated `plugin-article`.
New tables: `articles`, `publications`, optional `promo_posts` (or
unified per 7.2). Own CRUD, editor integration, publication
management.

**Pros:**
- Clean separation of concerns
- Book workflow untouched
- Articles evolve independently (types, platforms, lifecycle)
- Matches plugin architecture as `plugin-article`
- Easier to remove if adoption fails

**Cons:**
- More infrastructure upfront
- Editor needs article-aware customizations (tweet limit, SEO
  panel, platform metadata)
- Cross-entity features ("link article to audiobook promo") need
  explicit integration
- Plugin boundary may push integration pain onto the user

### Option C: Separate sister project

New repo (e.g. `articlegon`). Shares editor, AI, i18n as extracted
npm/PyPI packages. Independent identity, release cycle, potentially
different stack.

**Pros:**
- Clearest positioning
- No risk to Bibliogon's identity
- Articles can adopt a web-publishing stack (Astro, Next, headless
  CMS)
- Potential differentiated monetization

**Cons:**
- Massive duplication of effort
- Aster is one developer; two projects in parallel is unrealistic
- Brand dilution and doubled marketing surface
- Shared-package extraction is a project of its own before article
  work starts

### Comparison

- **Code-change cost:** A < B < C
- **Positioning clarity:** C > B > A
- **Maintenance burden:** A < B < C
- **Feature richness ceiling:** C > B > A
- **Risk to existing Bibliogon workflow:** C (none) < B (low) < A
  (moderate, same tables)

---

## 9. Things not yet thought through

- **Images and media.** Featured plus inline. Reuse per-book asset
  infrastructure or separate pool? Does Bibliogon assist generation
  (Midjourney prompt library, SD integration) or only storage?
- **Aspect-ratio fan-out.** Each platform wants different featured-
  image dimensions. Regenerate from one source prompt, keep N
  separate files, or both?
- **Link management.** Articles link back to other articles, other
  projects, related posts. Linked-content concept or raw URL?
- **Analytics post-publication.** Views, reads, claps, shares. In-
  tool means OAuth per platform and ongoing API maintenance.
- **Archive and discoverability.** Search, tag, collection, timeline
  become needed as archive grows.
- **Scheduling.** Future publish requires background job runner plus
  OAuth. Significant scope.
- **Drafting together vs separately.** Medium article and its X
  thread: one entity with variants or two linked entities?
- **Version history across publications.** If Medium version edits
  post-publication, push-update Substack or flag drift?
- **Multi-author.** Article entity assume single author?
- **Tags as shared vocabulary.** Shared across articles (auto-
  complete, filter) or free-text per article (zero infrastructure)?
- **Revision control.** Books have chapter_versions. Articles get
  the same or simpler snapshot approach?
- **Preamble, CTA, signature library.** Repeated boilerplate belongs
  in a reusable snippet system, not copy-paste.
- **Platform credentials.** OAuth tokens need secure storage.
  Bibliogon has no secrets manager today.
- **Retroactive import.** Articles already live on Medium/Substack.
  Import path, or tool only tracks what it created?

Exploration surfaces these; does not resolve them.

---

## 10. Current manual workflow (inferred, needs validation)

Inferred from the v0.19.1 release article:

1. Draft in AI chat (Claude)
2. Iterate on feedback
3. Copy final version to local markdown file
4. Generate images via Midjourney with per-platform aspect-ratio
   prompts
5. Copy to Medium. Fill SEO title/description, tags, subtitle,
   featured image. Publish.
6. Adapt for Substack: preamble, CTA, re-copy, featured image,
   section. Publish.
7. Shorten for LinkedIn. Write inline post (no link preview).
   Publish.
8. Write X announcement linking to Medium canonical URL. Post.
9. Track URLs somewhere manual (spreadsheet? Notes app?).

Estimated 1-3 hours per article depending on length and platform
count.

**Validation note.** Inferred from one release article. Before
committing to Option A/B/C, log the actual workflow across 3-5
articles. Inferred steps may be wrong, incomplete, or in different
order.

---

## 11. Pain points

### Tool-solvable

- SEO metadata templates per platform
- Cross-post tracking: which version is live where, at which URL
- Image aspect-ratio regeneration from one prompt
- Reusable preambles, CTAs, signatures, author bios
- Platform-specific metadata schema validation before publish
- Archive and history of all published content
- Tag and topic consistency across pieces
- Drift detection when one platform version changes post-publication
- One-click export to the format each platform wants

### Workflow-solvable (not tool)

- Voice consistency across platforms
- Timing of cross-posts (same day vs staggered)
- Audience-specific framing (dev.to vs LinkedIn vs X)
- Editorial judgment (what to cut, what to expand)
- Topic choice and content calendar

Tool-solvable is where the feature adds value. Workflow-solvable
stays with the author.

---

## 12. Validation plan

- **Weeks 1-4.** Continue manual workflow. Log each article in
  `docs/journal/article-workflow-observations.md`. Track: time per
  step, specific pain points, recurring patterns, workarounds used,
  which metadata fields mattered, which did not.
- **End of month.** Review log. Classify pain points as tool- or
  workflow-solvable. Identify patterns that repeat across three+
  articles. Count platforms actually used (MVP assumed four;
  reality may differ).
- **Decision point.** Pick Option A, B, C, or none. If none:
  archive as "investigated and deferred".

Without observation data, architecture choice is a guess about a
use case not yet understood. The log is the cheapest possible
validation: a markdown file per article, updated as part of the
existing publication workflow.

---

## 13. Triggers for revisiting

Commit to implementation when at least one fires:

- Article frequency exceeds 2 per month for 3+ months
- Time-per-article exceeds 2 hours of pure cross-posting work
- A collaborator or user requests article-authoring features
- A platform API (Medium, Substack, LinkedIn) becomes available
  enabling meaningful automation
- A business case emerges for monetizing a writer-focused tier

Without a trigger, exploration stays deferred and manual workflow
continues.

---

## 14. Out of scope

Explicitly NOT addressed:

- Architecture specification beyond Section 8 options
- Data-model proposals (column lists, migration plans)
- UI mockups, component inventories
- Session or task breakdown
- Plugin scaffolding
- ROADMAP entries
- Competitive analysis (Ghost, Notion, Hugo, Buttondown) - future
  work if Option C is seriously considered
- API integration details (Medium/X/LinkedIn) - design for
  implementation, not exploration
- Monetization or tier design for writer features
- i18n string inventory

Any of the above becomes relevant only AFTER validation data
justifies deeper investment.

---

## 15. Cross-references

- [children-book-plugin.md](children-book-plugin.md) - precedent
  for a deferred feature with a validation plan
- [ai-review-extension.md](ai-review-extension.md) - precedent for
  extending Bibliogon with a focused capability
- [monetization.md](monetization.md) - future tier strategy;
  relevant if writer features ever gate behind a plan
- [../../.claude/rules/architecture.md](../../.claude/rules/architecture.md)
  - plugin vs core decision rules
- [../../backend/app/models/__init__.py](../../backend/app/models/__init__.py)
  - Book model, directly relevant for Option A
- [../../backend/app/routers/ai.py](../../backend/app/routers/ai.py)
  - AI integration to reuse for article writing assistance
- [../../plugins/bibliogon-plugin-grammar](../../plugins/bibliogon-plugin-grammar)
  - grammar checks reusable across content types

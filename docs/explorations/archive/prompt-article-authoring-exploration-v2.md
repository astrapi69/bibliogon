# Write exploration document: Article Authoring and Publication Workflow

## Context

Bibliogon is positioned today as a **book authoring tool**. The
project lead (Aster) has started writing articles about Bibliogon
on Medium, Substack, and LinkedIn as part of project outreach.
During the v0.19.1 article workflow, the thought surfaced: this
entire authoring-plus-publication pipeline could itself be a
Bibliogon feature.

**The scope is larger than originally considered.** Not just
"write an article in Bibliogon", but:

- New dashboard entry-point (button TBD: "New Article / Blog post /
  Tweet / Short post")
- Content-type selection dialog (similar to book creation)
- Structured content types: article, blogpost, tweet, possibly
  more
- Platform targeting: which platforms should this content be
  published to (Medium, Substack, X, LinkedIn for MVP)
- Platform-specific metadata per publication: SEO title / SEO
  description, tags, canonical URL, friend link, scheduled-at,
  published-at, published-url
- Per-platform promo posts: social-media posts that link to the
  main content (X post, Facebook post, Instagram caption, etc.)
  with their own tags and scheduling
- Status tracking across the lifecycle: idea, draft, review,
  finalized, published on each platform

This is a publication-workflow tool, not a writing tool. The
editor is one component among many.

---

## Scope

Single file to create:
`docs/explorations/article-authoring.md`

Single commit:
`docs(explorations): article authoring and publication workflow`

No code changes. No ROADMAP entries. No plugin scaffolding. No
architecture committed.

Target length: 300-450 lines. Longer than the children-book-plugin
exploration because the feature touches more concepts (content
types, publications, promo posts, lifecycle). Shorter than 500
lines because it is exploration, not specification.

---

## Document structure

### Section 1: Origin

Brief context:

- Aster publishes Bibliogon release content on Medium, Substack,
  LinkedIn. Each platform has different metadata, different
  formats, different social-media ecosystems.
- Cross-posting is manual, repetitive, and forgetful (a URL
  changes on one platform and the Substack version is out of sync).
- The v0.19.1 article workflow made this visible enough to
  consider it as a feature.

The exploration exists to preserve the thinking at this moment
so that future decisions are structured rather than impulsive.

### Section 2: What the feature should do

Based on user requirements stated in the exploration session:

**Dashboard entry-point:**
- A new button on the dashboard (alongside "New Book") that
  creates a new content item of a type to be selected.
- Button label to be determined during UX work. Options to
  consider: "New Article", "New Post", "New Publication",
  "New Short-form". Trade-off: specificity vs coverage.

**Content-type selection dialog:**
- Modal similar to the existing CreateBookModal.
- User selects content type: article, blogpost, tweet, possibly
  others.
- Each content type has different default length expectations,
  different metadata schemas, different default publishing
  targets.

**Content entity with metadata:**
- Analogous to Book: title, author, language, created-at, etc.
- Plus content-type-specific fields (explored in Section 5).
- Editor uses existing TipTap infrastructure with content-type-
  appropriate configuration (e.g., tweet limited to 280 chars,
  article allows full formatting).

**Publication targets:**
- User declares which platforms this piece should be published
  on.
- Each target is a Publication entity with platform, status,
  platform-specific metadata, URL once published.

**Promo posts:**
- For each main content piece, user can create N associated
  promo posts (short social-media posts linking to the main
  piece on its primary platform).
- Promo posts have their own platform, text, tags, scheduled-at,
  published-url.
- Promo posts are distinct from the main content: they are
  about it, not versions of it.

**Lifecycle tracking:**
- Main content: idea → draft → review → finalized → archived.
- Per publication: planned → scheduled → published → out-of-sync
  (if source changes after publication).
- Per promo post: draft → scheduled → published.

### Section 3: What this shares with book authoring

Non-trivial reuse potential:

- Structured prose content
- TipTap editor
- AI assistance (review, style, grammar)
- Language support (i18n for the UI)
- Autosave, versioning, drafts
- Metadata fields (title, author, language, genre → topic/category)
- Export to multiple formats (Markdown, HTML for platforms)

Roughly 50-60% of existing book infrastructure applies. Lower
than initially estimated because the workflow diverges earlier
than just "writing".

### Section 4: What this does NOT share with book authoring

Significant divergences:

- **No chapters.** Articles, blogposts, tweets are single-document
  artifacts. The ChapterType enum with 31 values is irrelevant.
- **No ISBN, KDP, audiobook, cover validation.** Books have a
  retail-publication context; articles do not.
- **Multi-platform publication is the default, not the exception.**
  Books publish to one distribution channel per format. Articles
  publish to 2-5+ platforms simultaneously with platform-specific
  variations.
- **Promo-post ecosystem.** Books don't need X threads to drive
  traffic to themselves. Articles do.
- **Shorter lifecycle.** Article is written in hours to days,
  relevant for weeks. Book is written in months, relevant for
  years.
- **Scale per artifact.** Article: 800-2500 words. Tweet: under
  280 chars. Book: 30,000+ words.
- **SEO is primary metadata.** Books have ISBN and catalog
  classifications. Articles have SEO title, description, tags,
  canonical URL, Open Graph data — all platform-specific.
- **No concept of chapters, parts, TOC, front/back matter.** All
  book-specific structure.

### Section 5: Content types and their schemas

MVP content types and their distinguishing characteristics:

**Article (long-form):**
- 800-3000 words typical
- Full TipTap formatting (headings, lists, code blocks, images)
- Primary platforms: Medium, Substack, dev.to, personal blog
- Metadata: title, subtitle, SEO title, SEO description, tags,
  reading-time estimate, canonical URL, featured image
- Default promo posts: X thread, LinkedIn post

**Blogpost (medium-form):**
- 400-1500 words typical
- Similar to article but shorter, more conversational
- Primary platforms: personal blog, LinkedIn (long-form), Substack
- Metadata: title, SEO description, tags, featured image
- Default promo posts: X thread or single post

**Tweet (short-form):**
- Under 280 chars (or thread structure)
- Plain text, minimal formatting, mentions, hashtags
- Primary platforms: X, possibly Mastodon
- Metadata: tags (hashtags), mentions, reply-to URL, thread
  position
- No promo posts (tweet IS a promo form)

**Open question:** are these three enough, or should the MVP
include more types (LinkedIn post as a distinct type? Instagram
caption? Thread-length piece?). The exploration should surface
trade-offs but not prescribe more than the three above for MVP.

### Section 6: Publication targets (platforms) for MVP

Concrete platforms considered for MVP:

**Medium:**
- Requires: SEO title, SEO description, tags (up to 5), canonical
  URL, featured image
- Publishing: manual (Medium API exists but is limited)
- Typical: long-form articles

**Substack:**
- Requires: section (if multiple sections in a newsletter),
  subtitle, preview text, featured image
- Publishing: manual (Substack has API but requires paid tier)
- Typical: articles, blogposts, newsletters

**X (Twitter):**
- Requires: short text (280 char main) or thread structure,
  hashtags, media attachments
- Publishing: manual or via Twitter API (requires developer
  account)
- Typical: tweets, threads, article promo

**LinkedIn:**
- Requires: body text (inline, not a link-with-preview), tags,
  industry
- Publishing: manual or via LinkedIn API (OAuth, rate-limited)
- Typical: blogposts, article promo

**Out of MVP (mentioned but not designed):**
- Facebook, Instagram, Mastodon, Bluesky, personal blog (static
  site), RSS feed, Hacker News, dev.to, Hashnode

Each MVP platform's metadata schema needs to be captured as
reference data. The question of whether metadata is a static
schema in code or configurable per-user is open.

### Section 7: Open architectural questions

The following questions need analysis, not immediate answers.
The exploration should present trade-offs for each, NOT prescribe
a single answer.

#### Question 7.1: Content-type vs platform — how do they relate?

Two possible models:

- **Independent axes:** Content type (article, blogpost, tweet) is
  WHAT it is. Platform (Medium, Substack, X) is WHERE it goes.
  A tweet-type piece happens to only go to X, but structurally
  content and platform are separate concerns.
- **Conflated:** A "tweet" is both a content-type and an
  implicit platform choice. A "Medium article" is a content
  type that is implicitly Medium-specific.

Recommendation to analyze: **independent axes**. Content-type
drives structure (length, formatting). Platform drives
distribution metadata. A tweet CAN be cross-posted to Mastodon
and Bluesky; conflating would prevent that.

#### Question 7.2: How to model the promo posts?

Three options:

- **Option A — Fields on the article:**
  `article.promo_x`, `article.promo_facebook`, etc.
- **Option B — Separate promo-post entity:**
  `promo_posts` table linked to article, each with platform,
  text, tags.
- **Option C — Every publication IS a publication entity,
  promo posts are just publications with short content:**
  unified model where "article on Medium" and "promo post on X"
  are both Publications with different platforms and different
  content.

Recommendation to analyze: **Option C (unified Publications)**.
Simpler data model, handles all cases. A publication has a
platform, a content (inherited from parent or custom), metadata,
status, URL once live. Promo posts are just publications where
the content is custom short-form.

#### Question 7.3: Status and lifecycle — how granular?

Three levels:

- **Minimal:** One status field on the article (draft / published
  / archived).
- **Balanced:** Status on the article (draft / final / archived)
  plus status per publication (planned / scheduled / published /
  out-of-sync).
- **Maximal:** Editorial workflow with approval states, scheduled
  publishing, cross-post delays, reminder system.

Recommendation to analyze: **Balanced**. Matches one-person-shop
reality. Maximal is over-engineered for a tool where the author
is also the editor and publisher.

### Section 8: Architectural options for implementation

Three genuine options, each with honest pros/cons. No final
recommendation yet; validation data should guide that choice.

#### Option A: Extend Book model with content_type

Add `content_type` to Book ("book", "article", "blogpost", "tweet"),
add nullable article-specific fields. Frontend branches based on
content_type.

**Pros:**
- Minimum new code.
- Unified editor infrastructure.
- Easy to disable (feature flag).

**Cons:**
- Book model accumulates many nullable fields for article-only
  concerns (SEO, platform metadata, publications).
- Schema conflates two product concerns.
- Positioning ambiguity: "Bibliogon handles books AND articles"
  is harder to communicate than either alone.

#### Option B: New Article entity + plugin-article

Separate Article entity in core (or in a new plugin). New tables:
`articles`, `publications`, possibly `promo_posts` (or unified
Publications per Question 7.2). Article has its own CRUD, editor
integration, publication management.

**Pros:**
- Clean separation of concerns.
- Book workflow untouched.
- Articles can evolve independently (new content types, new
  platforms).
- Matches the existing plugin architecture if done as
  `plugin-article`.

**Cons:**
- More infrastructure to build upfront.
- Editor needs article-aware customizations (tweet char limit,
  article SEO fields).
- Cross-entity features (e.g., "link article to audiobook
  promo") become harder.

#### Option C: Separate sister project

New repo `bibliographon` (or similar), shares editor/AI libraries
as extracted npm/PyPI packages, but independent product identity.

**Pros:**
- Clearest positioning.
- No risk to Bibliogon's current identity.
- Can adopt different stack or architecture if desired.

**Cons:**
- Massive duplication of effort.
- Aster is one developer; two projects in parallel is unrealistic.
- Brand dilution, marketing surface doubled.

**Comparison:**
- **Code-change cost:** A < B < C
- **Positioning clarity:** C > B > A
- **Maintenance burden:** A < B < C
- **Feature richness ceiling:** C > B > A (because articles have
  room to grow with their own identity)

### Section 9: Things not yet thought through

Aster explicitly flagged "and everything I haven't thought of yet"
as part of the scope. This section is for items that emerged
during writing the exploration but were not in the original list.

**Candidates to address:**

- **Images and media:** articles and blogposts need featured
  images and inline media. Is that the existing asset infrastructure
  or a new abstraction? Does Bibliogon help with image
  generation (Midjourney prompt library?) or just storage?
- **Link management:** articles often link back to other articles,
  other projects, related posts. Is there a linked-content concept?
- **Analytics (post-publication):** once published, authors want
  to see performance. Views, reads, claps, shares. Is that a
  Bibliogon concern or an out-of-tool responsibility?
- **Archive and discoverability:** over time, Aster's article
  archive grows. Is there a search / tag / collection system?
- **Scheduling:** publishing at a future date. Bibliogon would
  need a scheduler, not just publish-now. Significant scope.
- **Drafting together vs separately:** if the same article is
  adapted for Medium (long) vs X (thread), is it one entity with
  variants, or two entities linked as "this X thread is the
  short-form of that Medium article"?
- **Version history across publications:** if the Medium version
  gets edited 3 days after publication, does Substack get
  updated? Bibliogon tracks, but who enforces?
- **Multi-author:** Aster writes alone today, but collaborative
  articles exist. Does the Article entity assume single author?
- **Tags as shared vocabulary:** is "self-publishing" a tag that
  gets used across 50 articles, or free-text per article? Shared
  vocabulary has UX benefits (auto-complete, filtering) but
  requires a Tags table.
- **Revision control and rollback:** for books this is covered by
  chapter_versions. For articles, is there an equivalent? Is
  every published version snapshotted?

Each of these is a design decision that needs consideration
before implementation. The exploration surfaces them; it does
not resolve them.

### Section 10: User's current article workflow (to verify)

This section captures the existing manual workflow, based on
inference from the v0.19.1 release article experience. Flag it
as "needs validation with actual observation" because the
inference is based on limited data.

Inferred workflow:

1. Write draft in AI chat (Claude)
2. Iterate on feedback
3. Copy final version to local markdown file
4. Generate images via Midjourney with separate prompts per
   platform aspect ratio
5. Copy to Medium, fill in SEO title + description, pick tags
6. Adapt for Substack (preamble, CTA, re-copy)
7. Shorten for LinkedIn, write inline post
8. Post X announcement linking to Medium

Estimated time per article: 1-3 hours depending on length and
platform count.

**Validation note:** before committing to Option B or C, the
actual workflow should be logged for 3-5 articles to confirm
where time is actually spent and what would benefit from
automation.

### Section 11: Pain points (tool-solvable vs not)

**Tool-solvable:**
- SEO metadata templates per platform
- Cross-post tracking (which version is live where)
- Image aspect-ratio regeneration from a single prompt
- Reusable preambles, CTAs, signatures
- Platform-specific metadata schema validation
- Archive/history of all published content
- Tag/topic consistency across pieces

**Workflow-solvable (process, not tool):**
- Voice consistency
- Timing of cross-posts
- Audience-specific framing decisions
- Editorial judgment

The tool-solvable category is where a feature like this adds
value. The workflow-solvable category is up to the author,
regardless of tooling.

### Section 12: Validation plan (before any architecture decision)

Before committing to Option A, B, or C:

- **Week 1-4:** Continue manual workflow. Log each article's
  workflow in `docs/journal/article-workflow-observations.md`.
  Track: time per step, specific pain points, recurring patterns,
  workarounds.
- **End of month:** Review log. Classify pain points as
  tool-solvable or workflow-solvable. Identify patterns that
  repeat across 3+ articles.
- **Decision:** Based on logged data, decide Option A / B / C /
  none. If none, archive exploration as "investigated and
  deferred."

Without observation data, architecture choice is a guess about
a use case not yet understood.

### Section 13: Triggers for revisiting

Revisit and commit to implementation if:

- Article frequency exceeds 2 per month for 3+ months
- Time-per-article exceeds 2 hours of pure cross-posting work
- A collaborator or user requests article-authoring features
- A platform API (Medium, Substack, LinkedIn) becomes available
  that would enable meaningful automation
- A business case emerges for monetizing a writer-focused tier

Without one of these triggers, the exploration stays deferred
and manual workflow continues.

### Section 14: Out of scope

Explicitly NOT addressed:

- Architecture specification (premature)
- Data-model proposals (premature beyond options in Section 8)
- UI mockups (premature)
- Session breakdown (premature)
- Plugin scaffolding (premature)
- ROADMAP entries (not ready)
- Competitive analysis (Ghost, Notion, Hugo, Buttondown) (future
  work if Option C is ever seriously considered)
- API integration details (Medium API, Twitter API, etc.) (design
  decision for implementation, not exploration)

Any of the above becomes relevant only AFTER validation data
justifies deeper investment.

### Section 15: Cross-references

- `docs/explorations/children-book-plugin.md` — architectural
  precedent for a deferred feature
- `docs/explorations/ai-review-extension.md` — precedent for
  extending Bibliogon with a focused capability
- `.claude/rules/architecture.md` — plugin vs core decisions
- `backend/app/models/__init__.py` — Book model; relevant for
  Option A
- `backend/app/routers/ai.py` — AI integration to reuse for
  article writing assistance

---

## Out of scope for this session

- Any code changes
- Any ROADMAP changes
- Any plugin scaffolding
- Any data-model migrations
- Any UI work

This session produces one markdown file. One commit. Nothing else.

---

## Closing checklist

Before committing, confirm:

- [ ] Document is 300-450 lines
- [ ] All 15 sections are present
- [ ] Three architectural options (A, B, C) are presented with
  genuine pros and cons
- [ ] Three open architectural questions (7.1, 7.2, 7.3) are
  analyzed with recommendations, not prescribed
- [ ] Validation plan (Section 12) is concrete and time-bound
- [ ] Triggers for revisiting (Section 13) are specific and
  observable
- [ ] Section 9 "Things not yet thought through" has at least
  8-10 items (the list in the prompt is a minimum, add more
  during writing if they surface)
- [ ] No code changes, no ROADMAP entries, no plugin creation
- [ ] Single commit with the specified message
- [ ] `make test` still passes (sanity; should be unaffected)

If during writing you find a section genuinely impossible to
write or self-contradictory, STOP and flag it before committing
rather than silently adjusting.

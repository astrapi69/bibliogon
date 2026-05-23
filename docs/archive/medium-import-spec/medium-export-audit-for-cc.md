# Medium Export Analysis: Bibliogon Importer Specification

## Purpose

A user has 209 Medium posts (2020-2026) exported as HTML via
Medium's settings → "Download your information" feature. They
want to import these into Bibliogon as Articles, and want a
proper Medium Import feature (not a one-off script) that other
self-publishing authors can also use.

This document is the analysis output of the export structure.
Use it to design the importer.

## Export structure overview

```
medium-export/
├── README.html                 # Medium's instructions
├── posts/                      # 209 .html files, one per post
├── blocks/                     # Empty in this user's export
├── bookmarks/                  # User's reading bookmarks
├── claps/                      # Posts user clapped for
├── highlights/                 # Highlighted passages
├── interests/                  # User's interest topics
├── lists/                      # User's curated lists
├── partner-program/            # Partner-program metadata
├── profile/                    # User profile data
├── pubs-following/             # Publications user follows
├── sessions/                   # Login sessions
├── topics-following/           # Topics user follows
├── twitter/                    # Connected Twitter data
└── users-following/            # Users user follows
```

Only `posts/` is relevant for an Article importer. The rest is
user-network data outside Bibliogon's scope.

## Per-post HTML structure

Every post follows the same template. Verified across 209 posts:

```html
<!DOCTYPE html>
<html>
<head>
  <title>{Post Title}</title>
  <style>...</style>            <!-- Medium's display CSS -->
</head>
<body>
  <article class="h-entry">
    <header>
      <h1 class="p-name">{Title}</h1>
    </header>

    <section data-field="subtitle" class="p-summary">
      {Subtitle, may be empty}
    </section>

    <section data-field="body" class="e-content">
      <!-- Multiple section.section--body containers, each
           wrapping a logical block of content -->
      <section name="..." class="section section--body">
        <div class="section-content">
          <div class="section-inner sectionLayout--insetColumn">
            <!-- Actual content paragraphs, headings, etc. -->
          </div>
        </div>
      </section>
      <!-- ... more sections ... -->
    </section>

    <footer>
      <p>By <a class="p-author h-card">Author</a> on
         <a><time class="dt-published" datetime="..."/></a></p>
      <p><a class="p-canonical" href="medium-url">Canonical link</a></p>
      <p>Exported from Medium on {date}.</p>
    </footer>
  </article>
</body>
</html>
```

### Reliable extraction selectors

Per the audit of all 209 posts:

| Field | Selector | Coverage |
|-------|----------|----------|
| Title | `h1.p-name` text | 209/209 (100%) |
| Subtitle | `section[data-field="subtitle"]` text | 192/209 (92%) |
| Date | `time.dt-published` `datetime` attr (ISO 8601) | 209/209 (100%) |
| Canonical URL | `a.p-canonical` `href` | 209/209 (100%) |
| Author name | `a.p-author.h-card` text | 209/209 (100%) |
| Body | `section[data-field="body"]` inner HTML | 209/209 (100%) |
| Tags | NONE | 0/209 (Medium strips tags) |

### Body content structure

Inside `section[data-field="body"]`, content is wrapped in
nested `<section>` containers with these element classes:

- `graf graf--p` - paragraphs
- `graf graf--h3` (and rare h2, h4) - headings (Medium maps
  user-typed H2 to graf--h3 in the body; the actual H1 lives
  in the header)
- `graf graf--pre graf--preV2` - code blocks with
  `data-code-block-lang` attribute
- `graf graf--blockquote` - blockquotes
- `graf graf--li` - list items inside `<ul class="postList">`
  or `<ol>`
- `graf graf--figure` - image containers, often standalone
- `graf graf--p graf--leading` - leading paragraph after a
  divider
- `graf graf--p graf--trailing` - trailing paragraph before
  a divider

Inline elements:
- `markup--anchor markup--p-anchor` - inline links
- `markup--code markup--p-code` - inline `<code>` spans
- `markup--strong` and `markup--em` - bold/italic

Images:
- Hosted on `cdn-images-1.medium.com`
- `data-image-id` attribute (UUID-like)
- `data-width` / `data-height` for original dimensions
- src URLs include resize directives like `/max/2560/`

## Aggregate statistics across all 209 posts

```
Total posts: 209
Total HTML size: 4.8 MB

Posts per year:
  2020: 4
  2021: 1
  2022: 4
  2023: 4
  2024: 35
  2025: 119
  2026: 42

Languages observed: English, German (mixed across years)

Content elements:
  has_subtitle: 192 (92%)
  has_canonical: 209 (100%)
  has_images: 196 (94%)
  has_mediumcdn_images: 196 (94%)
  has_code_blocks: 80 (38%)
  has_blockquotes: 115 (55%)
  has_lists: 172 (82%)
  has_h3_headings: 196 (94%)
  has_external_links: 192 (92%)
  has_tables: 0 (0%)

Image counts:
  total_images: 668
  avg_per_post: 3.2
  max_in_one_post: 12

Tags: NONE in export (Medium strips them in HTML export)
```

## Critical gaps in Medium's export

These are the things Medium does NOT include in HTML export:

1. **Tags.** No tag list per post. The user must either:
   - Manually tag posts after import
   - Have CC infer tags from content (LLM-based tagging)
   - Skip tags (set tags=[] on import; user can tag later)

2. **Series/Publications.** If a post was part of a Medium
   Publication (like "Better Programming"), that's not in the
   HTML. The canonical URL contains the publication slug
   though, so it can be parsed.

3. **Reading time / clap count / response count.** These are
   metrics, not content. Out of scope for import.

4. **Original Markdown source.** Medium's editor produces HTML;
   even if the user wrote the post in Markdown originally,
   the HTML is what's exported.

5. **Drafts.** Only published posts are in the export.

## What Bibliogon already has vs. what's needed

Reading the Bibliogon codebase:

### Article model fields (already present)

Per memory and recent work:
- `title` (string)
- `subtitle` (string)
- `author` (string)
- `language` (string)
- `excerpt` (string)
- `tags` (JSON list, default `[]`)
- `topic` (free string)
- `status` (enum: draft/ready/published/archived)
- `series` (free string, added in v0.27.0)
- `content_json` (TipTap JSON, the canonical body format)
- `deleted_at` (soft-delete timestamp)

### Publications model (already present)

The user already implemented per-platform publications with
drift detection. Each Article can have multiple Publications,
one per platform (medium, substack, x, linkedin, devto,
mastodon, bluesky, custom).

A publication entry has:
- `platform` (enum)
- `url` (canonical URL on the platform)
- `published_at` (timestamp)
- `is_promo` (bool, for promotional cross-posts)
- Drift detection fields

This is exactly what an imported Medium post needs: each
import creates an Article + one Publication (platform=medium,
url=canonical, published_at=date_iso).

### Conversion pipeline (partially present)

For per-Article export, Bibliogon already has:
- `tiptap_to_markdown` (TipTap JSON → Markdown)
- Pandoc-based Markdown → HTML/PDF/DOCX

For import, we need the reverse direction:
- HTML → Markdown (Pandoc handles this) → TipTap JSON

Pandoc command for HTML→Markdown:
```bash
pandoc input.html --from=html --to=gfm \
  --wrap=none --strip-comments \
  -o output.md
```

The Markdown→TipTap JSON step needs investigation. Some
possibilities:
- Direct HTML→TipTap via a TipTap extension (typically client-side)
- Markdown→TipTap via a server-side parser (mdast → TipTap)
- HTML cleanup → Pandoc HTML → TipTap-compatible HTML → TipTap parse

### What's missing in Bibliogon (to be built)

1. **Import endpoint.** No `/articles/import` route exists.
2. **HTML→TipTap conversion.** The reverse of the existing
   tiptap_to_markdown function.
3. **Image handling.** Two strategies needed:
   - Reference Medium CDN URLs as-is (lazy, but URLs may
     break if Medium ever takes them down)
   - Download images to local Bibliogon storage
4. **Bulk import UI.** Either:
   - A Medium-specific dashboard import button
   - A generic "Import from ZIP" feature that handles
     Medium's archive format
5. **Plugin or core decision.** This could be a new plugin
   `plugins/bibliogon-plugin-medium-import/` (consistent with
   other format-specific plugins like KDP, Audiobook) OR
   integrated into core articles routing.

## Sample posts attached

Three representative HTML files are at
`/home/claude/medium-analysis/sample-posts/`:

- `01_oldest_tech.html` - 2020 short technical post (Java/Gradle),
  English, simple structure, few elements
- `02_german_philosophical.html` - 2026 German post (Logos und
  Demokratie), longer-form, headings, blockquotes, no code
- `03_english_recent_with_code.html` - 2026 English post (Bibliogon
  v0.30.0), code blocks, multiple headings, structured content,
  inline code spans

These cover the structural variety. CC should test the
importer against all three.

## Aggregate analysis JSON

Full structured analysis at
`/home/claude/medium-analysis/medium-export-analysis.json`.

Fields per sample include extracted title, subtitle, date,
canonical URL, image URLs, body element counts (h1/h2/h3/p/img/pre/code/etc.),
content preview, word count.

## Design questions for CC

CC should produce its own audit report addressing:

1. **Plugin or core?** Is the Medium importer a plugin
   (`bibliogon-plugin-medium-import` matching the
   `bibliogon-plugin-{kdp,audiobook,kinderbuch}` pattern)
   or a core feature?
2. **HTML→TipTap conversion strategy.** Which path:
   a) Pandoc HTML→Markdown, then Markdown→TipTap (two-step,
      relies on existing tools)
   b) Direct HTML→TipTap parser (one-step, needs new code)
   c) HTML→sanitized HTML, then client-side TipTap parse
3. **Image handling.** Reference CDN URLs, download all
   locally, or user-configurable?
4. **Tag inference.** Medium strips tags. Options:
   a) Empty tags on import (user tags later)
   b) Heuristic from title/content (e.g. detect "Java",
      "Python", "Bibliogon" mentions)
   c) LLM-based tagging (uses existing AI Review infra)
   d) User-provided tag rules in import wizard
5. **Status mapping.** Medium posts are all "published"; should
   imported Bibliogon Articles default to status=published or
   status=ready?
6. **Existing-article detection.** If the user re-imports the
   same archive, what happens? Match on canonical URL?
   Skip duplicates? Update existing?
7. **Bulk import UI.** Per-file or whole-ZIP upload?
   Progress bar? Dry-run preview?
8. **Selective import.** User wants Pfad C (selective): only
   import some posts. Filter UI in the wizard? Or import all
   then archive unwanted?

## Implementation scope estimate

- Plugin scaffold + import endpoint: 1-2 commits
- HTML→TipTap conversion: 2-3 commits (depending on path)
- Image handling: 1 commit
- Bulk import UI: 2-3 commits
- Tests covering all 3 sample files + edge cases: 1-2 commits
- Documentation: 1 commit

Estimated 8-12 commits in 1-2 sessions for the full feature.

A minimal MVP (single-post import endpoint with reference-CDN-image
strategy and empty tags) is ~3-4 commits in one session and
delivers the core value of "user imports their archive".

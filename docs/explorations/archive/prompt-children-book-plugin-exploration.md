# Kinderbuch Plugin - Exploration Document and Session Planning

## Context for new chat session

This is the starting prompt for a new chat session focused on
designing the Children's Book Plugin for Bibliogon. The preceding
work context:

- Bibliogon is at v0.16.0 with complete audiobook infrastructure
- Phase 2 active, multiple themes in progress
- Plugin architecture exists (plugin-audiobook, plugin-export,
  plugin-kdp, plugin-kinderbuch stub, etc.)
- User is Asterios Raptis, German self-publisher via Amazon KDP
- User has written children's books before, not with Pandoc but
  with JS/TS
- User's own children's books use two layouts:
  1. Image full-bleed with speech bubble containing text
  2. Image on top, text below

## User requirements (confirmed in previous session)

- Variant B: proper page-based editor with multiple layouts (not
  simplified text-first, not full-featured Canva-like)
- Two layouts for initial implementation:
  - Layout 1: Image full-bleed plus speech bubble with text
  - Layout 2: Image on top, text on bottom (classic picture book)
- JS/TS rendering approach, NOT Pandoc
- Target: Amazon KDP children's book (paperback + Kindle fixed-layout)

## Research findings (Amazon KDP requirements)

### Trim sizes for picture books
- 8.5 x 8.5 inches: standard square picture book format
- 8.5 x 11 inches: larger picture/activity books
- 8 x 10 inches: classic portrait picture book
- 5.5 x 8.5 or 6 x 9 inches: early readers, chapter books

**Recommendation for Bibliogon first version: 8.5 x 8.5 Paperback
only.** Extension to other sizes later.

### Print specifications
- Bleed: 0.125 inches on all sides for full-bleed images
- Safe zone: 0.25 to 0.5 inches from edges for important content
- When bleed enabled: outside margin minimum rises to 0.375 inches
- For 8.5 x 8.5 with bleed: PDF page size is 8.75 x 8.75 inches
- Content safe zone: approximately 8.0 x 8.0 inches

### Image specifications
- 300 DPI minimum, 600 DPI maximum
- For 8.5 x 8.5 image: approximately 2550 x 2550 pixels
- RGB color space acceptable (KDP converts to CMYK)
- PNG or TIFF preferred
- Flattened (no transparency layers)

### Page count
- Minimum 24 pages, must be even number
- Typical 24-32 pages for picture books

### Output formats
- Print: PDF with embedded fonts, correct bleed and margins
- Kindle: Fixed-Layout EPUB3 (Kindle Kids Book Creator style)
- AI-generated illustrations must be disclosed in KDP metadata

## Goal for this session (Session 1)

Create the exploration document
`docs/explorations/children-book-plugin.md` that captures:

1. Architecture approach (page-based data model, HTML/CSS rendering,
   NOT Pandoc)
2. Layout system design (two initial layouts, extension pattern
   for more)
3. Data model (Page entity, layout_type, image_id, text_content,
   etc.)
4. Rendering pipeline (TipTap/page-editor JSON -> HTML template ->
   Puppeteer PDF, separate EPUB generator)
5. KDP-specific requirements captured (trim sizes, bleed, DPI,
   disclosure)
6. Plugin structure (how plugin-kinderbuch fits into existing
   plugin system)
7. Multi-session roadmap for implementation

Do NOT implement anything in this session. Output is only the
exploration document.

## Proposed multi-session roadmap

The exploration document should propose and justify a session
breakdown. My recommendation to validate in the document:

- Session 1 (this one): Exploration document
- Session 2: Backend Page model + basic CRUD + plugin infrastructure
- Session 3: Frontend page-based editor with layout selection UI
- Session 4: Layout 1 rendering (image full-bleed + speech bubble)
  + PDF export via Puppeteer
- Session 5: Layout 2 rendering (image on top + text on bottom) +
  PDF export
- Session 6: Fixed-Layout EPUB export
- Session 7: Polish, image upload workflow, preview, i18n

Adjust if you see better natural breakpoints. Validate with user
before committing to the sequence.

## Key architectural decisions to document

### Data model separation
Children's books need a Page entity that is separate from the
existing Chapter entity. A Page has:
- `layout_type`: enum of available layouts (layout_1_speech_bubble,
  layout_2_image_top_text_bottom, future layouts)
- `image_id`: reference to uploaded image asset
- `text_content`: short text content (not TipTap JSON, because
  it's too short/simple for that)
- `text_position`: for layout 1, position of speech bubble
- `page_number`: position in the book (1-indexed, must be even
  total)

### Rendering pipeline for PDF
- Page data -> Handlebars or similar template -> HTML/CSS document
- HTML renders in Chromium via Puppeteer -> PDF
- CSS `@page` rules handle trim size and bleed
- Each page is a separate document or a single multi-page document
  with page breaks

Key CSS features needed:
- `@page { size: 8.75in 8.75in; margin: 0; }`
- Absolute positioning for speech bubbles
- Background-image for full-bleed images

### Rendering pipeline for EPUB
- Fixed-Layout EPUB3 with explicit viewport per page
- Each page is a separate XHTML document
- CSS references the same HTML structure used for PDF
- Container XML with `rendition:layout-pre-paginated`

### Plugin architecture
- plugin-kinderbuch extends the existing plugin system
- Registers: page editor UI, page data model, rendering pipelines
- Hooks into export: when book.type is "children_book", use this
  plugin's renderers instead of default Pandoc pipeline

### Editor UX

Recommended structure:
- Left sidebar: page thumbnail list, drag to reorder
- Center: current page canvas with layout
- Right sidebar: page properties (layout selection, text input,
  image upload)
- Top bar: standard book-level actions (settings, export, preview)

### Features NOT in initial scope
Per YAGNI, explicitly deferred:
- More than 2 layouts (can add later)
- Multiple image per page
- Interactive Kindle features
- Drawing tools within Bibliogon (user uploads prepared images)
- Hardcover variants (Paperback only for first version)
- Trim sizes other than 8.5 x 8.5 (for now)
- Bilingual books (future consideration)
- Read-aloud audio integration (could reuse audiobook plugin
  infrastructure later)

## Questions for user to resolve in this session

The exploration document must address these before implementation
starts:

1. Image upload workflow: where in Bibliogon are book-level images
   managed currently? The plugin should use existing asset
   infrastructure, not invent new.

2. Speech bubble styling: fixed styling or user-configurable
   (position, shape, font)? Start with fixed for MVP.

3. Text input for layout 1 (speech bubble): plain text with line
   breaks, or basic formatting (bold, italic)? Plain text is
   sufficient for MVP.

4. Page numbering display: always on, optional, never?
   Recommendation: optional per book, default off for picture books.

5. AI illustration workflow: does plugin-kinderbuch integrate with
   existing AI capabilities? If user has configured an image
   generation provider in Bibliogon, can they generate illustrations
   directly in the children's book editor?

   For MVP: no, user uploads prepared images. AI integration is
   separate future feature.

6. Export trigger: existing book export dialog handles this, or
   does children's book need its own export flow?

   Recommendation: extend existing export dialog with "children's
   book" detection, but use plugin-kinderbuch rendering pipeline
   instead of Pandoc.

## Deliverables for this session

Single commit:
`docs(explorations): children's book plugin architecture and
multi-session plan`

The document should be self-sufficient for future Claude Code
sessions that pick up the implementation. Later sessions reference
this document instead of re-deriving architecture.

## Style and language

- Written in English (project convention for internal docs)
- Concrete and decision-oriented, not speculative
- References KDP specifications with inline sources where applicable
- Cross-references existing Bibliogon patterns (plugin system,
  asset management, export pipeline)

## Pre-audit step

Before writing the document, verify:
- Current state of plugin-kinderbuch (is it a stub or already has
  some code?)
- Existing asset/image management in Bibliogon (how is it handled
  today?)
- Current export pipeline entry points (where does Pandoc get
  called, where would plugin-kinderbuch hook in?)
- Puppeteer or alternative headless Chromium availability in the
  backend

Report findings, then write the document based on actual project
state.

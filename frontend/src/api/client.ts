// --- Types ---

export type ChapterType =
    | "chapter"
    | "preface"
    | "foreword"
    | "acknowledgments"
    | "about_author"
    | "appendix"
    | "bibliography"
    | "glossary"
    | "epilogue"
    | "imprint"
    | "next_in_series"
    | "part"
    | "part_intro"
    | "interlude"
    | "toc"
    | "dedication"
    | "prologue"
    | "introduction"
    | "afterword"
    | "final_thoughts"
    | "index"
    | "epigraph"
    | "endnotes"
    | "also_by_author"
    | "excerpt"
    | "call_to_action";

/** PB-PHASE4: discriminator for the book's authoring shape.
 *  ``prose`` keeps the existing Chapter-based editor; ``picture_book``
 *  routes into PageEditor; ``comic_book`` mounts ComicBookEditor.
 *  Defaults to ``prose`` server-side. Immutable after create per
 *  the Session-2 PATCH /api/books/{id} guard.
 *
 *  BOOK-TYPES-SSOT-YAML-01 (2026-05-24): the value-set of this
 *  Literal MUST stay in sync with backend/config/book-types.yaml.
 *  The backend test ``test_book_type_registry.py::test_literal_matches_registry``
 *  pins the parity. When adding a new book-type, bump BOTH this
 *  Literal AND the YAML registry. */
export type BookType = "prose" | "picture_book" | "comic_book";

/** BOOK-TYPES-SSOT-YAML-01: per-type capability flags returned by
 *  GET /api/book-types. Mirrors the backend's BookTypeCapabilities
 *  Pydantic model. Negative-default semantics: any unspecified
 *  capability is False. */
export interface BookTypeCapabilities {
    ebook_export: boolean;
    paperback_export: boolean;
    hardcover_export: boolean;
    audiobook_export: boolean;
    template_catalog: boolean;
    kdp_package_supported: boolean;
}

/** BOOK-TYPES-SSOT-YAML-01: one book-type's full metadata bundle
 *  served by GET /api/book-types. Mirrors the backend BookTypeDef
 *  Pydantic model. */
export interface BookTypeDef {
    id: BookType;
    label_key: string;
    description_key: string;
    icon: string;
    /** "chapters" | "pages" — drives the editor selection + the
     *  PAGEABLE_BOOK_TYPES gate on the backend. */
    content_model: string;
    editor_component: string;
    capabilities: BookTypeCapabilities;
    dashboard_create_visible: boolean;
    immutable_after_create: boolean;
    default_page_size: string | null;
}

export interface Book {
    id: string;
    /** ``prose`` for the existing chapter-based authoring flow;
     *  ``picture_book`` mounts the page-based PageEditor instead.
     *  Defaults to ``prose`` for legacy rows (the backend's
     *  Pydantic default). */
    book_type: BookType;
    title: string;
    subtitle: string | null;
    /** Nullable when the user enabled
     *  ``app.allow_books_without_author`` in Settings and the
     *  import wizard's defer path was used (or the metadata
     *  editor cleared the field). UI surfaces an em-dash
     *  placeholder. */
    author: string | null;
    language: string;
    genre: string | null;
    series: string | null;
    series_index: number | null;
    description: string | null;
    /** EXPOSE-BUCHIDEE-METADATA-01: author-design metadata.
     *  ``book_idea`` is the short premise (1-2 sentences);
     *  ``expose`` is the long-form Exposé (Plot + Characters +
     *  Setting + Tone document). Both default null. */
    book_idea: string | null;
    expose: string | null;
    edition: string | null;
    publisher: string | null;
    publisher_city: string | null;
    publish_date: string | null;
    isbn_ebook: string | null;
    isbn_paperback: string | null;
    isbn_hardcover: string | null;
    asin_ebook: string | null;
    asin_paperback: string | null;
    asin_hardcover: string | null;
    keywords: string[];
    // Bug 9: Books-only subject categorisation. ``categories`` are
    // free-text (KDP-style names + any string the user types);
    // ``bisac_codes`` are 9-char industry codes (``^[A-Z]{3}[0-9]{6}$``,
    // validated server-side). Both default to ``[]`` so callers can
    // assume the arrays exist even on pre-Bug-9 rows.
    categories: string[];
    bisac_codes: string[];
    html_description: string | null;
    backpage_description: string | null;
    backpage_author_bio: string | null;
    cover_image: string | null;
    custom_css: string | null;
    /** BOOK-REPOSITORY-URL-FIELD-01: optional git repo URL for
     *  books tracked externally. When the book is
     *  plugin-git-sync-managed, GitSyncMappingStatus.repo_url
     *  takes precedence in the UI (BookMetadataEditor reads it
     *  read-only); this column carries the value for manually-
     *  tracked repos. */
    repository_url: string | null;
    ai_assisted: boolean;
    ai_tokens_used: number;
    tts_engine: string | null;
    tts_voice: string | null;
    tts_language: string | null;
    tts_speed: string | null;
    audiobook_merge: string | null;
    audiobook_filename: string | null;
    audiobook_overwrite_existing: boolean;
    audiobook_skip_chapter_types: string[];
    created_at: string;
    updated_at: string;
}

export interface BookDetail extends Book {
    chapters: Chapter[];
}

export interface Chapter {
    id: string;
    book_id: string;
    title: string;
    content: string;
    position: number;
    chapter_type: ChapterType;
    created_at: string;
    updated_at: string;
    /** Optimistic-lock counter. Bumped by the backend on every
     *  successful PATCH. Clients must echo it back on update.
     */
    version: number;
}

// --- Page (PB-PHASE4: picture-book pages) ---
// Mirrors the backend's ``app.schemas.PageOut`` + ``PageCreate`` +
// ``PageUpdate`` + ``PagesReorder``. Books with
// ``book_type === "picture_book"`` carry N Page rows instead of
// Chapter rows; the kinderbuch plugin's PageEditor consumes this
// shape. Layout names are also validated server-side; the union
// here is the authoritative client list (keep in sync with the
// Pydantic ``PageLayout`` Literal).

export type PageLayout =
    | "speech_bubble"
    | "image_top_text_bottom"
    | "image_left_text_right"
    | "image_full_text_overlay"
    | "text_only"
    | "comic_panel_grid"
    // Picture-Book Layout Expansion Phase 1 (2026-05-28). Single-
    // image layouts mirror existing geometry; multi-image layouts
    // (Phase 2) + collage (Phase 3) extend this union in later
    // commits. PageCanvas branches + walker + picker + i18n land
    // in subsequent Phase 1 commits.
    | "image_bottom_text_top"
    | "image_right_text_left"
    | "image_full_no_text"
    // Picture-Book Layout Expansion Phase 2 (2026-05-28). Multi-
    // image layouts using M1 storage (PRIMARY on Page.image_asset_id
    // unchanged; SECONDARY in layout_config[layout].secondary_image
    // _asset_id via the readSecondaryImageAssetId helper). Subsequent
    // Phase 2 commits add per-layout PageCanvas branches, walker
    // CSS, LayoutConfig bodies, picker entries, and i18n.
    | "two_images_text_center"
    | "split_horizontal"
    | "split_vertical"
    | "image_border_text_center"

/** Story-structure tag for ``Page.story_beat`` (PICTURE-BOOK-
 *  STORYBOARD-VIEW-01). 6 fixed values constrain future beat-sheet
 *  templates. Keep in sync with the Pydantic ``StoryBeat`` Literal. */
export type StoryBeat =
    | "setup"
    | "inciting"
    | "rising"
    | "climax"
    | "falling"
    | "resolution"

export interface Page {
    id: string
    book_id: string
    position: number
    layout: PageLayout
    text_content: string | null
    image_asset_id: string | null
    /** JSON object stored as text on the backend; decoded for the
     *  API. Per-page layout configuration. Keys are layout-specific
     *  (anchor_position + opacity for speech_bubble; image_position +
     *  image_fit for image_top_text_bottom; split_ratio for
     *  image_left_text_right; text_position + text_backdrop_opacity
     *  for image_full_text_overlay; empty for text_only). NULL falls
     *  back to per-layout defaults in PageCanvas. Renamed from
     *  speech_bubble_config in PB-PHASE4 Session 4c when the column
     *  was generalized beyond Layout-A. */
    layout_config: Record<string, unknown> | null
    /** Storyboard annotation fields (PICTURE-BOOK-STORYBOARD-VIEW-01).
     *  Edited from the Storyboard view; NULL for legacy rows and any
     *  page where the author hasn't set a value. ``story_beat``
     *  returns the raw String value (no Literal enforcement on read
     *  so legacy values still serialise cleanly). */
    notes: string | null
    story_beat: string | null
    mood_color: string | null
    act_group: string | null
    created_at: string
    updated_at: string
}

export interface PageCreate {
    layout: PageLayout
    text_content?: string | null
    image_asset_id?: string | null
    layout_config?: Record<string, unknown> | null
    notes?: string | null
    story_beat?: StoryBeat | null
    mood_color?: string | null
    act_group?: string | null
}

export interface PageUpdate {
    layout?: PageLayout
    text_content?: string | null
    image_asset_id?: string | null
    layout_config?: Record<string, unknown> | null
    notes?: string | null
    story_beat?: StoryBeat | null
    mood_color?: string | null
    act_group?: string | null
}

export interface StyleFinding {
    type: string;
    word: string;
    offset: number;
    length: number;
    severity: "info" | "warning";
    message: {de: string; en: string};
}

export interface ChapterMetric {
    chapter_id: string;
    chapter: string;
    position: number;
    chapter_type: string;
    empty: boolean;
    word_count: number;
    sentence_count: number;
    avg_sentence_length: number;
    flesch_reading_ease: number;
    difficulty: string;
    reading_time_minutes: number;
    filler_ratio: number;
    passive_ratio: number;
    adverb_ratio: number;
    adjective_ratio: number;
    long_sentence_count: number;
    finding_count: number;
}

export interface ChapterMetricsResponse {
    book_title: string;
    chapter_count: number;
    chapters: ChapterMetric[];
    averages: Record<string, number>;
}

// --- Article (AR-01 Phase 1 + AR-02 Phase 2) ---

export type ArticleStatus = "draft" | "ready" | "published" | "archived"

/** Standalone long-form article. Distinct from Book: no chapters,
 *  no front-matter, no ISBN. Single TipTap document plus minimal
 *  metadata. ``content_json`` is a string-serialised TipTap doc
 *  (matches the Chapter.content convention).
 *
 *  Phase 2 adds canonical SEO fields (canonical_url,
 *  featured_image_url, excerpt, tags) and a one-to-many
 *  relationship to Publication (fetched separately via
 *  ``api.publications.list``). */
export interface Article {
    id: string
    title: string
    subtitle: string | null
    author: string | null
    language: string
    /** Phase 1 always emits ``"article"``. The column exists for a
     *  future Blogpost / Tweet differentiation. */
    content_type: string
    content_json: string
    status: ArticleStatus
    /** AR-02 Phase 2 SEO defaults. Publications inherit these unless
     *  the per-platform metadata blob overrides. */
    canonical_url: string | null
    featured_image_url: string | null
    excerpt: string | null
    tags: string[]
    /** AR-02 Phase 2.1: primary category (settings-managed) +
     *  dedicated SEO title/description. SEO fields default to
     *  title/excerpt at publish time when empty. */
    topic: string | null
    seo_title: string | null
    seo_description: string | null
    /** Free-string series name. Mirrors ``Book.series``; flat, no
     *  hierarchy. Drives the bulk-export "filter by series" workflow. */
    series: string | null
    created_at: string
    updated_at: string
    /** Trash-bin parity with Book. ISO timestamp when the article
     *  was soft-deleted; null while live. The default list endpoint
     *  filters trashed entries out so the dashboard never sees them. */
    deleted_at?: string | null
    /** Earliest ``Publication.published_at`` across all publications.
     *  Computed server-side on every read; not a DB column. Null
     *  for native articles with no publications (or where every
     *  publication is still ``planned`` / ``scheduled``). Frontend
     *  prefers this over ``updated_at`` for date display so imported
     *  articles show the canonical Medium publish date instead of
     *  the import timestamp. */
    original_published_at?: string | null
    /** MEDIUM-COMMENTS-UI-01. Computed server-side via
     *  ``Article.comments_count`` (non-soft-deleted only); not
     *  a DB column. Drives the article-list count badge so the
     *  dashboard can render counts without an N+1 fetch per
     *  article. Defaults to 0 server-side. */
    comments_count?: number
}

/** MEDIUM-COMMENTS-IMPORT-01 + UI-01. Short user-written response
 *  to an article. Imported by per-source plugins (Medium is the
 *  first) and surfaced read-only in the editor + admin views.
 *  responds_to_article_id is nullable because some import sources
 *  (notably Medium) carry no parent-article reference at all -
 *  every Medium-imported comment is an orphan with the URL
 *  preserved in responds_to_url for later re-linkage. */
export interface ArticleComment {
    id: string
    author: string | null
    body_text: string
    body_json: string | null
    language: string
    published_at: string | null
    canonical_url: string | null
    responds_to_article_id: string | null
    responds_to_url: string | null
    imported_from: string
    imported_at: string
    source_filename: string | null
    created_at: string
    updated_at: string
}

export interface ArticleCreate {
    title: string
    subtitle?: string | null
    author?: string | null
    language?: string
}

// --- Author (Bug 8 Phase 1) ---
// The Authors-Database is decoupled from the free-text ``author``
// columns on Book / Article / ArticleComment per D5. Surfaced as
// the Wizard datalist source (Phase 2) and the new Settings
// "Authors-Database" tab.

export interface Author {
    id: string
    name: string
    slug: string
    bio: string | null
    created_at: string
    updated_at: string
}

export interface AuthorCreate {
    name: string
    bio?: string | null
}

export interface AuthorUpdate {
    name?: string
    bio?: string | null
}

/** UX-FU-02: a file uploaded against an Article (currently only
 *  featured_image). Mirrors the Asset type but article-scoped. */
export interface ArticleAsset {
    id: string
    article_id: string
    filename: string
    asset_type: string
    path: string
    uploaded_at: string
}

export interface ArticleUpdate {
    title?: string
    subtitle?: string | null
    author?: string | null
    language?: string
    content_json?: string
    status?: ArticleStatus
    canonical_url?: string | null
    featured_image_url?: string | null
    excerpt?: string | null
    tags?: string[]
    topic?: string | null
    seo_title?: string | null
    seo_description?: string | null
    series?: string | null
}

// --- Publication (AR-02 Phase 2) ---

export type PublicationStatus =
    | "planned"
    | "scheduled"
    | "published"
    | "out_of_sync"
    | "archived"

export interface Publication {
    id: string
    article_id: string
    platform: string
    is_promo: boolean
    status: PublicationStatus
    platform_metadata: Record<string, unknown>
    content_snapshot_at_publish: string | null
    scheduled_at: string | null
    published_at: string | null
    last_verified_at: string | null
    notes: string | null
    created_at: string
    updated_at: string
}

export interface PublicationCreate {
    platform: string
    is_promo?: boolean
    platform_metadata?: Record<string, unknown>
    notes?: string | null
    scheduled_at?: string | null
}

export interface PublicationUpdate {
    status?: PublicationStatus
    platform_metadata?: Record<string, unknown>
    scheduled_at?: string | null
    published_at?: string | null
    notes?: string | null
}

export interface MarkPublishedRequest {
    published_url?: string | null
    published_at?: string | null
}

/** Response shape of POST /api/articles/bulk-delete,
 *  POST /api/books/bulk-delete, and POST /api/comments/bulk-delete.
 *  Mirrors the Pydantic
 *  ``BulkDeleteResponse`` in backend/app/routers/bulk_delete.py.
 *  ``deleted_count`` counts soft- OR hard-deleted rows;
 *  ``skipped_already_trashed`` is non-empty only on the soft path
 *  when caller's list included rows whose ``deleted_at`` was
 *  already set. ``failed[]`` carries per-row errors (e.g. "not
 *  found") so the bulk action never short-circuits on one bad row. */
export interface BulkDeleteResponse {
    deleted_count: number
    skipped_already_trashed: string[]
    failed: {id: string; error: string}[]
}

/** Response shape of POST /api/articles/trash/bulk-restore,
 *  POST /api/books/trash/bulk-restore, and the existing
 *  POST /api/comments/trash/bulk-restore. Mirrors the Pydantic
 *  ``BulkRestoreResponse`` in backend/app/routers/bulk_delete.py
 *  (articles + books) and backend/app/routers/comments.py
 *  (comments). ``restored_count`` counts rows whose deleted_at
 *  was cleared; ``skipped_not_in_trash`` is the idempotency-skip
 *  list (already-live ids the caller sent anyway); ``failed[]``
 *  is unknown-id or per-row error so the Undo never short-
 *  circuits on one bad row. */
export interface BulkRestoreResponse {
    restored_count: number
    skipped_not_in_trash: string[]
    failed: {id: string; error: string}[]
}

// --- UNIVERSAL-AI-TEMPLATE-02 Session 2 types -------------------------
//
// AI template format (Article + Book) + AI-fill + bulk endpoints. The
// backend shapes are pinned by the Session 1 endpoints; these mirror
// them so the frontend can consume the JSON responses with full type
// safety.

/** Per-field skip reason returned by the apply pipeline. Mirrors
 *  the constants in backend/app/ai/template_schema. The book
 *  "all-entries-dropped" variant fires when chapter_summaries
 *  receives entries that all fail reconciliation - distinct from
 *  "value-is-empty" so the UI can render the right message. */
export type ApplySkipReason =
    | "value-is-empty"
    | "field-already-populated"
    | "all-entries-dropped"

export type ApplySkipReasons = Record<string, ApplySkipReason>

export type ArticleFieldClass =
    | "seo"
    | "tags"
    | "topic"
    | "excerpt"
    | "image_prompts"

export type BookFieldClass =
    | "marketing_copy"
    | "tags"
    | "description_genre"
    | "cover_prompt"
    | "chapter_summaries"

/** One chapter_summaries entry the import / fill pipeline rejected.
 *  Reason is one of the documented values; other strings are
 *  forward-compatible. The shape varies slightly by reason
 *  (no-matching-chapter carries chapter_id + title; summary-empty
 *  carries the original entry; not-a-mapping carries the raw entry). */
export interface DroppedChapterSummary {
    reason:
        | "no-matching-chapter"
        | "summary-empty"
        | "not-a-mapping"
        | string
    chapter_id?: string | null
    title?: string | null
    entry?: unknown
}

/** Per-record import response. ``article_id`` / ``book_id`` is
 *  present depending on the endpoint. Force flag echoes the caller's
 *  choice so a test or audit can verify the request. */
export interface AiTemplateImportResult {
    article_id?: string
    book_id?: string
    updated_fields: string[]
    skipped_fields: string[]
    skip_reasons: ApplySkipReasons
    /** Book-only. Empty list for article imports. */
    dropped_chapter_summaries?: DroppedChapterSummary[]
    force: boolean
}

export interface AiFillRequest {
    field_classes: string[]
    force?: boolean
    /** Article-only. Backend ignores for book fills. None means
     *  "use the H2 heuristic, clamped to [1, 5]". */
    inline_image_count?: number | null
}

export interface AiFillFieldClassResult {
    updated: string[]
    skipped: ApplySkipReasons
    tokens: number
    cost_usd: number | null
    error: string | null
    /** Present only on the book chapter_summaries class. */
    dropped_chapter_summaries?: DroppedChapterSummary[]
}

export interface AiFillResponse {
    article_id?: string
    book_id?: string
    updated_fields: string[]
    skipped_fields: string[]
    skip_reasons: ApplySkipReasons
    field_class_results: Record<string, AiFillFieldClassResult>
    field_class_errors: Record<string, string>
    /** Book-only aggregate across all classes. Empty for articles. */
    dropped_chapter_summaries?: DroppedChapterSummary[]
    tokens_used: number
    estimated_cost_usd: number | null
    force: boolean
    /** Article-only. */
    inline_image_count?: number
}

/** Per-entry result inside a bulk ZIP import response. */
export interface BulkAiTemplateImportItem {
    filename: string
    article_id?: string
    book_id?: string
    updated_fields: string[]
    skipped_fields: string[]
    skip_reasons: ApplySkipReasons
    dropped_chapter_summaries?: DroppedChapterSummary[]
}

export interface BulkAiTemplateImportResult {
    imported: BulkAiTemplateImportItem[]
    failed: {filename: string; error: string}[]
    force: boolean
}

export interface BulkAiFillRequest {
    ids: string[]
    field_classes: string[]
    force?: boolean
    /** Article-only. */
    inline_image_count?: number | null
}

/** Per-class entry inside the bulk estimate response. ``cost_usd``
 *  is null when the configured model is unknown to the backend
 *  pricing table. ``note`` is present only when the worker WILL
 *  skip the class (e.g. book chapter_summaries on a book with no
 *  chapters). */
export interface BulkAiFillPerClassEstimate {
    input_tokens: number
    output_tokens: number
    cost_usd: number | null
    note?: string
}

export interface BulkAiFillEstimateItem {
    id: string
    title: string
    language: string
    /** Book-only. Drives the chapter_summaries output-token
     *  heuristic of 50 tokens per chapter. */
    chapter_count?: number
    field_class_calls: number
    per_class: Record<string, BulkAiFillPerClassEstimate>
    estimated_input_tokens: number
    estimated_output_tokens: number
    estimated_cost_usd: number | null
}

export interface BulkAiFillEstimateTotals {
    total_items: number
    total_field_class_calls: number
    estimated_input_tokens: number
    estimated_output_tokens: number
    estimated_cost_usd: number | null
}

export interface BulkAiFillEstimate {
    model: string
    field_classes: string[]
    items: BulkAiFillEstimateItem[]
    totals: BulkAiFillEstimateTotals
}

export interface BulkAiFillStartResponse {
    job_id: string
}

/** SSE event payload union. Event types mirror the backend
 *  job_store events plus the synthetic stream_end appended on
 *  terminal status. */
export type BulkAiFillEvent =
    | {
          type: "start"
          data: {
              total: number
              field_classes: string[]
              rate_limit_seconds: number
          }
      }
    | {type: "item_start"; data: {id: string; index: number; title: string}}
    | {
          type: "item_done"
          data: {
              id: string
              index: number
              updated_fields: string[]
              skipped_fields: string[]
              tokens: number
              cost_usd: number | null
              field_class_errors: Record<string, string>
              dropped_chapter_summaries?: DroppedChapterSummary[]
          }
      }
    | {
          type: "item_skipped"
          data: {
              id: string
              index: number
              reason: "not-found" | "no-content" | string
          }
      }
    | {
          type: "item_error"
          data: {id: string; index: number; error: string}
      }
    | {
          type: "done"
          data: {
              total_items: number
              items_updated: number
              total_tokens: number
              total_cost_usd: number | null
          }
      }
    | {
          type: "stream_end"
          data: {
              status: "completed" | "failed" | "cancelled"
              error: string | null
          }
      }

export type BulkAiFillJobStatusName =
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"

export interface BulkAiFillJobStatus {
    id: string
    status: BulkAiFillJobStatusName
    progress: Record<string, unknown>
    result: Record<string, unknown>
    error: string | null
}

/** Per-platform metadata schema (loaded from
 *  backend/app/data/platform_schemas.yaml). The frontend renders
 *  add-publication forms from this data. */
export interface PlatformSchema {
    display_name: string
    required_metadata: string[]
    optional_metadata: string[]
    max_tags?: number | null
    max_chars_per_post?: number | null
    publishing_method: string
    notes?: string | null
}

export interface BookCreate {
    title: string;
    subtitle?: string;
    author?: string | null;
    language?: string;
    genre?: string;
    series?: string;
    series_index?: number;
    description?: string;
    /** PB-PHASE4: omit to default 'prose' (backend default). Pass
     *  'picture_book' from the dashboard's split-button menu to
     *  route the new book straight into PageEditor. */
    book_type?: "prose" | "picture_book" | "comic_book";
}

export interface BookFromTemplateCreate extends BookCreate {
    template_id: string;
}

// --- Article-to-book conversion (Phase 2 wizard) ---

export type BookFromArticlesSortStrategy =
    | "date_asc"
    | "date_desc"
    | "title_asc"
    | "title_desc"
    | "manual";

export interface BookFromArticlesFrontMatter {
    include_title_page?: boolean;
    title_page_title?: string | null;
    include_dedication?: boolean;
    dedication_title?: string | null;
    dedication_text?: string | null;
    include_introduction?: boolean;
    introduction_title?: string | null;
    introduction_text?: string | null;
}

export interface BookFromArticlesBackMatter {
    include_acknowledgments?: boolean;
    acknowledgments_title?: string | null;
    acknowledgments_text?: string | null;
    include_author_bio?: boolean;
    author_bio_title?: string | null;
    author_bio_text?: string | null;
}

export interface BookFromArticlesChapterSettings {
    use_article_title_as_chapter_title?: boolean;
}

export interface BookFromArticlesCreate {
    article_ids: string[];
    title: string;
    subtitle?: string | null;
    author?: string | null;
    language?: string;
    series?: string | null;
    series_index?: number | null;
    keywords?: string[];
    cover_image?: string | null;
    sort_strategy?: BookFromArticlesSortStrategy;
    manual_order?: string[] | null;
    front_matter?: BookFromArticlesFrontMatter | null;
    back_matter?: BookFromArticlesBackMatter | null;
    chapter_settings?: BookFromArticlesChapterSettings;
}

/** Shape of the 422 ``detail`` body when the validation gates reject
 *  one or more article ids. Every list surfaces in a single response
 *  so the wizard can show the user every offending row at once. */
export interface BookFromArticlesValidationError {
    code: "invalid_articles" | "manual_order_required" | "manual_order_mismatch";
    message: string;
    not_found_ids?: string[];
    trashed?: Array<{id: string; title: string}>;
    non_article?: Array<{id: string; title: string; content_type: string}>;
    expected_ids?: string[];
    received_ids?: string[];
}

export interface BookTemplateChapter {
    position: number;
    title: string;
    chapter_type: ChapterType;
    content: string | null;
}

export interface BookTemplate {
    id: string;
    name: string;
    description: string;
    genre: string;
    language: string;
    is_builtin: boolean;
    created_at: string;
    updated_at: string;
    chapters: BookTemplateChapter[];
}

export interface BookTemplateCreate {
    name: string;
    description: string;
    genre: string;
    language: string;
    is_builtin?: boolean;  // server forces false on POST
    chapters: BookTemplateChapter[];
}

export interface ChapterTemplate {
    id: string;
    name: string;
    description: string;
    chapter_type: ChapterType;
    content: string | null;
    language: string;
    is_builtin: boolean;
    /** TM-04b sub-item 3: when non-null and non-empty, marks the
     *  template as a group whose application inserts one chapter per
     *  child id, in list order. ``content`` + ``chapter_type`` are
     *  ignored at apply time for groups. */
    child_template_ids: string[] | null;
    created_at: string;
    updated_at: string;
}

export interface ChapterTemplateCreate {
    name: string;
    description: string;
    chapter_type: ChapterType;
    content?: string | null;
    language?: string;
    child_template_ids?: string[] | null;
}

/** All fields optional - matches the backend Pydantic
 *  ChapterTemplateUpdate (PUT /api/chapter-templates/{id}). */
export interface ChapterTemplateUpdate {
    name?: string;
    description?: string;
    chapter_type?: ChapterType;
    content?: string | null;
    language?: string;
    child_template_ids?: string[] | null;
}

export interface ChapterCreate {
    title: string;
    content?: string;
    position?: number;
    chapter_type?: ChapterType;
}

/** PATCH body for chapter updates. `version` is required and must
 *  match the server's current value, else 409.
 */
export interface ChapterUpdatePayload {
    version: number;
    title?: string;
    content?: string;
    position?: number;
    chapter_type?: ChapterType;
}

export interface ChapterVersionSummary {
    id: string;
    chapter_id: string;
    title: string;
    version: number;
    created_at: string;
}

export interface ChapterVersionRead extends ChapterVersionSummary {
    content: string;
}

export interface Asset {
    id: string;
    book_id: string;
    filename: string;
    asset_type: string;
    path: string;
    uploaded_at: string;
}

export interface CoverUploadResponse {
    cover_image: string;
    filename: string;
    width: number;
    height: number;
    aspect_ratio: number;
    size_bytes: number;
}

export interface CoverLimits {
    allowed_extensions: string[];
    max_bytes: number;
    max_mb: number;
}

export interface GoogleCloudTTSConfig {
    configured: boolean;
    project_id?: string;
    client_email?: string;
    seeding_done?: boolean;
    seeding_error?: string | null;
    voice_count?: number;
}

export interface GoogleCloudTTSUploadResponse {
    configured: boolean;
    project_id: string;
    client_email: string;
    seeding: boolean;
}

export interface AudiobookVoice {
    id: string;
    name: string;
    /** Locale string from the engine, e.g. "de-DE". May be empty for
     *  multilingual engines like ElevenLabs. */
    language?: string;
    gender?: string;
    /** Quality tier for engines that have multiple (e.g. Google Cloud:
     *  standard, wavenet, neural2, studio, journey). */
    quality?: string;
}

/** Render a voice as "Katja (de-DE, Female)".
 *
 *  Both pieces in the parens are optional - the language is missing
 *  for multilingual engines (ElevenLabs), the gender is missing when
 *  the upstream API does not report it. We squeeze whatever IS present
 *  into a single comma-separated paren so the dropdown stays visually
 *  consistent.
 */
export function formatVoiceLabel(v: AudiobookVoice): string {
    const base = v.name || v.id;
    const meta: string[] = [];
    if (v.language) meta.push(v.language);
    if (v.gender) meta.push(v.gender);
    if (v.quality && v.quality !== "standard") meta.push(v.quality);
    return meta.length > 0 ? `${base} (${meta.join(", ")})` : base;
}

export interface AudiobookChapterFile {
    filename: string;
    size_bytes: number;
    url: string;
    title?: string;
    position?: number;
    duration_seconds?: number | null;
}

export interface AudiobookMergedFile {
    filename: string;
    size_bytes: number;
    url: string;
    duration_seconds?: number | null;
}

export interface BookAudiobook {
    exists: boolean;
    book_id: string;
    status?: string;
    created_at?: string;
    engine?: string;
    voice?: string;
    language?: string;
    speed?: string;
    merge_mode?: string;
    chapters?: AudiobookChapterFile[];
    merged?: AudiobookMergedFile | null;
    zip_url?: string;
}

export interface AudiobookClassifiedChapter {
    chapter_id: string;
    title: string;
    position: number;
    chapter_type: string;
}

export interface AudiobookClassification {
    current: AudiobookClassifiedChapter[];
    outdated: AudiobookClassifiedChapter[];
    missing: AudiobookClassifiedChapter[];
    engine: string;
    voice: string;
    speed: string;
}

export interface DryRunResult {
    /** Object URL for the generated sample MP3 (revoke when done). */
    audioUrl: string;
    /** "free" or a decimal USD amount like "2.3400". */
    estimatedCostUsd: string;
    /** Number of chapters that would be generated. */
    estimatedChapters: number;
    engine: string;
    voice: string;
}

export interface HelpNavItem {
    title: string;
    slug: string;
    icon: string;
    children?: HelpNavItem[];
}

export interface HelpPage {
    slug: string;
    locale: string;
    content: string;
    last_modified: number;
}

export interface HelpSearchResult {
    slug: string;
    title: string;
    snippet: string;
    score: number;
}

export type BackupDiffLineType = "unchanged" | "added" | "removed";

export interface BackupDiffLine {
    type: BackupDiffLineType;
    text: string;
}

export interface BackupChapterDiff {
    chapter_id: string;
    position: number;
    change_type: "added" | "removed" | "changed";
    title_a: string | null;
    title_b: string | null;
    chapter_type_a: string | null;
    chapter_type_b: string | null;
    title_changed: boolean;
    type_changed: boolean;
    lines: BackupDiffLine[];
    has_changes: boolean;
}

export interface BackupMetadataChange {
    field: string;
    before: unknown;
    after: unknown;
}

export interface BackupBookDiff {
    book_id: string;
    title_a: string | null;
    title_b: string | null;
    metadata_changes: BackupMetadataChange[];
    chapter_count_a: number;
    chapter_count_b: number;
    chapters: BackupChapterDiff[];
}

export interface BackupCompareResult {
    summary: {
        books_in_both: number;
        books_only_in_a: string[];
        books_only_in_b: string[];
        filename_a: string | null;
        filename_b: string | null;
    };
    books: BackupBookDiff[];
}

export interface AudiobookExistsError {
    code: "audiobook_exists";
    message: string;
    existing: {
        created_at?: string;
        engine?: string;
        voice?: string;
        language?: string;
        speed?: string;
        merge_mode?: string;
    };
}

// --- AI / grammar shapes ---

export interface AiReviewEstimate {
    input_tokens: number;
    cost_usd: number | null;
}

export interface AiGenerateResponse {
    content: string;
}

export interface AiReviewSubmitRequest {
    content: string;
    chapter_id: string;
    chapter_title: string;
    chapter_type: string | null;
    book_title: string;
    genre: string;
    language: string;
    focus: string[];
    book_id: string;
}

export interface AiGenerateMarketingRequest {
    field: string;
    book_title: string;
    author: string | null;
    genre: string;
    language: string;
    description: string;
    chapter_titles: string[];
    existing_text: string;
    book_id: string;
}

export interface AiAsyncJobSubmit {
    job_id: string;
}

export interface AiJobStatus {
    status: string;
    result?: {review?: string} & Record<string, unknown>;
}

export interface AiTestConnectionResult {
    success: boolean;
    error_key: string;
    error_detail: string;
}

export interface GrammarMatch {
    message: string;
    short_message: string;
    offset: number;
    length: number;
    replacements: string[];
    rule_id: string;
}

export interface GrammarCheckResponse {
    matches: GrammarMatch[];
}

// --- KDP Publishing Wizard (Phase 1 MVP) ---

export interface KdpCheckMetadataRequest {
    title: string;
    subtitle: string | null;
    author: string;
    description: string | null;
    html_description: string | null;
    language: string;
    keywords: string[];
    cover_image: string | null;
    isbn_ebook: string | null;
    isbn_paperback: string | null;
    publisher: string | null;
    backpage_description: string | null;
    chapters: Array<{id: string; title: string}>;
    categories: string[];
    bisac_codes: string[];
}

export interface KdpMetadataIssue {
    field: string;
    message: string;
    severity: "error" | "warning";
}

export interface KdpMetadataCheckResult {
    complete: boolean;
    error_count: number;
    warning_count: number;
    issues: KdpMetadataIssue[];
}

// --- KDP Publishing Wizard Phase 2 (C9) ---------------------------

export type ReviewStatus =
    | "invited"
    | "sent"
    | "received"
    | "reviewed"
    | "declined";

/** ARC reviewer row as the server returns it. Matches the
 *  ``ArcReviewerOut`` Pydantic schema 1:1. */
export interface ArcReviewerApi {
    id: string;
    publishing_state_id: string;
    reviewer_name: string;
    reviewer_email: string | null;
    review_status: ReviewStatus;
    copy_version: string | null;
    review_permalink: string | null;
    review_text_excerpt: string | null;
    invited_at: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ArcReviewerCreatePayload {
    reviewer_name: string;
    reviewer_email?: string | null;
}

export interface ArcReviewerUpdatePayload {
    review_status?: ReviewStatus;
    copy_version?: string | null;
    review_permalink?: string | null;
    review_text_excerpt?: string | null;
    reviewed_at?: string | null;
}

/** ``book_publishing_state`` row as the server returns it.
 *  Matches the ``BookPublishingStateRead`` Pydantic schema. */
export interface BookPublishingStateApi {
    id: string;
    book_id: string;
    royalty_plan: "35" | "70" | null;
    kdp_select_enrolled: boolean;
    kdp_select_enrollment_date: string | null;
    expanded_distribution: boolean;
    prices: Record<
        string,
        {currency: string; list_price: number; page_count?: number}
    >;
    launch_checklist_state: Record<string, string>;
    publication_target_date: string | null;
    last_kdp_upload_at: string | null;
    created_at: string;
    updated_at: string;
    arc_reviewers: ArcReviewerApi[];
}

/** Wrapped GET response carrying both the (nullable) state row
 *  + the related book's ``updated_at`` for client-side conflict
 *  detection (C11 banner). */
export interface BookPublishingStateGetResponse {
    book_id: string;
    book_updated_at: string;
    state: BookPublishingStateApi | null;
}

export interface BookPublishingStateUpdatePayload {
    royalty_plan?: "35" | "70" | null;
    kdp_select_enrolled?: boolean;
    kdp_select_enrollment_date?: string | null;
    expanded_distribution?: boolean;
    prices?: Record<
        string,
        {currency: string; list_price: number; page_count?: number}
    >;
    launch_checklist_state?: Record<string, string>;
    publication_target_date?: string | null;
    last_kdp_upload_at?: string | null;
}

// --- ApiError with context ---

/** Thrown by `api.chapters.update` when a newer save for the same
 *  chapter superseded the in-flight request. Consumers should treat
 *  this as a no-op, not an error.
 */
export class SaveAbortedError extends Error {
    constructor() {
        super("Save superseded by a newer save for the same chapter");
        this.name = "SaveAbortedError";
    }
}

export class ApiError extends Error {
    status: number;
    detail: string;
    endpoint: string;
    method: string;
    stacktrace: string;
    timestamp: string;
    /** Structured error body when the backend returned a dict in `detail`.
     *  Used by the audiobook overwrite warning (409 audiobook_exists). */
    detailBody?: Record<string, unknown>;

    constructor(
        status: number,
        detail: string,
        endpoint: string,
        method: string,
        stacktrace = "",
        detailBody?: Record<string, unknown>,
    ) {
        super(detail);
        this.name = "ApiError";
        this.status = status;
        this.detail = detail;
        this.endpoint = endpoint;
        this.method = method;
        this.stacktrace = stacktrace;
        this.timestamp = new Date().toISOString();
        this.detailBody = detailBody;
    }
}

// --- Fetch helper ---

const BASE = "/api";

// Per-chapter in-flight save controllers for dedup/abort (see
// `api.chapters.update`). Module-local so every call site shares the
// same map.
const saveControllers = new Map<string, AbortController>();

async function request<T>(
    path: string,
    options?: RequestInit
): Promise<T> {
    const method = options?.method || "GET";
    const startTime = performance.now();
    const endpoint = `${BASE}${path}`.split("?")[0]; // strip query for recorder
    let res: Response;
    try {
        res = await fetch(`${BASE}${path}`, {
            headers: {"Content-Type": "application/json"},
            ...options,
        });
    } catch (networkError) {
        // Record network-level failures (ECONNREFUSED etc.)
        try {
            const {eventRecorder} = await import("../utils/eventRecorder");
            eventRecorder.add({type: "api_error", timestamp: startTime, method, endpoint, message: String(networkError).substring(0, 200)});
        } catch { /* recorder not available */ }
        throw networkError;
    }
    const durationMs = Math.round(performance.now() - startTime);
    // Record every API call (success and error)
    try {
        const {eventRecorder} = await import("../utils/eventRecorder");
        eventRecorder.add({type: "api_call", timestamp: startTime, method, endpoint, status: res.status, durationMs});
    } catch { /* recorder not available */ }
    if (!res.ok) {
        const err = await res.json().catch(() => ({detail: res.statusText}));
        // Backend may return `detail` as a string (simple errors) or as a
        // structured dict (conflict payloads with context). Normalise:
        // the string form lands in `.detail`, the dict form lands in
        // `.detailBody` with a synthetic `.detail` string pulled from
        // `.message` (or a fallback).
        const isDictDetail = err.detail && typeof err.detail === "object";
        const detailString = isDictDetail
            ? (err.detail.message || err.detail.error || "Request failed")
            : (err.detail || "Request failed");
        throw new ApiError(
            res.status,
            detailString,
            `${BASE}${path}`,
            method,
            err.stacktrace || "",
            isDictDetail ? (err.detail as Record<string, unknown>) : undefined,
        );
    }
    if (res.status === 204) return undefined as T;
    return res.json();
}

function _filenameFromContentDisposition(header: string | null): string | null {
    if (!header) return null;
    const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8) return decodeURIComponent(utf8[1]);
    const ascii = header.match(/filename="?([^";]+)"?/i);
    return ascii ? ascii[1] : null;
}

// --- Medium Import ---

/** One successfully-imported article from a Medium archive. */
export interface MediumImportImportedItem {
    id: string;
    title: string;
    canonical_url: string;
    warnings: string[];
}

/** A post in the archive that was skipped because an article with
 *  the same canonical URL already exists. */
export interface MediumImportSkippedItem {
    filename: string;
    canonical_url: string;
    existing_article_id: string;
}

/** A post in the archive that the importer could not process. The
 *  batch continues; per-post failures never abort the import. */
export interface MediumImportErroredItem {
    filename: string;
    error: string;
}

/** MEDIUM-COMMENTS-IMPORT-01 (v0.31.0+): a post the walker
 *  classified as comment-shaped and the importer routed to the
 *  ``article_comments`` table instead of ``articles``. The
 *  ``responds_to_article_id`` is currently always null for Medium
 *  imports because Medium's HTML export carries no parent-reference
 *  data (see lessons-learned "Schema 'preserved' / 'always set'
 *  claims must survive real-data audit"). The field stays in the
 *  interface so future importers that DO carry parent-references
 *  (e.g. a future Twitter / Bluesky importer) can populate it. */
export interface MediumImportImportedCommentItem {
    id: string;
    filename: string;
    body_preview: string;
    responds_to_article_id: string | null;
}

/** MEDIUM-COMMENTS-IMPORT-01: a comment-shaped post that was
 *  dropped without persisting. ``reason`` is one of:
 *    - ``"mode_skip"``: the plugin's ``import_comments_mode`` setting
 *      was ``"skip"``.
 *    - ``"orphan_skip"``: the plugin's ``orphan_comment_handling``
 *      setting was ``"skip"`` (Medium comments are always orphans
 *      so this discards every detected comment).
 */
export interface MediumImportSkippedCommentItem {
    filename: string;
    reason: string;
}

/** Response of POST /api/medium-import/import. Counts mirror the
 *  array lengths so consumers can render a summary without iterating.
 *
 *  MEDIUM-IMPORT-RESPONSE-INTERFACE-SYNC-01: the four comment-routing
 *  fields (``imported_comments_count``, ``skipped_comments_count``,
 *  ``imported_comments[]``, ``skipped_comments[]``) were added in
 *  v0.31.0 to mirror the backend ``ImportZipResponse`` Pydantic
 *  shape. They default to 0 / empty so consumers that don't render
 *  comment surfaces don't need defensive checks. */
export interface MediumImportResponse {
    imported_count: number;
    skipped_count: number;
    errored_count: number;
    imported: MediumImportImportedItem[];
    skipped: MediumImportSkippedItem[];
    errored: MediumImportErroredItem[];
    imported_comments_count?: number;
    skipped_comments_count?: number;
    imported_comments?: MediumImportImportedCommentItem[];
    skipped_comments?: MediumImportSkippedCommentItem[];
}

// --- Medium Import v2 (dry-run preview workflow) ---

/** One row in the v2 preview table. Mirrors the backend's
 *  ``_PreviewItemOut`` Pydantic model field-for-field. */
export interface MediumImportPreviewItem {
    filename: string;
    title: string;
    subtitle: string;
    author: string;
    published_at: string | null;
    canonical_url: string;
    detected_language: string | null;
    /** "article" or "comment" — drives the badge in the preview row. */
    classification: string;
    /** When non-null, an existing Article carries the same
     *  canonical_url. The v2 wizard renders a "would skip" badge
     *  for these rows so the user knows re-selecting them is a
     *  no-op under ``skip_existing_canonical_urls=true``. */
    existing_article_id: string | null;
    /** First ~120 chars of body text for comment rows; empty for
     *  article rows. Mirrors ``ImportedComment.body_preview``
     *  semantics so the preview and post-import result UIs surface
     *  the same snippet for the same row. */
    body_preview: string;
    warnings: string[];
}

/** A post the walker couldn't parse during the preview pass.
 *  Surfaced separately so the user understands "I see 198 rows
 *  but the ZIP had 200 posts". */
export interface MediumImportPreviewErroredItem {
    filename: string;
    error: string;
}

/** Response of POST /api/medium-import/preview. ``preview_id`` is
 *  the token the import endpoint reads to look up the cached ZIP.
 *  ``expires_at`` is the Unix timestamp at which the cache entry
 *  will be reaped server-side (default TTL 30 minutes); the
 *  frontend uses it to warn the user before submitting a stale
 *  selection. */
export interface MediumImportPreviewResponse {
    preview_id: string;
    total_posts: number;
    items: MediumImportPreviewItem[];
    errored: MediumImportPreviewErroredItem[];
    expires_at: number;
}

/** Response of DELETE /api/medium-import/preview/{preview_id}.
 *  ``deleted: false`` means the id was unknown (already expired
 *  or never existed); the response is still 200 because the
 *  caller's intent ("forget this preview") is satisfied either
 *  way. */
export interface MediumImportCancelPreviewResponse {
    deleted: boolean;
}

// --- Books ---

export const api = {
    books: {
        list: () => request<Book[]>("/books"),

        get: (id: string, includeContent = false) =>
            request<BookDetail>(`/books/${id}${includeContent ? "" : "?include_content=false"}`),

        create: (data: BookCreate) =>
            request<Book>("/books", {
                method: "POST",
                body: JSON.stringify(data),
            }),

        createFromTemplate: (data: BookFromTemplateCreate) =>
            request<BookDetail>("/books/from-template", {
                method: "POST",
                body: JSON.stringify(data),
            }),

        /** Article-to-book conversion (Phase 2 wizard). Copies the
         *  selected Articles into a brand-new Book as Chapters; the
         *  original Articles are left untouched (decoupled lifecycle).
         *
         *  On 422 the wizard inspects ``ApiError.detailBody`` for the
         *  ``BookFromArticlesValidationError`` shape so it can list
         *  every offending article in a single review screen. */
        fromArticles: (data: BookFromArticlesCreate) =>
            request<BookDetail>("/books/from-articles", {
                method: "POST",
                body: JSON.stringify(data),
            }),

        update: (id: string, data: Partial<BookCreate>) =>
            request<Book>(`/books/${id}`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),

        delete: (id: string) =>
            request<void>(`/books/${id}`, {method: "DELETE"}),

        exportUrl: (id: string, fmt: string) =>
            `${BASE}/books/${id}/export/${fmt}`,

        // Trash
        listTrash: () => request<Book[]>("/books/trash/list"),

        restore: (id: string) =>
            request<Book>(`/books/trash/${id}/restore`, {method: "POST"}),

        permanentDelete: (id: string) =>
            request<void>(`/books/trash/${id}`, {method: "DELETE"}),

        emptyTrash: () =>
            request<void>("/books/trash/empty", {method: "DELETE"}),

        /** Bulk-restore (counterpart to ``bulkDelete`` soft path).
         *  Single round-trip replacing ``Promise.all(ids.map(restore))``
         *  in the Undo-toast flow. Mirrors ``articles.bulkRestore``. */
        bulkRestore: (ids: string[]) =>
            request<BulkRestoreResponse>("/books/trash/bulk-restore", {
                method: "POST",
                body: JSON.stringify({ids}),
            }),

        /** Bulk-delete books. ``permanent=false`` moves to trash;
         *  ``true`` hard-deletes and cascades to Chapter / Asset /
         *  BookImportSource. Server-side cap MAX_BULK_DELETE=200
         *  rejects oversize requests with 422. */
        bulkDelete: (ids: string[], permanent: boolean) =>
            request<BulkDeleteResponse>("/books/bulk-delete", {
                method: "POST",
                body: JSON.stringify({ids, permanent}),
            }),

        /** Bulk export. POSTs an explicit ID list (already in display
         *  order on the dashboard) plus a format and returns a ZIP-of-
         *  books. ZIP is the only mode for books — combined-multi-book
         *  is conceptually wrong because the per-book pipeline already
         *  goes through manuscripta + write-book-template scaffolding
         *  (see backend AR-BULK-BOOKS-PARITY-01 commit for reasoning).
         *  Errors surface as ApiError with the server's fail-loud
         *  message so the toast names the offending book directly. */
        bulkExport: async (
            bookIds: string[],
            format: "epub" | "pdf" | "docx",
        ): Promise<{blob: Blob; filename: string}> => {
            const res = await fetch(`${BASE}/books/bulk-export`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({book_ids: bookIds, format}),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}))
                throw new ApiError(
                    res.status,
                    typeof err.detail === "string" ? err.detail : "Bulk book export failed",
                    `${BASE}/books/bulk-export`,
                    "POST",
                )
            }
            const blob = await res.blob()
            const filename = _filenameFromContentDisposition(
                res.headers.get("Content-Disposition"),
            ) || `books.zip`
            return {blob, filename}
        },

        /** UNIVERSAL-AI-TEMPLATE-02: AI-template export / import /
         *  empty + AI-fill for one book. The .biblio.yaml template
         *  format is self-explanatory; see docs/help/{en,de}/ai/
         *  ai-templates.md. */
        aiTemplate: {
            /** Download the book's filled template as a
             *  ``.biblio.yaml`` blob. */
            export: async (id: string): Promise<{blob: Blob; filename: string}> => {
                const res = await fetch(`${BASE}/books/${id}/ai-template`)
                if (!res.ok) {
                    const err = await res.json().catch(() => ({detail: res.statusText}))
                    throw new ApiError(
                        res.status,
                        typeof err.detail === "string" ? err.detail : "Book template export failed",
                        `${BASE}/books/${id}/ai-template`,
                        "GET",
                    )
                }
                const blob = await res.blob()
                const filename = _filenameFromContentDisposition(
                    res.headers.get("Content-Disposition"),
                ) || `book-${id}.biblio.yaml`
                return {blob, filename}
            },

            /** Import a filled template YAML against an existing book.
             *  Force=true overwrites populated fields; the AI-null /
             *  AI-empty branch always skips regardless of force. */
            import: (id: string, yamlText: string, force = false) =>
                request<AiTemplateImportResult>(
                    `/books/${id}/ai-template?force=${force}`,
                    {
                        method: "POST",
                        headers: {"Content-Type": "text/yaml"},
                        body: yamlText,
                    },
                ),

            /** Download an empty (new-idea) book template in the
             *  requested language. No reference block. */
            empty: async (
                language = "en",
            ): Promise<{blob: Blob; filename: string}> => {
                const url = `${BASE}/ai-templates/book?language=${encodeURIComponent(language)}`
                const res = await fetch(url)
                if (!res.ok) {
                    const err = await res.json().catch(() => ({detail: res.statusText}))
                    throw new ApiError(
                        res.status,
                        typeof err.detail === "string" ? err.detail : "Empty template failed",
                        url,
                        "GET",
                    )
                }
                const blob = await res.blob()
                const filename = _filenameFromContentDisposition(
                    res.headers.get("Content-Disposition"),
                ) || `new-book-${language}.biblio.yaml`
                return {blob, filename}
            },
        },

        /** Create a fresh book from a filled ``.biblio.yaml``
         *  template ("New from template" workflow). Symmetric
         *  with ``api.articles.fromAiTemplate``; backend endpoint
         *  lands in commit 5 of Session 2. Calling this before
         *  the backend is up returns 404; the typed surface is
         *  already here so the frontend doesn't churn at commit
         *  5 ship time. */
        fromAiTemplate: async (yamlText: string): Promise<BookDetail> => {
            const url = `${BASE}/books/from-ai-template`
            const res = await fetch(url, {
                method: "POST",
                headers: {"Content-Type": "text/yaml"},
                body: yamlText,
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}))
                throw new ApiError(
                    res.status,
                    typeof err.detail === "string" ? err.detail : "Create-from-template failed",
                    url,
                    "POST",
                )
            }
            return (await res.json()) as BookDetail
        },

        /** AI-fill one book. Per-class failure is isolated; the
         *  response carries ``field_class_errors`` so the UI can
         *  surface which classes failed. Tokens used bump
         *  ``Book.ai_tokens_used``. */
        aiFill: (id: string, req: AiFillRequest) =>
            request<AiFillResponse>(`/books/${id}/ai-fill`, {
                method: "POST",
                body: JSON.stringify(req),
            }),

        /** Bulk template export / import for books. Cap is 50 per
         *  request (S8). Import is multipart with a ZIP file. */
        bulkAiTemplate: {
            export: async (ids: string[]): Promise<{blob: Blob; filename: string}> => {
                const res = await fetch(`${BASE}/books/bulk-ai-template/export`, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ids}),
                })
                if (!res.ok) {
                    const err = await res.json().catch(() => ({detail: res.statusText}))
                    throw new ApiError(
                        res.status,
                        typeof err.detail === "string" ? err.detail : "Bulk template export failed",
                        `${BASE}/books/bulk-ai-template/export`,
                        "POST",
                    )
                }
                const blob = await res.blob()
                const filename = _filenameFromContentDisposition(
                    res.headers.get("Content-Disposition"),
                ) || "books-ai-templates.zip"
                return {blob, filename}
            },

            import: async (
                zipFile: File,
                force = false,
            ): Promise<BulkAiTemplateImportResult> => {
                const form = new FormData()
                form.append("file", zipFile)
                const url = `${BASE}/books/bulk-ai-template/import?force=${force}`
                const res = await fetch(url, {method: "POST", body: form})
                if (!res.ok) {
                    const err = await res.json().catch(() => ({detail: res.statusText}))
                    throw new ApiError(
                        res.status,
                        typeof err.detail === "string" ? err.detail : "Bulk template import failed",
                        url,
                        "POST",
                    )
                }
                return (await res.json()) as BulkAiTemplateImportResult
            },
        },

        /** Bulk AI-fill with per-item cost-estimate breakdown,
         *  async job, and SSE streaming. ``estimate`` does NOT run
         *  the LLM; it builds the same prompts a real run would and
         *  applies the pricing heuristic. ``start`` submits the job
         *  and returns its id; subscribe to ``streamUrl(jobId)`` via
         *  ``EventSource`` for live progress. ``status`` is a poll
         *  fallback when SSE isn't available. */
        bulkAiFill: {
            estimate: (req: BulkAiFillRequest) =>
                request<BulkAiFillEstimate>("/books/bulk-ai-fill/estimate", {
                    method: "POST",
                    body: JSON.stringify(req),
                }),

            start: (req: BulkAiFillRequest) =>
                request<BulkAiFillStartResponse>("/books/bulk-ai-fill/start", {
                    method: "POST",
                    body: JSON.stringify(req),
                }),

            streamUrl: (jobId: string) =>
                `${BASE}/books/bulk-ai-fill/jobs/${jobId}/stream`,

            status: (jobId: string) =>
                request<BulkAiFillJobStatus>(`/books/bulk-ai-fill/jobs/${jobId}`),
        },
    },

    /** AR-02 Phase 2: per-Article publications + drift detection. */
    publications: {
        list: (articleId: string) =>
            request<Publication[]>(`/articles/${articleId}/publications`),

        get: (articleId: string, pubId: string) =>
            request<Publication>(
                `/articles/${articleId}/publications/${pubId}`,
            ),

        create: (articleId: string, data: PublicationCreate) =>
            request<Publication>(`/articles/${articleId}/publications`, {
                method: "POST",
                body: JSON.stringify(data),
            }),

        update: (
            articleId: string,
            pubId: string,
            data: PublicationUpdate,
        ) =>
            request<Publication>(
                `/articles/${articleId}/publications/${pubId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify(data),
                },
            ),

        delete: (articleId: string, pubId: string) =>
            request<void>(
                `/articles/${articleId}/publications/${pubId}`,
                {method: "DELETE"},
            ),

        markPublished: (
            articleId: string,
            pubId: string,
            data: MarkPublishedRequest,
        ) =>
            request<Publication>(
                `/articles/${articleId}/publications/${pubId}/mark-published`,
                {
                    method: "POST",
                    body: JSON.stringify(data),
                },
            ),

        verifyLive: (articleId: string, pubId: string) =>
            request<Publication>(
                `/articles/${articleId}/publications/${pubId}/verify-live`,
                {method: "POST"},
            ),
    },

    /** AR-02 Phase 2: platform schemas loaded from
     *  backend/app/data/platform_schemas.yaml. Top-level path so it
     *  doesn't collide with /articles/{article_id}. */
    articlePlatforms: {
        list: () =>
            request<Record<string, PlatformSchema>>("/article-platforms"),
    },

    /** BOOK-TYPES-SSOT-YAML-01: book-type registry loaded from
     *  backend/config/book-types.yaml. Returns the {id: BookTypeDef}
     *  mapping. Frontend's useBookTypes() hook + BookTypesProvider
     *  consume this; per-component direct callers are also valid. */
    bookTypes: {
        list: () =>
            request<Record<string, BookTypeDef>>("/book-types"),
    },

    /** AR-01 Phase 1: standalone Article CRUD. Article is its own
     *  entity, NOT a Book - no chapters, no front-matter, no ISBN.
     *  Phase 2 layers on Publications + drift detection (see
     *  api.publications) and SEO fields on Article itself. */
    articles: {
        list: (status?: ArticleStatus) => {
            const qs = status ? `?status=${status}` : ""
            return request<Article[]>(`/articles${qs}`)
        },

        get: (id: string) => request<Article>(`/articles/${id}`),

        create: (data: ArticleCreate) =>
            request<Article>("/articles", {
                method: "POST",
                body: JSON.stringify(data),
            }),

        update: (id: string, data: ArticleUpdate) =>
            request<Article>(`/articles/${id}`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),

        delete: (id: string) =>
            request<void>(`/articles/${id}`, {method: "DELETE"}),

        /** Reclassify an article as an ArticleComment. Transactional
         *  move (insert comment + delete article in one commit).
         *  Returns the new comment id + the deleted article id so the
         *  caller can deep-link a "View in Comments admin" toast and
         *  drop the article from any local cache. Companion to the
         *  reciprocal ``comments.reclassifyAsArticle``. */
        reclassifyAsComment: (
            id: string,
            payload: {
                respondsToUrl?: string
                respondsToArticleId?: string
            } = {},
        ) =>
            request<{
                success: boolean
                comment_id: string
                deleted_article_id: string
            }>(`/articles/${id}/reclassify-as-comment`, {
                method: "POST",
                body: JSON.stringify({
                    responds_to_url: payload.respondsToUrl ?? null,
                    responds_to_article_id: payload.respondsToArticleId ?? null,
                }),
            }),

        /** Single-shot AI generation for SEO title / description /
         *  tags. Backend extracts plain text from the article body,
         *  builds a language-aware prompt, calls the configured AI
         *  provider, and returns either ``generated_text`` (string
         *  fields) or ``generated_tags`` (list). Tokens used bump
         *  ``Article.ai_tokens_used`` for the per-article cost
         *  dashboard. */
        generateMeta: (
            id: string,
            field: "seo_title" | "seo_description" | "tags",
        ) =>
            request<{
                generated_text?: string
                generated_tags?: string[]
                tokens_used: number
            }>(`/articles/${id}/ai/generate-meta`, {
                method: "POST",
                body: JSON.stringify({field}),
            }),

        /** MEDIUM-COMMENTS-UI-01. Read-only listing of comments
         *  that respond to this article. Returns a soft-delete-
         *  filtered list ordered by ``published_at`` ASC (NULLs
         *  last). 404 when the article id is unknown - distinct
         *  from "no comments yet" (200 + []). Drives the editor
         *  sidebar's read-only comments section. */
        getComments: (id: string) =>
            request<ArticleComment[]>(`/articles/${id}/comments`),

        // Trash bin parity with books. ``delete`` above moves to
        // trash by default (or hard-deletes when
        // ``app.delete_permanently`` is true in app.yaml). The trash
        // endpoints below are dedicated to managing trashed rows.
        listTrash: () => request<Article[]>("/articles/trash/list"),
        restore: (id: string) =>
            request<Article>(`/articles/trash/${id}/restore`, {method: "POST"}),
        permanentDelete: (id: string) =>
            request<void>(`/articles/trash/${id}`, {method: "DELETE"}),
        emptyTrash: () =>
            request<void>("/articles/trash/empty", {method: "DELETE"}),

        /** Bulk-delete. ``permanent=false`` moves rows to trash; ``true``
         *  hard-deletes and cascades to children. Response includes
         *  ``deleted_count``, ``skipped_already_trashed`` (soft path only)
         *  and ``failed[]`` so the caller's toast can surface partial
         *  failures transparently. Server-side cap matches MAX_BULK_DELETE
         *  (200) and rejects oversize requests with 422. */
        bulkDelete: (ids: string[], permanent: boolean) =>
            request<BulkDeleteResponse>("/articles/bulk-delete", {
                method: "POST",
                body: JSON.stringify({ids, permanent}),
            }),

        /** Bulk-restore (counterpart to ``bulkDelete`` soft path).
         *  Single round-trip replacing ``Promise.all(ids.map(restore))``
         *  in the Undo-toast flow. Returns per-id status so the caller
         *  can render "X restored, Y already live, Z failed". Mirrors
         *  the existing ``comments.bulkRestore`` shape. */
        bulkRestore: (ids: string[]) =>
            request<BulkRestoreResponse>("/articles/trash/bulk-restore", {
                method: "POST",
                body: JSON.stringify({ids}),
            }),

        /** Bulk export. POSTs an explicit ID list (already in display
         *  order on the dashboard) plus a format and a mode, downloads
         *  the resulting blob via a synthetic anchor click. The
         *  request bypasses the JSON wrapper because the response is a
         *  binary file (ZIP / PDF / DOCX) or a non-JSON document
         *  (Markdown / HTML); anything other than 200 surfaces as
         *  ApiError so the caller's catch block can toast the
         *  fail-loud message coming back from the server (e.g.
         *  "Failed exporting article 'X': pandoc broke on image Y"). */
        bulkExport: async (
            articleIds: string[],
            format: "markdown" | "html" | "pdf" | "docx",
            mode: "zip" | "combined",
        ): Promise<{blob: Blob; filename: string}> => {
            const res = await fetch(`${BASE}/articles/bulk-export`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({article_ids: articleIds, format, mode}),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}))
                throw new ApiError(
                    res.status,
                    typeof err.detail === "string" ? err.detail : "Bulk export failed",
                    `${BASE}/articles/bulk-export`,
                    "POST",
                )
            }
            const blob = await res.blob()
            const filename = _filenameFromContentDisposition(
                res.headers.get("Content-Disposition"),
            ) || (mode === "zip" ? "articles.zip" : `articles.${format}`)
            return {blob, filename}
        },

        /** UNIVERSAL-AI-TEMPLATE-02: AI-template export / import /
         *  empty + AI-fill for one article. Symmetrical with
         *  ``api.books.aiTemplate``. */
        aiTemplate: {
            export: async (id: string): Promise<{blob: Blob; filename: string}> => {
                const res = await fetch(`${BASE}/articles/${id}/ai-template`)
                if (!res.ok) {
                    const err = await res.json().catch(() => ({detail: res.statusText}))
                    throw new ApiError(
                        res.status,
                        typeof err.detail === "string" ? err.detail : "Article template export failed",
                        `${BASE}/articles/${id}/ai-template`,
                        "GET",
                    )
                }
                const blob = await res.blob()
                const filename = _filenameFromContentDisposition(
                    res.headers.get("Content-Disposition"),
                ) || `article-${id}.biblio.yaml`
                return {blob, filename}
            },

            import: (id: string, yamlText: string, force = false) =>
                request<AiTemplateImportResult>(
                    `/articles/${id}/ai-template?force=${force}`,
                    {
                        method: "POST",
                        headers: {"Content-Type": "text/yaml"},
                        body: yamlText,
                    },
                ),

            empty: async (
                language = "en",
            ): Promise<{blob: Blob; filename: string}> => {
                const url = `${BASE}/ai-templates/article?language=${encodeURIComponent(language)}`
                const res = await fetch(url)
                if (!res.ok) {
                    const err = await res.json().catch(() => ({detail: res.statusText}))
                    throw new ApiError(
                        res.status,
                        typeof err.detail === "string" ? err.detail : "Empty template failed",
                        url,
                        "GET",
                    )
                }
                const blob = await res.blob()
                const filename = _filenameFromContentDisposition(
                    res.headers.get("Content-Disposition"),
                ) || `new-article-${language}.biblio.yaml`
                return {blob, filename}
            },
        },

        /** Create a fresh article from a filled
         *  ``.biblio.yaml`` template (the "New from template"
         *  workflow). Backend mirrors the per-record import
         *  pipeline but with force=True implicit since every
         *  column starts empty. Requires the template's
         *  title.current_value to be a non-empty string. */
        fromAiTemplate: async (yamlText: string): Promise<Article> => {
            const url = `${BASE}/articles/from-ai-template`
            const res = await fetch(url, {
                method: "POST",
                headers: {"Content-Type": "text/yaml"},
                body: yamlText,
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}))
                throw new ApiError(
                    res.status,
                    typeof err.detail === "string" ? err.detail : "Create-from-template failed",
                    url,
                    "POST",
                )
            }
            return (await res.json()) as Article
        },

        aiFill: (id: string, req: AiFillRequest) =>
            request<AiFillResponse>(`/articles/${id}/ai-fill`, {
                method: "POST",
                body: JSON.stringify(req),
            }),

        bulkAiTemplate: {
            export: async (ids: string[]): Promise<{blob: Blob; filename: string}> => {
                const res = await fetch(`${BASE}/articles/bulk-ai-template/export`, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ids}),
                })
                if (!res.ok) {
                    const err = await res.json().catch(() => ({detail: res.statusText}))
                    throw new ApiError(
                        res.status,
                        typeof err.detail === "string" ? err.detail : "Bulk template export failed",
                        `${BASE}/articles/bulk-ai-template/export`,
                        "POST",
                    )
                }
                const blob = await res.blob()
                const filename = _filenameFromContentDisposition(
                    res.headers.get("Content-Disposition"),
                ) || "articles-ai-templates.zip"
                return {blob, filename}
            },

            import: async (
                zipFile: File,
                force = false,
            ): Promise<BulkAiTemplateImportResult> => {
                const form = new FormData()
                form.append("file", zipFile)
                const url = `${BASE}/articles/bulk-ai-template/import?force=${force}`
                const res = await fetch(url, {method: "POST", body: form})
                if (!res.ok) {
                    const err = await res.json().catch(() => ({detail: res.statusText}))
                    throw new ApiError(
                        res.status,
                        typeof err.detail === "string" ? err.detail : "Bulk template import failed",
                        url,
                        "POST",
                    )
                }
                return (await res.json()) as BulkAiTemplateImportResult
            },
        },

        bulkAiFill: {
            estimate: (req: BulkAiFillRequest) =>
                request<BulkAiFillEstimate>("/articles/bulk-ai-fill/estimate", {
                    method: "POST",
                    body: JSON.stringify(req),
                }),

            start: (req: BulkAiFillRequest) =>
                request<BulkAiFillStartResponse>("/articles/bulk-ai-fill/start", {
                    method: "POST",
                    body: JSON.stringify(req),
                }),

            streamUrl: (jobId: string) =>
                `${BASE}/articles/bulk-ai-fill/jobs/${jobId}/stream`,

            status: (jobId: string) =>
                request<BulkAiFillJobStatus>(`/articles/bulk-ai-fill/jobs/${jobId}`),
        },
    },

    /** AR editor-parity Phase 2: translate an Article into a new
     *  target-language Article. Backend route lives in the
     *  translation plugin (POST /api/translation/translate-article).
     *  Returns the new article id; caller navigates to it. */
    articleTranslation: {
        translate: (
            articleId: string,
            targetLang: string,
            opts: {sourceLang?: string; provider?: "deepl" | "lmstudio"; titleSuffix?: string} = {},
        ) =>
            request<{
                article_id: string;
                title: string;
                language: string;
                original_article_id: string;
                provider: string;
            }>("/translation/translate-article", {
                method: "POST",
                body: JSON.stringify({
                    article_id: articleId,
                    target_lang: targetLang,
                    source_lang: opts.sourceLang,
                    provider: opts.provider ?? "deepl",
                    title_suffix: opts.titleSuffix ?? "",
                }),
            }),

        /** Available providers + their configured/health state.
         *  Read this before showing the translate panel so the user
         *  is not surprised by a 400 "No API key configured". */
        providers: () =>
            request<Array<{id: string; name: string; configured: boolean; description: string}>>(
                "/translation/providers",
            ),

        /** Live health check for each provider (DeepL: validates the
         *  API key with a usage call; LMStudio: pings /models on the
         *  configured base_url). Use this to filter the translate
         *  dropdown so the user does not pick a provider that will
         *  120s-timeout on submit. */
        health: () =>
            request<Record<string, {status: "ok" | "error" | "not_configured"; error?: string}>>(
                "/translation/health",
            ),
    },

    /** AR editor-parity Phase 3: download an article as
     *  Markdown / HTML / PDF / DOCX. Triggers a browser download
     *  via fetch + Blob (instead of a plain link click) so the
     *  caller can show progress and surface backend errors via
     *  the standard ApiError toast path. */
    articleExport: {
        download: async (
            articleId: string,
            fmt: "markdown" | "html" | "pdf" | "docx",
        ): Promise<void> => {
            const url = `${BASE}/articles/${articleId}/export/${fmt}`;
            const res = await fetch(url, {method: "GET"});
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(
                    res.status,
                    err.detail || "Article export failed",
                    url,
                    "GET",
                    err.stacktrace || "",
                );
            }
            // Filename comes from Content-Disposition; fall back to
            // a generic article.{ext} when missing.
            const cd = res.headers.get("content-disposition") ?? "";
            const match = cd.match(/filename="?([^";]+)"?/i);
            const ext = fmt === "markdown" ? "md" : fmt;
            const filename = match ? match[1] : `article.${ext}`;
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objectUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);
        },

        formats: (articleId: string) =>
            request<{formats: string[]; pandoc_required: string[]}>(
                `/articles/${articleId}/export`,
            ),
    },

    /** UX-FU-02: per-article asset uploads (currently
     *  ``featured_image``). Mirrors ``api.covers`` for books. */
    articleAssets: {
        upload: async (
            articleId: string,
            file: File,
            assetType: string = "featured_image",
        ): Promise<ArticleAsset> => {
            const formData = new FormData();
            formData.append("file", file);
            const url = `${BASE}/articles/${articleId}/assets?asset_type=${encodeURIComponent(assetType)}`;
            const res = await fetch(url, {method: "POST", body: formData});
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(
                    res.status,
                    err.detail || "Article asset upload failed",
                    url,
                    "POST",
                    err.stacktrace || "",
                );
            }
            return res.json();
        },

        list: (articleId: string) =>
            request<ArticleAsset[]>(`/articles/${articleId}/assets`),

        delete: (articleId: string, assetId: string) =>
            request<void>(`/articles/${articleId}/assets/${assetId}`, {
                method: "DELETE",
            }),

        /** Build the served URL for an uploaded asset. The backend
         *  serves files by filename via ``GET /file/{filename}``. */
        urlFor: (articleId: string, filename: string): string =>
            `/api/articles/${articleId}/assets/file/${encodeURIComponent(filename)}`,
    },

    /** MEDIUM-COMMENTS-UI-01. Admin-side comments management.
     *  Article-scoped read access lives on api.articles.getComments
     *  (where it semantically belongs with the article). This
     *  namespace is for cross-article admin operations: filtered
     *  listing + soft-delete. Future v2 work in this namespace:
     *  bulk-delete, re-link to article, hard-delete. */
    comments: {
        /** List comments across all articles. ``importedFrom``
         *  narrows to one source (e.g. ``"medium"``);
         *  ``orphansOnly=true`` restricts to comments with
         *  ``responds_to_article_id IS NULL``. Soft-deleted
         *  comments are excluded by the backend. Server cap is
         *  500; default is 100. */
        list: (params: {
            importedFrom?: string
            orphansOnly?: boolean
            limit?: number
        } = {}) => {
            const qs = new URLSearchParams()
            if (params.importedFrom)
                qs.set("imported_from", params.importedFrom)
            if (params.orphansOnly) qs.set("orphans_only", "true")
            if (params.limit != null) qs.set("limit", String(params.limit))
            const suffix = qs.toString() ? `?${qs.toString()}` : ""
            return request<ArticleComment[]>(`/comments${suffix}`)
        },

        /** Soft-delete a single comment. Idempotent: re-deletes
         *  return 204 so a bulk-by-id flow stays clean. 404 only
         *  when the id is unknown. */
        delete: (id: string) =>
            request<void>(`/comments/${id}`, {method: "DELETE"}),

        /** Reciprocal of ``articles.reclassifyAsComment``: move an
         *  ArticleComment to Article. Article.title is auto-derived
         *  from the comment body (truncated at 200 chars + ``"..."``).
         *  The caller typically navigates straight to
         *  ``/articles/{article_id}`` so the user can edit the title
         *  if the auto-derivation reads awkwardly. */
        reclassifyAsArticle: (id: string) =>
            request<{
                success: boolean
                article_id: string
                deleted_comment_id: string
            }>(`/comments/${id}/reclassify-as-article`, {
                method: "POST",
                body: JSON.stringify({}),
            }),

        /** Bulk soft- (default) or permanent-delete a list of comment
         *  ids. Mirrors ``articles.bulkDelete`` and
         *  ``books.bulkDelete``. Uncapped — comments-admin selections
         *  can run into the hundreds and the backend is DB-bound
         *  (sub-second). Response carries per-row outcomes so the
         *  caller's toast can surface partial failures. */
        bulkDelete: (ids: string[], permanent: boolean) =>
            request<BulkDeleteResponse>("/comments/bulk-delete", {
                method: "POST",
                body: JSON.stringify({ids, permanent}),
            }),

        // --- Bug 10: trash-lifecycle methods ---

        /** List every comment currently in the trash, newest-trashed
         *  first. Mirror of ``articles.listTrash`` / ``books`` trash
         *  list. Soft-deleted comments only — the active ``list``
         *  endpoint filters them out by ``deleted_at IS NULL``. */
        listTrashed: () => request<ArticleComment[]>("/comments/trash/list"),

        /** Restore a trashed comment. Returns the restored row.
         *  404 when the id is unknown OR not currently in trash
         *  (protects multi-tab races where another tab restored
         *  first). */
        restore: (id: string) =>
            request<ArticleComment>(`/comments/trash/${id}/restore`, {
                method: "POST",
            }),

        /** Permanently remove one comment from the trash. 404 when
         *  the id is not currently in trash — the caller MUST
         *  soft-delete first via ``delete()``. No single-step
         *  hard-delete-without-trash path exists by design. */
        permanentDelete: (id: string) =>
            request<void>(`/comments/trash/${id}`, {method: "DELETE"}),

        /** Permanently delete every comment currently in trash.
         *  Returns 204 even when the trash was already empty
         *  (idempotent). */
        emptyTrash: () =>
            request<void>("/comments/trash/empty", {method: "DELETE"}),

        /** Bulk-restore the given trashed ids. Per-id outcomes:
         *  ``restored_count`` (success), ``skipped_not_in_trash``
         *  (already live — idempotent), ``failed`` (unknown id or
         *  unexpected error). Bulk-permanent-delete is NOT a
         *  separate endpoint — use ``bulkDelete(ids, true)`` which
         *  hard-deletes regardless of soft-delete state. */
        bulkRestore: (ids: string[]) =>
            request<{
                restored_count: number
                skipped_not_in_trash: string[]
                failed: {id: string; error: string}[]
            }>("/comments/trash/bulk-restore", {
                method: "POST",
                body: JSON.stringify({ids}),
            }),
    },

    authors: {
        /** List authors ordered by name. ``search`` is a
         *  case-insensitive substring filter on ``name``;
         *  whitespace-only is treated as omitted. ``limit``
         *  defaults to 200, capped at 1000 server-side. */
        list: (params: {search?: string; limit?: number} = {}) => {
            const qs = new URLSearchParams()
            if (params.search) qs.set("search", params.search)
            if (params.limit != null) qs.set("limit", String(params.limit))
            const suffix = qs.toString() ? `?${qs.toString()}` : ""
            return request<Author[]>(`/authors${suffix}`)
        },

        get: (id: string) => request<Author>(`/authors/${id}`),

        /** Slug is server-generated from ``name`` (lowercase +
         *  hyphenated, German + Nordic diacritics transliterated,
         *  NFKD-fold for other diacritics). Collisions append a
         *  numeric suffix (``-2``, ``-3`` ...). Empty result (all-
         *  emoji input) falls back to ``"author"``. */
        create: (data: AuthorCreate) =>
            request<Author>("/authors", {
                method: "POST",
                body: JSON.stringify(data),
            }),

        /** Partial update. Slug is immutable; name edits do NOT
         *  regenerate it. */
        update: (id: string, data: AuthorUpdate) =>
            request<Author>(`/authors/${id}`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),

        /** Hard-delete. Idempotent: 204 even on already-gone. */
        delete: (id: string) =>
            request<void>(`/authors/${id}`, {method: "DELETE"}),
    },

    chapters: {
        list: (bookId: string) =>
            request<Chapter[]>(`/books/${bookId}/chapters`),

        get: (bookId: string, chapterId: string) =>
            request<Chapter>(`/books/${bookId}/chapters/${chapterId}`),

        create: (bookId: string, data: ChapterCreate) =>
            request<Chapter>(`/books/${bookId}/chapters`, {
                method: "POST",
                body: JSON.stringify(data),
            }),

        /** PS-13: clone the user's local edit into a NEW chapter
         *  inserted directly after the source. Used by the
         *  ConflictResolutionDialog "Save as new chapter" action so the
         *  user preserves their unsaved draft without overwriting the
         *  server's copy of the source chapter. */
        fork: (
            bookId: string,
            chapterId: string,
            data: {content: string; title?: string},
        ) =>
            request<Chapter>(`/books/${bookId}/chapters/${chapterId}/fork`, {
                method: "POST",
                body: JSON.stringify(data),
            }),

        update: async (bookId: string, chapterId: string, data: ChapterUpdatePayload): Promise<Chapter> => {
            // Per-chapter abort: if a save for this chapter is already
            // in flight when a new one starts, cancel the old one. The
            // latest save always wins. Aborts surface as
            // SaveAbortedError so callers can treat them as no-ops.
            const prior = saveControllers.get(chapterId);
            if (prior) prior.abort();
            const controller = new AbortController();
            saveControllers.set(chapterId, controller);
            try {
                const result = await request<Chapter>(`/books/${bookId}/chapters/${chapterId}`, {
                    method: "PATCH",
                    body: JSON.stringify(data),
                    signal: controller.signal,
                });
                if (saveControllers.get(chapterId) === controller) {
                    saveControllers.delete(chapterId);
                }
                return result;
            } catch (err) {
                if (saveControllers.get(chapterId) === controller) {
                    saveControllers.delete(chapterId);
                }
                if (err instanceof Error && err.name === "AbortError") {
                    throw new SaveAbortedError();
                }
                throw err;
            }
        },

        /** Best-effort save that survives tab close / page unload.
         *
         * Uses `fetch(..., {keepalive: true})` so the browser completes
         * the request after the tab is gone. Does NOT go through the
         * normal `request` helper: keepalive requests cannot be
         * cancelled and we intentionally skip the abort-controller
         * queue (see commit 8). Errors are swallowed - the IndexedDB
         * draft is the authoritative fallback for unload-time saves.
         */
        updateKeepalive: (bookId: string, chapterId: string, data: ChapterUpdatePayload): void => {
            try {
                void fetch(`${BASE}/books/${bookId}/chapters/${chapterId}`, {
                    method: "PATCH",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(data),
                    keepalive: true,
                }).catch(() => {
                    // IndexedDB draft covers this case.
                });
            } catch {
                // Some browsers reject keepalive bodies > 64KB. The draft covers it.
            }
        },

        delete: (bookId: string, chapterId: string) =>
            request<void>(`/books/${bookId}/chapters/${chapterId}`, {
                method: "DELETE",
            }),

        reorder: (bookId: string, chapterIds: string[]) =>
            request<Chapter[]>(`/books/${bookId}/chapters/reorder`, {
                method: "PUT",
                body: JSON.stringify({chapter_ids: chapterIds}),
            }),

        listVersions: (bookId: string, chapterId: string) =>
            request<ChapterVersionSummary[]>(`/books/${bookId}/chapters/${chapterId}/versions`),

        getVersion: (bookId: string, chapterId: string, versionId: string) =>
            request<ChapterVersionRead>(`/books/${bookId}/chapters/${chapterId}/versions/${versionId}`),

        restoreVersion: (bookId: string, chapterId: string, versionId: string) =>
            request<Chapter>(`/books/${bookId}/chapters/${chapterId}/versions/${versionId}/restore`, {
                method: "POST",
            }),

        validateToc: (bookId: string) =>
            request<{
                valid: boolean;
                toc_found: boolean;
                total_links: number;
                broken_count: number;
                links: {text: string; anchor: string; toc_chapter_id: string}[];
                broken: {text: string; anchor: string; toc_chapter_id: string}[];
                valid_anchors: string[];
            }>(`/books/${bookId}/chapters/validate-toc`, {method: "POST"}),
    },

    /** PB-PHASE4 picture-book pages CRUD. Endpoints come from the
     *  kinderbuch plugin's ``pages.py`` router (mounted under
     *  ``/api/books/{book_id}/pages*``). Domain conventions
     *  intentionally diverge from ``api.chapters`` in two ways:
     *
     *    - No abort-controller on ``update`` (Page fields are
     *      manually-saved, not auto-saved per keystroke like
     *      Chapter content).
     *    - ``reorder`` is POST, not PUT (honours the deployed
     *      backend — the Session-2 router shipped with POST).
     *
     *  These are deliberate domain-specific patterns, not
     *  inconsistencies; see PB-PHASE4 Session 3 handover. */
    pages: {
        list: (bookId: string) =>
            request<Page[]>(`/books/${bookId}/pages`),

        create: (bookId: string, data: PageCreate) =>
            request<Page>(`/books/${bookId}/pages`, {
                method: "POST",
                body: JSON.stringify(data),
            }),

        update: (bookId: string, pageId: string, data: PageUpdate) =>
            request<Page>(`/books/${bookId}/pages/${pageId}`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),

        delete: (bookId: string, pageId: string) =>
            request<void>(`/books/${bookId}/pages/${pageId}`, {
                method: "DELETE",
            }),

        /** Bulk-reorder by full id-list. Backend runs the position
         *  updates in a single transaction; partial failure leaves
         *  no half-reordered state. Returns the post-reorder
         *  ordered list. */
        reorder: (bookId: string, pageIds: string[]) =>
            request<Page[]>(`/books/${bookId}/pages/reorder`, {
                method: "POST",
                body: JSON.stringify({page_ids: pageIds}),
            }),
    },

    assets: {
        list: (bookId: string) =>
            request<Asset[]>(`/books/${bookId}/assets`),

        upload: async (bookId: string, file: File, assetType: string): Promise<Asset> => {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(
                `${BASE}/books/${bookId}/assets?asset_type=${assetType}`,
                {method: "POST", body: formData}
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(res.status, err.detail || "Upload failed", `${BASE}/books/assets`, "POST", err.stacktrace || "");
            }
            return res.json();
        },

        delete: (bookId: string, assetId: string) =>
            request<void>(`/books/${bookId}/assets/${assetId}`, {method: "DELETE"}),
    },

    covers: {
        upload: async (bookId: string, file: File): Promise<CoverUploadResponse> => {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(`${BASE}/books/${bookId}/cover`, {
                method: "POST",
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(
                    res.status,
                    err.detail || "Cover upload failed",
                    `${BASE}/books/${bookId}/cover`,
                    "POST",
                    err.stacktrace || "",
                );
            }
            return res.json();
        },

        delete: (bookId: string) =>
            request<void>(`/books/${bookId}/cover`, {method: "DELETE"}),

        limits: (bookId: string) =>
            request<CoverLimits>(`/books/${bookId}/cover/limits`),
    },

    /** Document export (epub/pdf/docx/html/markdown). Fetches the file
     *  via blob so 4xx errors (e.g. 422 missing_images) surface as
     *  ApiError with detailBody, instead of being lost in window.open. */
    documentExport: {
        download: async (
            bookId: string,
            format: string,
            params: URLSearchParams,
        ): Promise<void> => {
            const query = params.toString();
            const url = `${BASE}/books/${bookId}/export/${format}${query ? `?${query}` : ""}`;
            const res = await fetch(url, {method: "GET"});
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(
                    res.status,
                    typeof err.detail === "string" ? err.detail : (err.detail?.message || "Export failed"),
                    url,
                    "GET",
                    err.stacktrace || "",
                    typeof err.detail === "object" ? err.detail : undefined,
                );
            }
            const blob = await res.blob();
            const filename = _filenameFromContentDisposition(res.headers.get("Content-Disposition"))
                ?? `${bookId}.${format}`;
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        },
    },

    exportJobs: {
        /** POST /api/books/{id}/export/async/audiobook -> {job_id, status}
         *
         * When ``confirmOverwrite`` is false (default) and the book already
         * has a persisted audiobook on disk, the backend returns 409 with
         * an ``audiobook_exists`` payload that the caller must surface as
         * a confirm dialog before retrying with confirmOverwrite=true.
         */
        startAudiobook: async (
            bookId: string,
            confirmOverwrite: boolean = false,
            generationMode: string = "missing_and_outdated",
        ): Promise<{job_id: string; status: string}> => {
            const params = new URLSearchParams();
            if (confirmOverwrite) params.set("confirm_overwrite", "true");
            if (generationMode !== "missing_and_outdated") params.set("generation_mode", generationMode);
            const qs = params.toString();
            const url = `${BASE}/books/${bookId}/export/async/audiobook${qs ? `?${qs}` : ""}`;
            const res = await fetch(url, {method: "POST"});
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(
                    res.status,
                    typeof err.detail === "string" ? err.detail : (err.detail?.message || "Audiobook export failed"),
                    url,
                    "POST",
                    err.stacktrace || "",
                    typeof err.detail === "object" ? err.detail : undefined,
                );
            }
            return res.json();
        },
        /** DELETE /api/export/jobs/{id} -> 204 on success, 409 if already done */
        cancel: (jobId: string) =>
            request<void>(`/export/jobs/${jobId}`, {method: "DELETE"}),
        /** Per-chapter MP3 download URL (no API call, just the URL string) */
        chapterFileUrl: (jobId: string, filename: string) =>
            `${BASE}/export/jobs/${jobId}/files/${encodeURIComponent(filename)}`,
        /** Bundled audiobook download URL */
        downloadUrl: (jobId: string) =>
            `${BASE}/export/jobs/${jobId}/download`,
    },

    audiobook: {
        /** GET /api/audiobook/config/elevenlabs -> {configured} */
        getElevenLabsConfig: () =>
            request<{configured: boolean}>("/audiobook/config/elevenlabs"),

        /** POST /api/audiobook/config/elevenlabs -> verifies and persists */
        setElevenLabsKey: (apiKey: string) =>
            request<{
                configured: boolean;
                tier?: string;
                character_count?: number;
                character_limit?: number;
            }>("/audiobook/config/elevenlabs", {
                method: "POST",
                body: JSON.stringify({api_key: apiKey}),
            }),

        /** DELETE /api/audiobook/config/elevenlabs */
        deleteElevenLabsKey: () =>
            request<void>("/audiobook/config/elevenlabs", {method: "DELETE"}),

        /** Google Cloud TTS credentials (Service Account JSON upload) */
        getGoogleCloudConfig: () =>
            request<GoogleCloudTTSConfig>("/audiobook/config/google-cloud-tts"),

        uploadGoogleCloudCredentials: async (file: File): Promise<GoogleCloudTTSUploadResponse> => {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(`${BASE}/audiobook/config/google-cloud-tts`, {
                method: "POST",
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(
                    res.status,
                    err.detail || "Upload failed",
                    `${BASE}/audiobook/config/google-cloud-tts`,
                    "POST",
                    err.stacktrace || "",
                );
            }
            return res.json();
        },

        testGoogleCloudCredentials: () =>
            request<{valid: boolean; message: string}>("/audiobook/config/google-cloud-tts/test", {method: "POST"}),

        deleteGoogleCloudCredentials: () =>
            request<void>("/audiobook/config/google-cloud-tts", {method: "DELETE"}),

        /** Fetch voices for a specific engine + language combination.
         *
         *  Tries the core ``/api/voices`` cache first; falls back to the
         *  audiobook plugin's live ``/api/audiobook/voices`` endpoint if
         *  the cache is empty (e.g. for non-Edge engines that have no
         *  seeded rows in ``audio_voices``). Returns ``[]`` for any
         *  unknown engine or empty language - the dropdown then shows a
         *  clear "no voices for this engine/language" empty state and
         *  the user knows to switch engines instead of staring at a
         *  silently misfilled dropdown of voices that do not actually
         *  belong to the selected engine.
         *
         *  Critically, there is NO hardcoded Edge-TTS fallback list any
         *  more. The previous implementation showed Edge German voices
         *  whenever ``/api/voices`` returned empty - which the user
         *  experienced as the dropdown leaking voices for engines they
         *  did not pick.
         */
        listVoices: async (
            engine: string,
            language: string,
        ): Promise<AudiobookVoice[]> => {
            if (!engine || !language) return [];
            const params = new URLSearchParams({engine, language});

            // 1) Core cache
            try {
                const cached = await request<AudiobookVoice[]>(`/voices?${params}`);
                if (cached && cached.length > 0) return cached;
            } catch {
                // Core endpoint may be missing in odd test setups - fall
                // through to the plugin endpoint instead of giving up.
            }

            // 2) Live plugin endpoint (only meaningful for the engines
            //    the audiobook plugin actually knows how to query).
            try {
                const live = await request<AudiobookVoice[]>(
                    `/audiobook/voices?${params}`,
                );
                return Array.isArray(live) ? live : [];
            } catch {
                return [];
            }
        },

        /** Synthesise a short preview MP3 for the editor's "Vorlesen"
         *  button. Returns the audio bytes as a Blob so the caller
         *  can `URL.createObjectURL` it into an <audio> element. */
        preview: async (
            text: string,
            bookId: string,
            chapterTitle: string,
        ): Promise<Blob> => {
            const url = `${BASE}/audiobook/preview`;
            const res = await fetch(url, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({text, book_id: bookId, chapter_title: chapterTitle}),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(
                    res.status,
                    err.detail || "Preview failed",
                    url,
                    "POST",
                    err.stacktrace || "",
                );
            }
            return res.blob();
        },
    },

    ai: {
        /** Cheap pre-flight estimate for the AI review cost label. */
        estimateReview: (content: string) =>
            request<AiReviewEstimate>("/ai/review/estimate", {
                method: "POST",
                body: JSON.stringify({content}),
            }),

        /** Free-form generation used by the editor's AI panel. */
        generate: (prompt: string, system: string, bookId: string) =>
            request<AiGenerateResponse>("/ai/generate", {
                method: "POST",
                body: JSON.stringify({prompt, system, book_id: bookId}),
            }),

        /** Submit an async chapter review. The caller subscribes to
         *  `/api/ai/jobs/{id}/stream` (SSE) afterwards via the native
         *  EventSource - that lifecycle is not part of the API client. */
        reviewAsync: (request_body: AiReviewSubmitRequest) =>
            request<AiAsyncJobSubmit>("/ai/review/async", {
                method: "POST",
                body: JSON.stringify(request_body),
            }),

        /** Poll the final job result once SSE reports `stream_end`. */
        getJob: (jobId: string) =>
            request<AiJobStatus>(`/ai/jobs/${jobId}`),

        /** Generate marketing copy for a book metadata field. */
        generateMarketing: (request_body: AiGenerateMarketingRequest) =>
            request<AiGenerateResponse>("/ai/generate-marketing", {
                method: "POST",
                body: JSON.stringify(request_body),
            }),

        /** Test the current AI configuration with a minimal request.
         *  Backend GET /api/ai/test-connection returns
         *  {success, error_key, error_detail}. Consumers branch on
         *  success and may map error_key to localized strings. */
        testConnection: () =>
            request<AiTestConnectionResult>("/ai/test-connection"),
    },

    grammar: {
        check: (text: string) =>
            request<GrammarCheckResponse>("/grammar/check", {
                method: "POST",
                body: JSON.stringify({text}),
            }),
    },

    kdp: {
        /** List the bundled KDP category catalog. Returns the 26
         *  Amazon-canonical category names (verified by
         *  test_kdp_categories_returns_full_26_catalog). The catalog
         *  is dictated by Amazon and stable across the editor's
         *  lifetime, so callers typically fetch once on mount and
         *  cache for the duration of the surface (BookMetadataEditor
         *  pattern). KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01. */
        listCategories: () =>
            request<string[]>("/kdp/categories"),

        /** Metadata-completeness check for KDP publishing. Returns
         *  errors (block publishing) + warnings (recommended).
         *  Used by Phase 1 MVP wizard Step 1. */
        checkMetadata: (payload: KdpCheckMetadataRequest) =>
            request<KdpMetadataCheckResult>("/kdp/check-metadata", {
                method: "POST",
                body: JSON.stringify(payload),
            }),

        /** Build the KDP-ready ZIP for a book. Returns the blob +
         *  the server-supplied filename. Used by Phase 1 MVP
         *  wizard Step 3. Returns a 400 with a readable detail
         *  when metadata is incomplete (defence-in-depth gate). */
        buildPackage: async (
            bookId: string,
        ): Promise<{blob: Blob; filename: string}> => {
            const res = await fetch(`${BASE}/kdp/package/${bookId}`, {
                method: "POST",
            })
            if (!res.ok) {
                const err = await res
                    .json()
                    .catch(() => ({detail: res.statusText}))
                throw new ApiError(
                    res.status,
                    typeof err.detail === "string"
                        ? err.detail
                        : "KDP package build failed",
                    `${BASE}/kdp/package/${bookId}`,
                    "POST",
                )
            }
            const blob = await res.blob()
            const filename =
                _filenameFromContentDisposition(
                    res.headers.get("Content-Disposition"),
                ) || `${bookId}-kdp-package.zip`
            return {blob, filename}
        },

        // --- ARC reviewer CRUD (Phase 2 C9) ---------------------

        /** List ARC reviewers for a book. Returns ``[]`` when no
         *  publishing-state row exists yet. */
        listReviewers: (bookId: string) =>
            request<ArcReviewerApi[]>(
                `/kdp/publishing-state/${bookId}/reviewers`,
            ),

        /** Add a reviewer to the book's ARC list. Server auto-
         *  creates the publishing-state row if absent + assigns
         *  ``review_status="invited"`` + ``invited_at=now``. */
        addReviewer: (
            bookId: string,
            payload: ArcReviewerCreatePayload,
        ) =>
            request<ArcReviewerApi>(
                `/kdp/publishing-state/${bookId}/reviewers`,
                {
                    method: "POST",
                    body: JSON.stringify(payload),
                },
            ),

        /** Update an ARC reviewer's status / permalink / excerpt.
         *  Server auto-stamps ``reviewed_at`` when status flips to
         *  ``reviewed`` and the payload didn't supply one. */
        updateReviewer: (
            bookId: string,
            reviewerId: string,
            payload: ArcReviewerUpdatePayload,
        ) =>
            request<ArcReviewerApi>(
                `/kdp/publishing-state/${bookId}/reviewers/${reviewerId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                },
            ),

        /** Hard-delete an ARC reviewer (no soft-delete per A25). */
        deleteReviewer: async (
            bookId: string,
            reviewerId: string,
        ): Promise<void> => {
            const res = await fetch(
                `${BASE}/kdp/publishing-state/${bookId}/reviewers/${reviewerId}`,
                {method: "DELETE"},
            )
            if (!res.ok) {
                throw new ApiError(
                    res.status,
                    `Reviewer delete failed (${res.status})`,
                    `${BASE}/kdp/publishing-state/${bookId}/reviewers/${reviewerId}`,
                    "DELETE",
                )
            }
        },

        // --- BookPublishingState (Phase 2 C10) -------------------

        /** Load the publishing-state row + the related book's
         *  ``updated_at`` for client-side conflict detection.
         *  Returns ``state: null`` when no row exists yet. */
        getPublishingState: (bookId: string) =>
            request<BookPublishingStateGetResponse>(
                `/kdp/publishing-state/${bookId}`,
            ),

        /** Upsert the publishing-state row. Missing row → created
         *  with defaults + payload overrides; existing row →
         *  partial-updated with the explicitly-set payload
         *  fields. */
        upsertPublishingState: (
            bookId: string,
            payload: BookPublishingStateUpdatePayload,
        ) =>
            request<BookPublishingStateApi>(
                `/kdp/publishing-state/${bookId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                },
            ),
    },

    i18n: {
        get: (lang: string) =>
            request<Record<string, unknown>>(`/i18n/${encodeURIComponent(lang)}`),
    },

    bookAudiobook: {
        /** GET /api/books/{id}/audiobook -> persisted audiobook metadata */
        get: (bookId: string) =>
            request<BookAudiobook>(`/books/${bookId}/audiobook`),

        /** GET /api/books/{id}/audiobook/classify -> chapter classification */
        classify: (bookId: string) =>
            request<AudiobookClassification>(`/books/${bookId}/audiobook/classify`),

        /** DELETE /api/books/{id}/audiobook -> remove persisted files */
        delete: (bookId: string) =>
            request<void>(`/books/${bookId}/audiobook`, {method: "DELETE"}),

        /** Dry-run: generate a short sample from the first paragraph.
         *  Returns a blob URL for playback + cost estimate from headers. */
        dryRun: async (bookId: string): Promise<DryRunResult> => {
            const res = await fetch(`${BASE}/books/${bookId}/audiobook/dry-run`, {method: "POST"});
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(res.status, err.detail || "Dry-run failed", `${BASE}/books/${bookId}/audiobook/dry-run`, "POST", err.stacktrace || "");
            }
            const blob = await res.blob();
            return {
                audioUrl: URL.createObjectURL(blob),
                estimatedCostUsd: res.headers.get("X-Estimated-Cost-USD") || "free",
                estimatedChapters: parseInt(res.headers.get("X-Estimated-Chapters") || "0", 10),
                engine: res.headers.get("X-Sample-Engine") || "",
                voice: res.headers.get("X-Sample-Voice") || "",
            };
        },

        /** List persisted preview MP3s for a book */
        listPreviews: (bookId: string) =>
            request<AudiobookChapterFile[]>(`/books/${bookId}/audiobook/previews`),

        /** Delete a single preview file */
        deletePreview: (bookId: string, filename: string) =>
            request<void>(`/books/${bookId}/audiobook/previews/${encodeURIComponent(filename)}`, {method: "DELETE"}),

        /** Delete all previews for a book */
        deleteAllPreviews: (bookId: string) =>
            request<void>(`/books/${bookId}/audiobook/previews`, {method: "DELETE"}),

        /** Delete a single chapter MP3 from the persisted audiobook */
        deleteChapter: (bookId: string, filename: string) =>
            request<void>(`/books/${bookId}/audiobook/chapters/${encodeURIComponent(filename)}`, {method: "DELETE"}),

        /** Direct download URLs (no API call) */
        mergedUrl: (bookId: string) => `${BASE}/books/${bookId}/audiobook/merged`,
        zipUrl: (bookId: string) => `${BASE}/books/${bookId}/audiobook/zip`,
        chapterUrl: (bookId: string, filename: string) =>
            `${BASE}/books/${bookId}/audiobook/chapters/${encodeURIComponent(filename)}`,
    },

    backup: {
        exportUrl: (includeAudiobook: boolean = false) =>
            `${BASE}/backup/export${includeAudiobook ? "?include_audiobook=true" : ""}`,

        history: (limit = 50) =>
            request<{timestamp: string; action: string; book_count: number; chapter_count: number; file_size_bytes: number; filename: string; details: string}[]>(`/backup/history?limit=${limit}`),

        deleteHistoryEntry: (timestamp: string) =>
            request<{status: string}>(`/backup/history/${encodeURIComponent(timestamp)}`, {
                method: "DELETE",
            }),

        clearHistory: () =>
            request<{status: string}>(`/backup/history`, {
                method: "DELETE",
            }),

        import: async (
            file: File,
        ): Promise<{imported_books: number; imported_articles?: number}> => {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(`${BASE}/backup/import`, {
                method: "POST",
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(res.status, err.detail || "Import failed", `${BASE}/backup/import`, "POST", err.stacktrace || "");
            }
            return res.json();
        },

        compare: async (fileA: File, fileB: File): Promise<BackupCompareResult> => {
            const formData = new FormData();
            formData.append("file_a", fileA);
            formData.append("file_b", fileB);
            const res = await fetch(`${BASE}/backup/compare`, {
                method: "POST",
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(res.status, err.detail || "Compare failed", `${BASE}/backup/compare`, "POST", err.stacktrace || "");
            }
            return res.json();
        },
    },

    settings: {
        getApp: () => request<Record<string, unknown>>("/settings/app"),

        updateApp: (data: Record<string, unknown>) =>
            request<Record<string, unknown>>("/settings/app", {
                method: "PATCH",
                body: JSON.stringify(data),
            }),

        /** Append a name to the user's author profile. The wizard's
         * AuthorPicker calls this on the "Create new" path when the
         * imported source references an author not yet in Settings.
         * Returns the updated `{name, pen_names}` block. */
        addPenName: (name: string) =>
            request<{name: string; pen_names: string[]}>(
                "/settings/author/pen-name",
                {
                    method: "POST",
                    body: JSON.stringify({name}),
                },
            ),

        listPlugins: () => request<Record<string, unknown>>("/settings/plugins"),

        discoveredPlugins: () =>
            request<DiscoveredPlugin[]>("/settings/plugins/discovered"),

        getPlugin: (name: string) => request<Record<string, unknown>>(`/settings/plugins/${name}`),

        createPlugin: (data: {name: string; display_name?: string; description?: string; version?: string; license?: string; settings?: Record<string, unknown>}) =>
            request<Record<string, unknown>>("/settings/plugins", {
                method: "POST",
                body: JSON.stringify(data),
            }),

        deletePlugin: (name: string) =>
            request<{plugin: string; status: string}>(`/settings/plugins/${name}`, {method: "DELETE"}),

        updatePlugin: (name: string, settings: Record<string, unknown>) =>
            request<Record<string, unknown>>(`/settings/plugins/${name}`, {
                method: "PATCH",
                body: JSON.stringify({settings}),
            }),

        enablePlugin: (name: string) =>
            request<{plugin: string; status: string}>(`/settings/plugins/${name}/enable`, {method: "POST"}),

        disablePlugin: (name: string) =>
            request<{plugin: string; status: string}>(`/settings/plugins/${name}/disable`, {method: "POST"}),
    },

    editorPluginStatus: () =>
        request<Record<string, {available: boolean; reason: string | null; message?: string}>>("/editor/plugin-status"),

    help: {
        // Legacy endpoints (kept for backward compat)
        shortcuts: (lang: string = "de") =>
            request<{keys: string; action: string}[]>(`/help/shortcuts?lang=${lang}`),

        faq: (lang: string = "de") =>
            request<{question: string; answer: string}[]>(`/help/faq?lang=${lang}`),

        about: () => request<Record<string, string>>("/help/about"),

        // New docs-based endpoints
        navigation: (locale: string = "de") =>
            request<HelpNavItem[]>(`/help/navigation/${locale}`),

        page: (locale: string, slug: string) =>
            request<HelpPage>(`/help/page/${locale}/${slug}`),

        search: (locale: string, query: string) =>
            request<{results: HelpSearchResult[]}>(`/help/search/${locale}?q=${encodeURIComponent(query)}`),
    },

    getStarted: {
        guide: (lang: string = "de") =>
            request<{id: string; title: string; description: string; icon: string}[]>(`/get-started/guide?lang=${lang}`),

        // GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 C3: sample-book response
        // varies by book_type:
        //   - prose: carries ``chapters: [...]``
        //   - picture_book / comic_book: carries ``pages: [...]``
        // The TypeScript shape unions both so the caller branches on
        // ``book_type`` (or just checks ``"chapters" in resp``).
        sampleBook: (lang: string = "de", bookType: BookType = "prose") =>
            request<{
                title: string;
                author: string;
                language: string;
                book_type: BookType;
                description: string;
                chapters?: {title: string; content: string}[];
                pages?: {
                    layout: string;
                    text_content?: string;
                    layout_config?: Record<string, unknown>;
                    image_asset_id?: string | null;
                }[];
            }>(`/get-started/sample-book?lang=${lang}&book_type=${bookType}`),
    },

    pluginInstall: {
        install: async (file: File): Promise<{plugin: string; version: string; status: string; message: string; error: string | null}> => {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(`${BASE}/plugins/install`, {
                method: "POST",
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(res.status, err.detail || "Installation fehlgeschlagen", `${BASE}/plugins/install`, "POST", err.stacktrace || "");
            }
            return res.json();
        },

        uninstall: (name: string) =>
            request<{plugin: string; status: string}>(`/plugins/install/${name}`, {method: "DELETE"}),

        listInstalled: () =>
            request<{name: string; display_name: string; description: string; version: string; license: string; active: boolean; path: string}[]>("/plugins/installed"),

        manifests: () =>
            request<Record<string, Record<string, unknown>>>("/plugins/manifests"),
    },

    /** Medium-import plugin client. The importZip helper is the only
     *  XHR-based call in the codebase; XHR is required because fetch()
     *  does not expose upload-progress events and Medium archives can
     *  be large enough that a determinate progress bar matters. */
    mediumImport: {
        importZip: (
            file: File,
            onUploadProgress?: (loaded: number, total: number) => void,
        ): Promise<MediumImportResponse> => {
            const endpoint = `${BASE}/medium-import/import`;
            const formData = new FormData();
            formData.append("file", file);

            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", endpoint);

                if (onUploadProgress) {
                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            onUploadProgress(event.loaded, event.total);
                        }
                    };
                }

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            resolve(JSON.parse(xhr.responseText) as MediumImportResponse);
                        } catch (parseError) {
                            reject(
                                new ApiError(
                                    xhr.status,
                                    "Antwort konnte nicht geparst werden",
                                    endpoint,
                                    "POST",
                                    String(parseError),
                                ),
                            );
                        }
                        return;
                    }
                    let detail = xhr.statusText || "Import fehlgeschlagen";
                    let stacktrace = "";
                    try {
                        const body = JSON.parse(xhr.responseText) as {
                            detail?: string;
                            stacktrace?: string;
                        };
                        if (body.detail) detail = body.detail;
                        if (body.stacktrace) stacktrace = body.stacktrace;
                    } catch {
                        // Non-JSON body; surface the raw status text above.
                    }
                    reject(new ApiError(xhr.status, detail, endpoint, "POST", stacktrace));
                };

                xhr.onerror = () => {
                    reject(
                        new ApiError(
                            0,
                            "Netzwerkfehler beim Upload",
                            endpoint,
                            "POST",
                            "",
                        ),
                    );
                };

                xhr.send(formData);
            });
        },

        /** MEDIUM-IMPORT-V2-01: Phase 1 of the dry-run preview
         *  workflow. Uploads the ZIP, returns the per-post table
         *  + a ``preview_id`` token without persisting anything.
         *  Same XHR shape as ``importZip`` because the upload is
         *  still the slow part for typical Medium archives. */
        preview: (
            file: File,
            onUploadProgress?: (loaded: number, total: number) => void,
        ): Promise<MediumImportPreviewResponse> => {
            const endpoint = `${BASE}/medium-import/preview`;
            const formData = new FormData();
            formData.append("file", file);

            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", endpoint);

                if (onUploadProgress) {
                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            onUploadProgress(event.loaded, event.total);
                        }
                    };
                }

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            resolve(JSON.parse(xhr.responseText) as MediumImportPreviewResponse);
                        } catch (parseError) {
                            reject(
                                new ApiError(
                                    xhr.status,
                                    "Antwort konnte nicht geparst werden",
                                    endpoint,
                                    "POST",
                                    String(parseError),
                                ),
                            );
                        }
                        return;
                    }
                    let detail = xhr.statusText || "Vorschau fehlgeschlagen";
                    let stacktrace = "";
                    try {
                        const body = JSON.parse(xhr.responseText) as {
                            detail?: string;
                            stacktrace?: string;
                        };
                        if (body.detail) detail = body.detail;
                        if (body.stacktrace) stacktrace = body.stacktrace;
                    } catch {
                        // Non-JSON body; surface the raw status text above.
                    }
                    reject(new ApiError(xhr.status, detail, endpoint, "POST", stacktrace));
                };

                xhr.onerror = () => {
                    reject(
                        new ApiError(
                            0,
                            "Netzwerkfehler beim Upload",
                            endpoint,
                            "POST",
                            "",
                        ),
                    );
                };

                xhr.send(formData);
            });
        },

        /** MEDIUM-IMPORT-V2-01: Phase 2 of the dry-run preview
         *  workflow. Triggers the actual import of the
         *  user-selected rows from a previously-previewed ZIP.
         *  The backend reads the cached ZIP for ``previewId``,
         *  passes ``selected_filenames`` through to ``import_zip``,
         *  and reaps the cache on success. 404 when the preview
         *  has expired (TTL 30 min) — the wizard surfaces a
         *  "please upload again" toast in that case. */
        importSelected: (
            previewId: string,
            selectedFilenames: string[],
        ): Promise<MediumImportResponse> =>
            request<MediumImportResponse>(`/medium-import/import/${previewId}`, {
                method: "POST",
                body: JSON.stringify({selected_filenames: selectedFilenames}),
            }),

        /** MEDIUM-IMPORT-V2-01: explicit cancel-from-UI. Reaps the
         *  cached ZIP for ``previewId`` so it doesn't sit on disk
         *  until the TTL fires. Idempotent — unknown ids return
         *  ``{deleted: false}`` with HTTP 200, not 404. */
        cancelPreview: (previewId: string): Promise<MediumImportCancelPreviewResponse> =>
            request<MediumImportCancelPreviewResponse>(
                `/medium-import/preview/${previewId}`,
                {method: "DELETE"},
            ),

        /** ASYNC-IMPORT-PROGRESS-01: kick off an async import job
         *  for the user's selection. Returns immediately (HTTP 202)
         *  with the job_id; per-post progress streams via SSE at
         *  /api/export/jobs/{job_id}/stream and the final
         *  ImportResponse is fetched via getJobResult once
         *  stream_end arrives. */
        importSelectedAsync: (
            previewId: string,
            selectedFilenames: string[],
        ): Promise<{job_id: string; status: string}> =>
            request<{job_id: string; status: string}>(
                `/medium-import/import/async/${previewId}`,
                {
                    method: "POST",
                    body: JSON.stringify({selected_filenames: selectedFilenames}),
                },
            ),

        /** ASYNC-IMPORT-PROGRESS-01: fetch the full ImportResponse
         *  for a completed async job. The MediumImportJobContext
         *  calls this when SSE stream_end fires with status=completed.
         *  Returns 404 (unknown job) or 409 (not yet completed); see
         *  the route docstring in the plugin for the per-status
         *  decision table. */
        getJobResult: (jobId: string): Promise<MediumImportResponse> =>
            request<MediumImportResponse>(
                `/medium-import/jobs/${jobId}/result`,
            ),

        /** ASYNC-IMPORT-PROGRESS-01: cancel an in-flight async
         *  import job. Reuses the generic
         *  DELETE /api/export/jobs/{id} endpoint that the export
         *  plugin owns - the job_store cancel path is generic, the
         *  worker stops at the next ``await asyncio.sleep(0)``
         *  yield-point between posts. Idempotent: returns 204 for
         *  running jobs, 409 for already-terminal jobs. */
        cancelJob: (jobId: string): Promise<void> =>
            request<void>(`/export/jobs/${jobId}`, {method: "DELETE"}),
    },

    msTools: {
        /** GET /api/ms-tools/metrics/{bookId} -> per-chapter quality metrics */
        chapterMetrics: (bookId: string) =>
            request<ChapterMetricsResponse>(`/ms-tools/metrics/${bookId}`),

        /** POST /api/ms-tools/check -> style analysis with findings */
        check: (text: string, language: string = "de", bookId?: string) => {
            const params = new URLSearchParams({text, language})
            if (bookId) params.set("book_id", bookId)
            return request<{
                total_words: number;
                total_sentences: number;
                finding_count: number;
                filler_count: number;
                passive_count: number;
                long_sentence_count: number;
                repetition_count: number;
                adverb_count: number;
                adjective_count: number;
                redundant_phrase_count: number;
                filler_ratio: number;
                passive_ratio: number;
                adverb_ratio: number;
                adjective_ratio: number;
                findings: StyleFinding[];
            }>("/ms-tools/check", {
                method: "POST",
                body: JSON.stringify({text, language, book_id: bookId}),
            })
        },
    },

    licenses: {
        list: () => request<Record<string, unknown>>("/licenses"),

        activate: (pluginName: string, licenseKey: string) =>
            request<Record<string, unknown>>("/licenses", {
                method: "POST",
                body: JSON.stringify({plugin_name: pluginName, license_key: licenseKey}),
            }),

        deactivate: (pluginName: string) =>
            request<Record<string, unknown>>(`/licenses/${pluginName}`, {method: "DELETE"}),
    },

    templates: {
        list: () => request<BookTemplate[]>("/templates"),

        get: (id: string) => request<BookTemplate>(`/templates/${id}`),

        create: (data: BookTemplateCreate) =>
            request<BookTemplate>("/templates", {
                method: "POST",
                body: JSON.stringify(data),
            }),

        delete: (id: string) =>
            request<void>(`/templates/${id}`, {method: "DELETE"}),
    },

    chapterTemplates: {
        list: () => request<ChapterTemplate[]>("/chapter-templates"),

        get: (id: string) => request<ChapterTemplate>(`/chapter-templates/${id}`),

        create: (data: ChapterTemplateCreate) =>
            request<ChapterTemplate>("/chapter-templates", {
                method: "POST",
                body: JSON.stringify(data),
            }),

        update: (id: string, data: ChapterTemplateUpdate) =>
            request<ChapterTemplate>(`/chapter-templates/${id}`, {
                method: "PUT",
                body: JSON.stringify(data),
            }),

        delete: (id: string) =>
            request<void>(`/chapter-templates/${id}`, {method: "DELETE"}),

        /** TM-04b: trigger a browser download of the template as a
         *  portable JSON file. Filename comes from the backend's
         *  Content-Disposition header. */
        exportJson: async (id: string): Promise<void> => {
            const url = `${BASE}/chapter-templates/${id}/export`;
            const res = await fetch(url, {method: "GET"});
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(
                    res.status,
                    err.detail || "Export failed",
                    url,
                    "GET",
                    err.stacktrace || "",
                );
            }
            const cd = res.headers.get("content-disposition") ?? "";
            const filename = _filenameFromContentDisposition(cd) ?? "chapter-template.json";
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objectUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);
        },

        /** TM-04b: create a chapter template from a previously-exported
         *  JSON file. Multipart upload; the backend validates the
         *  ``format`` marker, required fields, and chapter_type enum. */
        importJson: async (file: File): Promise<ChapterTemplate> => {
            const formData = new FormData();
            formData.append("file", file);
            const url = `${BASE}/chapter-templates/import`;
            const res = await fetch(url, {method: "POST", body: formData});
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(
                    res.status,
                    err.detail || "Import failed",
                    url,
                    "POST",
                    err.stacktrace || "",
                );
            }
            return res.json();
        },
    },

    git: {
        init: (bookId: string) =>
            request<GitRepoStatus>(`/books/${bookId}/git/init`, {method: "POST"}),

        commit: (bookId: string, message: string) =>
            request<GitCommitEntry>(`/books/${bookId}/git/commit`, {
                method: "POST",
                body: JSON.stringify({message}),
            }),

        log: (bookId: string, limit: number = 50) =>
            request<GitCommitEntry[]>(`/books/${bookId}/git/log?limit=${limit}`),

        status: (bookId: string) =>
            request<GitRepoStatus>(`/books/${bookId}/git/status`),

        getRemote: (bookId: string) =>
            request<GitRemoteConfig>(`/books/${bookId}/git/remote`),

        setRemote: (bookId: string, url: string, pat: string | null) =>
            request<GitRemoteConfig>(`/books/${bookId}/git/remote`, {
                method: "POST",
                body: JSON.stringify({url, pat}),
            }),

        deleteRemote: (bookId: string) =>
            request<void>(`/books/${bookId}/git/remote`, {method: "DELETE"}),

        push: (bookId: string, force: boolean = false) =>
            request<GitPushResult>(`/books/${bookId}/git/push`, {
                method: "POST",
                body: JSON.stringify({force}),
            }),

        pull: (bookId: string) =>
            request<GitPullResult>(`/books/${bookId}/git/pull`, {method: "POST"}),

        syncStatus: (bookId: string) =>
            request<GitSyncStatus>(`/books/${bookId}/git/sync-status`),

        analyzeConflict: (bookId: string) =>
            request<GitConflictAnalysis>(`/books/${bookId}/git/conflict/analyze`),

        merge: (bookId: string) =>
            request<GitMergeResult>(`/books/${bookId}/git/merge`, {method: "POST"}),

        resolveConflict: (bookId: string, resolutions: Record<string, "mine" | "theirs">) =>
            request<GitMergeResult>(`/books/${bookId}/git/conflict/resolve`, {
                method: "POST",
                body: JSON.stringify({resolutions}),
            }),

        abortMerge: (bookId: string) =>
            request<GitMergeResult>(`/books/${bookId}/git/conflict/abort`, {method: "POST"}),
    },

    translations: {
        /** PGS-04: list translation siblings of a book.
         *  ``translation_group_id`` is null for unlinked books. */
        list: (bookId: string) =>
            request<TranslationSiblingsResponse>(`/translations/${bookId}`),

        /** PGS-04: group two or more books under one
         *  ``translation_group_id``. Pre-existing groups merge
         *  deterministically. */
        link: (bookIds: string[]) =>
            request<TranslationLinkResult>(`/translations/link`, {
                method: "POST",
                body: JSON.stringify({book_ids: bookIds}),
            }),

        /** PGS-04: remove a single book from its group. Idempotent. */
        unlink: (bookId: string) =>
            request<void>(`/translations/${bookId}/unlink`, {method: "POST"}),

        /** PGS-04: clone a multi-language repo and import every
         *  ``main`` / ``main-XX`` branch as a linked book. */
        importMultiBranch: (gitUrl: string) =>
            request<TranslationMultiBranchImportResult>(
                `/translations/import-multi-branch`,
                {
                    method: "POST",
                    body: JSON.stringify({git_url: gitUrl}),
                },
            ),
    },

    gitSync: {
        /** PGS-02: per-book sync state for the plugin-git-sync flow.
         *  ``mapped=false`` means the book wasn't imported via the
         *  git-URL wizard - the BookEditor uses that to hide the
         *  "Commit to Repo" button entirely.
         */
        status: (bookId: string) =>
            request<GitSyncMappingStatus>(`/git-sync/${bookId}`),

        commit: (bookId: string, payload: GitSyncCommitRequest) =>
            request<GitSyncCommitResult>(`/git-sync/${bookId}/commit`, {
                method: "POST",
                body: JSON.stringify(payload),
            }),

        /** PGS-03: three-way diff between Bibliogon, the imported
         *  base commit, and current branch HEAD. Read-only. */
        diff: (bookId: string) =>
            request<GitSyncDiffResponse>(`/git-sync/${bookId}/diff`, {
                method: "POST",
            }),

        /** PGS-03: apply per-chapter resolutions. Mutates the local
         *  DB; bumps ``last_imported_commit_sha`` so the next diff
         *  starts fresh. Does NOT push. */
        resolve: (bookId: string, resolutions: GitSyncResolutionEntry[]) =>
            request<GitSyncResolveResult>(`/git-sync/${bookId}/resolve`, {
                method: "POST",
                body: JSON.stringify({resolutions}),
            }),

        /** PGS-05: fan one user-facing commit out to both core git
         *  and plugin-git-sync. Skipped subsystems return
         *  ``status: "skipped"`` rather than failing the whole call. */
        unifiedCommit: (bookId: string, payload: GitSyncUnifiedCommitRequest) =>
            request<GitSyncUnifiedCommitResult>(
                `/git-sync/${bookId}/unified-commit`,
                {
                    method: "POST",
                    body: JSON.stringify(payload),
                },
            ),

        /** PGS-02-FU-01: per-book Personal Access Token used for HTTPS
         *  push/pull. Shared with core git_backup, so setting here also
         *  unblocks the core git remote. The PAT is never returned. */
        getCredentialStatus: (bookId: string) =>
            request<{has_credential: boolean}>(
                `/git-sync/${bookId}/credentials`,
            ),

        putCredential: (bookId: string, pat: string) =>
            request<{has_credential: boolean}>(
                `/git-sync/${bookId}/credentials`,
                {
                    method: "PUT",
                    body: JSON.stringify({pat}),
                },
            ),

        deleteCredential: (bookId: string) =>
            request<void>(`/git-sync/${bookId}/credentials`, {
                method: "DELETE",
            }),
    },

    ssh: {
        info: () => request<SshKeyInfo>("/ssh"),

        generate: (comment: string | null = null, overwrite: boolean = false) =>
            request<SshKeyInfo>("/ssh/generate", {
                method: "POST",
                body: JSON.stringify({comment, overwrite}),
            }),

        publicKey: () => request<{public_key: string}>("/ssh/public-key"),

        remove: () => request<void>("/ssh", {method: "DELETE"}),
    },

    /** plugin-comics Session 2 client. Session 2 adds full
     *  panel + bubble CRUD on top of the Session 1 info gate.
     *  The bubble-list endpoint was added in C6 as the
     *  Half-Wired-Lifecycle closure of C2 (which shipped C+U+D
     *  without R; gap surfaced by the C6 Pre-Coding-Reality-Check
     *  when the full editor needed to populate ``ComicPanelGrid``). */
    comics: {
        getInfo: () => request<ComicsPluginInfo>("/comics/info"),

        listPanels: (bookId: string, pageId: string) =>
            request<ComicPanelOut[]>(
                `/books/${bookId}/comic-pages/${pageId}/panels`,
            ),

        createPanel: (bookId: string, pageId: string, data: ComicPanelCreate) =>
            request<ComicPanelOut>(
                `/books/${bookId}/comic-pages/${pageId}/panels`,
                {method: "POST", body: JSON.stringify(data)},
            ),

        updatePanel: (
            bookId: string,
            panelId: string,
            data: ComicPanelUpdate,
        ) =>
            request<ComicPanelOut>(
                `/books/${bookId}/comic-panels/${panelId}`,
                {method: "PATCH", body: JSON.stringify(data)},
            ),

        deletePanel: (bookId: string, panelId: string) =>
            request<void>(
                `/books/${bookId}/comic-panels/${panelId}`,
                {method: "DELETE"},
            ),

        listBubbles: (bookId: string, panelId: string) =>
            request<ComicBubbleOut[]>(
                `/books/${bookId}/comic-panels/${panelId}/bubbles`,
            ),

        createBubble: (
            bookId: string,
            panelId: string,
            data: ComicBubbleCreate,
        ) =>
            request<ComicBubbleOut>(
                `/books/${bookId}/comic-panels/${panelId}/bubbles`,
                {method: "POST", body: JSON.stringify(data)},
            ),

        updateBubble: (
            bookId: string,
            bubbleId: string,
            data: ComicBubbleUpdate,
        ) =>
            request<ComicBubbleOut>(
                `/books/${bookId}/comic-bubbles/${bubbleId}`,
                {method: "PATCH", body: JSON.stringify(data)},
            ),

        deleteBubble: (bookId: string, bubbleId: string) =>
            request<void>(
                `/books/${bookId}/comic-bubbles/${bubbleId}`,
                {method: "DELETE"},
            ),
    },

    /** About-Dialog backend client. Single cohesive payload — app
     *  identity + Python runtime + bundled dependency versions —
     *  fetched on Settings > About tab mount. Stable shape per the
     *  D1.A decision (2026-05-18 audit). */
    system: {
        info: () => request<SystemInfo>("/system/info"),

        /** Danger-Zone two-phase reset. Step 1: obtain a 5-min HMAC
         *  token via ``resetPrepare``. Step 2: post the token + the
         *  literal ``"RESET"`` to ``reset`` to execute the wipe. The
         *  backend rejects either step on its own (missing token →
         *  400; wrong confirmation literal → 400). See
         *  ``backend/app/routers/system.py`` for the contract. */
        resetPrepare: () =>
            request<{token: string; expires_at: number; ttl_seconds: number}>(
                "/system/reset/prepare",
                {method: "POST"},
            ),

        reset: (token: string, confirmation: string) =>
            request<{
                status: string;
                jobs_cancelled: number;
                rows_deleted: number;
                uploads_cleared: boolean;
                tmp_cleared: boolean;
                backup_history_cleared: boolean;
                config_overlays_cleared: number;
                installed_plugins_cleared: number;
                secrets_cleared: boolean;
            }>("/system/reset", {
                method: "POST",
                body: JSON.stringify({token, confirmation}),
            }),
    },
};

/** Identity returned by GET /api/comics/info. Stable shape through
 *  Session 1; Session 2 extends with the list of mounted sub-routes
 *  once panels + bubbles ship. */
export interface ComicsPluginInfo {
    name: string
    version: string
    session: number
    status: string
    description: string
}

/** Comic-panel + comic-bubble Session-2 shapes. Field-name parity
 *  with the backend Pydantic ``ComicPanelOut`` + ``ComicBubbleOut``
 *  schemas. The 6 ``BubbleType`` ids and 10 ``BubbleTailDirection``
 *  values are pinned by ``backend/app/schemas/__init__.py``;
 *  unknown values from older payloads fall through gracefully at
 *  the renderer (gamma-shim default-on-read). */
export interface ComicPanelOut {
    id: string
    page_id: string
    position: number
    image_asset_id: string | null
    bounds: Record<string, unknown>
    panel_config: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

export interface ComicPanelCreate {
    bounds: Record<string, unknown>
    image_asset_id?: string | null
    panel_config?: Record<string, unknown> | null
}

export interface ComicPanelUpdate {
    bounds?: Record<string, unknown>
    image_asset_id?: string | null
    panel_config?: Record<string, unknown> | null
}

export interface ComicBubbleOut {
    id: string
    panel_id: string
    position: number
    bubble_type: string
    anchor: Record<string, unknown>
    width_pct: number
    height_pct: number
    tail_direction: string
    tail_position_pct: number
    tail_length_px: number
    bubble_config: Record<string, unknown> | null
    text_content: string | null
    created_at: string
    updated_at: string
}

export interface ComicBubbleCreate {
    bubble_type: string
    anchor: Record<string, unknown>
    width_pct?: number
    height_pct?: number
    tail_direction?: string
    tail_position_pct?: number
    tail_length_px?: number
    bubble_config?: Record<string, unknown> | null
    text_content?: string | null
}

export interface ComicBubbleUpdate {
    bubble_type?: string
    anchor?: Record<string, unknown>
    width_pct?: number
    height_pct?: number
    tail_direction?: string
    tail_position_pct?: number
    tail_length_px?: number
    bubble_config?: Record<string, unknown> | null
    text_content?: string | null
}

export interface GitCommitEntry {
    hash: string
    short_hash: string
    message: string
    author: string
    date: string
}

export interface GitRepoStatus {
    initialized: boolean
    dirty: boolean
    uncommitted_files: number
    head_hash: string | null
    head_short_hash: string | null
}

export interface GitRemoteConfig {
    url: string | null
    has_credential: boolean
}

export interface GitPushResult {
    branch: string
    summary: string
    flags: number
    forced?: boolean
}

export interface GitPullResult {
    branch: string
    updated: boolean
    fast_forward: boolean
    head_hash: string | null
}

export interface GitSyncStatus {
    remote_configured: boolean
    has_credential: boolean
    ahead: number
    behind: number
    state: "no_remote" | "never_synced" | "in_sync" | "local_ahead" | "remote_ahead" | "diverged"
}

export interface GitConflictAnalysis {
    state: string
    classification: "simple" | "complex" | null
    local_files: string[]
    remote_files: string[]
    overlapping_files: string[]
    merge_in_progress: boolean
}

export interface GitMergeResult {
    status: "merged" | "conflicts" | "already_up_to_date" | "aborted"
    head_hash?: string | null
    files?: string[]
}

export interface SshKeyInfo {
    exists: boolean
    type?: string
    comment?: string
    created_at?: string
    public_key?: string
}

/** PGS-02 git-sync mapping snapshot.
 *  ``mapped=false`` -> the book wasn't imported via plugin-git-sync;
 *  the rest of the fields are then null. ``dirty=null`` means the
 *  on-disk clone is missing entirely (not just clean/dirty), so
 *  the UI can prompt re-import instead of "no changes".
 */
export interface GitSyncMappingStatus {
    mapped: boolean
    repo_url: string | null
    branch: string | null
    last_imported_commit_sha: string | null
    local_clone_path: string | null
    last_committed_at: string | null
    dirty: boolean | null
    /** PGS-05: True when core git
     *  (``uploads/{book_id}/.git``) is also initialized for this
     *  book. The frontend uses this together with ``mapped`` to
     *  decide whether to render the unified "Commit everywhere"
     *  button instead of the single-subsystem one. */
    core_git_initialized: boolean
    /** PGS-02-FU-01: True when a per-book PAT is stored. The
     *  GitSyncDialog uses this to show "Repo credentials configured"
     *  without ever rendering the PAT itself. */
    has_credential: boolean
}

export interface GitSyncCommitRequest {
    /** Optional commit subject; backend defaults to
     *  ``"Sync from Bibliogon at <utc-iso>"`` when null. */
    message?: string | null
    /** Push to remote after committing. Currently 501; wired now
     *  so the form can carry the toggle without a future API
     *  shape change when push lands. */
    push?: boolean
}

export interface GitSyncCommitResult {
    commit_sha: string
    branch: string
    pushed: boolean
}

/** Stable classification slugs the diff endpoint returns. */
export type GitSyncDiffClassification =
    | "unchanged"
    | "remote_changed"
    | "local_changed"
    | "both_changed"
    | "remote_added"
    | "local_added"
    | "remote_removed"
    | "local_removed"
    /** PGS-03-FU-01: chapter file moved between identities with body
     *  unchanged. ``rename_from`` carries the old (section, slug). */
    | "renamed_remote"
    | "renamed_local"

export interface GitSyncDiffEntry {
    section: "front-matter" | "chapters" | "back-matter"
    slug: string
    title: string
    classification: GitSyncDiffClassification
    base_md: string | null
    local_md: string | null
    remote_md: string | null
    db_chapter_id: string | null
    /** PGS-03-FU-01: old identity for renamed_* rows. */
    rename_from?: {section: string; slug: string} | null
}

export interface GitSyncDiffResponse {
    book_id: string
    last_imported_commit_sha: string
    branch: string
    chapters: GitSyncDiffEntry[]
    counts: Record<GitSyncDiffClassification, number>
}

export interface GitSyncResolutionEntry {
    section: string
    slug: string
    /** PGS-03-FU-01 promoted ``mark_conflict`` (write both versions
     *  inside git-style conflict markers) from a follow-up to a real
     *  action. Only valid for ``both_changed`` chapters; the backend
     *  silently skips it for any other classification. */
    action: "keep_local" | "take_remote" | "mark_conflict"
}

export interface GitSyncResolveResult {
    counts: Record<
        "updated" | "created" | "deleted" | "marked" | "renamed" | "skipped",
        number
    >
}

export interface GitSyncUnifiedCommitRequest {
    message?: string | null
    push_core?: boolean
    push_plugin?: boolean
}

/** Stable per-subsystem outcome slug. */
export type GitSyncSubsystemStatus =
    | "ok"
    | "skipped"
    | "nothing_to_commit"
    | "failed"

export interface GitSyncSubsystemResult {
    status: GitSyncSubsystemStatus
    detail: string | null
    commit_sha: string | null
    pushed: boolean
}

export interface GitSyncUnifiedCommitResult {
    core_git: GitSyncSubsystemResult
    plugin_git_sync: GitSyncSubsystemResult
}

/** PGS-04 sibling listing for a book. */
export interface TranslationSibling {
    book_id: string
    title: string
    language: string
}

export interface TranslationSiblingsResponse {
    book_id: string
    translation_group_id: string | null
    siblings: TranslationSibling[]
}

export interface TranslationLinkResult {
    translation_group_id: string | null
    linked_book_ids: string[]
}

export interface TranslationImportedBook {
    book_id: string
    branch: string
    language: string | null
    title: string
}

/** PGS-04-FU-01: a branch the multi-branch importer could not turn
 *  into a book. The wizard renders a per-entry "Attention required"
 *  row so silent skips never happen again. */
export interface TranslationSkippedBranch {
    branch: string
    /** Stable slug; the frontend switches on it for the i18n label.
     *  - ``no_wbt_layout`` - branch lacks ``config/metadata.yaml``
     *  - ``import_failed`` - the WBT importer raised
     *    (typically incompatible chapter structure) */
    reason: "no_wbt_layout" | "import_failed" | string
    /** Backend-truncated diagnostic (exception class + message). Safe
     *  to render verbatim; useful in a "Report issue" body. */
    detail: string
}

export interface TranslationMultiBranchImportResult {
    translation_group_id: string | null
    books: TranslationImportedBook[]
    /** PGS-04-FU-01: empty list on a clean import; non-empty when
     *  some branches could not be imported. */
    skipped: TranslationSkippedBranch[]
}

/** Returned by GET /api/settings/plugins/discovered. Includes the
 *  6 pre-existing activation-state fields PLUS the 3 About-Dialog
 *  metadata fields added in C1 (2026-05-18). The display_name and
 *  description dicts are localized; pass through ``getLocalized``
 *  to render. */
export interface DiscoveredPlugin {
    name: string
    has_config: boolean
    enabled: boolean
    loaded: boolean
    license_tier: string
    has_license: boolean
    display_name: Record<string, string>
    description: Record<string, string>
    version: string | null
    /** PluginForge v0.6.0 FilterReason for non-activated plugins.
     *  Null when the plugin activated cleanly. Maps to
     *  ``settings.plugin_status_*`` i18n keys for status-column
     *  rendering in the Plugins tab. */
    filter_reason: string | null
    /** PluginForge v0.6.0 ``PluginError.user_facing_message`` from
     *  the structured load error. Null unless the plugin failed
     *  with an exception during init/activate (filter_reason =
     *  ``load_failed``). */
    load_error_message: string | null
    /** PluginForge v0.9.0 ``PluginState.activated_at``. ISO 8601
     *  timestamp of the most recent successful activation. Null
     *  when the plugin has never activated. */
    activated_at: string | null
    /** PluginForge v0.9.0 ``PluginState.last_config_change``. ISO
     *  8601 timestamp of the last ``on_config_changed`` delivery.
     *  Null when no config refresh has happened since activation. */
    last_config_change: string | null
    /** PluginForge v0.9.0 ``PluginState.source``. ``"entry_point"``
     *  for the standard install path, ``"direct_register"`` for
     *  plugins added via ``register_plugin()`` (ZIP installs).
     *  Null for configured-but-not-discovered rows. */
    source: "entry_point" | "direct_register" | null
}

/** Returned by GET /api/system/info. Aggregates app identity +
 *  Python runtime + bundled-dependency versions for the About-
 *  Dialog payload. Stable shape per the 2026-05-18 audit D1.A
 *  decision; dependency entries can be ``null`` when a module
 *  isn't importable so the renderer can degrade gracefully. */
export interface SystemInfo {
    app: {
        name: string
        version: string
        license: string
        authors: string[]
        repository_url: string
        issues_url: string
    }
    runtime: {
        python_version: string
        platform_system: string
        platform_release: string
        platform_machine: string
    }
    dependencies: {
        fastapi: string | null
        sqlalchemy: string | null
        pydantic: string | null
        pluginforge: string | null
    }
}

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

export interface Book {
    id: string;
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
    html_description: string | null;
    backpage_description: string | null;
    backpage_author_bio: string | null;
    cover_image: string | null;
    custom_css: string | null;
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

export type ArticleStatus = "draft" | "published" | "archived"

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
    created_at: string
    updated_at: string
}

export interface ArticleCreate {
    title: string
    subtitle?: string | null
    author?: string | null
    language?: string
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
}

export interface BookFromTemplateCreate extends BookCreate {
    template_id: string;
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
    created_at: string;
    updated_at: string;
}

export interface ChapterTemplateCreate {
    name: string;
    description: string;
    chapter_type: ChapterType;
    content?: string | null;
    language?: string;
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

        import: async (file: File): Promise<{imported_books: number}> => {
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
            request<{name: string; has_config: boolean; enabled: boolean; loaded: boolean}[]>("/settings/plugins/discovered"),

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

        sampleBook: (lang: string = "de") =>
            request<{title: string; author: string; language: string; description: string; chapters: {title: string; content: string}[]}>(`/get-started/sample-book?lang=${lang}`),
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

        create: (data: ChapterTemplateCreate) =>
            request<ChapterTemplate>("/chapter-templates", {
                method: "POST",
                body: JSON.stringify(data),
            }),

        delete: (id: string) =>
            request<void>(`/chapter-templates/${id}`, {method: "DELETE"}),
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
};

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

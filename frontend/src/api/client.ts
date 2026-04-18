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
    author: string;
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

export interface BookCreate {
    title: string;
    subtitle?: string;
    author: string;
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

        smartImport: async (file: File): Promise<{type: string; result: Record<string, unknown>}> => {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(`${BASE}/backup/smart-import`, {
                method: "POST",
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(res.status, err.detail || "Import failed", `${BASE}/backup/smart-import`, "POST", err.stacktrace || "");
            }
            return res.json();
        },

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

        importProject: async (file: File): Promise<{book_id: string; title: string; chapter_count: number}> => {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(`${BASE}/backup/import-project`, {
                method: "POST",
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new ApiError(res.status, err.detail || "Import failed", `${BASE}/backup/import-project`, "POST", err.stacktrace || "");
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
};

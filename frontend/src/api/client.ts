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
    | "part_intro"
    | "interlude"
    | "toc"
    | "dedication"
    | "prologue"
    | "introduction"
    | "afterword"
    | "index"
    | "epigraph"
    | "endnotes";

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
    keywords: string | null;
    html_description: string | null;
    backpage_description: string | null;
    backpage_author_bio: string | null;
    cover_image: string | null;
    custom_css: string | null;
    ai_assisted: boolean;
    tts_engine: string | null;
    tts_voice: string | null;
    tts_language: string | null;
    tts_speed: string | null;
    audiobook_merge: string | null;
    audiobook_filename: string | null;
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

export interface ChapterCreate {
    title: string;
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

// --- ApiError with context ---

export class ApiError extends Error {
    status: number;
    detail: string;
    endpoint: string;
    method: string;
    stacktrace: string;
    timestamp: string;

    constructor(status: number, detail: string, endpoint: string, method: string, stacktrace = "") {
        super(detail);
        this.name = "ApiError";
        this.status = status;
        this.detail = detail;
        this.endpoint = endpoint;
        this.method = method;
        this.stacktrace = stacktrace;
        this.timestamp = new Date().toISOString();
    }
}

// --- Fetch helper ---

const BASE = "/api";

async function request<T>(
    path: string,
    options?: RequestInit
): Promise<T> {
    const method = options?.method || "GET";
    const res = await fetch(`${BASE}${path}`, {
        headers: {"Content-Type": "application/json"},
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({detail: res.statusText}));
        throw new ApiError(
            res.status,
            err.detail || "Request failed",
            `${BASE}${path}`,
            method,
            err.stacktrace || "",
        );
    }
    if (res.status === 204) return undefined as T;
    return res.json();
}

// --- Books ---

export const api = {
    books: {
        list: () => request<Book[]>("/books"),

        get: (id: string) => request<BookDetail>(`/books/${id}`),

        create: (data: BookCreate) =>
            request<Book>("/books", {
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

        update: (bookId: string, chapterId: string, data: Partial<ChapterCreate>) =>
            request<Chapter>(`/books/${bookId}/chapters/${chapterId}`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),

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

    backup: {
        exportUrl: () => `${BASE}/backup/export`,

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

    help: {
        shortcuts: (lang: string = "de") =>
            request<{keys: string; action: string}[]>(`/help/shortcuts?lang=${lang}`),

        faq: (lang: string = "de") =>
            request<{question: string; answer: string}[]>(`/help/faq?lang=${lang}`),

        about: () => request<Record<string, string>>("/help/about"),
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
};

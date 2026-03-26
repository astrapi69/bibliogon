// --- Types ---

export type ChapterType =
    | "chapter"
    | "preface"
    | "foreword"
    | "acknowledgments"
    | "about_author"
    | "appendix"
    | "bibliography"
    | "glossary";

export interface Book {
    id: string;
    title: string;
    subtitle: string | null;
    author: string;
    language: string;
    series: string | null;
    series_index: number | null;
    description: string | null;
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

// --- Fetch helper ---

const BASE = "/api";

async function request<T>(
    path: string,
    options?: RequestInit
): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        headers: {"Content-Type": "application/json"},
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({detail: res.statusText}));
        throw new Error(err.detail || "Request failed");
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

        exportUrl: (id: string, fmt: "epub" | "pdf" | "project") =>
            `${BASE}/books/${id}/export/${fmt}`,
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
                throw new Error(err.detail || "Upload failed");
            }
            return res.json();
        },

        delete: (bookId: string, assetId: string) =>
            request<void>(`/books/${bookId}/assets/${assetId}`, {method: "DELETE"}),
    },

    backup: {
        exportUrl: () => `${BASE}/backup/export`,

        import: async (file: File): Promise<{imported_books: number}> => {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(`${BASE}/backup/import`, {
                method: "POST",
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: res.statusText}));
                throw new Error(err.detail || "Import failed");
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
                throw new Error(err.detail || "Import failed");
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

        getPlugin: (name: string) => request<Record<string, unknown>>(`/settings/plugins/${name}`),

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

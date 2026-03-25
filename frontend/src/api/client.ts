// --- Types ---

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
}

// --- Fetch helper ---

const BASE = "/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
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
      request<void>(`/books/${id}`, { method: "DELETE" }),

    exportUrl: (id: string, fmt: "epub" | "pdf") =>
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
        body: JSON.stringify({ chapter_ids: chapterIds }),
      }),
  },
};

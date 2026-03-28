/**
 * Direct API calls for test setup/teardown.
 * Bypasses the UI for fast data creation.
 */

const API = "http://localhost:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        headers: {"Content-Type": "application/json"},
        ...options,
    });
    if (!res.ok && res.status !== 204) {
        throw new Error(`API ${path}: ${res.status} ${await res.text()}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
}

export async function resetDb(): Promise<void> {
    await request("/test/reset", {method: "DELETE"});
}

export async function createBook(title: string, author: string = "E2E Autor"): Promise<{id: string; title: string}> {
    return request("/books", {
        method: "POST",
        body: JSON.stringify({title, author}),
    });
}

export async function createChapter(
    bookId: string,
    title: string,
    content: string = "",
    chapterType: string = "chapter",
): Promise<{id: string; title: string}> {
    return request(`/books/${bookId}/chapters`, {
        method: "POST",
        body: JSON.stringify({title, content, chapter_type: chapterType}),
    });
}

export async function deleteBook(id: string): Promise<void> {
    await request(`/books/${id}`, {method: "DELETE"});
}

export async function getBooks(): Promise<{id: string; title: string}[]> {
    return request("/books");
}

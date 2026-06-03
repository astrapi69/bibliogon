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

// Cross-test settings isolation. /test/reset wipes DB rows but NOT the
// app settings (ui.dashboard view-modes + page-sizes, topics), which live
// in app.yaml and are read fresh on every page load. A test that flips a
// global setting (view-mode default, page-size, topics) would otherwise
// leak into every later test in the serial run — the dominant cause of
// "passes in isolation, fails in the full suite". Capture the pre-suite
// baseline once, then restore the mutation-prone keys before each test.
let _settingsBaseline: {ui?: Record<string, unknown>; topics?: unknown} | null =
    null;

export async function resetSettings(): Promise<void> {
    if (_settingsBaseline === null) {
        // First call (start of the run): capture the clean baseline.
        _settingsBaseline = await request<{
            ui?: Record<string, unknown>;
            topics?: unknown;
        }>("/settings/app");
        return;
    }
    const ui = _settingsBaseline.ui ?? {};
    const dashboard = (ui.dashboard as Record<string, unknown> | undefined) ?? {};
    await request("/settings/app", {
        method: "PATCH",
        body: JSON.stringify({
            ui: {
                ...ui,
                // The vast majority of dashboard specs drive the grid-only
                // card testids (book-card-* / article-card-*). The app
                // DEFAULT for articles_view is "list", so the E2E baseline
                // explicitly forces BOTH dashboards to grid. Also force the
                // TRASH view-modes to grid: trash-view-mode-defaults flips
                // them to "list", which otherwise leaks into trash.spec.ts
                // (grid trash-card-* testids). List-specific specs set
                // their own view after this reset.
                dashboard: {
                    ...dashboard,
                    books_view: "grid",
                    articles_view: "grid",
                    books_trash_view: "grid",
                    articles_trash_view: "grid",
                },
            },
            topics: _settingsBaseline.topics ?? [],
        }),
    });
}

export async function createBook(title: string, author: string = "E2E Autor"): Promise<{id: string; title: string}> {
    return request("/books", {
        method: "POST",
        body: JSON.stringify({title, author}),
    });
}

/**
 * PB-PHASE4 Session 3: create a picture-book (book_type='picture_book').
 * Picture books route into <PageEditor> instead of the chapter editor;
 * see frontend/src/pages/BookEditor.tsx for the routing branch.
 */
export async function createPictureBook(
    title: string,
    author: string = "E2E Autor",
): Promise<{id: string; title: string; book_type: string}> {
    return request("/books", {
        method: "POST",
        body: JSON.stringify({title, author, book_type: "picture_book"}),
    });
}

/**
 * plugin-comics Session 2: create a comic_book.
 * Comic books route into <ComicBookEditor> instead of the chapter
 * editor; see frontend/src/pages/BookEditor.tsx for the routing
 * branch.
 */
export async function createComicBook(
    title: string,
    author: string = "E2E Autor",
): Promise<{id: string; title: string; book_type: string}> {
    return request("/books", {
        method: "POST",
        body: JSON.stringify({title, author, book_type: "comic_book"}),
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

/**
 * PATCH a book from the node side (absolute URL). Use this for test
 * setup instead of an in-browser `page.evaluate(fetch(...))` with a
 * relative URL: before the first `page.goto`, the page is at
 * `about:blank`, where a relative `/api/...` URL fails to parse.
 */
export async function updateBook(
    id: string,
    patch: Record<string, unknown>,
): Promise<{id: string}> {
    return request(`/books/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
    });
}

/**
 * PATCH a book's KDP publishing-state (plugin-kdp). Creates the row
 * on first call. Node-side absolute URL, same rationale as
 * `updateBook`.
 */
export async function updateKdpPublishingState(
    id: string,
    patch: Record<string, unknown>,
): Promise<unknown> {
    return request(`/kdp/publishing-state/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
    });
}

export async function getBooks(): Promise<{id: string; title: string}[]> {
    return request("/books");
}

export async function createArticle(
    title: string,
    language: string = "en",
): Promise<{id: string; title: string}> {
    return request("/articles", {
        method: "POST",
        body: JSON.stringify({title, language}),
    });
}

export async function deleteArticle(id: string): Promise<void> {
    await request(`/articles/${id}`, {method: "DELETE"});
}

export async function getArticles(): Promise<{id: string; title: string}[]> {
    return request("/articles");
}

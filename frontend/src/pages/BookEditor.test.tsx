/**
 * Focused BookEditor routing test (PB-PHASE4 Session 3 Commit 6).
 *
 * Covers the book_type-based routing branch added in Commit 6:
 *   - book_type === "picture_book" mounts <PageEditor> directly.
 *   - book_type === "prose" falls through to the existing
 *     chapter-based flow (the wrapper div with data-testid
 *     "book-editor").
 *
 * Heavy chapter-side components (Editor / BookMetadataEditor /
 * ChapterSidebar / dialogs) are stubbed because they aren't the
 * subject of this commit and pull in TipTap + plugin status. The
 * picture-book branch does NOT render any of them.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import BookEditor from "./BookEditor";
import type { BookDetail, BookTypeDef, Chapter } from "../api/client";
import { BookTypesProvider } from "../hooks/book/useBookTypes";
import { FeatureTestProvider } from "../features/FeatureTestProvider";
import { expectNoA11yViolations } from "../test-utils/a11y";

// BOOK-TYPES-SSOT-YAML-01 C6: BookEditor now reads the registry
// to dispatch the editor component. Static snapshot covers
// prose + picture_book + comic_book so the routing tests
// resolve to PageEditor / ComicBookEditor / chapter-editor as
// expected.
const TEST_BOOK_TYPES: Record<string, BookTypeDef> = {
    prose: {
        id: "prose",
        label_key: "ui.get_started.book_type_prose_title",
        description_key: "ui.get_started.book_type_prose_desc",
        icon: "BookOpen",
        content_model: "chapters",
        editor_component: "BookEditor",
        capabilities: {
            ebook_export: true,
            paperback_export: true,
            hardcover_export: true,
            audiobook_export: true,
            template_catalog: true,
            kdp_package_supported: true,
        },
        dashboard_create_visible: true,
        immutable_after_create: true,
        default_page_size: null,
    },
    picture_book: {
        id: "picture_book",
        label_key: "ui.get_started.book_type_picture_title",
        description_key: "ui.get_started.book_type_picture_desc",
        icon: "Image",
        content_model: "pages",
        editor_component: "PageEditor",
        capabilities: {
            ebook_export: false,
            paperback_export: true,
            hardcover_export: false,
            audiobook_export: false,
            template_catalog: false,
            kdp_package_supported: true,
        },
        dashboard_create_visible: true,
        immutable_after_create: true,
        default_page_size: "8.5x8.5",
    },
    comic_book: {
        id: "comic_book",
        label_key: "ui.get_started.book_type_comic_title",
        description_key: "ui.get_started.book_type_comic_desc",
        icon: "Layers",
        content_model: "pages",
        editor_component: "ComicBookEditor",
        capabilities: {
            ebook_export: false,
            paperback_export: true,
            hardcover_export: false,
            audiobook_export: false,
            template_catalog: false,
            kdp_package_supported: true,
        },
        dashboard_create_visible: true,
        immutable_after_create: true,
        default_page_size: "7x10",
    },
};

const navigateMock = vi.fn();
const getBookMock = vi.fn<(id: string) => Promise<BookDetail>>();
const updateBookMock = vi.fn();
const listPagesMock = vi.fn();
const getChapterMock = vi.fn();
const updateChapterMock = vi.fn();
// Captures the latest `onSave` the (stubbed) Editor receives, so the
// autosave-version-race test can invoke a stale-closure save directly.
const editorOnSaveHolder: {
    current: ((content: string) => void | Promise<void>) | null;
} = { current: null };
// Captures the latest ``onShowVersions`` the (stubbed) ChapterSidebar
// receives, so the VERSION_HISTORY feature-gate test can assert the prop
// is undefined offline (menu item hidden) and defined online.
const chapterSidebarPropsHolder: {
    onShowVersions: ((id: string) => void) | undefined;
} = { onShowVersions: undefined };

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../components/shared/AppDialog", () => ({
    useDialog: () => ({
        confirm: vi.fn(async () => true),
        prompt: vi.fn(),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}));

vi.mock("../utils/platform/notify", () => ({
    notify: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

vi.mock("../api/client", async () => {
    const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
    return {
        ...actual,
        api: {
            ...actual.api,
            books: {
                ...actual.api.books,
                get: (id: string) => getBookMock(id),
                update: (...args: unknown[]) => updateBookMock(...args),
                list: vi.fn(async () => []),
            },
            chapters: {
                ...actual.api.chapters,
                get: (...args: unknown[]) => getChapterMock(...args),
                update: (...args: unknown[]) => updateChapterMock(...args),
            },
            settings: {
                ...actual.api.settings,
                getApp: vi.fn(async () => ({})),
            },
            git: {
                ...actual.api.git,
                syncStatus: vi.fn(async () => ({ state: null })),
            },
            gitSync: {
                ...actual.api.gitSync,
                status: vi.fn(async () => ({ mapped: false })),
            },
            pages: {
                ...actual.api.pages,
                list: (...args: unknown[]) => listPagesMock(...args),
            },
            comics: {
                ...actual.api.comics,
                // ComicBookEditor (plugin-comics Session 1) fetches
                // /api/comics/info on mount; stub a resolved value so
                // the placeholder renders deterministically in tests.
                getInfo: vi.fn(async () => ({
                    name: "comics",
                    version: "1.0.0",
                    session: 1,
                    status: "scaffolding",
                    description: "Test stub.",
                })),
            },
        },
    };
});

// Stub the heavy chapter-side components so the prose-flow test
// doesn't load TipTap / plugin status / metadata editor. The
// picture-book branch returns before any of these mount.
vi.mock("../components/editor/Editor", () => ({
    default: (props: { onSave?: (content: string) => void | Promise<void> }) => {
        editorOnSaveHolder.current = props.onSave ?? null;
        return <div data-testid="editor-stub" />;
    },
    pluginsForContentKind: () => ({
        markdownMode: false,
        focusMode: false,
        styleCheck: false,
        spellcheck: false,
        searchInDocument: false,
        autosave: false,
    }),
}));
vi.mock("../components/book/ChapterSidebar", () => ({
    // Render a select-button per chapter so tests can drive the real
    // BookEditor ``onSelect`` handler (chapter-switch regression pins).
    default: (props: {
        chapters?: Array<{ id: string; title: string }>;
        onSelect: (id: string) => void;
        onMetadata?: () => void;
        onShowVersions?: (id: string) => void;
    }) => {
        chapterSidebarPropsHolder.onShowVersions = props.onShowVersions;
        return (
            <div data-testid="chapter-sidebar-stub">
                {(props.chapters ?? []).map((ch) => (
                    <button
                        key={ch.id}
                        data-testid={`chapter-select-${ch.id}`}
                        onClick={() => props.onSelect(ch.id)}
                    >
                        {ch.title}
                    </button>
                ))}
                <button data-testid="sidebar-metadata-btn" onClick={() => props.onMetadata?.()}>
                    metadata
                </button>
            </div>
        );
    },
}));
vi.mock("../components/book/BookMetadataEditor", () => ({
    default: () => <div data-testid="book-metadata-editor-stub" />,
}));
vi.mock("../components/import/ConflictResolutionDialog", () => ({ default: () => null }));
vi.mock("../components/book/SaveAsTemplateModal", () => ({ default: () => null }));
vi.mock("../components/book/ChapterTemplatePickerModal", () => ({ default: () => null }));
vi.mock("../components/book/SaveAsChapterTemplateModal", () => ({ default: () => null }));
vi.mock("../lib/components/EmptyState", () => ({ EmptyState: () => null }));
vi.mock("../components/shared/LoadingIndicator", () => ({
    LoadingIndicator: ({ testId }: { testId?: string }) => (
        <div data-testid={testId ?? "loading"}>loading</div>
    ),
}));

function makeBook(overrides: Partial<BookDetail> = {}): BookDetail {
    const base: BookDetail = {
        id: "b1",
        book_type: "prose",
        title: "Test Book",
        subtitle: null,
        author: "Author",
        language: "en",
        genre: null,
        series: null,
        series_index: null,
        description: null,
        book_idea: null,
        expose: null,
        edition: null,
        publisher: null,
        publisher_city: null,
        publish_date: null,
        isbn_ebook: null,
        isbn_paperback: null,
        isbn_hardcover: null,
        asin_ebook: null,
        asin_paperback: null,
        asin_hardcover: null,
        keywords: [],
        categories: [],
        bisac_codes: [],
        html_description: null,
        backpage_description: null,
        backpage_author_bio: null,
        cover_image: null,
        custom_css: null,
        notes: null,
        repository_url: null,
        ai_assisted: false,
        ai_tokens_used: 0,
        tts_engine: null,
        tts_voice: null,
        tts_language: null,
        tts_speed: null,
        audiobook_merge: null,
        audiobook_filename: null,
        audiobook_overwrite_existing: false,
        audiobook_skip_chapter_types: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        chapters: [],
    } as BookDetail;
    return { ...base, ...overrides };
}

function renderEditor(bookId: string) {
    return render(
        <FeatureTestProvider>
            <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
                <MemoryRouter initialEntries={[`/book/${bookId}`]}>
                    <Routes>
                        <Route path="/book/:bookId" element={<BookEditor />} />
                    </Routes>
                </MemoryRouter>
            </BookTypesProvider>
        </FeatureTestProvider>,
    );
}

beforeEach(() => {
    navigateMock.mockReset();
    getBookMock.mockReset();
    updateBookMock.mockReset();
    listPagesMock.mockReset();
    listPagesMock.mockResolvedValue([]);
    getChapterMock.mockReset();
    updateChapterMock.mockReset();
    editorOnSaveHolder.current = null;
    chapterSidebarPropsHolder.onShowVersions = undefined;
    // Default: resolve the requested chapter so the content-load effect
    // never hits the real network (the routing + chapter-switch tests
    // don't configure it themselves).
    getChapterMock.mockImplementation(async (_bookId: string, chapterId: string) =>
        makeChapterRow({ id: chapterId }),
    );
});

function makeChapterRow(overrides: Partial<Chapter> = {}): Chapter {
    return {
        id: "c1",
        book_id: "b1",
        title: "One",
        content: '{"type":"doc","content":[]}',
        position: 0,
        chapter_type: "chapter",
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    };
}

describe("BookEditor - autosave version race (Issue #41)", () => {
    it("a rapid second autosave sends the post-bump version, not the stale one", async () => {
        getBookMock.mockResolvedValue(makeBook({ id: "b1", chapters: [makeChapterRow()] }));
        getChapterMock.mockResolvedValue(makeChapterRow({ version: 1 }));
        updateChapterMock.mockImplementation(
            async (
                _bookId: string,
                _chapterId: string,
                data: { version: number; content?: string },
            ) => makeChapterRow({ version: data.version + 1, content: data.content }),
        );

        render(
            <FeatureTestProvider>
                <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
                    <MemoryRouter initialEntries={["/book/b1?chapter=c1"]}>
                        <Routes>
                            <Route path="/book/:bookId" element={<BookEditor />} />
                        </Routes>
                    </MemoryRouter>
                </BookTypesProvider>
            </FeatureTestProvider>,
        );

        await waitFor(() => expect(screen.getByTestId("editor-stub")).toBeTruthy());
        await waitFor(() => expect(editorOnSaveHolder.current).toBeTypeOf("function"));

        // Drive two saves through the SAME (first-render) onSave closure,
        // the lagging-state path the bug took: without the version ref the
        // second save would resend version 1 and 409 against the server.
        const staleSave = editorOnSaveHolder.current!;
        await act(async () => {
            await staleSave('{"type":"doc","content":[{"type":"paragraph"}]}');
        });
        await act(async () => {
            await staleSave('{"type":"doc","content":[{"type":"paragraph"},{}]}');
        });

        expect(updateChapterMock).toHaveBeenCalledTimes(2);
        expect(updateChapterMock.mock.calls[0][2].version).toBe(1);
        expect(updateChapterMock.mock.calls[1][2].version).toBe(2);
    });
});

describe("BookEditor - book_type routing (Commit 6)", () => {
    it("mounts <PageEditor> when book.book_type === 'picture_book'", async () => {
        getBookMock.mockResolvedValue(
            makeBook({ id: "pb1", book_type: "picture_book", title: "My Picture Book" }),
        );
        renderEditor("pb1");
        await waitFor(() => expect(screen.getByTestId("page-editor-root")).toBeTruthy());
        expect(screen.getByTestId("page-editor-root").getAttribute("data-book-id")).toBe("pb1");
        // The chapter-side wrapper must NOT mount.
        expect(screen.queryByTestId("book-editor")).toBeNull();
        expect(screen.queryByTestId("chapter-sidebar-stub")).toBeNull();
    });

    it("renders the book title in PageEditor's header", async () => {
        getBookMock.mockResolvedValue(
            makeBook({ id: "pb1", book_type: "picture_book", title: "My Picture Book" }),
        );
        renderEditor("pb1");
        await waitFor(() => expect(screen.getByText("My Picture Book")).toBeTruthy());
    });

    it("falls through to the chapter editor when book_type === 'prose'", async () => {
        getBookMock.mockResolvedValue(
            makeBook({ id: "b1", book_type: "prose", title: "Prose Book" }),
        );
        renderEditor("b1");
        await waitFor(() => expect(screen.getByTestId("book-editor")).toBeTruthy());
        // The page-editor surface must NOT mount.
        expect(screen.queryByTestId("page-editor-root")).toBeNull();
    });

    it("mounts <ComicBookEditor> when book.book_type === 'comic_book' (plugin-comics Session 1)", async () => {
        getBookMock.mockResolvedValue(
            makeBook({ id: "cb1", book_type: "comic_book", title: "Comic Book" }),
        );
        renderEditor("cb1");
        // The comic-book editor placeholder mounts; neither the
        // chapter-side wrapper nor the page-editor surface should.
        await waitFor(() => expect(screen.getByTestId("comic-book-editor-root")).toBeTruthy());
        expect(screen.getByTestId("comic-book-editor-root").getAttribute("data-book-id")).toBe(
            "cb1",
        );
        expect(screen.queryByTestId("book-editor")).toBeNull();
        expect(screen.queryByTestId("page-editor-root")).toBeNull();
    });

    it("renders the not-found state when the book load fails", async () => {
        getBookMock.mockRejectedValue(new Error("404"));
        renderEditor("missing");
        await waitFor(() => expect(screen.getByTestId("book-editor-not-found")).toBeTruthy());
    });
});

// --- Session 5 Commit 2: picture-book metadata routing ---
//
// Picture-books now reach BookMetadataEditor via the same
// ?view=metadata URL pattern as prose-books. PageEditor exposes
// an onShowMetadata callback that flips BookEditor's showMetadata
// state; BookMetadataEditor renders in place of PageEditor; the
// metadata onBack returns to PageEditor (NOT all the way to the
// dashboard). Closes the same-component-discriminator asymmetry
// between prose and picture_book metadata access.

function renderEditorAtPath(bookId: string, search = "") {
    return render(
        <FeatureTestProvider>
            <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
                <MemoryRouter initialEntries={[`/book/${bookId}${search}`]}>
                    <Routes>
                        <Route path="/book/:bookId" element={<BookEditor />} />
                    </Routes>
                </MemoryRouter>
            </BookTypesProvider>
        </FeatureTestProvider>,
    );
}

describe("BookEditor - picture-book metadata routing (Session 5 Commit 2)", () => {
    it("picture_book without ?view=metadata: renders PageEditor with the show-metadata button", async () => {
        getBookMock.mockResolvedValue(
            makeBook({ id: "pb1", book_type: "picture_book", title: "PB" }),
        );
        renderEditor("pb1");
        await waitFor(() => expect(screen.getByTestId("page-editor-root")).toBeTruthy());
        expect(screen.getByTestId("page-editor-show-metadata")).toBeTruthy();
        expect(screen.queryByTestId("book-metadata-editor-stub")).toBeNull();
    });

    it("picture_book + ?view=metadata: renders BookMetadataEditor (not PageEditor)", async () => {
        getBookMock.mockResolvedValue(
            makeBook({ id: "pb1", book_type: "picture_book", title: "PB" }),
        );
        renderEditorAtPath("pb1", "?view=metadata");
        await waitFor(() => expect(screen.getByTestId("book-metadata-editor-stub")).toBeTruthy());
        expect(screen.queryByTestId("page-editor-root")).toBeNull();
    });

    it("prose flow unaffected: chapter editor still renders without ?view=metadata", async () => {
        // Regression pin — Session 5 must not touch the prose
        // BookEditor flow.
        getBookMock.mockResolvedValue(makeBook({ id: "b1", book_type: "prose", title: "Prose" }));
        renderEditor("b1");
        await waitFor(() => expect(screen.getByTestId("book-editor")).toBeTruthy());
        expect(screen.queryByTestId("page-editor-root")).toBeNull();
    });

    it("prose flow with ?view=metadata: chapter wrapper still mounts (its own metadata-toggle is internal)", async () => {
        // Regression pin: the prose flow's existing showMetadata
        // pattern is unchanged. The chapter wrapper (book-editor
        // div) is the parent; the BookMetadataEditor mounts INSIDE
        // it for prose. The chapter wrapper testid is therefore
        // present in both views.
        getBookMock.mockResolvedValue(makeBook({ id: "b1", book_type: "prose", title: "Prose" }));
        renderEditorAtPath("b1", "?view=metadata");
        await waitFor(() => expect(screen.getByTestId("book-editor")).toBeTruthy());
    });
});

// --- COMIC-BOOK-EDITOR-METADATA-BUTTON-01 C2: comic-book metadata routing ---
//
// Comic-books now reach BookMetadataEditor via the same
// ?view=metadata URL pattern as prose-books + picture-books.
// ComicBookEditor exposes an onShowMetadata callback that flips
// BookEditor's showMetadata state; BookMetadataEditor renders in
// place of ComicBookEditor; the metadata onBack returns to
// ComicBookEditor (NOT all the way to the dashboard). Closes the
// Half-Wired-Visible-in-Production gap surfaced during
// EXPOSE-BUCHIDEE-METADATA-01 Track 5 — prior to this work, comic-
// book authors could not edit ANY book metadata (Categories, BISAC,
// ISBN, the new Story tab, etc.).

describe("BookEditor - comic-book metadata routing (COMIC-BOOK-EDITOR-METADATA-BUTTON-01)", () => {
    it("comic_book without ?view=metadata: renders ComicBookEditor with the show-metadata button", async () => {
        getBookMock.mockResolvedValue(
            makeBook({ id: "cb1", book_type: "comic_book", title: "CB" }),
        );
        renderEditor("cb1");
        await waitFor(() => expect(screen.getByTestId("comic-book-editor-root")).toBeTruthy());
        // The new metadata button is rendered (onShowMetadata prop
        // wired through BookEditor → ComicBookEditor).
        expect(screen.getByTestId("comic-book-editor-show-metadata")).toBeTruthy();
        // BookMetadataEditor stub is NOT rendered yet — only after
        // the button click flips showMetadata.
        expect(screen.queryByTestId("book-metadata-editor-stub")).toBeNull();
    });

    it("comic_book + ?view=metadata: renders BookMetadataEditor (not ComicBookEditor)", async () => {
        getBookMock.mockResolvedValue(
            makeBook({ id: "cb1", book_type: "comic_book", title: "CB" }),
        );
        renderEditorAtPath("cb1", "?view=metadata");
        await waitFor(() => expect(screen.getByTestId("book-metadata-editor-stub")).toBeTruthy());
        // The comic-book editor root is NOT mounted while the
        // metadata view is active — same in-place swap pattern as
        // picture_book.
        expect(screen.queryByTestId("comic-book-editor-root")).toBeNull();
    });

    it("picture_book + prose flows unaffected (cross-surface regression-pin)", async () => {
        // Regression pin: the comic-book branch addition must not
        // touch the picture_book OR prose paths.
        getBookMock.mockResolvedValue(
            makeBook({ id: "pb1", book_type: "picture_book", title: "PB" }),
        );
        renderEditor("pb1");
        await waitFor(() => expect(screen.getByTestId("page-editor-root")).toBeTruthy());
        // Picture-book still mounts PageEditor (NOT ComicBookEditor)
        // — confirms the branch ordering didn't fall through.
        expect(screen.queryByTestId("comic-book-editor-root")).toBeNull();
    });
});

describe("BookEditor — accessibility (axe)", () => {
    it("has no critical/serious axe violations (picture-book)", async () => {
        getBookMock.mockResolvedValue(
            makeBook({
                id: "pb1",
                book_type: "picture_book",
                title: "My Picture Book",
            }),
        );
        const { container } = renderEditor("pb1");
        await waitFor(() => expect(screen.getByTestId("page-editor-root")).toBeTruthy());
        await expectNoA11yViolations(container);
    });
});

// --- Chapter-switch regression (clobbered ?chapter= URL write) ---
//
// Selecting a sidebar chapter calls BookEditor's onSelect, which must
// land the new chapter id in the ``?chapter=`` URL param. The bug:
// onSelect issued two separate setSearchParams calls in one tick
// (set chapter, then clear view); react-router resolves each against
// the render-time snapshot, so the second navigate clobbered the
// first and ``?chapter=`` never changed — the editor stayed on the
// previous chapter. selectChapter now writes both in one call.

function makeChapter(id: string, title: string, position: number): import("../api/client").Chapter {
    return {
        id,
        book_id: "b1",
        title,
        content: "{}",
        position,
        chapter_type: "chapter",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
    } as import("../api/client").Chapter;
}

function LocationProbe() {
    const loc = useLocation();
    return <div data-testid="location-search">{loc.search}</div>;
}

function renderEditorWithProbe(bookId: string, search = "") {
    return render(
        <FeatureTestProvider>
            <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
                <MemoryRouter initialEntries={[`/book/${bookId}${search}`]}>
                    <Routes>
                        <Route path="/book/:bookId" element={<BookEditor />} />
                    </Routes>
                    <LocationProbe />
                </MemoryRouter>
            </BookTypesProvider>
        </FeatureTestProvider>,
    );
}

describe("BookEditor - chapter switch updates ?chapter= (regression)", () => {
    const proseWithChapters = () =>
        makeBook({
            id: "b1",
            book_type: "prose",
            title: "Prose",
            chapters: [
                makeChapter("a", "Chapter A", 0),
                makeChapter("b", "Chapter B", 1),
                makeChapter("c", "Chapter C", 2),
            ],
        });

    it("clicking another chapter moves ?chapter= to that chapter", async () => {
        getBookMock.mockResolvedValue(proseWithChapters());
        renderEditorWithProbe("b1", "?chapter=a");
        await waitFor(() => expect(screen.getByTestId("chapter-select-b")).toBeTruthy());
        expect(screen.getByTestId("location-search").textContent).toContain("chapter=a");

        fireEvent.click(screen.getByTestId("chapter-select-b"));
        await waitFor(() =>
            expect(screen.getByTestId("location-search").textContent).toContain("chapter=b"),
        );
        // The previous chapter id must be gone (the clobber left it at "a").
        expect(screen.getByTestId("location-search").textContent).not.toContain("chapter=a");
    });

    it("selecting a chapter from the metadata view sets ?chapter= and clears ?view=", async () => {
        getBookMock.mockResolvedValue(proseWithChapters());
        renderEditorWithProbe("b1", "?view=metadata&chapter=a");
        await waitFor(() => expect(screen.getByTestId("chapter-select-c")).toBeTruthy());

        fireEvent.click(screen.getByTestId("chapter-select-c"));
        await waitFor(() =>
            expect(screen.getByTestId("location-search").textContent).toContain("chapter=c"),
        );
        const search = screen.getByTestId("location-search").textContent ?? "";
        expect(search).not.toContain("view=metadata");
        expect(search).not.toContain("chapter=a");
    });
});

// --- VERSION_HISTORY feature gate (#67 item 1) ---
//
// The chapter snapshot/versions menu item is version-history-gated.
// BookEditor passes onShowVersions to ChapterSidebar only when the
// VERSION_HISTORY feature is active; ChapterSortable renders the menu
// item only when the prop is defined. In dexie/offline mode
// VERSION_HISTORY is desktop-only (no backend snapshot store), so the
// handler must be undefined and the menu item absent — mirroring how
// Editor.tsx already gates onTakeSnapshot.

function renderEditorWithMode(bookId: string, mode: "api" | "dexie") {
    return render(
        <FeatureTestProvider mode={mode}>
            <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
                <MemoryRouter initialEntries={[`/book/${bookId}`]}>
                    <Routes>
                        <Route path="/book/:bookId" element={<BookEditor />} />
                    </Routes>
                </MemoryRouter>
            </BookTypesProvider>
        </FeatureTestProvider>,
    );
}

describe("BookEditor - version-history gate on onShowVersions (#67)", () => {
    it("online (api mode): passes an onShowVersions handler to the sidebar", async () => {
        getBookMock.mockResolvedValue(
            makeBook({ id: "b1", chapters: [makeChapterRow({ id: "c1" })] }),
        );
        renderEditorWithMode("b1", "api");
        await waitFor(() => expect(screen.getByTestId("chapter-sidebar-stub")).toBeTruthy());
        expect(chapterSidebarPropsHolder.onShowVersions).toBeTypeOf("function");
    });

    it("offline (dexie mode): onShowVersions is undefined (menu item hidden)", async () => {
        getBookMock.mockResolvedValue(
            makeBook({ id: "b1", chapters: [makeChapterRow({ id: "c1" })] }),
        );
        renderEditorWithMode("b1", "dexie");
        await waitFor(() => expect(screen.getByTestId("chapter-sidebar-stub")).toBeTruthy());
        expect(chapterSidebarPropsHolder.onShowVersions).toBeUndefined();
    });

    it("online handler navigates to the chapter snapshots route", async () => {
        getBookMock.mockResolvedValue(
            makeBook({ id: "b1", chapters: [makeChapterRow({ id: "c1" })] }),
        );
        renderEditorWithMode("b1", "api");
        await waitFor(() =>
            expect(chapterSidebarPropsHolder.onShowVersions).toBeTypeOf("function"),
        );
        chapterSidebarPropsHolder.onShowVersions!("c1");
        expect(navigateMock).toHaveBeenCalledWith("/books/b1/chapters/c1/snapshots");
    });

    it("offline build never wires a snapshot navigation (no leak)", async () => {
        getBookMock.mockResolvedValue(
            makeBook({ id: "b1", chapters: [makeChapterRow({ id: "c1" })] }),
        );
        renderEditorWithMode("b1", "dexie");
        await waitFor(() => expect(screen.getByTestId("chapter-sidebar-stub")).toBeTruthy());
        expect(chapterSidebarPropsHolder.onShowVersions).toBeUndefined();
        expect(navigateMock.mock.calls.some((c) => String(c[0]).includes("/snapshots"))).toBe(
            false,
        );
    });
});

describe("BookEditor - sidebar closes on view switch (narrow viewport, #293)", () => {
    function setWidth(px: number) {
        Object.defineProperty(window, "innerWidth", {
            value: px,
            configurable: true,
            writable: true,
        });
    }

    it("closes the sidebar when metadata is opened on a narrow viewport", async () => {
        const original = window.innerWidth;
        setWidth(375);
        localStorage.setItem("bibliogon-book-editor-sidebar", "1");
        getBookMock.mockResolvedValue(
            makeBook({ id: "b1", chapters: [makeChapterRow({ id: "c1" })] }),
        );
        try {
            renderEditor("b1");
            await waitFor(() => expect(screen.getByTestId("chapter-sidebar-stub")).toBeTruthy());
            expect(
                screen.getByTestId("book-editor-sidebar").getAttribute("data-sidebar-open"),
            ).toBe("true");

            fireEvent.click(screen.getByTestId("sidebar-metadata-btn"));

            await waitFor(() =>
                expect(
                    screen.getByTestId("book-editor-sidebar").getAttribute("data-sidebar-open"),
                ).toBe("false"),
            );
        } finally {
            setWidth(original);
            localStorage.clear();
        }
    });

    it("keeps the sidebar open when metadata is opened on a wide viewport", async () => {
        const original = window.innerWidth;
        setWidth(1400);
        localStorage.setItem("bibliogon-book-editor-sidebar", "1");
        getBookMock.mockResolvedValue(
            makeBook({ id: "b1", chapters: [makeChapterRow({ id: "c1" })] }),
        );
        try {
            renderEditor("b1");
            await waitFor(() => expect(screen.getByTestId("chapter-sidebar-stub")).toBeTruthy());
            fireEvent.click(screen.getByTestId("sidebar-metadata-btn"));
            expect(
                screen.getByTestId("book-editor-sidebar").getAttribute("data-sidebar-open"),
            ).toBe("true");
        } finally {
            setWidth(original);
            localStorage.clear();
        }
    });
});

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
import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router-dom";

import BookEditor from "./BookEditor";
import type {BookDetail, BookTypeDef} from "../api/client";
import {BookTypesProvider} from "../hooks/useBookTypes";
import {expectNoA11yViolations} from "../test-utils/a11y";

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

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>(
        "react-router-dom",
    );
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

vi.mock("../components/AppDialog", () => ({
    useDialog: () => ({
        confirm: vi.fn(async () => true),
        prompt: vi.fn(),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}));

vi.mock("../utils/notify", () => ({
    notify: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

vi.mock("../api/client", async () => {
    const actual = await vi.importActual<typeof import("../api/client")>(
        "../api/client",
    );
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
            settings: {
                ...actual.api.settings,
                getApp: vi.fn(async () => ({})),
            },
            git: {
                ...actual.api.git,
                syncStatus: vi.fn(async () => ({state: null})),
            },
            gitSync: {
                ...actual.api.gitSync,
                status: vi.fn(async () => ({mapped: false})),
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
vi.mock("../components/Editor", () => ({
    default: () => <div data-testid="editor-stub" />,
    pluginsForContentKind: () => ({
        markdownMode: false,
        focusMode: false,
        styleCheck: false,
        spellcheck: false,
        searchInDocument: false,
        autosave: false,
    }),
}));
vi.mock("../components/ChapterSidebar", () => ({
    default: () => <div data-testid="chapter-sidebar-stub" />,
}));
vi.mock("../components/BookMetadataEditor", () => ({
    default: () => <div data-testid="book-metadata-editor-stub" />,
}));
vi.mock("../components/ConflictResolutionDialog", () => ({default: () => null}));
vi.mock("../components/ChapterVersionsModal", () => ({default: () => null}));
vi.mock("../components/ExportDialog", () => ({default: () => null}));
vi.mock("../components/GitBackupDialog", () => ({default: () => null}));
vi.mock("../components/GitSyncDialog", () => ({default: () => null}));
vi.mock("../components/SaveAsTemplateModal", () => ({default: () => null}));
vi.mock("../components/ChapterTemplatePickerModal", () => ({default: () => null}));
vi.mock("../components/SaveAsChapterTemplateModal", () => ({default: () => null}));
vi.mock("../components/EmptyState", () => ({EmptyState: () => null}));
vi.mock("../components/LoadingIndicator", () => ({
    LoadingIndicator: ({testId}: {testId?: string}) => (
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
    return {...base, ...overrides};
}

function renderEditor(bookId: string) {
    return render(
        <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
            <MemoryRouter initialEntries={[`/book/${bookId}`]}>
                <Routes>
                    <Route path="/book/:bookId" element={<BookEditor />} />
                </Routes>
            </MemoryRouter>
        </BookTypesProvider>,
    );
}

beforeEach(() => {
    navigateMock.mockReset();
    getBookMock.mockReset();
    updateBookMock.mockReset();
    listPagesMock.mockReset();
    listPagesMock.mockResolvedValue([]);
});

describe("BookEditor - book_type routing (Commit 6)", () => {
    it("mounts <PageEditor> when book.book_type === 'picture_book'", async () => {
        getBookMock.mockResolvedValue(
            makeBook({id: "pb1", book_type: "picture_book", title: "My Picture Book"}),
        );
        renderEditor("pb1");
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-root")).toBeTruthy(),
        );
        expect(
            screen.getByTestId("page-editor-root").getAttribute("data-book-id"),
        ).toBe("pb1");
        // The chapter-side wrapper must NOT mount.
        expect(screen.queryByTestId("book-editor")).toBeNull();
        expect(screen.queryByTestId("chapter-sidebar-stub")).toBeNull();
    });

    it("renders the book title in PageEditor's header", async () => {
        getBookMock.mockResolvedValue(
            makeBook({id: "pb1", book_type: "picture_book", title: "My Picture Book"}),
        );
        renderEditor("pb1");
        await waitFor(() =>
            expect(screen.getByText("My Picture Book")).toBeTruthy(),
        );
    });

    it("falls through to the chapter editor when book_type === 'prose'", async () => {
        getBookMock.mockResolvedValue(
            makeBook({id: "b1", book_type: "prose", title: "Prose Book"}),
        );
        renderEditor("b1");
        await waitFor(() =>
            expect(screen.getByTestId("book-editor")).toBeTruthy(),
        );
        // The page-editor surface must NOT mount.
        expect(screen.queryByTestId("page-editor-root")).toBeNull();
    });

    it("mounts <ComicBookEditor> when book.book_type === 'comic_book' (plugin-comics Session 1)", async () => {
        getBookMock.mockResolvedValue(
            makeBook({id: "cb1", book_type: "comic_book", title: "Comic Book"}),
        );
        renderEditor("cb1");
        // The comic-book editor placeholder mounts; neither the
        // chapter-side wrapper nor the page-editor surface should.
        await waitFor(() =>
            expect(screen.getByTestId("comic-book-editor-root")).toBeTruthy(),
        );
        expect(
            screen
                .getByTestId("comic-book-editor-root")
                .getAttribute("data-book-id"),
        ).toBe("cb1");
        expect(screen.queryByTestId("book-editor")).toBeNull();
        expect(screen.queryByTestId("page-editor-root")).toBeNull();
    });

    it("renders the not-found state when the book load fails", async () => {
        getBookMock.mockRejectedValue(new Error("404"));
        renderEditor("missing");
        await waitFor(() =>
            expect(screen.getByTestId("book-editor-not-found")).toBeTruthy(),
        );
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
        <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
            <MemoryRouter initialEntries={[`/book/${bookId}${search}`]}>
                <Routes>
                    <Route path="/book/:bookId" element={<BookEditor />} />
                </Routes>
            </MemoryRouter>
        </BookTypesProvider>,
    );
}

describe("BookEditor - picture-book metadata routing (Session 5 Commit 2)", () => {
    it("picture_book without ?view=metadata: renders PageEditor with the show-metadata button", async () => {
        getBookMock.mockResolvedValue(
            makeBook({id: "pb1", book_type: "picture_book", title: "PB"}),
        );
        renderEditor("pb1");
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-root")).toBeTruthy(),
        );
        expect(screen.getByTestId("page-editor-show-metadata")).toBeTruthy();
        expect(screen.queryByTestId("book-metadata-editor-stub")).toBeNull();
    });

    it("picture_book + ?view=metadata: renders BookMetadataEditor (not PageEditor)", async () => {
        getBookMock.mockResolvedValue(
            makeBook({id: "pb1", book_type: "picture_book", title: "PB"}),
        );
        renderEditorAtPath("pb1", "?view=metadata");
        await waitFor(() =>
            expect(screen.getByTestId("book-metadata-editor-stub")).toBeTruthy(),
        );
        expect(screen.queryByTestId("page-editor-root")).toBeNull();
    });

    it("prose flow unaffected: chapter editor still renders without ?view=metadata", async () => {
        // Regression pin — Session 5 must not touch the prose
        // BookEditor flow.
        getBookMock.mockResolvedValue(
            makeBook({id: "b1", book_type: "prose", title: "Prose"}),
        );
        renderEditor("b1");
        await waitFor(() =>
            expect(screen.getByTestId("book-editor")).toBeTruthy(),
        );
        expect(screen.queryByTestId("page-editor-root")).toBeNull();
    });

    it("prose flow with ?view=metadata: chapter wrapper still mounts (its own metadata-toggle is internal)", async () => {
        // Regression pin: the prose flow's existing showMetadata
        // pattern is unchanged. The chapter wrapper (book-editor
        // div) is the parent; the BookMetadataEditor mounts INSIDE
        // it for prose. The chapter wrapper testid is therefore
        // present in both views.
        getBookMock.mockResolvedValue(
            makeBook({id: "b1", book_type: "prose", title: "Prose"}),
        );
        renderEditorAtPath("b1", "?view=metadata");
        await waitFor(() =>
            expect(screen.getByTestId("book-editor")).toBeTruthy(),
        );
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
            makeBook({id: "cb1", book_type: "comic_book", title: "CB"}),
        );
        renderEditor("cb1");
        await waitFor(() =>
            expect(screen.getByTestId("comic-book-editor-root")).toBeTruthy(),
        );
        // The new metadata button is rendered (onShowMetadata prop
        // wired through BookEditor → ComicBookEditor).
        expect(
            screen.getByTestId("comic-book-editor-show-metadata"),
        ).toBeTruthy();
        // BookMetadataEditor stub is NOT rendered yet — only after
        // the button click flips showMetadata.
        expect(screen.queryByTestId("book-metadata-editor-stub")).toBeNull();
    });

    it("comic_book + ?view=metadata: renders BookMetadataEditor (not ComicBookEditor)", async () => {
        getBookMock.mockResolvedValue(
            makeBook({id: "cb1", book_type: "comic_book", title: "CB"}),
        );
        renderEditorAtPath("cb1", "?view=metadata");
        await waitFor(() =>
            expect(screen.getByTestId("book-metadata-editor-stub")).toBeTruthy(),
        );
        // The comic-book editor root is NOT mounted while the
        // metadata view is active — same in-place swap pattern as
        // picture_book.
        expect(screen.queryByTestId("comic-book-editor-root")).toBeNull();
    });

    it("picture_book + prose flows unaffected (cross-surface regression-pin)", async () => {
        // Regression pin: the comic-book branch addition must not
        // touch the picture_book OR prose paths.
        getBookMock.mockResolvedValue(
            makeBook({id: "pb1", book_type: "picture_book", title: "PB"}),
        );
        renderEditor("pb1");
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-root")).toBeTruthy(),
        );
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
        const {container} = renderEditor("pb1");
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-root")).toBeTruthy(),
        );
        await expectNoA11yViolations(container);
    });
});

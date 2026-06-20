/**
 * GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 C4: Vitest coverage for the
 * multi-book-type onboarding additions (C1-C3).
 *
 * Pins:
 *  - The new ``choose-book-type`` step renders + its 3-card help
 *    content surfaces all 3 BookType cards with stable testids
 *  - The 3-button sample-row replaces the prior single button on
 *    the ``create-book`` step
 *  - Clicking each sample button calls api.getStarted.sampleBook
 *    with the matching book_type query param
 *  - Per-book-type sample creation branches on response.chapters
 *    (prose) vs response.pages (picture/comic) and dispatches the
 *    right downstream API call (api.chapters.create vs
 *    api.pages.create)
 *  - Book-type header on api.books.create gets set for non-prose
 *
 * The dropdown / Radix-portal layers don't apply here (no Radix
 * usage in GetStarted). Pre-Inspection confirmed no anti-extraction
 * doc-comments on the BOOK_TYPE_CARDS list (it's defined inline in
 * GetStarted.tsx for now; lifted-out extraction tracked under
 * BOOK-TYPE-CARD-COMPONENT-EXTRACT-01 when a 2nd consumer lands).
 */

import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";

import GetStarted from "./GetStarted";
import {BookTypesProvider} from "../hooks/book/useBookTypes";
import type {BookTypeDef} from "../api/client";

// --- Mocks -----------------------------------------------------------------

const navigateMock = vi.fn();

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

vi.mock("../utils/notify", () => ({
    notify: {
        success: vi.fn(),
        error: vi.fn(),
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
            getStarted: {
                guide: vi.fn(),
                sampleBook: vi.fn(),
            },
            books: {
                ...actual.api.books,
                create: vi.fn(),
            },
            chapters: {
                ...actual.api.chapters,
                create: vi.fn(),
            },
            pages: {
                ...actual.api.pages,
                create: vi.fn(),
            },
        },
    };
});

import {api} from "../api/client";

const fakeSteps = [
    {
        id: "choose-book-type",
        title: "Choose Book Type",
        description: "Pick the type.",
        icon: "book-open",
    },
    {
        id: "create-book",
        title: "Create a Book",
        description: "Click 'New Book'.",
        icon: "book-plus",
    },
];

const fakeProseSample = {
    title: "My First Book",
    author: "Bibliogon",
    language: "de",
    book_type: "prose" as const,
    description: "A sample book",
    chapters: [{title: "Welcome", content: "Hello!"}],
};

const fakePictureSample = {
    title: "My First Picture Book",
    author: "Bibliogon",
    language: "de",
    book_type: "picture_book" as const,
    description: "Picture book demo",
    pages: [
        {layout: "image_top_text_bottom", text_content: "Welcome!"},
        {layout: "text_only", text_content: "Text-only page."},
    ],
};

const fakeComicSample = {
    title: "My First Comic Book",
    author: "Bibliogon",
    language: "de",
    book_type: "comic_book" as const,
    description: "Comic book demo",
    pages: [
        {
            layout: "comic_panel_grid",
            layout_config: {comic_grid_template: "single_panel"},
        },
    ],
};

const fakeBook = {
    id: "book-1",
    title: "Sample",
    author: "Bibliogon",
    language: "de",
    book_type: "prose" as const,
    description: "",
};

// BOOK-TYPES-SSOT-YAML-01 C5: GetStarted now reads the BookType
// registry via useBookTypes(). The provider's initialTypes prop
// lets tests skip the network fetch + use a static snapshot.
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

function renderGetStarted() {
    return render(
        <MemoryRouter>
            <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
                <GetStarted/>
            </BookTypesProvider>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.mocked(api.getStarted.guide).mockImplementation(async () => fakeSteps);
    vi.mocked(api.getStarted.sampleBook).mockImplementation(
        async (_lang, bookType = "prose") => {
            if (bookType === "picture_book") return fakePictureSample;
            if (bookType === "comic_book") return fakeComicSample;
            return fakeProseSample;
        },
    );
    vi.mocked(api.books.create).mockImplementation(async () => fakeBook as never);
    vi.mocked(api.chapters.create).mockImplementation(async () => ({
        id: "ch-1",
        book_id: "book-1",
        title: "Welcome",
        content: "Hello!",
        position: 1,
        chapter_type: "chapter",
    }) as never);
    vi.mocked(api.pages.create).mockImplementation(async () => ({
        id: "p-1",
        book_id: "book-1",
        position: 1,
        layout: "image_top_text_bottom",
        layout_config: null,
        image_asset_id: null,
        text_content: null,
        notes: null,
        story_beat: null,
        mood_color: null,
        act_group: null,
        created_at: "2026-05-23T00:00:00",
        updated_at: "2026-05-23T00:00:00",
    }));
});

afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
});

describe("GetStarted multi-book-type onboarding (C4)", () => {
    it("renders the choose-book-type step first when guide returns it as step #1", async () => {
        renderGetStarted();
        await waitFor(() => {
            expect(api.getStarted.guide).toHaveBeenCalled();
        });
        // Title from the first step.
        expect(await screen.findByText("Choose Book Type")).toBeInTheDocument();
    });

    it("expands the choose-book-type help into a 3-card grid", async () => {
        renderGetStarted();
        await screen.findByText("Choose Book Type");
        // Click "How does it work?" to expand the help section.
        fireEvent.click(screen.getByText("Wie geht das?"));
        // Grid + 3 cards visible.
        expect(
            await screen.findByTestId("getstarted-book-type-grid"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("getstarted-book-type-card-prose"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("getstarted-book-type-card-picture_book"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("getstarted-book-type-card-comic_book"),
        ).toBeInTheDocument();
    });

    it("the create-book step surfaces a 3-button sample row", async () => {
        renderGetStarted();
        await screen.findByText("Choose Book Type");
        // Navigate to create-book step (#2 in fakeSteps).
        const indicators = screen.getAllByRole("button").filter((b) => b.textContent === "2");
        fireEvent.click(indicators[0]);
        expect(
            await screen.findByTestId("getstarted-sample-button-row"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("getstarted-sample-prose"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("getstarted-sample-picture_book"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("getstarted-sample-comic_book"),
        ).toBeInTheDocument();
    });

    it("clicking sample-prose calls sampleBook(lang, 'prose') + creates chapters via api.chapters.create", async () => {
        renderGetStarted();
        await screen.findByText("Choose Book Type");
        const indicators = screen.getAllByRole("button").filter((b) => b.textContent === "2");
        fireEvent.click(indicators[0]);
        fireEvent.click(await screen.findByTestId("getstarted-sample-prose"));
        await waitFor(() => {
            expect(api.getStarted.sampleBook).toHaveBeenCalledWith("de", "prose");
        });
        await waitFor(() => {
            expect(api.books.create).toHaveBeenCalled();
        });
        // Prose call to api.books.create does NOT include book_type
        // (default-prose payload preserves pre-MULTIBOOK shape).
        const proseCallArg = vi.mocked(api.books.create).mock.calls[0]?.[0] as unknown as Record<string, unknown>;
        expect("book_type" in proseCallArg).toBe(false);
        // Chapters dispatched, NO pages.
        expect(api.chapters.create).toHaveBeenCalled();
        expect(api.pages.create).not.toHaveBeenCalled();
    });

    it("clicking sample-picture_book branches to api.pages.create + sets book_type=picture_book", async () => {
        renderGetStarted();
        await screen.findByText("Choose Book Type");
        const indicators = screen.getAllByRole("button").filter((b) => b.textContent === "2");
        fireEvent.click(indicators[0]);
        fireEvent.click(await screen.findByTestId("getstarted-sample-picture_book"));
        await waitFor(() => {
            expect(api.getStarted.sampleBook).toHaveBeenCalledWith("de", "picture_book");
        });
        await waitFor(() => {
            expect(api.books.create).toHaveBeenCalled();
        });
        const pictureCallArg = vi.mocked(api.books.create).mock.calls[0]?.[0] as {
            book_type?: string;
        };
        expect(pictureCallArg.book_type).toBe("picture_book");
        // Pages dispatched (2 from fakePictureSample), NO chapters.
        await waitFor(() => {
            expect(api.pages.create).toHaveBeenCalledTimes(2);
        });
        expect(api.chapters.create).not.toHaveBeenCalled();
    });

    it("clicking sample-comic_book branches to api.pages.create with layout_config", async () => {
        renderGetStarted();
        await screen.findByText("Choose Book Type");
        const indicators = screen.getAllByRole("button").filter((b) => b.textContent === "2");
        fireEvent.click(indicators[0]);
        fireEvent.click(await screen.findByTestId("getstarted-sample-comic_book"));
        await waitFor(() => {
            expect(api.getStarted.sampleBook).toHaveBeenCalledWith("de", "comic_book");
        });
        await waitFor(() => {
            expect(api.books.create).toHaveBeenCalled();
        });
        const comicCallArg = vi.mocked(api.books.create).mock.calls[0]?.[0] as {
            book_type?: string;
        };
        expect(comicCallArg.book_type).toBe("comic_book");
        // 1 page from fakeComicSample.
        await waitFor(() => {
            expect(api.pages.create).toHaveBeenCalledTimes(1);
        });
        // Confirm layout_config was threaded through to api.pages.create.
        const pageArg = vi.mocked(api.pages.create).mock.calls[0]?.[1] as {
            layout?: string;
            layout_config?: Record<string, unknown>;
        };
        expect(pageArg.layout).toBe("comic_panel_grid");
        expect(pageArg.layout_config).toEqual({
            comic_grid_template: "single_panel",
        });
    });

    it("navigates to the new book's editor after sample creation succeeds", async () => {
        renderGetStarted();
        await screen.findByText("Choose Book Type");
        const indicators = screen.getAllByRole("button").filter((b) => b.textContent === "2");
        fireEvent.click(indicators[0]);
        fireEvent.click(await screen.findByTestId("getstarted-sample-prose"));
        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith("/book/book-1");
        });
    });
});

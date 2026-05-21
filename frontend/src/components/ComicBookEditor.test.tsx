/**
 * Vitest coverage for the full ComicBookEditor (plugin-comics
 * Session 2 C6 + PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 close).
 *
 * Pins the full editor's read-side wiring (panels + bubbles list
 * flow), CRUD actions (add/delete panel + bubble), the empty
 * "no pages yet" state with its create-first-page action button
 * (Session 3), and the PdfExportControls mount under the
 * comic-book-editor testid namespace.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";

import ComicBookEditor from "./ComicBookEditor";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../api/client", async () => {
    const actual = await vi.importActual<typeof import("../api/client")>(
        "../api/client",
    );
    return {
        ...actual,
        api: {
            ...actual.api,
            comics: {
                getInfo: vi.fn(),
                listPanels: vi.fn(),
                createPanel: vi.fn(),
                updatePanel: vi.fn(),
                deletePanel: vi.fn(),
                listBubbles: vi.fn(),
                createBubble: vi.fn(),
                updateBubble: vi.fn(),
                deleteBubble: vi.fn(),
            },
            pages: {
                ...actual.api.pages,
                list: vi.fn(),
                create: vi.fn(),
            },
        },
    };
});

import {api} from "../api/client";

const fakePluginInfo = {
    name: "comics",
    version: "1.1.0",
    session: 2,
    status: "active",
    description: "Test description.",
};

const fakePage = {
    id: "page-1",
    book_id: "book-1",
    position: 1,
    layout: "speech_bubble" as const,
    layout_config: {comic_grid_template: "grid_2x2"},
    image_asset_id: null,
    text_content: null,
    created_at: "2026-05-20T00:00:00",
    updated_at: "2026-05-20T00:00:00",
};

const fakePanel = {
    id: "panel-1",
    page_id: "page-1",
    position: 1,
    image_asset_id: null,
    bounds: {x_pct: 0, y_pct: 0, width_pct: 100, height_pct: 100},
    panel_config: null,
    created_at: "2026-05-20T00:00:00",
    updated_at: "2026-05-20T00:00:00",
};

const fakeBubble = {
    id: "bubble-1",
    panel_id: "panel-1",
    position: 1,
    bubble_type: "speech",
    anchor: {x_pct: 25, y_pct: 25},
    width_pct: 30,
    height_pct: 20,
    tail_direction: "S",
    tail_position_pct: 50,
    tail_length_px: 16,
    bubble_config: null,
    text_content: "Hello",
    created_at: "2026-05-20T00:00:00",
    updated_at: "2026-05-20T00:00:00",
};

beforeEach(() => {
    vi.mocked(api.comics.getInfo).mockImplementation(async () => fakePluginInfo);
    vi.mocked(api.comics.listPanels).mockImplementation(async () => [fakePanel]);
    vi.mocked(api.comics.listBubbles).mockImplementation(async () => [
        fakeBubble,
    ]);
    vi.mocked(api.comics.createPanel).mockImplementation(async () => fakePanel);
    vi.mocked(api.comics.createBubble).mockImplementation(
        async () => fakeBubble,
    );
    vi.mocked(api.comics.updateBubble).mockImplementation(
        async () => fakeBubble,
    );
    vi.mocked(api.comics.deletePanel).mockImplementation(async () => undefined);
    vi.mocked(api.comics.deleteBubble).mockImplementation(async () => undefined);
    vi.mocked(api.pages.list).mockImplementation(async () => [fakePage]);
    vi.mocked(api.pages.create).mockImplementation(async () => fakePage);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("ComicBookEditor (Session 2 C6 full editor)", () => {
    it("renders the book title + back button + fullscreen", () => {
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        expect(screen.getByTestId("comic-book-editor-title").textContent).toBe(
            "My Comic",
        );
        expect(
            screen.getByTestId("comic-book-editor-back"),
        ).toBeInTheDocument();
    });

    it("calls onBack when the back button is clicked", () => {
        const onBack = vi.fn();
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={onBack}
            />,
        );
        fireEvent.click(screen.getByTestId("comic-book-editor-back"));
        expect(onBack).toHaveBeenCalledOnce();
    });

    it("surfaces the empty-pages state with a create-first-page button when pages.list returns []", async () => {
        vi.mocked(api.pages.list).mockImplementation(async () => []);
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        expect(
            await screen.findByTestId("comic-book-editor-no-pages"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("comic-book-editor-create-first-page"),
        ).toBeInTheDocument();
    });

    it("clicking create-first-page calls api.pages.create with comic_panel_grid + refreshes the page list", async () => {
        // Closure-flag pattern (per lessons-learned "React 18 dev-mode
        // double-effect-mount strands mockImplementationOnce"): both
        // strict-mode mounts of the initial useEffect see an empty
        // list; after create flips the flag, refreshPages sees the
        // new row.
        let hasCreated = false;
        vi.mocked(api.pages.list).mockImplementation(async () =>
            hasCreated ? [fakePage] : [],
        );
        vi.mocked(api.pages.create).mockImplementation(async () => {
            hasCreated = true;
            return fakePage;
        });
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        const createButton = await screen.findByTestId(
            "comic-book-editor-create-first-page",
        );
        fireEvent.click(createButton);
        await waitFor(() => {
            // Phase 1 of PLUGIN-COMICS-PHASE-1-MULTI-PANEL-LAYOUTS-01
            // sets the default template explicitly to avoid γ-shim
            // reliance (previously this commit-payload was just
            // {layout: "comic_panel_grid"}; explicit layout_config
            // added 2026-05-20).
            expect(api.pages.create).toHaveBeenCalledWith("book-1", {
                layout: "comic_panel_grid",
                layout_config: {
                    comic_grid_template: "single_panel",
                },
            });
        });
        // After the create + refresh, the page nav appears.
        expect(
            await screen.findByTestId("comic-book-editor-page-nav"),
        ).toBeInTheDocument();
    });

    it("surfaces an error in the empty state when api.pages.create fails", async () => {
        const {ApiError} = await import("../api/client");
        vi.mocked(api.pages.list).mockImplementation(async () => []);
        vi.mocked(api.pages.create).mockImplementation(async () => {
            throw new ApiError(500, "creation failed", "/books/book-1/pages", "POST");
        });
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        fireEvent.click(
            await screen.findByTestId("comic-book-editor-create-first-page"),
        );
        const errorEl = await screen.findByTestId(
            "comic-book-editor-pages-error",
        );
        expect(errorEl.textContent).toMatch(/creation failed/);
    });

    it("renders the page nav + grid when pages exist", async () => {
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        await waitFor(() => {
            expect(api.pages.list).toHaveBeenCalledWith("book-1");
        });
        expect(
            await screen.findByTestId("comic-book-editor-page-nav"),
        ).toBeInTheDocument();
        expect(
            await screen.findByTestId("comic-book-editor-page-page-1"),
        ).toBeInTheDocument();
    });

    it("mounts the PdfExportControls under comic-book-editor testid namespace", async () => {
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        expect(
            screen.getByTestId("comic-book-editor-pdf-format-select"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("comic-book-editor-export-pdf"),
        ).toBeInTheDocument();
    });

    it("Add Panel button calls api.comics.createPanel on click", async () => {
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        await waitFor(() => {
            expect(
                screen.getByTestId("comic-book-editor-add-panel"),
            ).not.toBeDisabled();
        });
        fireEvent.click(screen.getByTestId("comic-book-editor-add-panel"));
        await waitFor(() => {
            expect(api.comics.createPanel).toHaveBeenCalledWith(
                "book-1",
                "page-1",
                expect.objectContaining({bounds: expect.any(Object)}),
            );
        });
    });

    it("Add Panel auto-selects the new panel (Add-Bubble enables)", async () => {
        // Perception-lag fix: after a successful createPanel, the
        // editor sets selectedPanelId to the new panel's id. The
        // visible signal is Add-Bubble going from disabled to
        // enabled (since the bubble-create handler gates on
        // selectedPanelId).
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        await waitFor(() => {
            expect(api.comics.listPanels).toHaveBeenCalled();
        });
        // Pre-click: Add-Bubble disabled because no panel selected.
        expect(
            screen.getByTestId("comic-book-editor-add-bubble"),
        ).toBeDisabled();
        fireEvent.click(screen.getByTestId("comic-book-editor-add-panel"));
        // Post-click: createPanel resolved, auto-select fired,
        // Add-Bubble now enabled.
        await waitFor(() => {
            expect(
                screen.getByTestId("comic-book-editor-add-bubble"),
            ).not.toBeDisabled();
        });
    });

    it("Add Bubble auto-selects the new bubble (LayoutConfigComicBubble side-pane mounts)", async () => {
        // Mirror of the Add-Panel auto-select: after a successful
        // createBubble, the editor sets selectedBubbleId to the new
        // bubble's id. The visible signal is the side-pane mounting
        // LayoutConfigComicBubble (which only renders when
        // selectedBubble is non-null).
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        // First select the panel so Add-Bubble enables. Click on the
        // already-rendered fakePanel from the default mocks.
        const panel = await screen.findByTestId(`comic-panel-${fakePanel.id}`);
        fireEvent.click(panel);
        await waitFor(() => {
            expect(
                screen.getByTestId("comic-book-editor-add-bubble"),
            ).not.toBeDisabled();
        });
        // Side-pane shows the "panel selected" instruction, NOT
        // the LayoutConfigComicBubble.
        expect(
            screen.queryByTestId("layout-config-comic-bubble"),
        ).not.toBeInTheDocument();
        // Click Add-Bubble; auto-select should fire and mount the
        // side-pane LayoutConfigComicBubble.
        fireEvent.click(screen.getByTestId("comic-book-editor-add-bubble"));
        expect(
            await screen.findByTestId("layout-config-comic-bubble"),
        ).toBeInTheDocument();
    });

    it("Add Bubble + Delete buttons disable when nothing is selected", async () => {
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        await waitFor(() => {
            expect(api.comics.listPanels).toHaveBeenCalled();
        });
        expect(
            screen.getByTestId("comic-book-editor-add-bubble"),
        ).toBeDisabled();
        expect(
            screen.getByTestId("comic-book-editor-delete-panel"),
        ).toBeDisabled();
        expect(
            screen.getByTestId("comic-book-editor-delete-bubble"),
        ).toBeDisabled();
    });

    it("renders LayoutConfigComicBubble in side pane after bubble click", async () => {
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        const bubble = await screen.findByTestId(`comic-bubble-${fakeBubble.id}`);
        fireEvent.click(bubble);
        expect(
            await screen.findByTestId("layout-config-comic-bubble"),
        ).toBeInTheDocument();
    });

    it("fetches and renders plugin info from /api/comics/info", async () => {
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        const info = await screen.findByTestId("comic-book-editor-plugin-info");
        expect(info.textContent).toMatch(/comics v1\.1\.0/);
    });

    it("renders the plugin-error slot on getInfo failure", async () => {
        const {ApiError} = await import("../api/client");
        vi.mocked(api.comics.getInfo).mockImplementation(async () => {
            throw new ApiError(500, "boom", "/comics/info", "GET");
        });
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        );
        const errorEl = await screen.findByTestId(
            "comic-book-editor-plugin-error",
        );
        await waitFor(() => {
            expect(errorEl.textContent).toMatch(/boom/);
        });
    });
});

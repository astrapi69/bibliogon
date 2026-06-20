/**
 * Tests for CreateBookPage (Dialog->Pages migration C2).
 *
 * The form body itself is covered by CreateBookForm.test.tsx; here we
 * cover the page-shell concerns the form doesn't own:
 *   - the per-type page title (rendered by PageLayout) + its testid
 *   - reading ?type= from the URL
 *   - the create handlers calling api.books.create / createFromTemplate
 *   - navigation after create (page-based type -> editor; prose ->
 *     dashboard with the `bookCreated` onboarding nav-state)
 *   - error handling surfaces a toast
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

import CreateBookPage from "./CreateBookPage";

vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => ({
        state: "active",
        isActive: true,
        isDisabled: false,
        isHidden: false,
        reason: undefined,
    }),
}));
import { BookTypesProvider } from "../hooks/book/useBookTypes";
import type { BookTypeDef } from "../api/client";

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
};

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const mockBooksCreate = vi.fn();
const mockBooksCreateFromTemplate = vi.fn();
const mockNotifyError = vi.fn();
const mockGetApp = vi.fn();

vi.mock("../api/client", () => ({
    api: {
        settings: {
            getApp: (...args: unknown[]) => mockGetApp(...args),
        },
        authors: {
            list: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({
                id: "a1",
                name: "X",
                slug: "x",
                bio: null,
                created_at: "2026-06-03T00:00:00Z",
                updated_at: "2026-06-03T00:00:00Z",
            }),
        },
        templates: {
            list: vi.fn().mockResolvedValue([]),
            delete: vi.fn(),
        },
        books: {
            create: (...args: unknown[]) => mockBooksCreate(...args),
            createFromTemplate: (...args: unknown[]) => mockBooksCreateFromTemplate(...args),
        },
    },
    ApiError: class ApiError extends Error {
        status: number;
        detail: string;
        constructor(status: number, detail: string) {
            super(detail);
            this.status = status;
            this.detail = detail;
        }
    },
}));

vi.mock("../utils/platform/notify", () => ({
    notify: {
        success: vi.fn(),
        error: (...args: unknown[]) => mockNotifyError(...args),
        info: vi.fn(),
        warning: vi.fn(),
    },
}));

// CreateBookForm pulls in useDialog (template-delete confirm); not
// exercised by these page tests, so a no-op stub is enough.
vi.mock("../components/AppDialog", () => ({
    useDialog: () => ({ confirm: vi.fn(), alert: vi.fn(), prompt: vi.fn() }),
}));

/** Renders the current path + nav-state so navigation assertions can
 *  read where CreateBookPage sent the user. */
function LocationProbe() {
    const loc = useLocation();
    return (
        <div
            data-testid="location-probe"
            data-path={loc.pathname}
            data-state={JSON.stringify(loc.state ?? null)}
        />
    );
}

function renderPage(initialUrl: string) {
    return render(
        <MemoryRouter initialEntries={[initialUrl]}>
            <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
                <Routes>
                    <Route path="/books/new" element={<CreateBookPage />} />
                    <Route
                        path="/book/:id"
                        element={<div data-testid="editor-route">editor</div>}
                    />
                    <Route path="/" element={<div data-testid="dashboard-route">dash</div>} />
                </Routes>
                <LocationProbe />
            </BookTypesProvider>
        </MemoryRouter>,
    );
}

async function fillRequired() {
    fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
        target: { value: "My Book" },
    });
    fireEvent.change(screen.getByPlaceholderText("Autorenname oder Pen Name"), {
        target: { value: "Author" },
    });
}

describe("CreateBookPage", () => {
    beforeEach(() => {
        mockBooksCreate.mockReset();
        mockBooksCreateFromTemplate.mockReset();
        mockNotifyError.mockReset();
        mockGetApp.mockReset();
        mockGetApp.mockResolvedValue({ author: { name: "", pen_names: [] } });
        mockBooksCreate.mockResolvedValue({ id: "new-book-id", title: "My Book" });
        mockBooksCreateFromTemplate.mockResolvedValue({ id: "tpl-book-id" });
    });

    it("pre-selects the configured default book-type when no ?type= is given", async () => {
        mockGetApp.mockResolvedValue({
            author: { name: "", pen_names: [] },
            ui: { defaults: { book_type: "picture_book" } },
        });
        renderPage("/books/new");
        await waitFor(() =>
            expect(screen.getByTestId("create-book-title-picture_book")).toBeTruthy(),
        );
    });

    it("lets an explicit ?type= override the configured default", async () => {
        mockGetApp.mockResolvedValue({
            author: { name: "", pen_names: [] },
            ui: { defaults: { book_type: "picture_book" } },
        });
        renderPage("/books/new?type=prose");
        await waitFor(() => expect(screen.getByTestId("create-book-title-prose")).toBeTruthy());
        // The configured default (picture_book) must NOT win.
        expect(screen.queryByTestId("create-book-title-picture_book")).toBeNull();
    });

    it("renders the generic title for prose with its testid", async () => {
        renderPage("/books/new?type=prose");
        await waitFor(() => expect(screen.getByTestId("create-book-title-prose")).toBeTruthy());
        expect(screen.getByTestId("create-book-title-prose").textContent).toBe("Neues Buch");
    });

    it("defaults to prose when no ?type= is given", async () => {
        renderPage("/books/new");
        await waitFor(() => expect(screen.getByTestId("create-book-title-prose")).toBeTruthy());
    });

    it("renders the picture-book title from ?type=picture_book", async () => {
        renderPage("/books/new?type=picture_book");
        await waitFor(() =>
            expect(screen.getByTestId("create-book-title-picture_book")).toBeTruthy(),
        );
        expect(screen.getByTestId("create-book-title-picture_book").textContent).toBe(
            "Neues Bilderbuch",
        );
    });

    it("creating a prose book calls api.books.create and returns to the dashboard", async () => {
        renderPage("/books/new?type=prose");
        await waitFor(() =>
            expect(screen.getByPlaceholderText("Der Titel deines Buches")).toBeTruthy(),
        );
        await fillRequired();
        fireEvent.click(screen.getByTestId("create-book-submit"));

        await waitFor(() => expect(mockBooksCreate).toHaveBeenCalledTimes(1));
        const payload = mockBooksCreate.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.title).toBe("My Book");
        expect(payload.book_type).toBeUndefined();

        // Navigated back to the dashboard with the onboarding nav-state flag.
        await waitFor(() => expect(screen.getByTestId("dashboard-route")).toBeTruthy());
        const probe = screen.getByTestId("location-probe");
        expect(probe.getAttribute("data-path")).toBe("/");
        expect(probe.getAttribute("data-state")).toContain("bookCreated");
    });

    it("creating a picture_book threads book_type and navigates to the editor", async () => {
        renderPage("/books/new?type=picture_book");
        await waitFor(() =>
            expect(screen.getByPlaceholderText("Der Titel deines Buches")).toBeTruthy(),
        );
        await fillRequired();
        fireEvent.click(screen.getByTestId("create-book-submit"));

        await waitFor(() => expect(mockBooksCreate).toHaveBeenCalledTimes(1));
        const payload = mockBooksCreate.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.book_type).toBe("picture_book");

        // Page-based type -> straight to its editor at /book/:id.
        await waitFor(() => expect(screen.getByTestId("editor-route")).toBeTruthy());
        expect(screen.getByTestId("location-probe").getAttribute("data-path")).toBe(
            "/book/new-book-id",
        );
    });

    it("surfaces a toast when book creation fails", async () => {
        mockBooksCreate.mockRejectedValue(new Error("boom"));
        renderPage("/books/new?type=prose");
        await waitFor(() =>
            expect(screen.getByPlaceholderText("Der Titel deines Buches")).toBeTruthy(),
        );
        await fillRequired();
        fireEvent.click(screen.getByTestId("create-book-submit"));

        await waitFor(() => expect(mockNotifyError).toHaveBeenCalledTimes(1));
        // Stayed on the create page (no navigation away on error).
        expect(screen.getByTestId("location-probe").getAttribute("data-path")).toBe("/books/new");
    });
});

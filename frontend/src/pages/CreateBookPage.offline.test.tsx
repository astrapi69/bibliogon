/**
 * Offline (Dexie) CreateBookPage tests — the client-side template path.
 *
 * Covers the page glue the data/form tests don't: a `client-`-prefixed
 * template id is instantiated through the storage seam (book + chapters/pages,
 * zero /api) and navigation lands prose on the dashboard, page-based types in
 * their editor.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

import CreateBookPage from "./CreateBookPage";
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

const h = vi.hoisted(() => ({
    created: {
        books: [] as Array<Record<string, unknown>>,
        chapters: [] as Array<{ bookId: string; data: Record<string, unknown> }>,
        pages: [] as Array<{ bookId: string; data: Record<string, unknown> }>,
    },
}));

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({ t: (_k: string, fallback: string) => fallback, lang: "de", setLang: vi.fn() }),
}));

vi.mock("../storage/useStorageMode", () => ({
    useStorageMode: () => ({ mode: "dexie", online: false, offlineEnabled: true }),
}));

vi.mock("../storage", () => ({
    getStorage: () => ({
        mode: "dexie",
        settings: { getApp: vi.fn(async () => ({ author: { name: "", pen_names: [] }, ui: {} })) },
        authors: { list: vi.fn(async () => []), create: vi.fn() },
        books: {
            create: vi.fn(async (data: Record<string, unknown>) => {
                h.created.books.push(data);
                return { id: "bk1", title: data.title };
            }),
        },
        chapters: {
            create: vi.fn(async (bookId: string, data: Record<string, unknown>) => {
                h.created.chapters.push({ bookId, data });
                return {};
            }),
        },
        pages: {
            create: vi.fn(async (bookId: string, data: Record<string, unknown>) => {
                h.created.pages.push({ bookId, data });
                return {};
            }),
        },
    }),
}));

vi.mock("../api/client", () => ({
    api: { books: { createFromTemplate: vi.fn() } },
    ApiError: class ApiError extends Error {},
}));

vi.mock("../utils/platform/notify", () => ({
    notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("../components/shared/AppDialog", () => ({
    useDialog: () => ({ confirm: vi.fn(), alert: vi.fn(), prompt: vi.fn() }),
}));

function LocationProbe() {
    const loc = useLocation();
    return <div data-testid="location-probe" data-path={loc.pathname} />;
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

async function clickTab(testId: string) {
    const el = await screen.findByTestId(testId);
    fireEvent.pointerDown(el, { button: 0 });
    fireEvent.mouseDown(el, { button: 0 });
    fireEvent.pointerUp(el, { button: 0 });
    fireEvent.mouseUp(el, { button: 0 });
    fireEvent.click(el);
}

async function fillRequired(title: string) {
    fireEvent.change(await screen.findByPlaceholderText("Der Titel deines Buches"), {
        target: { value: title },
    });
    fireEvent.change(screen.getByPlaceholderText("Autorenname oder Pen Name"), {
        target: { value: "Aster" },
    });
}

describe("CreateBookPage offline (client templates via seam)", () => {
    beforeEach(() => {
        h.created.books = [];
        h.created.chapters = [];
        h.created.pages = [];
    });

    it("prose: creates book + chapters via seam and returns to the dashboard", async () => {
        renderPage("/books/new");
        await fillRequired("Mein Roman");
        await clickTab("create-book-mode-template");
        fireEvent.click(await screen.findByTestId("template-card-client-roman-3akt"));
        fireEvent.click(screen.getByText("Erstellen"));

        await waitFor(() => expect(h.created.books).toHaveLength(1));
        expect(h.created.books[0]).toMatchObject({ title: "Mein Roman", author: "Aster" });
        expect(h.created.books[0].book_type).toBeUndefined();
        // Roman = prologue + 3 acts + 11 chapters + epilogue.
        expect(h.created.chapters).toHaveLength(16);
        expect(h.created.pages).toHaveLength(0);
        // Prose → dashboard.
        await waitFor(() =>
            expect(screen.getByTestId("location-probe").dataset.path).toBe("/"),
        );
    });

    it("picture_book: creates 12 pages via seam and opens the editor", async () => {
        renderPage("/books/new?type=picture_book");
        await fillRequired("Mein Bilderbuch");
        await clickTab("create-book-mode-template");
        fireEvent.click(await screen.findByTestId("template-card-client-kinderbuch"));
        fireEvent.click(screen.getByText("Erstellen"));

        await waitFor(() => expect(h.created.books).toHaveLength(1));
        expect(h.created.books[0].book_type).toBe("picture_book");
        expect(h.created.pages).toHaveLength(12);
        expect(h.created.chapters).toHaveLength(0);
        // Page-based → editor.
        await waitFor(() =>
            expect(screen.getByTestId("location-probe").dataset.path).toBe("/book/bk1"),
        );
    });
});

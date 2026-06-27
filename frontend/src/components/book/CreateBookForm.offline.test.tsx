/**
 * Offline (Dexie) CreateBookForm tests — the "Maximal Offline" client-side
 * template catalog. In dexie mode the template tab is fed by
 * frontend/src/data/bookTemplates.ts (no /api), works for prose AND
 * picture-book/comic, and submit hands a `client-`-prefixed template_id to
 * onCreateFromTemplate (the page routes it through the storage seam).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import CreateBookForm from "./CreateBookForm";
import { BookTypesProvider } from "../../hooks/book/useBookTypes";
import type { BookTypeDef } from "../../api/client";

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
    // Deliberately template_catalog:false — offline must show the catalog
    // anyway (the backend-only capability flag is bypassed in dexie mode).
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

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

// Force offline (Dexie) mode — the trigger for the client template catalog.
vi.mock("../../storage/useStorageMode", () => ({
    useStorageMode: () => ({ mode: "dexie", online: false, offlineEnabled: true }),
}));

const mockListTemplates = vi.fn();
let mockAppConfig: Record<string, unknown> = { author: { name: "", pen_names: [] } };

vi.mock("../../api/client", () => ({
    api: {
        settings: { getApp: vi.fn(async () => mockAppConfig) },
        // Offline must NOT call these; mocked to throw so a regression surfaces.
        templates: {
            list: () => mockListTemplates(),
            delete: vi.fn(),
        },
        authors: { list: vi.fn(async () => []), create: vi.fn() },
    },
    ApiError: class ApiError extends Error {},
}));

vi.mock("../shared/AppDialog", () => ({
    useDialog: () => ({ confirm: vi.fn(), alert: vi.fn(), prompt: vi.fn() }),
}));

vi.mock("../../utils/platform/notify", () => ({
    notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

async function clickTab(testId: string) {
    const el = await screen.findByTestId(testId);
    fireEvent.pointerDown(el, { button: 0 });
    fireEvent.mouseDown(el, { button: 0 });
    fireEvent.pointerUp(el, { button: 0 });
    fireEvent.mouseUp(el, { button: 0 });
    fireEvent.click(el);
}

describe("CreateBookForm offline (client-side templates)", () => {
    const onCancel = vi.fn();
    const onCreate = vi.fn();
    const onCreateFromTemplate = vi.fn();

    beforeEach(() => {
        onCancel.mockClear();
        onCreate.mockClear();
        onCreateFromTemplate.mockClear();
        mockListTemplates.mockReset();
        mockListTemplates.mockRejectedValue(new Error("must not call /api offline"));
        mockAppConfig = { author: { name: "", pen_names: [] } };
    });

    function renderForm(bookType?: "prose" | "picture_book") {
        return render(
            <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
                <CreateBookForm
                    onCancel={onCancel}
                    onCreate={onCreate}
                    onCreateFromTemplate={onCreateFromTemplate}
                    bookType={bookType}
                />
            </BookTypesProvider>,
        );
    }

    it("shows the template tab with the 4 prose client templates (no /api)", async () => {
        renderForm("prose");
        expect(await screen.findByTestId("create-book-mode-template")).toBeTruthy();
        await clickTab("create-book-mode-template");
        await waitFor(() => {
            expect(screen.getByTestId("template-card-client-roman-3akt")).toBeTruthy();
            expect(screen.getByTestId("template-card-client-sachbuch")).toBeTruthy();
            expect(
                screen.getByTestId("template-card-client-kurzgeschichte"),
            ).toBeTruthy();
            expect(screen.getByTestId("template-card-client-lyrik")).toBeTruthy();
        });
        expect(screen.getByText("Roman (3-Akt)")).toBeTruthy();
        expect(mockListTemplates).not.toHaveBeenCalled();
    });

    it("submit hands a client- template_id to onCreateFromTemplate", async () => {
        renderForm("prose");
        fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
            target: { value: "Mein Roman" },
        });
        fireEvent.change(screen.getByPlaceholderText("Autorenname oder Pen Name"), {
            target: { value: "Aster" },
        });
        await clickTab("create-book-mode-template");
        await waitFor(() => expect(screen.getByText("Roman (3-Akt)")).toBeTruthy());
        fireEvent.click(screen.getByTestId("template-card-client-roman-3akt"));
        fireEvent.click(screen.getByText("Erstellen"));

        await waitFor(() => expect(onCreateFromTemplate).toHaveBeenCalledTimes(1));
        expect(onCreate).not.toHaveBeenCalled();
        const arg = onCreateFromTemplate.mock.calls[0][0];
        expect(arg.template_id).toBe("client-roman-3akt");
        expect(arg.title).toBe("Mein Roman");
        expect(arg.author).toBe("Aster");
    });

    it("offers the Kinderbuch template for picture_book despite template_catalog:false", async () => {
        renderForm("picture_book");
        await clickTab("create-book-mode-template");
        await waitFor(() => {
            expect(screen.getByTestId("template-card-client-kinderbuch")).toBeTruthy();
            // Page-based count badge says "Seiten", not "Kapitel".
            expect(screen.getByText("12 Seiten")).toBeTruthy();
        });
    });

    it("blank-book creation still works offline (regression)", async () => {
        renderForm("prose");
        fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
            target: { value: "Leeres Buch" },
        });
        fireEvent.change(screen.getByPlaceholderText("Autorenname oder Pen Name"), {
            target: { value: "Aster" },
        });
        fireEvent.click(screen.getByText("Erstellen"));
        await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
        expect(onCreateFromTemplate).not.toHaveBeenCalled();
        expect(onCreate.mock.calls[0][0].title).toBe("Leeres Buch");
    });
});

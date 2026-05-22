/**
 * Vitest cases for the useBookTypes() hook + BookTypesProvider.
 *
 * Filed by BOOK-TYPES-SSOT-YAML-01 C3 (2026-05-24).
 *
 * Tests use the ``initialTypes`` provider escape hatch so each
 * case starts with a static known snapshot (no fetch). The
 * fetch-on-mount path is exercised separately via a mocked
 * ``api.bookTypes.list``.
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, waitFor, renderHook} from "@testing-library/react";
import type {ReactNode} from "react";

import {
    BookTypesProvider,
    bookTypeIdsWithCapability,
    pageableBookTypeIds,
    useBookTypes,
} from "./useBookTypes";
import type {BookTypeDef} from "../api/client";

vi.mock("../api/client", () => ({
    api: {
        bookTypes: {
            list: vi.fn(),
        },
    },
    BookType: undefined,
}));

import {api} from "../api/client";

function makeBookType(overrides: Partial<BookTypeDef> = {}): BookTypeDef {
    return {
        id: overrides.id ?? "prose",
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
        ...overrides,
    } as BookTypeDef;
}

const SAMPLE_REGISTRY: Record<string, BookTypeDef> = {
    prose: makeBookType({id: "prose"}),
    picture_book: makeBookType({
        id: "picture_book",
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
        default_page_size: "8.5x8.5",
    }),
    comic_book: makeBookType({
        id: "comic_book",
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
        default_page_size: "7x10",
    }),
};

function wrapper(initialTypes?: Record<string, BookTypeDef>) {
    return ({children}: {children: ReactNode}) => (
        <BookTypesProvider initialTypes={initialTypes}>
            {children}
        </BookTypesProvider>
    );
}

beforeEach(() => {
    vi.mocked(api.bookTypes.list).mockReset();
});

describe("useBookTypes() — Provider with initialTypes", () => {
    it("exposes the snapshot via the hook", () => {
        const {result} = renderHook(() => useBookTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(result.current.types).toEqual(SAMPLE_REGISTRY);
        expect(result.current.status).toBe("ready");
    });

    it("ordered array reflects YAML order from the response", () => {
        const {result} = renderHook(() => useBookTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(result.current.ordered.map((bt) => bt.id)).toEqual([
            "prose",
            "picture_book",
            "comic_book",
        ]);
    });

    it("skips the network fetch when initialTypes is provided", () => {
        renderHook(() => useBookTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(api.bookTypes.list).not.toHaveBeenCalled();
    });
});

describe("useBookTypes() — Provider fetch-on-mount", () => {
    it("status='loading' before the fetch resolves, then 'ready'", async () => {
        vi.mocked(api.bookTypes.list).mockResolvedValue(SAMPLE_REGISTRY);
        const {result} = renderHook(() => useBookTypes(), {
            wrapper: wrapper(),
        });
        // Synchronously after render, types is empty + loading.
        expect(result.current.status).toBe("loading");
        expect(result.current.types).toEqual({});
        // After the fetch resolves...
        await waitFor(() => expect(result.current.status).toBe("ready"));
        expect(result.current.types).toEqual(SAMPLE_REGISTRY);
    });

    it("status='error' on fetch failure; types stay empty", async () => {
        vi.mocked(api.bookTypes.list).mockRejectedValue(
            new Error("network down"),
        );
        const {result} = renderHook(() => useBookTypes(), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.status).toBe("error"));
        expect(result.current.types).toEqual({});
    });

    it("refresh() re-triggers the fetch", async () => {
        vi.mocked(api.bookTypes.list)
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce(SAMPLE_REGISTRY);
        const {result} = renderHook(() => useBookTypes(), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.status).toBe("ready"));
        expect(result.current.types).toEqual({});
        // Second call returns the full registry.
        await result.current.refresh();
        await waitFor(() =>
            expect(result.current.types).toEqual(SAMPLE_REGISTRY),
        );
    });
});

describe("useBookTypes() outside a provider", () => {
    it("throws a clear error", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        function Bad() {
            useBookTypes();
            return null;
        }
        expect(() => render(<Bad />)).toThrow(
            /useBookTypes must be used within a <BookTypesProvider>/,
        );
        spy.mockRestore();
    });
});

describe("pageableBookTypeIds selector", () => {
    it("returns ids whose content_model is 'pages'", () => {
        const {result} = renderHook(() => useBookTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(pageableBookTypeIds(result.current)).toEqual(
            new Set(["picture_book", "comic_book"]),
        );
    });

    it("returns an empty set when no types loaded yet", () => {
        const {result} = renderHook(() => useBookTypes(), {
            wrapper: wrapper({}),
        });
        expect(pageableBookTypeIds(result.current)).toEqual(new Set());
    });
});

describe("bookTypeIdsWithCapability selector", () => {
    it("ebook_export → only prose", () => {
        const {result} = renderHook(() => useBookTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(
            bookTypeIdsWithCapability(result.current, "ebook_export"),
        ).toEqual(new Set(["prose"]));
    });

    it("paperback_export → all three", () => {
        const {result} = renderHook(() => useBookTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(
            bookTypeIdsWithCapability(result.current, "paperback_export"),
        ).toEqual(new Set(["prose", "picture_book", "comic_book"]));
    });

    it("template_catalog → only prose", () => {
        const {result} = renderHook(() => useBookTypes(), {
            wrapper: wrapper(SAMPLE_REGISTRY),
        });
        expect(
            bookTypeIdsWithCapability(result.current, "template_catalog"),
        ).toEqual(new Set(["prose"]));
    });
});

describe("BookTypesProvider — rendering children", () => {
    it("passes the snapshot to consuming components", () => {
        function Consumer() {
            const {ordered, status} = useBookTypes();
            return (
                <div>
                    <span data-testid="status">{status}</span>
                    <span data-testid="count">{ordered.length}</span>
                </div>
            );
        }
        render(
            <BookTypesProvider initialTypes={SAMPLE_REGISTRY}>
                <Consumer />
            </BookTypesProvider>,
        );
        expect(screen.getByTestId("status").textContent).toBe("ready");
        expect(screen.getByTestId("count").textContent).toBe("3");
    });
});

/**
 * Tests for the PGS-04 metadata-editor "Translations:" row + the
 * link picker dialog reachable from the unlinked state.
 *
 * Covers:
 * - Unlinked state: renders the dashed "no translations" row +
 *   the Link button. Linked state: renders sibling badges +
 *   Unlink button.
 * - Sibling badge click invokes navigate("/book/{sibling-id}").
 * - Unlink invokes api.translations.unlink and re-loads.
 * - Link picker hides the current book, only allows confirm
 *   when at least one book is selected, and posts
 *   ``[bookId, ...selected]`` to api.translations.link.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import TranslationLinks from "./TranslationLinks";
import type { TranslationSiblingsResponse, Book } from "../api/client";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importActual) => {
    const actual = await importActual<typeof import("react-router-dom")>();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockList = vi.fn();
const mockUnlink = vi.fn();
const mockLink = vi.fn();
const mockBooksList = vi.fn();
vi.mock("../api/client", () => ({
    api: {
        translations: {
            list: (...args: unknown[]) => mockList(...args),
            unlink: (...args: unknown[]) => mockUnlink(...args),
            link: (...args: unknown[]) => mockLink(...args),
        },
        books: {
            list: () => mockBooksList(),
        },
    },
    ApiError: class extends Error {
        status: number;
        detail: string;
        constructor(
            status: number,
            detail: string,
            _url = "",
            _method = "GET",
            _stack = "",
        ) {
            super(detail);
            this.status = status;
            this.detail = detail;
        }
    },
}));

vi.mock("../utils/notify", () => ({
    notify: {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    },
}));

import { notify as mockedNotify } from "../utils/notify";
const mockNotify = mockedNotify as unknown as {
    error: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
};

function makeBook(overrides: Partial<Book> = {}): Book {
    return {
        id: "book-1",
        title: "Test",
        author: "Aster",
        language: "de",
        chapter_count: 0,
        created_at: "2026-04-25T00:00:00Z",
        updated_at: "2026-04-25T00:00:00Z",
        deleted_at: null,
        ai_assisted: false,
        ai_tokens_used: 0,
        ...overrides,
    } as Book;
}

const unlinked: TranslationSiblingsResponse = {
    book_id: "book-1",
    translation_group_id: null,
    siblings: [],
};

const linked: TranslationSiblingsResponse = {
    book_id: "book-1",
    translation_group_id: "grp-x",
    siblings: [
        { book_id: "book-2", title: "Test EN", language: "en" },
        { book_id: "book-3", title: "Test FR", language: "fr" },
    ],
};

describe("TranslationLinks", () => {
    beforeEach(() => {
        mockList.mockReset();
        mockUnlink.mockReset();
        mockLink.mockReset();
        mockBooksList.mockReset();
        mockNavigate.mockReset();
        mockNotify.error.mockClear();
        mockNotify.success.mockClear();
    });

    async function renderRow(payload: TranslationSiblingsResponse): Promise<void> {
        mockList.mockResolvedValueOnce(payload);
        await act(async () => {
            render(
                <MemoryRouter>
                    <TranslationLinks bookId="book-1" />
                </MemoryRouter>,
            );
        });
        await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
    }

    it("renders the unlinked state with a Link button", async () => {
        await renderRow(unlinked);
        expect(
            screen.getByTestId("translation-links-row-unlinked"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("translation-link-btn")).toBeInTheDocument();
    });

    it("renders sibling badges and an Unlink button when linked", async () => {
        await renderRow(linked);
        expect(screen.getByTestId("translation-links-row")).toBeInTheDocument();
        expect(screen.getByTestId("translation-sibling-en")).toBeInTheDocument();
        expect(screen.getByTestId("translation-sibling-fr")).toBeInTheDocument();
        expect(screen.getByTestId("translation-unlink-btn")).toBeInTheDocument();
    });

    it("clicking a sibling badge navigates to that book", async () => {
        await renderRow(linked);
        fireEvent.click(screen.getByTestId("translation-sibling-en"));
        expect(mockNavigate).toHaveBeenCalledWith("/book/book-2");
    });

    it("Unlink invokes api.translations.unlink and re-fetches", async () => {
        await renderRow(linked);
        mockList.mockResolvedValueOnce(unlinked); // re-fetch after unlink
        mockUnlink.mockResolvedValueOnce(undefined);
        fireEvent.click(screen.getByTestId("translation-unlink-btn"));
        await waitFor(() => expect(mockUnlink).toHaveBeenCalledWith("book-1"));
        await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
        expect(mockNotify.success).toHaveBeenCalledTimes(1);
    });

    it("link-picker dialog hides the current book and posts the selected ids", async () => {
        await renderRow(unlinked);
        mockBooksList.mockResolvedValue([
            makeBook({ id: "book-1", title: "Self" }),
            makeBook({ id: "book-2", title: "Other EN", language: "en" }),
            makeBook({ id: "book-3", title: "Other FR", language: "fr" }),
        ]);
        fireEvent.click(screen.getByTestId("translation-link-btn"));
        await waitFor(() => expect(mockBooksList).toHaveBeenCalledTimes(1));

        // Self is excluded; only book-2 + book-3 are pickable.
        expect(
            screen.queryByTestId("translation-link-pick-book-1"),
        ).not.toBeInTheDocument();
        const pick2 = screen.getByTestId("translation-link-pick-book-2");
        fireEvent.click(pick2);

        mockLink.mockResolvedValueOnce({
            translation_group_id: "grp-new",
            linked_book_ids: ["book-1", "book-2"],
        });
        // After link succeeds, the row reloads -> mockList second call.
        mockList.mockResolvedValueOnce(linked);
        fireEvent.click(screen.getByTestId("translation-link-confirm"));

        await waitFor(() => expect(mockLink).toHaveBeenCalledTimes(1));
        const [ids] = mockLink.mock.calls[0];
        expect(ids).toEqual(["book-1", "book-2"]);
        expect(mockNotify.success).toHaveBeenCalledTimes(1);
    });

    it("link-picker confirm button is disabled when nothing is selected", async () => {
        await renderRow(unlinked);
        mockBooksList.mockResolvedValue([
            makeBook({ id: "book-2", title: "Other", language: "en" }),
        ]);
        fireEvent.click(screen.getByTestId("translation-link-btn"));
        await waitFor(() => expect(mockBooksList).toHaveBeenCalledTimes(1));
        expect(screen.getByTestId("translation-link-confirm")).toBeDisabled();
    });
});

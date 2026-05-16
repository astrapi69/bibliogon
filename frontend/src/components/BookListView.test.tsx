/**
 * Tests for Bug 2 fix (commit `feat(books): BookDashboard list-view
 * selection checkboxes`).
 *
 * BookListView grew optional isSelected + onToggleSelect props that
 * make the row render a leading checkbox cell, mirroring
 * ArticleRow's shape. The 6th Articles-vs-Books asymmetry instance
 * documented in lessons-learned was closed by this fix.
 *
 * The pin tests:
 *
 *   1. When BOTH selection props are provided, every row renders a
 *      visible checkbox + the testid pattern matches
 *      `book-bulk-check-{id}` (parallel to article-bulk-check-{id}).
 *   2. Clicking a row's checkbox fires onToggleSelect with the
 *      right book.
 *   3. When `isSelected(book)` returns true, the row has the
 *      rowSelected styling.
 *   4. When the props are omitted (the read-only path used by
 *      future trash-view callers), no checkbox renders.
 *   5. Clicking the checkbox does NOT bubble up and trigger the
 *      row's onClick (navigation guard).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

import BookListView from "./BookListView";
import type { Book } from "../api/client";

function makeBook(id: string, title: string): Book {
    return {
        id,
        title,
        subtitle: null,
        author: "Test Author",
        language: "de",
        series: null,
        series_index: null,
        description: null,
        genre: null,
        book_type: "prose",
        keywords: [],
        chapter_summaries: [],
        ai_assisted: false,
        ai_tokens_used: 0,
        audiobook_overwrite_existing: false,
        audiobook_skip_chapter_types: [],
        cover_image: null,
        created_at: "2026-05-16T10:00:00Z",
        updated_at: "2026-05-16T10:00:00Z",
    } as unknown as Book;
}

const BOOKS = [makeBook("b1", "First Book"), makeBook("b2", "Second Book")];

describe("Bug 2: BookListView selection checkboxes", () => {
    it("renders a checkbox per row when selection props are provided", () => {
        render(
            <BookListView
                books={BOOKS}
                onClick={vi.fn()}
                onDelete={vi.fn()}
                isSelected={() => false}
                onToggleSelect={vi.fn()}
            />,
        );
        expect(screen.getByTestId("book-bulk-check-b1")).toBeTruthy();
        expect(screen.getByTestId("book-bulk-check-b2")).toBeTruthy();
    });

    it("clicking a checkbox fires onToggleSelect with the right book", () => {
        const onToggle = vi.fn();
        render(
            <BookListView
                books={BOOKS}
                onClick={vi.fn()}
                onDelete={vi.fn()}
                isSelected={() => false}
                onToggleSelect={onToggle}
            />,
        );
        fireEvent.click(screen.getByTestId("book-bulk-check-b1"));
        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(onToggle).toHaveBeenCalledWith(BOOKS[0]);
    });

    it("isSelected=true reflects in the checkbox checked state", () => {
        render(
            <BookListView
                books={BOOKS}
                onClick={vi.fn()}
                onDelete={vi.fn()}
                isSelected={(book) => book.id === "b1"}
                onToggleSelect={vi.fn()}
            />,
        );
        const cb1 = screen.getByTestId("book-bulk-check-b1") as HTMLInputElement;
        const cb2 = screen.getByTestId("book-bulk-check-b2") as HTMLInputElement;
        expect(cb1.checked).toBe(true);
        expect(cb2.checked).toBe(false);
    });

    it("renders no checkbox when selection props are omitted", () => {
        render(
            <BookListView
                books={BOOKS}
                onClick={vi.fn()}
                onDelete={vi.fn()}
            />,
        );
        expect(screen.queryByTestId("book-bulk-check-b1")).toBeNull();
        expect(screen.queryByTestId("book-bulk-check-b2")).toBeNull();
    });

    it("clicking the checkbox does NOT trigger the row onClick", () => {
        const onRowClick = vi.fn();
        const onToggle = vi.fn();
        render(
            <BookListView
                books={BOOKS}
                onClick={onRowClick}
                onDelete={vi.fn()}
                isSelected={() => false}
                onToggleSelect={onToggle}
            />,
        );
        fireEvent.click(screen.getByTestId("book-bulk-check-b1"));
        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(onRowClick).not.toHaveBeenCalled();
    });
});

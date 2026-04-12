/**
 * Unit tests for the useBookFilters hook.
 *
 * Uses real timers + ``waitFor`` to account for the 200ms debounce
 * instead of fake timers, because ``vi.useFakeTimers()`` conflicts
 * with react-router-dom's internal ``useSearchParams`` which
 * relies on microtask scheduling that fake timers do not advance.
 */

import {describe, it, expect} from "vitest";
import {renderHook, act, waitFor} from "@testing-library/react";
import React from "react";
import {MemoryRouter} from "react-router-dom";

import {useBookFilters} from "./useBookFilters";
import type {Book} from "../api/client";

function makeBook(overrides: Partial<Book> = {}): Book {
    return {
        id: "b1",
        title: "Default Title",
        subtitle: null,
        author: "Default Author",
        language: "de",
        genre: null,
        series: null,
        series_index: null,
        description: null,
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
        html_description: null,
        backpage_description: null,
        backpage_author_bio: null,
        cover_image: null,
        custom_css: null,
        ai_assisted: false,
        tts_engine: null,
        tts_voice: null,
        tts_language: null,
        tts_speed: null,
        audiobook_merge: null,
        audiobook_filename: null,
        audiobook_overwrite_existing: false,
        audiobook_skip_chapter_types: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

// Alphabetical order: Alpha, Beta, Delta, Gamma, Sternenstaub
const BOOKS: Book[] = [
    makeBook({id: "1", title: "Alpha", author: "Müller", genre: "Krimi", language: "de", updated_at: "2026-01-03T00:00:00Z"}),
    makeBook({id: "2", title: "Beta", author: "Schmidt", genre: "Krimi", language: "en", updated_at: "2026-01-01T00:00:00Z"}),
    makeBook({id: "3", title: "Gamma", author: "Raptis", genre: "Science Fiction", language: "de", updated_at: "2026-01-02T00:00:00Z"}),
    makeBook({id: "4", title: "Delta", author: "Dupont", genre: null, language: "fr", updated_at: "2026-01-04T00:00:00Z"}),
];

const t = (key: string, fallback?: string) => {
    const map: Record<string, string> = {
        "ui.languages.de": "Deutsch",
        "ui.languages.en": "English",
        "ui.languages.fr": "Français",
    };
    return map[key] || fallback || key;
};

function wrapper({children}: {children: React.ReactNode}) {
    return React.createElement(MemoryRouter, null, children);
}

describe("useBookFilters - text search (debounced)", () => {
    it("filters on title after debounce", async () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => result.current.setSearchQuery("alpha"));
        // Wait for the 200ms debounce to fire
        await waitFor(() => {
            expect(result.current.filteredBooks).toHaveLength(1);
        });
        expect(result.current.filteredBooks[0].id).toBe("1");
    });

    it("filters on author", async () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => result.current.setSearchQuery("müller"));
        await waitFor(() => {
            expect(result.current.filteredBooks).toHaveLength(1);
        });
    });

    it("filters on genre text", async () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => result.current.setSearchQuery("krimi"));
        await waitFor(() => {
            expect(result.current.filteredBooks).toHaveLength(2);
        });
    });
});

describe("useBookFilters - genre filter", () => {
    it("narrows results to matching genre", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => result.current.setGenre("Krimi"));
        expect(result.current.filteredBooks).toHaveLength(2);
        expect(result.current.filteredBooks.every((b) => b.genre === "Krimi")).toBe(true);
    });

    it("empty string means no genre filter", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => result.current.setGenre("Krimi"));
        act(() => result.current.setGenre(""));
        expect(result.current.filteredBooks).toHaveLength(4);
    });
});

describe("useBookFilters - language filter", () => {
    it("narrows results to matching language", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => result.current.setLanguage("de"));
        expect(result.current.filteredBooks).toHaveLength(2);
    });
});

describe("useBookFilters - combined filters", () => {
    it("text + genre + language narrows correctly", async () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => {
            result.current.setGenre("Krimi");
            result.current.setLanguage("de");
            result.current.setSearchQuery("alpha");
        });
        await waitFor(() => {
            expect(result.current.filteredBooks).toHaveLength(1);
        });
        expect(result.current.filteredBooks[0].id).toBe("1");
    });
});

describe("useBookFilters - sort", () => {
    it("sorts by date descending by default (newest first)", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        expect(result.current.filteredBooks[0].id).toBe("4"); // Jan 4
        expect(result.current.filteredBooks[3].id).toBe("2"); // Jan 1
    });

    it("sorts by title ascending (A-Z)", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => result.current.setSortBy("title"));
        // Alphabetical: Alpha, Beta, Delta, Gamma
        expect(result.current.filteredBooks[0].title).toBe("Alpha");
        expect(result.current.filteredBooks[1].title).toBe("Beta");
        expect(result.current.filteredBooks[2].title).toBe("Delta");
        expect(result.current.filteredBooks[3].title).toBe("Gamma");
    });

    it("toggleSortOrder flips direction", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => result.current.setSortBy("title"));
        expect(result.current.sortOrder).toBe("asc");
        act(() => result.current.toggleSortOrder());
        expect(result.current.sortOrder).toBe("desc");
        // Reverse: Gamma, Delta, Beta, Alpha
        expect(result.current.filteredBooks[0].title).toBe("Gamma");
    });

    it("changing sortBy resets sortOrder to the field default", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => result.current.setSortBy("title"));
        act(() => result.current.toggleSortOrder()); // desc
        act(() => result.current.setSortBy("date"));
        expect(result.current.sortOrder).toBe("desc"); // date default is desc
    });
});

describe("useBookFilters - availableGenres", () => {
    it("excludes null/empty genres and counts correctly", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        expect(result.current.availableGenres).toHaveLength(2);
        const krimi = result.current.availableGenres.find((g) => g.value === "Krimi");
        expect(krimi).toBeDefined();
        expect(krimi!.count).toBe(2);
        expect(krimi!.label).toBe("Krimi (2)");
    });

    it("sorts alphabetically", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        expect(result.current.availableGenres[0].value).toBe("Krimi");
        expect(result.current.availableGenres[1].value).toBe("Science Fiction");
    });
});

describe("useBookFilters - availableLanguages", () => {
    it("resolves display names via t() and counts", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        const de = result.current.availableLanguages.find((l) => l.value === "de");
        expect(de).toBeDefined();
        expect(de!.label).toBe("Deutsch (2)");
        expect(de!.count).toBe(2);
    });
});

describe("useBookFilters - resetFilters", () => {
    it("clears search, genre and language but preserves sort", async () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => {
            result.current.setSearchQuery("alpha");
            result.current.setGenre("Krimi");
            result.current.setLanguage("de");
            result.current.setSortBy("title");
        });
        await waitFor(() => {
            expect(result.current.filteredBooks.length).toBeLessThan(4);
        });
        act(() => result.current.resetFilters());
        expect(result.current.searchQuery).toBe("");
        expect(result.current.genre).toBe("");
        expect(result.current.language).toBe("");
        expect(result.current.sortBy).toBe("title"); // preserved
    });
});

describe("useBookFilters - hasActiveFilters", () => {
    it("returns false with no filters set", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        expect(result.current.hasActiveFilters).toBe(false);
    });

    it("returns true when search query is set", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => result.current.setSearchQuery("test"));
        expect(result.current.hasActiveFilters).toBe(true);
    });

    it("returns true when genre is set", () => {
        const {result} = renderHook(() => useBookFilters(BOOKS, t), {wrapper});
        act(() => result.current.setGenre("Krimi"));
        expect(result.current.hasActiveFilters).toBe(true);
    });
});

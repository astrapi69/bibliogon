import { describe, expect, it } from "vitest";
import {
    formatActiveArticleFilters,
    formatActiveBookFilters,
} from "./formatActiveFilters";
import type { ArticleFilters } from "../hooks/article/useArticleFilters";
import type { BookFilters } from "../hooks/book/useBookFilters";

const t = (_: string, fallback?: string) => fallback ?? _;

function articleFilters(overrides: Partial<ArticleFilters> = {}): ArticleFilters {
    return {
        searchQuery: "",
        topic: "",
        language: "",
        status: "all",
        series: "",
        tag: "",
        sortBy: "date",
        sortOrder: "desc",
        filteredArticles: [],
        availableTopics: [],
        availableLanguages: [],
        availableSeries: [],
        availableTags: [],
        hasActiveFilters: false,
        setSearchQuery: () => {},
        setTopic: () => {},
        setLanguage: () => {},
        setStatus: () => {},
        setSeries: () => {},
        setTag: () => {},
        setSortBy: () => {},
        toggleSortOrder: () => {},
        resetFilters: () => {},
        ...overrides,
    } as ArticleFilters;
}

function bookFilters(overrides: Partial<BookFilters> = {}): BookFilters {
    return {
        searchQuery: "",
        genre: "",
        language: "",
        sortBy: "date",
        sortOrder: "desc",
        filteredBooks: [],
        availableGenres: [],
        availableLanguages: [],
        hasActiveFilters: false,
        setSearchQuery: () => {},
        setGenre: () => {},
        setLanguage: () => {},
        setSortBy: () => {},
        toggleSortOrder: () => {},
        resetFilters: () => {},
        ...overrides,
    } as BookFilters;
}

describe("formatActiveArticleFilters", () => {
    it("returns null when no filter is active", () => {
        expect(
            formatActiveArticleFilters(articleFilters({ hasActiveFilters: false }), t),
        ).toBeNull();
    });

    it("formats a single status filter", () => {
        const result = formatActiveArticleFilters(
            articleFilters({ status: "draft", hasActiveFilters: true }),
            t,
        );
        expect(result).toBe("Status=draft");
    });

    it("formats search + status + language together", () => {
        const result = formatActiveArticleFilters(
            articleFilters({
                searchQuery: "deutsch",
                status: "draft",
                language: "de",
                hasActiveFilters: true,
            }),
            t,
        );
        expect(result).toBe('Suche="deutsch", Status=draft, Sprache=de');
    });

    it("omits status when set to 'all'", () => {
        const result = formatActiveArticleFilters(
            articleFilters({
                status: "all",
                language: "de",
                hasActiveFilters: true,
            }),
            t,
        );
        expect(result).toBe("Sprache=de");
    });

    it("does not surface sortBy / sortOrder", () => {
        // hasActiveFilters is false for sort-only changes, so this
        // returns null. Pinning the contract: sort is not a filter.
        const result = formatActiveArticleFilters(
            articleFilters({ sortBy: "title", hasActiveFilters: false }),
            t,
        );
        expect(result).toBeNull();
    });
});

describe("formatActiveBookFilters", () => {
    it("returns null when no filter is active", () => {
        expect(
            formatActiveBookFilters(bookFilters({ hasActiveFilters: false }), t),
        ).toBeNull();
    });

    it("formats genre filter", () => {
        const result = formatActiveBookFilters(
            bookFilters({ genre: "Mystery", hasActiveFilters: true }),
            t,
        );
        expect(result).toBe("Genre=Mystery");
    });

    it("formats search + genre + language together", () => {
        const result = formatActiveBookFilters(
            bookFilters({
                searchQuery: "memoir",
                genre: "Non-Fiction",
                language: "en",
                hasActiveFilters: true,
            }),
            t,
        );
        expect(result).toBe('Suche="memoir", Genre=Non-Fiction, Sprache=en');
    });
});

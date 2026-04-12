/**
 * Custom hook for client-side book filtering, sorting and search.
 *
 * Owns all filter/sort state, the 200ms debounce timer, the URL
 * param sync via ``useSearchParams({replace: true})``, and the
 * derived ``filteredBooks`` array. Dashboard.tsx becomes a pure
 * layout component that calls ``useBookFilters(books)`` and renders
 * ``filters.filteredBooks``.
 *
 * Genre and language options are auto-populated from the books
 * array. Genre counts and language display names are derived from
 * the full (unfiltered) array so selecting one filter does not
 * distort the options of another.
 */

import {useState, useMemo, useEffect, useCallback} from "react";
import {useSearchParams} from "react-router-dom";
import type {Book} from "../api/client";

export type SortField = "date" | "title" | "author";
export type SortOrder = "asc" | "desc";

export interface FilterOption {
    value: string;
    label: string;
    count: number;
}

export interface BookFilters {
    // State
    searchQuery: string;
    genre: string;
    language: string;
    sortBy: SortField;
    sortOrder: SortOrder;

    // Derived
    filteredBooks: Book[];
    availableGenres: FilterOption[];
    availableLanguages: FilterOption[];
    hasActiveFilters: boolean;

    // Actions
    setSearchQuery: (q: string) => void;
    setGenre: (g: string) => void;
    setLanguage: (l: string) => void;
    setSortBy: (s: SortField) => void;
    toggleSortOrder: () => void;
    resetFilters: () => void;
}

const DEFAULT_SORT_ORDER: Record<SortField, SortOrder> = {
    date: "desc",
    title: "asc",
    author: "asc",
};

function defaultOrderFor(field: SortField): SortOrder {
    return DEFAULT_SORT_ORDER[field];
}

/**
 * @param books      The full, unfiltered book list from React state.
 * @param t          The ``useI18n().t`` function for localized labels.
 */
export function useBookFilters(
    books: Book[],
    t: (key: string, fallback?: string) => string,
): BookFilters {
    const [searchParams, setSearchParams] = useSearchParams();

    // --- Initialize from URL on mount, fall back to defaults ---

    const [searchQuery, setSearchQuery] = useState(
        () => searchParams.get("q") || "",
    );
    const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
    const [genre, setGenre] = useState(
        () => searchParams.get("genre") || "",
    );
    const [language, setLanguage] = useState(
        () => searchParams.get("lang") || "",
    );
    const [sortBy, setSortByRaw] = useState<SortField>(() => {
        const p = searchParams.get("sort");
        if (p === "title" || p === "author" || p === "date") return p;
        return "date";
    });
    const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
        const p = searchParams.get("order");
        if (p === "asc" || p === "desc") return p;
        return defaultOrderFor(sortBy);
    });

    // --- Debounce the search query (200ms) ---

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 200);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // --- Sync state -> URL params (replace, not push) ---

    useEffect(() => {
        const params = new URLSearchParams();
        if (debouncedQuery) params.set("q", debouncedQuery);
        if (genre) params.set("genre", genre);
        if (language) params.set("lang", language);
        if (sortBy !== "date") params.set("sort", sortBy);
        if (sortOrder !== defaultOrderFor(sortBy)) params.set("order", sortOrder);
        setSearchParams(params, {replace: true});
    }, [debouncedQuery, genre, language, sortBy, sortOrder, setSearchParams]);

    // --- Derived: available genres/languages from the FULL list ---

    const availableGenres = useMemo<FilterOption[]>(() => {
        const counts = new Map<string, number>();
        for (const book of books) {
            const g = (book.genre || "").trim();
            if (!g) continue;
            counts.set(g, (counts.get(g) || 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([value, count]) => ({value, label: `${value} (${count})`, count}))
            .sort((a, b) => a.value.localeCompare(b.value));
    }, [books]);

    const availableLanguages = useMemo<FilterOption[]>(() => {
        const counts = new Map<string, number>();
        for (const book of books) {
            const l = book.language;
            if (!l) continue;
            counts.set(l, (counts.get(l) || 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([value, count]) => {
                const name = t(`ui.languages.${value}`, value);
                return {value, label: `${name} (${count})`, count};
            })
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [books, t]);

    // --- Derived: filtered + sorted books ---

    const filteredBooks = useMemo(() => {
        const q = debouncedQuery.toLowerCase();

        return [...books]
            .filter((book) => {
                // Text search (same fields as the existing implementation)
                if (q) {
                    const matches =
                        book.title.toLowerCase().includes(q) ||
                        book.author.toLowerCase().includes(q) ||
                        (book.genre || "").toLowerCase().includes(q) ||
                        book.language.toLowerCase().includes(q) ||
                        (book.series || "").toLowerCase().includes(q) ||
                        (book.subtitle || "").toLowerCase().includes(q);
                    if (!matches) return false;
                }
                // Genre filter
                if (genre && (book.genre || "") !== genre) return false;
                // Language filter
                if (language && book.language !== language) return false;
                return true;
            })
            .sort((a, b) => {
                let cmp = 0;
                if (sortBy === "title") {
                    cmp = a.title.localeCompare(b.title);
                } else if (sortBy === "author") {
                    cmp = a.author.localeCompare(b.author);
                } else {
                    cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
                }
                return sortOrder === "asc" ? cmp : -cmp;
            });
    }, [books, debouncedQuery, genre, language, sortBy, sortOrder]);

    // --- Actions ---

    const setSortBy = useCallback((field: SortField) => {
        setSortByRaw(field);
        setSortOrder(defaultOrderFor(field));
    }, []);

    const toggleSortOrder = useCallback(() => {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    }, []);

    const resetFilters = useCallback(() => {
        setSearchQuery("");
        setDebouncedQuery("");
        setGenre("");
        setLanguage("");
        // Sort intentionally NOT reset per spec.
    }, []);

    const hasActiveFilters = searchQuery !== "" || genre !== "" || language !== "";

    return {
        searchQuery,
        genre,
        language,
        sortBy,
        sortOrder,
        filteredBooks,
        availableGenres,
        availableLanguages,
        hasActiveFilters,
        setSearchQuery,
        setGenre,
        setLanguage,
        setSortBy,
        toggleSortOrder,
        resetFilters,
    };
}

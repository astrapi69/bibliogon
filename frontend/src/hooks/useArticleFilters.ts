/**
 * Custom hook for client-side article filtering, sorting and search.
 *
 * Mirrors ``useBookFilters`` but with article-specific facets:
 * topic, language, status (no genre / series). Search covers title +
 * subtitle + author + topic + excerpt. Owns 200 ms debounce on
 * search, URL-param sync via ``useSearchParams({replace: true})``,
 * and the derived ``filteredArticles`` array.
 *
 * Topic + language options auto-populate from the articles array so
 * an unset facet does not distort another's available choices.
 *
 * URL keys mirror the books pattern so deep-links survive between
 * the two dashboards: ``q``, ``topic``, ``lang``, ``status``,
 * ``sort``, ``order``.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Article, ArticleStatus } from "../api/client";

export type ArticleSortField = "date" | "title" | "author";
export type ArticleSortOrder = "asc" | "desc";

export interface ArticleFilterOption {
    value: string;
    label: string;
    count: number;
}

export interface ArticleFilters {
    searchQuery: string;
    topic: string;
    language: string;
    status: ArticleStatus | "all";
    sortBy: ArticleSortField;
    sortOrder: ArticleSortOrder;

    filteredArticles: Article[];
    availableTopics: ArticleFilterOption[];
    availableLanguages: ArticleFilterOption[];
    hasActiveFilters: boolean;

    setSearchQuery: (q: string) => void;
    setTopic: (topic: string) => void;
    setLanguage: (lang: string) => void;
    setStatus: (status: ArticleStatus | "all") => void;
    setSortBy: (s: ArticleSortField) => void;
    toggleSortOrder: () => void;
    resetFilters: () => void;
}

const DEFAULT_SORT_ORDER: Record<ArticleSortField, ArticleSortOrder> = {
    date: "desc",
    title: "asc",
    author: "asc",
};

function defaultOrderFor(field: ArticleSortField): ArticleSortOrder {
    return DEFAULT_SORT_ORDER[field];
}

const ALLOWED_STATUSES: ReadonlyArray<ArticleStatus> = [
    "draft",
    "ready",
    "published",
    "archived",
];

function isStatus(value: string | null): value is ArticleStatus {
    return value !== null && (ALLOWED_STATUSES as ReadonlyArray<string>).includes(value);
}

export function useArticleFilters(
    articles: Article[],
    t: (key: string, fallback?: string) => string,
): ArticleFilters {
    const [searchParams, setSearchParams] = useSearchParams();

    const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
    const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
    const [topic, setTopic] = useState(() => searchParams.get("topic") || "");
    const [language, setLanguage] = useState(() => searchParams.get("lang") || "");
    const [status, setStatus] = useState<ArticleStatus | "all">(() => {
        const p = searchParams.get("status");
        return isStatus(p) ? p : "all";
    });
    const [sortBy, setSortByRaw] = useState<ArticleSortField>(() => {
        const p = searchParams.get("sort");
        if (p === "title" || p === "author" || p === "date") return p;
        return "date";
    });
    const [sortOrder, setSortOrder] = useState<ArticleSortOrder>(() => {
        const p = searchParams.get("order");
        if (p === "asc" || p === "desc") return p;
        return defaultOrderFor(sortBy);
    });

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 200);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (debouncedQuery) params.set("q", debouncedQuery);
        if (topic) params.set("topic", topic);
        if (language) params.set("lang", language);
        if (status !== "all") params.set("status", status);
        if (sortBy !== "date") params.set("sort", sortBy);
        if (sortOrder !== defaultOrderFor(sortBy)) params.set("order", sortOrder);
        setSearchParams(params, { replace: true });
    }, [debouncedQuery, topic, language, status, sortBy, sortOrder, setSearchParams]);

    const availableTopics = useMemo<ArticleFilterOption[]>(() => {
        const counts = new Map<string, number>();
        for (const article of articles) {
            const t_ = (article.topic || "").trim();
            if (!t_) continue;
            counts.set(t_, (counts.get(t_) || 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([value, count]) => ({ value, label: `${value} (${count})`, count }))
            .sort((a, b) => a.value.localeCompare(b.value));
    }, [articles]);

    const availableLanguages = useMemo<ArticleFilterOption[]>(() => {
        const counts = new Map<string, number>();
        for (const article of articles) {
            const l = article.language;
            if (!l) continue;
            counts.set(l, (counts.get(l) || 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([value, count]) => {
                const name = t(`ui.languages.${value}`, value);
                return { value, label: `${name} (${count})`, count };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [articles, t]);

    const filteredArticles = useMemo(() => {
        const q = debouncedQuery.toLowerCase();
        return [...articles]
            .filter((article) => {
                if (q) {
                    const matches =
                        article.title.toLowerCase().includes(q) ||
                        (article.subtitle || "").toLowerCase().includes(q) ||
                        (article.author || "").toLowerCase().includes(q) ||
                        (article.topic || "").toLowerCase().includes(q) ||
                        (article.excerpt || "").toLowerCase().includes(q) ||
                        article.language.toLowerCase().includes(q);
                    if (!matches) return false;
                }
                if (topic && (article.topic || "") !== topic) return false;
                if (language && article.language !== language) return false;
                if (status !== "all" && article.status !== status) return false;
                return true;
            })
            .sort((a, b) => {
                let cmp = 0;
                if (sortBy === "title") {
                    cmp = a.title.localeCompare(b.title);
                } else if (sortBy === "author") {
                    cmp = (a.author || "").localeCompare(b.author || "");
                } else {
                    cmp =
                        new Date(a.updated_at).getTime() -
                        new Date(b.updated_at).getTime();
                }
                return sortOrder === "asc" ? cmp : -cmp;
            });
    }, [articles, debouncedQuery, topic, language, status, sortBy, sortOrder]);

    const setSortBy = useCallback((field: ArticleSortField) => {
        setSortByRaw(field);
        setSortOrder(defaultOrderFor(field));
    }, []);

    const toggleSortOrder = useCallback(() => {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    }, []);

    const resetFilters = useCallback(() => {
        setSearchQuery("");
        setDebouncedQuery("");
        setTopic("");
        setLanguage("");
        setStatus("all");
    }, []);

    const hasActiveFilters =
        searchQuery !== "" || topic !== "" || language !== "" || status !== "all";

    return {
        searchQuery,
        topic,
        language,
        status,
        sortBy,
        sortOrder,
        filteredArticles,
        availableTopics,
        availableLanguages,
        hasActiveFilters,
        setSearchQuery,
        setTopic,
        setLanguage,
        setStatus,
        setSortBy,
        toggleSortOrder,
        resetFilters,
    };
}

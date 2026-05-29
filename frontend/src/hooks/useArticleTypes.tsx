/**
 * useArticleTypes — React Context-backed hook for the
 * ArticleTypeRegistry.
 *
 * Filed by ARTICLE-TYPES-SSOT-01 (2026-05-29). Mirrors the
 * BOOK-TYPES-SSOT-YAML-01 useBookTypes shape exactly: fetches
 * GET /api/article-types ONCE on app mount + caches in React
 * context; consumers across the app (ArticleList split-button,
 * ArticleEditor type-specific section, AD article-type filter,
 * future surfaces) read from the same cached snapshot via the
 * ``useArticleTypes()`` hook.
 *
 * Error policy: silent on fetch failure (the app must still boot
 * if the backend is unreachable for one second). Consumers that
 * need to know about the error can inspect ``snapshot.status``.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import {api, type ArticleTypeDef} from "../api/client";

type Status = "loading" | "ready" | "error";

interface ArticleTypesSnapshot {
    /** {id: ArticleTypeDef} mapping. Empty during initial load
     *  + on fetch error. */
    types: Record<string, ArticleTypeDef>;
    /** Ordered list of types (preserves YAML order from the
     *  backend response). Computed from `types`. */
    ordered: ArticleTypeDef[];
    /** The id of the article-type marked ``default: true`` in
     *  the registry. Falls back to the first registered id, or
     *  ``"blogpost"`` if the registry is empty (matches the
     *  backend's ``default_article_type_id`` fallback chain). */
    defaultId: string;
    status: Status;
    /** Manually re-trigger the fetch. */
    refresh: () => void;
}

const ArticleTypesContext = createContext<ArticleTypesSnapshot | null>(null);

interface ProviderProps {
    children: ReactNode;
    /** Test-only: skip the fetch + use this static snapshot. */
    initialTypes?: Record<string, ArticleTypeDef>;
}

export function ArticleTypesProvider({children, initialTypes}: ProviderProps) {
    const [types, setTypes] = useState<Record<string, ArticleTypeDef>>(
        initialTypes ?? {},
    );
    const [status, setStatus] = useState<Status>(
        initialTypes !== undefined ? "ready" : "loading",
    );

    const fetchTypes = useCallback(async () => {
        try {
            const result = await api.articleTypes.list();
            setTypes(result);
            setStatus("ready");
        } catch {
            // Silent fail-open: leave types empty + flag the
            // error so consumers can show a degraded UI if they
            // care.
            setStatus("error");
        }
    }, []);

    useEffect(() => {
        if (initialTypes !== undefined) return; // tests skip fetch
        void fetchTypes();
    }, [fetchTypes, initialTypes]);

    const ordered = useMemo(() => Object.values(types), [types]);

    const defaultId = useMemo(() => {
        for (const at of ordered) {
            if (at.default) return at.id;
        }
        if (ordered.length > 0) return ordered[0].id;
        return "blogpost";
    }, [ordered]);

    const value = useMemo<ArticleTypesSnapshot>(
        () => ({types, ordered, defaultId, status, refresh: fetchTypes}),
        [types, ordered, defaultId, status, fetchTypes],
    );

    return (
        <ArticleTypesContext.Provider value={value}>
            {children}
        </ArticleTypesContext.Provider>
    );
}

/**
 * Consume the ArticleTypeRegistry snapshot from the surrounding
 * ``ArticleTypesProvider``. Throws if used outside a provider.
 */
export function useArticleTypes(): ArticleTypesSnapshot {
    const ctx = useContext(ArticleTypesContext);
    if (ctx === null) {
        throw new Error(
            "useArticleTypes must be used within an <ArticleTypesProvider>",
        );
    }
    return ctx;
}

/** Convenience selector: the article-type's i18n label_key for
 *  a given id. Returns the bare id as the fallback so the UI
 *  never crashes on an unknown value (e.g. legacy backups with
 *  pre-registry content_type strings). */
export function articleTypeLabelKey(
    snapshot: ArticleTypesSnapshot,
    typeId: string,
): string {
    return snapshot.types[typeId]?.label_key ?? typeId;
}

/** Convenience selector: the article-type's icon name for a
 *  given id. Returns "FileText" as the fallback so the badge
 *  surfaces SOMETHING for an unknown value. */
export function articleTypeIcon(
    snapshot: ArticleTypesSnapshot,
    typeId: string,
): string {
    return snapshot.types[typeId]?.icon ?? "FileText";
}

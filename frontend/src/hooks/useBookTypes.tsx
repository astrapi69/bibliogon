/**
 * useBookTypes — React Context-backed hook for the BookTypeRegistry.
 *
 * Filed by BOOK-TYPES-SSOT-YAML-01 (2026-05-24). Fetches
 * GET /api/book-types ONCE on app mount + caches in React context;
 * consumers across the app (Dashboard, GetStarted, CreateBookModal,
 * BookEditor, BookMetadataEditor, kdp-wizard, etc.) read from the
 * same cached snapshot via the ``useBookTypes()`` hook.
 *
 * Pattern: `BookTypesProvider` mounted at app root; `useBookTypes()`
 * returns the loaded snapshot + a few derived selectors. Mirrors the
 * backend BookTypeRegistry's API surface — same selector names
 * (pageableBookTypes, withCapability) so the two layers feel like
 * one library.
 *
 * Error policy: silent on fetch failure (the app must still boot if
 * the backend is unreachable for one second). Consumers that need
 * to know about the error can inspect ``snapshot.status``.
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

import {type BookTypeDef} from "../api/client";
import {getStorage} from "../storage";

type Status = "loading" | "ready" | "error";

interface BookTypesSnapshot {
    /** {id: BookTypeDef} mapping. Empty during initial load + on
     *  fetch error. */
    types: Record<string, BookTypeDef>;
    /** Ordered list of types (preserves YAML order from the
     *  backend response). Computed from `types`. */
    ordered: BookTypeDef[];
    status: Status;
    /** Manually re-trigger the fetch (e.g. after the user updates
     *  the registry via Settings — not currently wired but cheap
     *  to expose). */
    refresh: () => void;
}

const BookTypesContext = createContext<BookTypesSnapshot | null>(null);

interface ProviderProps {
    children: ReactNode;
    /** Test-only: skip the fetch + use this static snapshot. */
    initialTypes?: Record<string, BookTypeDef>;
}

export function BookTypesProvider({children, initialTypes}: ProviderProps) {
    const [types, setTypes] = useState<Record<string, BookTypeDef>>(
        initialTypes ?? {},
    );
    const [status, setStatus] = useState<Status>(
        initialTypes !== undefined ? "ready" : "loading",
    );

    const fetchTypes = useCallback(async () => {
        try {
            const result = await getStorage().bookTypes.list();
            setTypes(result);
            setStatus("ready");
        } catch {
            // Silent fail-open: leave types empty + flag the error
            // so consumers can show a degraded UI if they care.
            setStatus("error");
        }
    }, []);

    useEffect(() => {
        if (initialTypes !== undefined) return; // tests skip fetch
        void fetchTypes();
    }, [fetchTypes, initialTypes]);

    const ordered = useMemo(() => Object.values(types), [types]);

    const value = useMemo<BookTypesSnapshot>(
        () => ({types, ordered, status, refresh: fetchTypes}),
        [types, ordered, status, fetchTypes],
    );

    return (
        <BookTypesContext.Provider value={value}>
            {children}
        </BookTypesContext.Provider>
    );
}

/**
 * Consume the BookTypeRegistry snapshot from the surrounding
 * `BookTypesProvider`. Throws if used outside a provider.
 */
export function useBookTypes(): BookTypesSnapshot {
    const ctx = useContext(BookTypesContext);
    if (ctx === null) {
        throw new Error(
            "useBookTypes must be used within a <BookTypesProvider>",
        );
    }
    return ctx;
}

/** Convenience: ids of book-types whose ``content_model`` is "pages".
 *  Mirrors the backend's ``pageable_book_types()``. */
export function pageableBookTypeIds(
    snapshot: BookTypesSnapshot,
): Set<string> {
    return new Set(
        snapshot.ordered
            .filter((bt) => bt.content_model === "pages")
            .map((bt) => bt.id),
    );
}

/** Convenience: ids of book-types where a named capability flag
 *  is True. Mirrors the backend's
 *  ``book_types_with_capability(name)``. */
export function bookTypeIdsWithCapability(
    snapshot: BookTypesSnapshot,
    capability: keyof BookTypeDef["capabilities"],
): Set<string> {
    return new Set(
        snapshot.ordered
            .filter((bt) => bt.capabilities[capability])
            .map((bt) => bt.id),
    );
}

/** The i18n key for a book-type's create label / default title, or
 *  null when the type is unknown or omits the key. Mirrors
 *  ``contentTypeDefaultTitleKey`` for the content-type registry;
 *  the Dashboard SplitButton primary label reads this so it reflects
 *  the configured ``ui.defaults.book_type``. */
export function bookTypeDefaultTitleKey(
    snapshot: BookTypesSnapshot,
    typeId: string,
): string | null {
    return snapshot.types[typeId]?.default_title_key ?? null;
}

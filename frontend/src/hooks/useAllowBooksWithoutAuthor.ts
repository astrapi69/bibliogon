import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * Returns the value of the ``app.allow_books_without_author``
 * toggle from Settings. Default false until the API resolves.
 *
 * Gates the import wizard's "Defer author" option and the
 * BookMetadataEditor's tolerance of an empty author select. The
 * matching backend toggle gates POST/PATCH/import validation.
 */
export function useAllowBooksWithoutAuthor(): boolean {
    const [allow, setAllow] = useState<boolean>(false);
    useEffect(() => {
        let cancelled = false;
        api.settings
            .getApp()
            .then((config) => {
                if (cancelled) return;
                const appBlock = (config.app || {}) as Record<string, unknown>;
                setAllow(Boolean(appBlock.allow_books_without_author));
            })
            .catch(() => {
                /* keep default false on network failure */
            });
        return () => {
            cancelled = true;
        };
    }, []);
    return allow;
}

import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * Load the author name + pen names from app settings.
 *
 * Returns a flat list of display names suitable for a
 * ``<datalist>``. The settings shape is:
 *
 * ```yaml
 * author:
 *   name: "Real Name"
 *   pen_names: ["Pen Name 1", "Pen Name 2"]
 * ```
 *
 * The real name comes first, then pen names. Duplicates are
 * removed (users sometimes re-enter their legal name as a pen
 * name). Empty strings are filtered. Network failure is
 * silent - the combobox falls back to a plain text input.
 */
export function useAuthorChoices(): string[] {
    const [choices, setChoices] = useState<string[]>([]);
    useEffect(() => {
        let cancelled = false;
        api.settings
            .getApp()
            .then((config) => {
                if (cancelled) return;
                const authorConfig = (config.author || {}) as Record<
                    string,
                    unknown
                >;
                const realName = ((authorConfig.name as string) || "").trim();
                const penNames = Array.isArray(authorConfig.pen_names)
                    ? (authorConfig.pen_names as unknown[])
                          .map((n) => (typeof n === "string" ? n.trim() : ""))
                          .filter(Boolean)
                    : [];
                const seen = new Set<string>();
                const out: string[] = [];
                for (const name of [realName, ...penNames]) {
                    if (name && !seen.has(name)) {
                        seen.add(name);
                        out.push(name);
                    }
                }
                setChoices(out);
            })
            .catch(() => {
                /* network failure falls back to empty list */
            });
        return () => {
            cancelled = true;
        };
    }, []);
    return choices;
}

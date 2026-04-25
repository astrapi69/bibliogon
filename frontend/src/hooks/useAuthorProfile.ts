import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * Author profile from app settings.
 *
 * Mirrors ``backend/config/app.yaml`` shape under ``author:``:
 *
 * ```yaml
 * author:
 *   name: "Real Name"
 *   pen_names: ["Pen 1", "Pen 2"]
 * ```
 *
 * Single-profile model; multi-profile support is a future schema
 * change. ``BookMetadataEditor`` uses this to render an optgroup-
 * style ``<select>`` (real name as the parent, pen names as
 * children). The wizard's ``AuthorPicker`` uses it to validate
 * imported author values against the user's known profiles.
 */
export interface AuthorProfile {
    name: string;
    pen_names: string[];
}

/** Returns the user's author profile, or null when the API has not
 * resolved yet, when the API failed, or when the profile is empty
 * (no real name AND no pen names). Empty pen-name strings are
 * filtered; non-string entries are ignored. */
export function useAuthorProfile(): AuthorProfile | null {
    const [profile, setProfile] = useState<AuthorProfile | null>(null);
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
                const name = ((authorConfig.name as string) || "").trim();
                const penNames = Array.isArray(authorConfig.pen_names)
                    ? (authorConfig.pen_names as unknown[])
                          .map((n) =>
                              typeof n === "string" ? n.trim() : "",
                          )
                          .filter((n) => n && n !== name)
                    : [];
                if (!name && penNames.length === 0) return;
                setProfile({ name, pen_names: penNames });
            })
            .catch(() => {
                /* network failure leaves profile null */
            });
        return () => {
            cancelled = true;
        };
    }, []);
    return profile;
}

/** Flatten a profile to its display names (real first, then pens).
 * Useful for callers that just need the legal-list of valid values
 * (e.g. import-wizard validation). */
export function profileDisplayNames(profile: AuthorProfile | null): string[] {
    if (profile === null) return [];
    const out: string[] = [];
    if (profile.name) out.push(profile.name);
    out.push(...profile.pen_names);
    return out;
}

/**
 * ArticleEditor static config (#207, extracted verbatim from ArticleEditor.tsx).
 * Pure data — the supported UI languages, the autosave debounce, and the
 * status cycle. No behaviour change.
 */

import type { ArticleStatus } from "../api/client";

/** Languages Bibliogon UI ships in. Mirrors backend/config/i18n/. */
export const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
    { code: "de", label: "Deutsch" },
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
    { code: "fr", label: "Français" },
    { code: "pt", label: "Português" },
    { code: "el", label: "Ελληνικά" },
    { code: "tr", label: "Türkçe" },
    { code: "ja", label: "日本語" },
];

export const AUTOSAVE_DEBOUNCE_MS = 1000;

export const STATUSES: ArticleStatus[] = ["draft", "ready", "published", "archived"];

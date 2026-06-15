/**
 * Book-language vocabulary.
 *
 * The language stored on a book (``Book.language``) is a free-form
 * string, not a UI-locale code. The 8 fixed defaults below are shown as
 * endonyms (each language in its own name, e.g. ``Français`` rather than
 * a UI-translated ``French``) so the list reads the same regardless of
 * the app's UI language. Users may add further languages of their own
 * via Settings; those custom strings are persisted under
 * ``ui.custom_languages`` and merged in at render time.
 */

/** Option shape consumed by {@link ComboboxSelect}. */
export interface BookLanguageOption {
    value: string;
    label: string;
}

/**
 * The 8 built-in book languages, shown as endonyms (a language in its
 * own name; intentionally NOT UI-translated). These are non-removable in
 * Settings — the custom-language editor only manages user additions.
 */
export const DEFAULT_BOOK_LANGUAGES: BookLanguageOption[] = [
    { value: "de", label: "Deutsch" },
    { value: "en", label: "English" },
    { value: "fr", label: "Français" },
    { value: "es", label: "Español" },
    { value: "el", label: "Ελληνικά" },
    { value: "it", label: "Italiano" },
    { value: "pt", label: "Português" },
    { value: "tr", label: "Türkçe" },
];

/** The bare value codes of the 8 fixed defaults, for membership tests. */
export const DEFAULT_BOOK_LANGUAGE_VALUES: string[] = DEFAULT_BOOK_LANGUAGES.map(
    (l) => l.value,
);

/**
 * Merge the 8 fixed defaults with the user's custom languages into a
 * single option list for the combobox. Defaults come first (in their
 * declared order), then custom entries (in their stored order). A custom
 * language is its own value AND its own label.
 *
 * Deduplication is case-insensitive on the value: a custom entry whose
 * value matches a default (or an earlier custom entry) is dropped, so a
 * user who types ``EN`` does not produce a second English row.
 *
 * @param custom - The user's custom-language strings (e.g. from
 *   ``ui.custom_languages``). Empty / whitespace-only entries are
 *   ignored.
 * @returns Deduped option list, defaults first.
 */
export function buildBookLanguageOptions(
    custom: string[],
): BookLanguageOption[] {
    const seen = new Set<string>(
        DEFAULT_BOOK_LANGUAGE_VALUES.map((v) => v.toLowerCase()),
    );
    const out: BookLanguageOption[] = [...DEFAULT_BOOK_LANGUAGES];
    for (const raw of custom) {
        const trimmed = (raw || "").trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ value: trimmed, label: trimmed });
    }
    return out;
}

/**
 * True when ``value`` is one of the 8 fixed default languages
 * (case-insensitive). Fixed defaults are non-removable in the Settings
 * custom-language editor.
 *
 * @param value - The language value to test.
 */
export function isDefaultBookLanguage(value: string): boolean {
    const key = (value || "").trim().toLowerCase();
    return DEFAULT_BOOK_LANGUAGE_VALUES.some((v) => v.toLowerCase() === key);
}

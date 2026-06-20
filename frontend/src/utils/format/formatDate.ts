/**
 * BCP47 locale resolution for Intl.DateTimeFormat across the
 * Bibliogon UI.
 *
 * Bibliogon supports 8 i18n languages (de, en, es, fr, el, pt, tr,
 * ja). Several callsites were either hardcoded to ``"de-DE"``
 * (BookCard, BookListView, ArticleCard, ArticleList) or used a
 * binary ``lang === "de" ? "de-DE" : "en-US"`` ternary that fell
 * back to en-US for 6 of the 8 languages.
 *
 * This helper centralises the lang → locale mapping so every date
 * surface renders in the user's actual UI language. The fallback
 * for an unknown lang code is the browser default (passing
 * ``undefined`` to ``toLocaleDateString`` honours
 * ``navigator.language``).
 */

const LANG_TO_LOCALE: Record<string, string> = {
    de: "de-DE",
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    el: "el-GR",
    pt: "pt-PT",
    tr: "tr-TR",
    ja: "ja-JP",
};

/** Resolve a Bibliogon i18n lang code to a BCP47 locale string.
 *  Returns ``undefined`` for unknown codes so Intl falls back to
 *  the browser default. */
export function resolveLocale(lang: string | undefined): string | undefined {
    if (!lang) return undefined;
    return LANG_TO_LOCALE[lang];
}

/** Format an ISO date string in the user's UI locale, date only.
 *  Returns an empty string for null / undefined input and the
 *  raw string for unparseable input. */
export function formatLocaleDate(
    iso: string | null | undefined,
    lang: string | undefined,
    options: Intl.DateTimeFormatOptions = {
        day: "numeric",
        month: "short",
        year: "numeric",
    },
): string {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleDateString(resolveLocale(lang), options);
    } catch {
        return iso;
    }
}

/** Same shape as formatLocaleDate but renders date + time. */
export function formatLocaleDateTime(
    iso: string | null | undefined,
    lang: string | undefined,
    options: Intl.DateTimeFormatOptions = {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    },
): string {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString(resolveLocale(lang), options);
    } catch {
        return iso;
    }
}

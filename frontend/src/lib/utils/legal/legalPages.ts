/**
 * Paths of the static legal pages (Impressum / Datenschutz, #876).
 *
 * The pages are plain HTML files in `public/`, so they exist in every
 * deployment at the deploy base: `/bibliogon/impressum.html` on GitHub
 * Pages, `/impressum.html` on the desktop build. German gets the German
 * pages; every other UI language gets the English ones.
 *
 * Library-grade: no app imports, so the same helper serves the footer,
 * the About tab and tests.
 *
 * @example
 * legalPageHref("privacy", "de", "/bibliogon/"); // "/bibliogon/datenschutz.html"
 */

export type LegalPage = "imprint" | "privacy";

const PATHS: Record<"de" | "en", Record<LegalPage, string>> = {
    de: {imprint: "impressum.html", privacy: "datenschutz.html"},
    en: {imprint: "imprint.html", privacy: "privacy.html"},
};

/** File name of the page for a UI language (`de` or any regional variant → German). */
export function legalPagePath(page: LegalPage, lang: string): string {
    const isGerman = lang.toLowerCase().split("-")[0] === "de";
    return PATHS[isGerman ? "de" : "en"][page];
}

/** Absolute href under the deploy base (defaults to Vite's `BASE_URL`). */
export function legalPageHref(
    page: LegalPage,
    lang: string,
    base: string = import.meta.env.BASE_URL,
): string {
    const prefix = base.endsWith("/") ? base : `${base}/`;
    return `${prefix}${legalPagePath(page, lang)}`;
}

/**
 * Dynamic document meta tags via native DOM (Library-First stage 1 — no
 * `react-helmet`). Updates `document.title` + the `description` / Open Graph
 * / Twitter-Card tags for the active SPA route so a shared link to a specific
 * book/article carries that item's title + description instead of the static
 * app-level defaults baked into `index.html`.
 *
 * Pure DOM, no app imports and no network — works identically online and in
 * Dexie/offline mode (Maximal Offline).
 *
 * @example
 * setDocumentMeta({ title: "Mein Buch", description: "Klappentext …" });
 * // on unmount / navigation away:
 * resetDocumentMeta();
 */

/** Static defaults mirroring `frontend/index.html`. {@link resetDocumentMeta}
 *  restores these when a route stops overriding the meta. */
export const DEFAULT_META = {
    title: "Bibliogon",
    description:
        "Bibliogon - die Open-Source-Plattform fuer Autoren. Buecher, Artikel und Comics schreiben, organisieren und veroeffentlichen. Offline-faehig, lokal-first.",
    ogTitle: "Bibliogon - Open-Source Autoren-Plattform",
    ogDescription:
        "Buecher, Artikel und Comics schreiben, organisieren und veroeffentlichen. Offline-faehig, lokal-first.",
    ogImage: "https://astrapi69.github.io/bibliogon/icon-512.png",
    ogType: "website",
} as const;

export interface DocumentMeta {
    /** Page title (shown as `<title>` and the tab label). Also used for
     *  `og:title` / `twitter:title` unless overridden. */
    title?: string;
    /** Meta description, also used for `og:description` / `twitter:description`. */
    description?: string;
    /** Absolute image URL for `og:image` / `twitter:image`. */
    image?: string;
    /** `og:type` (e.g. "website", "book", "article"). */
    type?: string;
}

function upsertMeta(attr: "name" | "property", key: string, content: string): void {
    if (typeof document === "undefined") return;
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
    if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
    }
    el.setAttribute("content", content);
}

/**
 * Apply per-page meta. Missing fields fall back to the static
 * {@link DEFAULT_META} so a partial override never leaves a stale value.
 */
export function setDocumentMeta(meta: DocumentMeta): void {
    if (typeof document === "undefined") return;
    const title = meta.title?.trim() || DEFAULT_META.title;
    const fullTitle = title === DEFAULT_META.title ? title : `${title} – Bibliogon`;
    const description = meta.description?.trim() || DEFAULT_META.ogDescription;
    const image = meta.image?.trim() || DEFAULT_META.ogImage;
    const type = meta.type?.trim() || DEFAULT_META.ogType;

    document.title = fullTitle;
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:image", image);
    upsertMeta("property", "og:type", type);
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", image);
}

/**
 * Lighter variant for static routes: set only the page title (and the
 * matching `og:title` / `twitter:title`), leaving the description/image at
 * the app defaults. Empty/blank restores the default "Bibliogon".
 */
export function setDocumentTitle(title?: string): void {
    if (typeof document === "undefined") return;
    const t = title?.trim();
    const display = t ? `${t} – Bibliogon` : DEFAULT_META.title;
    const ogTitle = t || DEFAULT_META.ogTitle;
    document.title = display;
    upsertMeta("property", "og:title", ogTitle);
    upsertMeta("name", "twitter:title", ogTitle);
}

/** Restore the static app-level defaults (call on navigation away from a
 *  route that set per-page meta). */
export function resetDocumentMeta(): void {
    if (typeof document === "undefined") return;
    document.title = DEFAULT_META.title;
    upsertMeta("name", "description", DEFAULT_META.description);
    upsertMeta("property", "og:title", DEFAULT_META.ogTitle);
    upsertMeta("property", "og:description", DEFAULT_META.ogDescription);
    upsertMeta("property", "og:image", DEFAULT_META.ogImage);
    upsertMeta("property", "og:type", DEFAULT_META.ogType);
    upsertMeta("name", "twitter:title", DEFAULT_META.ogTitle);
    upsertMeta("name", "twitter:description", DEFAULT_META.ogDescription);
    upsertMeta("name", "twitter:image", DEFAULT_META.ogImage);
}

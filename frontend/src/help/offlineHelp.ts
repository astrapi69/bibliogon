/**
 * Offline help + getstarted content resolution for the backendless PWA.
 *
 * The `/help` page, the HelpPanel modal, and the `/get-started` page all
 * fetch their content from the backend help/getstarted plugin endpoints.
 * Those endpoints reject offline (the `guardedFetch` egress), which left
 * every help/onboarding surface empty in Dexie mode.
 *
 * This module bundles the same content the backend would serve, generated
 * from the YAML/markdown SSoT by `scripts/generate-seed-data.py`
 * (`make generate-seed-data`). It is imported ONLY via a dynamic
 * `import()` from the offline branches in `api.help.*` / `api.getStarted.*`,
 * so the (≈1 MB) help docs never enter the online bundle and only load when
 * a help/onboarding surface is actually opened offline.
 *
 * The resolvers mirror the backend plugin shapes exactly (see
 * `plugins/bibliogon-plugin-help/bibliogon_help/{content,routes}.py` and
 * `plugins/bibliogon-plugin-getstarted/bibliogon_getstarted/guide.py`).
 */

import { ApiError } from "../api/client";
import type {
    BookType,
    HelpNavItem,
    HelpPage,
    HelpSearchResult,
} from "../api/client";

import seedHelp from "../storage/seed/seed-help.json";
import seedGetStarted from "../storage/seed/seed-getstarted.json";
import seedDocsDe from "../storage/seed/seed-help-docs-de.json";
import seedDocsEn from "../storage/seed/seed-help-docs-en.json";

interface Shortcut {
    keys: string;
    action: string;
}
interface FaqEntry {
    question: string;
    answer: string;
}
interface HelpLegacy {
    shortcuts: Record<string, Shortcut[]>;
    faq: Record<string, FaqEntry[]>;
    about: Record<string, string>;
}
interface DocsBundle {
    navigation: HelpNavItem[];
    pages: Record<string, HelpPage>;
}
interface SampleBook {
    title: string;
    author: string;
    language: string;
    book_type: BookType;
    description: string;
    chapters?: { title: string; content: string }[];
    pages?: {
        layout: string;
        text_content?: string;
        layout_config?: Record<string, unknown>;
        image_asset_id?: string | null;
    }[];
}
interface GetStartedSeed {
    guide: Record<
        string,
        { id: string; title: string; description: string; icon: string }[]
    >;
    sampleBooks: Record<string, Record<string, SampleBook>>;
}

const HELP = seedHelp as unknown as HelpLegacy;
const GETSTARTED = seedGetStarted as unknown as GetStartedSeed;

/** Locales with an authored doc tree. Others fall back to the default. */
const DOCS: Record<string, DocsBundle> = {
    de: seedDocsDe as unknown as DocsBundle,
    en: seedDocsEn as unknown as DocsBundle,
};
const DEFAULT_LOCALE = "de";

function resolveLocale(locale: string): string {
    return locale in DOCS ? locale : DEFAULT_LOCALE;
}

/** Pick `lang`, else the English catalog, else the first available. */
function pickLang<T>(byLang: Record<string, T>, lang: string): T {
    return byLang[lang] ?? byLang.en ?? byLang[DEFAULT_LOCALE];
}

export function offlineShortcuts(lang: string): Shortcut[] {
    return pickLang(HELP.shortcuts, lang) ?? [];
}

export function offlineFaq(lang: string): FaqEntry[] {
    return pickLang(HELP.faq, lang) ?? [];
}

export function offlineAbout(): Record<string, string> {
    return HELP.about;
}

export function offlineNavigation(locale: string): HelpNavItem[] {
    return DOCS[resolveLocale(locale)].navigation;
}

export function offlinePage(locale: string, slug: string): HelpPage {
    const resolved = resolveLocale(locale);
    const page =
        DOCS[resolved].pages[slug] ??
        (resolved !== DEFAULT_LOCALE
            ? DOCS[DEFAULT_LOCALE].pages[slug]
            : undefined);
    if (!page) {
        // Match the backend's 404 so HelpPanel's catch shows its
        // "page not found" placeholder.
        throw new ApiError(
            404,
            `Page not found: ${slug}`,
            `/help/page/${locale}/${slug}`,
            "GET",
        );
    }
    return page;
}

/**
 * Client-side fulltext search over the bundled pages. Mirrors the
 * backend `/help/search` shape (up to 20 results, score = match count,
 * snippet around the first hit).
 */
export function offlineSearch(
    locale: string,
    query: string,
): { results: HelpSearchResult[] } {
    if (!query || query.trim().length < 2) return { results: [] };
    const q = query.toLowerCase();
    const pages = DOCS[resolveLocale(locale)].pages;
    const results: HelpSearchResult[] = [];
    for (const slug of Object.keys(pages)) {
        const content = pages[slug].content;
        const lower = content.toLowerCase();
        const idx = lower.indexOf(q);
        if (idx === -1) continue;

        let title = slug;
        for (const line of content.split("\n")) {
            const stripped = line.trim();
            if (stripped.startsWith("#")) {
                title = stripped.replace(/^#+/, "").trim();
                break;
            }
        }

        const start = Math.max(0, idx - 80);
        const end = Math.min(content.length, idx + q.length + 120);
        let snippet = content.slice(start, end).trim();
        if (start > 0) snippet = `...${snippet}`;
        if (end < content.length) snippet = `${snippet}...`;

        let score = 0;
        let from = lower.indexOf(q);
        while (from !== -1) {
            score += 1;
            from = lower.indexOf(q, from + q.length);
        }
        results.push({ slug, title, snippet, score });
    }
    results.sort((a, b) => b.score - a.score);
    return { results: results.slice(0, 20) };
}

export function offlineGuide(
    lang: string,
): { id: string; title: string; description: string; icon: string }[] {
    return pickLang(GETSTARTED.guide, lang) ?? [];
}

export function offlineSampleBook(
    lang: string,
    bookType: BookType,
): SampleBook {
    const byType = pickLang(GETSTARTED.sampleBooks, lang) ?? {};
    return byType[bookType] ?? byType.prose;
}

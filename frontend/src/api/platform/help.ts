/**
 * Help + get-started API namespaces. Extracted from api/platform.ts
 * (#679).
 *
 * Help content is bundled into the offline seed (generated from the
 * docs/help markdown + help.yaml SSoT). On the backendless PWA these
 * methods resolve from that seed via a lazy import so the help page +
 * panel work offline; online they hit the backend help plugin. The
 * lazy import keeps the ~1 MB of help docs out of the eager bundle.
 */
import { isBackendlessOffline, request } from "../http";
import type {
  BookType,
  HelpNavItem,
  HelpPage,
  HelpSearchResult,
} from "../client";

export const help = {
  // Legacy endpoints (kept for backward compat)
  shortcuts: async (lang: string = "de") => {
    if (isBackendlessOffline()) {
      return (await import("../../help/offlineHelp")).offlineShortcuts(lang);
    }
    return request<{ keys: string; action: string }[]>(
      `/help/shortcuts?lang=${lang}`,
    );
  },

  faq: async (lang: string = "de") => {
    if (isBackendlessOffline()) {
      return (await import("../../help/offlineHelp")).offlineFaq(lang);
    }
    return request<{ question: string; answer: string }[]>(
      `/help/faq?lang=${lang}`,
    );
  },

  about: async () => {
    if (isBackendlessOffline()) {
      return (await import("../../help/offlineHelp")).offlineAbout();
    }
    return request<Record<string, string>>("/help/about");
  },

  // New docs-based endpoints
  navigation: async (locale: string = "de") => {
    if (isBackendlessOffline()) {
      return (await import("../../help/offlineHelp")).offlineNavigation(locale);
    }
    return request<HelpNavItem[]>(`/help/navigation/${locale}`);
  },

  page: async (locale: string, slug: string) => {
    if (isBackendlessOffline()) {
      return (await import("../../help/offlineHelp")).offlinePage(locale, slug);
    }
    return request<HelpPage>(`/help/page/${locale}/${slug}`);
  },

  search: async (locale: string, query: string) => {
    if (isBackendlessOffline()) {
      return (await import("../../help/offlineHelp")).offlineSearch(
        locale,
        query,
      );
    }
    return request<{ results: HelpSearchResult[] }>(
      `/help/search/${locale}?q=${encodeURIComponent(query)}`,
    );
  },
};

export const getStarted = {
  guide: async (lang: string = "de") => {
    if (isBackendlessOffline()) {
      return (await import("../../help/offlineHelp")).offlineGuide(lang);
    }
    return request<
      { id: string; title: string; description: string; icon: string }[]
    >(`/get-started/guide?lang=${lang}`);
  },

  // GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 C3: sample-book response
  // varies by book_type:
  //   - prose: carries ``chapters: [...]``
  //   - picture_book / comic_book: carries ``pages: [...]``
  // The TypeScript shape unions both so the caller branches on
  // ``book_type`` (or just checks ``"chapters" in resp``).
  sampleBook: async (lang: string = "de", bookType: BookType = "prose") => {
    if (isBackendlessOffline()) {
      return (await import("../../help/offlineHelp")).offlineSampleBook(
        lang,
        bookType,
      );
    }
    return request<{
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
    }>(`/get-started/sample-book?lang=${lang}&book_type=${bookType}`);
  },
};

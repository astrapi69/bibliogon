import { useEffect, useState } from "react";

import { getStorage } from "../../storage";
import { useContentTypes, contentTypeDefaultTitleKey } from "../useContentTypes";
import type { useI18n } from "../useI18n";

type ContentTypesSnapshot = ReturnType<typeof useContentTypes>;
type TFunc = ReturnType<typeof useI18n>["t"];

/**
 * Resolve the "New article" split-button's primary label + href from the
 * workspace's configured default content-type
 * (``ui.defaults.content_type``).
 *
 * Extracted from ArticleList.tsx (god-file split, #207) as a pure
 * structural move. The label always reflects the default's registry
 * ``default_title_key`` (mirroring the Book Dashboard's ``newBookLabel``),
 * falling back to the generic "Neuer Artikel" when the default is
 * unset/unknown or omits the key (issue #122). The primary deep-links a
 * SPECIFIC (non-registry-default) type so CreateArticlePage renders the
 * type-specific heading.
 *
 * @example
 * const { newArticleLabel, newArticleHref } = useArticleNewButton(articleTypesSnapshot, t);
 */
export function useArticleNewButton(
    articleTypesSnapshot: ContentTypesSnapshot,
    t: TFunc,
): { newArticleLabel: string; newArticleHref: string } {
    // CONFIGURABLE-DEFAULT-CONTENT-BOOK-TYPE-01: workspace default
    // content-type. The SplitButton primary "Neuer Artikel" creates this
    // type (CreateArticlePage applies it); its label reflects the
    // default's registry default_title_key.
    const [defaultContentType, setDefaultContentType] = useState("blogpost");

    // Fetch the configured default content-type for the SplitButton
    // primary label. No cache on getApp(), and this runs on every
    // mount, so the label updates as soon as the user returns from
    // Settings after changing the default. Silent fail: keep "blogpost".
    useEffect(() => {
        let cancelled = false;
        getStorage()
            .settings.getApp()
            .then((config) => {
                if (cancelled) return;
                const uiConfig = (config.ui || {}) as Record<string, unknown>;
                const uiDefaults = (uiConfig.defaults || {}) as Record<string, unknown>;
                const ct = uiDefaults.content_type;
                if (typeof ct === "string") setDefaultContentType(ct);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const registryDefaultContentType = articleTypesSnapshot.defaultId;
    const newArticleFallbackLabel = t("ui.articles.new", "Neuer Artikel");
    const newArticleTitleKey = defaultContentType
        ? contentTypeDefaultTitleKey(articleTypesSnapshot, defaultContentType)
        : null;
    const newArticleLabel = newArticleTitleKey
        ? t(newArticleTitleKey, newArticleFallbackLabel)
        : newArticleFallbackLabel;
    const hasSpecificDefaultContentType =
        !!defaultContentType &&
        defaultContentType !== registryDefaultContentType &&
        !!articleTypesSnapshot.types[defaultContentType];
    const newArticleHref = hasSpecificDefaultContentType
        ? `/articles/new?type=${defaultContentType}`
        : "/articles/new";

    return { newArticleLabel, newArticleHref };
}

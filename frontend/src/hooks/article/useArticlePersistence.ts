import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { ApiError, Article, ArticleStatus, ContentType } from "../../api/client";
import { getStorage } from "../../storage";
import { notify } from "../../utils/notify";
import type { SaveStatus } from "../../components/articles/ArticleEditorFields";

type Translate = (key: string, fallback: string) => string;

export interface UseArticlePersistence {
    article: Article | null;
    setArticle: Dispatch<SetStateAction<Article | null>>;
    loading: boolean;
    saveStatus: SaveStatus;
    persistContent: (json: string) => Promise<void>;
    persistMeta: (patch: Partial<Article>) => Promise<void>;
}

/**
 * Owns the ArticleEditor's load + persistence: the loaded article, the
 * save-status indicator state, content persistence (the Editor's onSave
 * sink), and the debounced metadata PATCH (``persistMeta``) with its
 * change-dedup key. The load effect re-runs on ``id`` change.
 *
 * @param id - article id from the route params.
 * @param t - i18n translate function (for error toasts).
 */
export function useArticlePersistence(id: string | undefined, t: Translate): UseArticlePersistence {
    const [article, setArticle] = useState<Article | null>(null);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

    const lastSavedMeta = useRef<string>("");

    // Load article + initial content.
    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        setLoading(true);
        getStorage()
            .articles.get(id)
            .then((a) => {
                if (cancelled) return;
                setArticle(a);
                lastSavedMeta.current = JSON.stringify({
                    title: a.title,
                    subtitle: a.subtitle,
                    author: a.author,
                    language: a.language,
                    status: a.status,
                    canonical_url: a.canonical_url,
                    featured_image_url: a.featured_image_url,
                    featured_image_asset_id: a.featured_image_asset_id,
                    excerpt: a.excerpt,
                    tags: a.tags,
                    topic: a.topic,
                    seo_title: a.seo_title,
                    seo_description: a.seo_description,
                });
            })
            .catch((err) => {
                if (err instanceof ApiError) {
                    notify.error(t("ui.articles.load_error", "Konnte Artikel nicht laden."), err);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [id, t]);

    // Editor handles content persistence via its onSave callback.
    // ArticleEditor still owns metadata persistence (persistMeta).
    const persistContent = useCallback(
        async (json: string) => {
            if (!id) return;
            setSaveStatus("saving");
            try {
                await getStorage().articles.update(id, { content_json: json });
                setSaveStatus("saved");
                setTimeout(() => setSaveStatus("idle"), 2000);
            } catch (err) {
                if (err instanceof ApiError) {
                    setSaveStatus("error");
                    notify.error(t("ui.articles.save_failed", "Speichern fehlgeschlagen."), err);
                }
            }
        },
        [id, t],
    );

    const persistMeta = useCallback(
        async (patch: Partial<Article>) => {
            if (!id || !article) return;
            const next = { ...article, ...patch };
            setArticle(next);
            const meta = JSON.stringify({
                title: next.title,
                subtitle: next.subtitle,
                author: next.author,
                language: next.language,
                status: next.status,
                canonical_url: next.canonical_url,
                featured_image_url: next.featured_image_url,
                featured_image_asset_id: next.featured_image_asset_id,
                excerpt: next.excerpt,
                tags: next.tags,
                topic: next.topic,
                seo_title: next.seo_title,
                seo_description: next.seo_description,
                // ARTICLE-TYPES-SSOT-01 C6: include article-type
                // discriminator + per-type metadata in the dedup
                // key so type-changes + extra_field edits trigger
                // saves.
                content_type: next.content_type,
                article_metadata: next.article_metadata,
            });
            if (meta === lastSavedMeta.current) return;
            try {
                const saved = await getStorage().articles.update(id, {
                    title: patch.title,
                    subtitle: patch.subtitle as string | null | undefined,
                    author: patch.author as string | null | undefined,
                    language: patch.language,
                    status: patch.status as ArticleStatus | undefined,
                    canonical_url: patch.canonical_url as string | null | undefined,
                    featured_image_url: patch.featured_image_url as string | null | undefined,
                    featured_image_asset_id: patch.featured_image_asset_id as
                        | string
                        | null
                        | undefined,
                    excerpt: patch.excerpt as string | null | undefined,
                    tags: patch.tags,
                    topic: patch.topic as string | null | undefined,
                    seo_title: patch.seo_title as string | null | undefined,
                    seo_description: patch.seo_description as string | null | undefined,
                    // ARTICLE-TYPES-SSOT-01 C6: thread the article-
                    // type + extra-fields PATCH through.
                    content_type: patch.content_type as ContentType | undefined,
                    article_metadata: patch.article_metadata,
                });
                setArticle(saved);
                lastSavedMeta.current = meta;
            } catch (err) {
                if (err instanceof ApiError) {
                    notify.error(t("ui.articles.save_failed", "Speichern fehlgeschlagen."), err);
                }
            }
        },
        [id, article, t],
    );

    return { article, setArticle, loading, saveStatus, persistContent, persistMeta };
}

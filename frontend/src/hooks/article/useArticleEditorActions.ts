import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";

import { api, ApiError, Article } from "../../api/client";
import { getStorage } from "../../storage";
import { aiComplete, AiNotConfiguredError } from "../../ai/aiComplete";
import { buildMetaMessages, parseMetaResponse } from "../../ai/metaPrompts";
import { extractBodyText } from "../../ai/templateApply";
import { useTopics } from "../content/useTopics";
import { notify } from "../../utils/platform/notify";

type Translate = (key: string, fallback: string) => string;

/** AR editor-parity Phase 3 export formats. LaTeX is always client-side. */
export type ArticleExportFormat = "markdown" | "html" | "pdf" | "docx" | "latex";

/** AI-meta target field. */
export type ArticleAiMetaField = "seo_title" | "seo_description" | "tags";

type ConfirmFn = (
    title: string,
    body: string,
    variant?: "danger" | "default",
    options?: { confirmLabel?: string },
) => Promise<boolean>;

export interface UseArticleEditorActions {
    topics: string[] | null;
    handleAddTopic: (name: string) => Promise<boolean>;
    exporting: ArticleExportFormat | null;
    handleExport: (fmt: ArticleExportFormat) => Promise<void>;
    aiGenerating: ArticleAiMetaField | null;
    articleHasContent: boolean;
    handleAiGenerate: (field: ArticleAiMetaField) => Promise<void>;
    handleDelete: () => Promise<void>;
    handleReclassifyAsComment: () => Promise<void>;
}

interface Params {
    article: Article | null;
    setArticle: Dispatch<SetStateAction<Article | null>>;
    persistMeta: (patch: Partial<Article>) => Promise<void>;
    navigate: NavigateFunction;
    confirm: ConfirmFn;
    t: Translate;
}

/**
 * Owns the ArticleEditor's imperative action handlers: topic inline-add,
 * document export, AI metadata generation (SEO title / description / tags),
 * move-to-trash, and reclassify-as-comment. Extracted from ArticleEditor to
 * keep the page component focused on layout + the metadata sidebar.
 *
 * @param article - the loaded article (null while loading).
 * @param setArticle - state setter for optimistic UI updates.
 * @param persistMeta - debounced metadata PATCH sink.
 * @param navigate - react-router navigate (post-delete / post-reclassify).
 * @param confirm - AppDialog confirm prompt.
 * @param t - i18n translate function.
 *
 * @example
 * const actions = useArticleEditorActions({ article, setArticle, persistMeta, navigate, confirm, t });
 * actions.handleExport("pdf");
 */
export function useArticleEditorActions({
    article,
    setArticle,
    persistMeta,
    navigate,
    confirm,
    t,
}: Params): UseArticleEditorActions {
    const topicsFromHook = useTopics();
    // Local mirror of the settings topics list so inline-add via the
    // TopicSelect dropdown can append without waiting on a re-mount of
    // the hook. Synced from useTopics on every change.
    const [topics, setTopics] = useState<string[] | null>(topicsFromHook);
    useEffect(() => {
        setTopics(topicsFromHook);
    }, [topicsFromHook]);

    const handleAddTopic = useCallback(
        async (name: string): Promise<boolean> => {
            const trimmed = name.trim();
            if (!trimmed) return false;
            const current = topics ?? [];
            if (current.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
                // Already exists - just select it without a redundant PATCH.
                return true;
            }
            const next = [...current, trimmed];
            try {
                await getStorage().settings.updateApp({ topics: next });
                setTopics(next);
                return true;
            } catch (err) {
                if (err instanceof ApiError) {
                    notify.error(
                        t("ui.articles.topic_add_failed", "Thema konnte nicht angelegt werden."),
                        err,
                    );
                }
                return false;
            }
        },
        [topics, t],
    );

    const [exporting, setExporting] = useState<ArticleExportFormat | null>(null);
    const [aiGenerating, setAiGenerating] = useState<ArticleAiMetaField | null>(null);

    const articleHasContent = ((): boolean => {
        const json = article?.content_json?.trim();
        if (!json) return false;
        try {
            const parsed = JSON.parse(json);
            const stack: unknown[] = [parsed];
            while (stack.length) {
                const node = stack.pop();
                if (node && typeof node === "object") {
                    const text = (node as { text?: unknown }).text;
                    if (typeof text === "string" && text.trim()) return true;
                    const children = (node as { content?: unknown }).content;
                    if (Array.isArray(children)) stack.push(...children);
                }
            }
            return false;
        } catch {
            return Boolean(json);
        }
    })();

    async function handleAiGenerate(field: ArticleAiMetaField): Promise<void> {
        if (!article || aiGenerating) return;
        setAiGenerating(field);
        try {
            // Offline (Dexie / PWA): build the prompt and call the user's
            // provider browser-direct; online: the backend generate-meta route.
            const result =
                getStorage().mode === "dexie"
                    ? parseMetaResponse(
                          field,
                          (
                              await aiComplete(
                                  buildMetaMessages(field, {
                                      title: article.title,
                                      language: article.language || "de",
                                      bodyText: extractBodyText(article.content_json),
                                      topic: article.topic,
                                  }),
                                  { maxTokens: 512 },
                              )
                          ).content,
                      )
                    : await api.articles.generateMeta(article.id, field);
            if (field === "tags") {
                const next = result.generated_tags ?? [];
                setArticle({ ...article, tags: next });
                void persistMeta({ tags: next });
                notify.success(
                    t("ui.articles.tags_generated", "{count} Tags generiert.").replace(
                        "{count}",
                        String(next.length),
                    ),
                );
            } else {
                const text = result.generated_text ?? "";
                if (field === "seo_title") {
                    setArticle({ ...article, seo_title: text || null });
                    void persistMeta({ seo_title: text || null });
                    notify.success(t("ui.articles.seo_title_generated", "SEO-Titel generiert."));
                } else {
                    setArticle({ ...article, seo_description: text || null });
                    void persistMeta({ seo_description: text || null });
                    notify.success(
                        t("ui.articles.seo_description_generated", "SEO-Beschreibung generiert."),
                    );
                }
            }
        } catch (err) {
            if (err instanceof AiNotConfiguredError) {
                notify.info(
                    t(
                        "ui.feature.requires_ai_key",
                        "This feature requires a configured AI key (Settings > AI Assistant)",
                    ),
                );
            } else {
                notify.error(
                    t("ui.articles.ai_generation_failed", "KI-Generierung fehlgeschlagen."),
                    err instanceof ApiError ? err : undefined,
                );
            }
        } finally {
            setAiGenerating(null);
        }
    }

    const handleExport = async (fmt: ArticleExportFormat) => {
        if (!article || exporting) return;
        setExporting(fmt);
        try {
            // Offline renders in the browser (no Pandoc backend). LaTeX is
            // always client-side — there is no backend `.tex` path, so it
            // takes the client engine regardless of connectivity.
            if (getStorage().mode === "dexie" || fmt === "latex") {
                const { downloadExport, buildArticleDocument } = await import("../../export");
                await downloadExport(buildArticleDocument(article), fmt);
            } else {
                await api.articleExport.download(
                    article.id,
                    fmt as "markdown" | "html" | "pdf" | "docx",
                );
            }
            notify.success(t("ui.articles.export_success", "Export gestartet."));
        } catch (err) {
            notify.error(
                t("ui.articles.export_failed", "Export fehlgeschlagen."),
                err instanceof ApiError ? err : undefined,
            );
        } finally {
            setExporting(null);
        }
    };

    async function handleDelete(): Promise<void> {
        if (!article) return;
        const ok = await confirm(
            t("ui.articles.delete_title", "Artikel löschen?"),
            t(
                "ui.articles.delete_trash_body",
                "Dieser Artikel wird in den Papierkorb verschoben und kann später wiederhergestellt werden.",
            ),
            "danger",
            { confirmLabel: t("ui.articles.delete_confirm", "Löschen") },
        );
        if (!ok) return;
        try {
            await getStorage().articles.delete(article.id);
            notify.info(t("ui.articles.moved_to_trash", "In den Papierkorb verschoben"));
            navigate("/articles");
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(t("ui.articles.delete_failed", "Löschen fehlgeschlagen."), err);
            }
        }
    }

    async function handleReclassifyAsComment(): Promise<void> {
        if (!article) return;
        // Single-item move uses the simple confirm dialog. The move is
        // reversible from the Comments admin tab, so type-to-confirm
        // would be overkill. The dialog spells out the lossy fields
        // (title, tags, SEO meta, etc.) so the user can't be surprised.
        const ok = await confirm(
            t("ui.articles.reclassify_title", "Move article to comments?"),
            t(
                "ui.articles.reclassify_body",
                "The article will be moved to the comments list. Title, subtitle, tags, SEO metadata, publications, and assets are dropped on the move. The action is reversible from Settings → Comments admin.",
            ),
            "danger",
            {
                confirmLabel: t("ui.articles.reclassify_confirm", "Move to comments"),
            },
        );
        if (!ok) return;
        try {
            await api.articles.reclassifyAsComment(article.id);
            // The article no longer exists locally; navigate away and
            // surface a toast with a deep-link to the Comments admin
            // tab so the user can verify the move landed.
            navigate("/articles");
            notify.bulkAction(
                t("ui.articles.reclassify_success", "Article moved to comments."),
                () => navigate("/settings?tab=comments"),
                t("ui.articles.reclassify_view", "Open Comments admin"),
            );
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t("ui.articles.reclassify_failed", "Could not move the article."),
                    err,
                );
            }
        }
    }

    return {
        topics,
        handleAddTopic,
        exporting,
        handleExport,
        aiGenerating,
        articleHasContent,
        handleAiGenerate,
        handleDelete,
        handleReclassifyAsComment,
    };
}

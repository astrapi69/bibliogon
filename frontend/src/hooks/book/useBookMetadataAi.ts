import { useEffect, useState } from "react";
import { api, ApiError, BookDetail } from "../../api/client";
import { aiChat, getAiConfig, isAiConfigured } from "../../ai/llmClient";
import { buildMarketingMessages } from "../../ai/marketingPrompts";
import { notify } from "../../utils/notify";
import { useI18n } from "../useI18n";
import { type EditorPluginStatusMap, isPluginAvailable } from "../editor/useEditorPluginStatus";

export interface UseBookMetadataAiParams {
    book: BookDetail;
    form: Record<string, string | null>;
    /** True when the app runs backendless (dexie). */
    offline: boolean;
    /** Editor plugin availability map (online AI gate). */
    pluginStatus: EditorPluginStatusMap;
    /** Field setter from useBookMetadata (mutates a single form key). */
    set: (key: string, value: string) => void;
    /** Keyword list setter from useBookMetadata. */
    setKeywords: React.Dispatch<React.SetStateAction<string[]>>;
}

export interface UseBookMetadataAiResult {
    aiGenerating: string | null;
    aiAvailable: boolean;
    handleAiGenerate: (field: string) => Promise<void>;
}

/**
 * AI-marketing generation for the book-metadata editor.
 *
 * Owns the per-field "generating" state, derives whether the AI path
 * is available (offline: a configured provider key; online: the AI
 * plugin probe), and runs the generate handler browser-direct offline
 * or via the backend AI route online.
 *
 * @param params - The active book, the live form, the offline flag,
 *   the plugin-status map, and the two form setters this handler writes
 *   results back through.
 * @returns The generating state, availability flag, and the handler.
 */
export function useBookMetadataAi({
    book,
    form,
    offline,
    pluginStatus,
    set,
    setKeywords,
}: UseBookMetadataAiParams): UseBookMetadataAiResult {
    const { t } = useI18n();
    const [aiGenerating, setAiGenerating] = useState<string | null>(null);
    // Offline the AI plugin probe is empty (backend-only); the marketing
    // generate instead runs browser-direct, so availability follows whether
    // the user configured an AI key in Settings.
    const [offlineAiReady, setOfflineAiReady] = useState(false);
    useEffect(() => {
        if (!offline) return;
        let cancelled = false;
        void getAiConfig().then((cfg) => {
            if (!cancelled) setOfflineAiReady(isAiConfigured(cfg));
        });
        return () => {
            cancelled = true;
        };
    }, [offline]);

    const aiAvailable = offline ? offlineAiReady : isPluginAvailable(pluginStatus, "ai");

    const handleAiGenerate = async (field: string) => {
        setAiGenerating(field);
        try {
            const req = {
                field,
                book_title: book.title,
                author: book.author,
                genre: book.genre || "",
                language: book.language || "de",
                description: book.description || "",
                chapter_titles: book.chapters.map((ch) => ch.title),
                existing_text: field === "keywords" ? "" : form[field] || "",
                book_id: book.id,
            };
            // Offline: build the same prompts and call the provider directly
            // from the browser; online: the backend AI route.
            const content = offline
                ? (
                      await aiChat(await getAiConfig(), buildMarketingMessages(req), {
                          maxTokens: 1024,
                      })
                  ).content
                : (await api.ai.generateMarketing(req)).content;
            if (field === "keywords") {
                try {
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed)) {
                        setKeywords(parsed.map(String).filter(Boolean));
                        notify.success(
                            t("ui.metadata.ai_keywords_generated", "Keywords generiert"),
                        );
                    } else {
                        notify.error(
                            t("ui.metadata.ai_generate_error", "AI-Generierung fehlgeschlagen"),
                        );
                    }
                } catch {
                    notify.error(
                        t("ui.metadata.ai_generate_error", "AI-Generierung fehlgeschlagen"),
                    );
                }
            } else {
                set(field, content || "");
                notify.success(t("ui.metadata.ai_text_generated", "Text generiert"));
            }
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : null;
            notify.error(
                detail || t("ui.metadata.ai_generate_error", "AI-Generierung fehlgeschlagen"),
                err,
            );
        }
        setAiGenerating(null);
    };

    return { aiGenerating, aiAvailable, handleAiGenerate };
}

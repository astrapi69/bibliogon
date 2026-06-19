import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { api, ApiError } from "../../api/client";
import { aiComplete, AiNotConfiguredError } from "../../ai/aiComplete";
import { AiClientError, classifyAiClientError } from "../../ai/llmClient";
import { buildReviewMessages } from "../../ai/reviewPrompts";
import { reviewString } from "../../data/ai-review-strings";
import { notify } from "../../utils/notify";
import { useI18n } from "../useI18n";
import { useStorageMode } from "../../storage/useStorageMode";

type ReviewFocus = "style" | "consistency" | "beta_reader";

/**
 * Bundle the editor's full-chapter AI review concern (v0.20.x AI review
 * extension, docs/explorations/ai-review-extension.md).
 *
 * Owns the SSE ``EventSource`` ref plus the review-specific state
 * (focus, download URL, live status message, cost estimate). The shared
 * AI-panel state (loading flag, the review text, whether the panel is
 * open) is NOT owned here - the editor's AI-suggest flow shares it - so
 * the relevant setters are passed in. This keeps the cut clean: the ref
 * (``reviewEventSource``) never crosses the hook boundary.
 *
 * The returned ``cleanup`` MUST run from the host component's unmount
 * effect so a mid-stream review closes its connection.
 */
export function useAiChapterReview(args: {
    editor: TiptapEditor | null;
    showAiPanel: boolean;
    aiPromptType: string;
    chapterId?: string;
    chapterTitle?: string;
    chapterType: string;
    bookId?: string;
    bookContext?: { title: string; genre: string };
    bookLanguage: string;
    setShowAiPanel: (open: boolean) => void;
    setAiLoading: (loading: boolean) => void;
    setAiReview: (review: string) => void;
    setAiSuggestion: (suggestion: string) => void;
}) {
    const {
        editor,
        showAiPanel,
        aiPromptType,
        chapterId,
        chapterTitle,
        chapterType,
        bookId,
        bookContext,
        bookLanguage,
        setShowAiPanel,
        setAiLoading,
        setAiReview,
        setAiSuggestion,
    } = args;
    const { t } = useI18n();
    const { mode } = useStorageMode();
    const offline = mode === "dexie";
    const [reviewFocus, setReviewFocus] = useState<ReviewFocus>("style");
    const [reviewDownloadUrl, setReviewDownloadUrl] = useState<string | null>(null);
    const [reviewStatusMsg, setReviewStatusMsg] = useState<string | null>(null);
    const [reviewCostLabel, setReviewCostLabel] = useState<string | null>(null);
    const reviewEventSource = useRef<EventSource | null>(null);

    const cleanup = useCallback(() => {
        if (reviewEventSource.current) {
            reviewEventSource.current.close();
            reviewEventSource.current = null;
        }
    }, []);

    // Fetch a rough token + USD cost estimate when the review tab is
    // visible and the chapter content changes. Best-effort - a failed
    // estimate just hides the cost label.
    useEffect(() => {
        // The cost estimate is a backend-only convenience (token pricing table
        // lives server-side). Offline there is no estimate endpoint, so the
        // label is simply omitted rather than firing a guarded /api call.
        if (!showAiPanel || aiPromptType !== "review" || !editor || offline) {
            setReviewCostLabel(null);
            return;
        }
        const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
        if (!fullText.trim()) {
            setReviewCostLabel(null);
            return;
        }
        let cancelled = false;
        api.ai
            .estimateReview(fullText)
            .then((payload) => {
                if (cancelled) return;
                const tokens = Number(payload.input_tokens || 0);
                const cost = typeof payload.cost_usd === "number" ? payload.cost_usd : null;
                const tokensLabel =
                    tokens >= 1000 ? `${Math.round(tokens / 100) / 10}k` : `${tokens}`;
                if (cost !== null) {
                    setReviewCostLabel(
                        `~${tokensLabel} ${t("ui.editor.ai_review_tokens", "tokens")}, ~$${cost.toFixed(3)}`,
                    );
                } else {
                    setReviewCostLabel(
                        `~${tokensLabel} ${t("ui.editor.ai_review_tokens", "tokens")}`,
                    );
                }
            })
            .catch(() => {
                if (!cancelled) setReviewCostLabel(null);
            });
        return () => {
            cancelled = true;
        };
    }, [showAiPanel, aiPromptType, editor, chapterId, offline, t]);

    const runReview = useCallback(async () => {
        if (!editor) return;
        const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
        if (!fullText.trim()) {
            notify.info(t("ui.editor.ai_review_empty", "Das Kapitel ist leer."));
            return;
        }
        setShowAiPanel(true);
        setAiLoading(true);
        setAiReview("");
        setAiSuggestion("");
        setReviewDownloadUrl(null);
        setReviewStatusMsg(reviewString(bookLanguage, "status_preparing"));

        // Offline (Dexie / PWA): no backend SSE pipeline. Run the review as a
        // single browser-direct completion and set the result text directly.
        // There is no downloadable artifact offline (the panel shows the text).
        if (offline) {
            setReviewStatusMsg(reviewString(bookLanguage, "status_generating"));
            try {
                const { content } = await aiComplete(
                    buildReviewMessages({
                        focus: reviewFocus,
                        chapterText: fullText,
                        chapterTitle,
                        bookTitle: bookContext?.title,
                        genre: bookContext?.genre,
                        language: bookLanguage,
                    }),
                    { maxTokens: 4096, temperature: 0.4 },
                );
                setAiReview(content);
            } catch (err) {
                if (err instanceof AiNotConfiguredError) {
                    notify.info(
                        t(
                            "ui.feature.requires_ai_key",
                            "This feature requires a configured AI key (Settings > AI Assistant)",
                        ),
                    );
                } else if (err instanceof AiClientError) {
                    const kind = classifyAiClientError(err);
                    notify.error(
                        kind === "cors"
                            ? t(
                                  "ui.settings.ai_test_browser_unsupported",
                                  "Ein Verbindungstest ist im Browser-Modus für diesen Anbieter evtl. nicht möglich. Der API-Schlüssel wird beim ersten KI-Aufruf geprüft.",
                              )
                            : t("ui.editor.ai_error", "AI nicht erreichbar"),
                        err,
                    );
                } else {
                    notify.error(t("ui.editor.ai_error", "AI nicht erreichbar"), err);
                }
            } finally {
                setAiLoading(false);
                setReviewStatusMsg(null);
            }
            return;
        }

        let jobId: string | null = null;
        try {
            const submitted = await api.ai.reviewAsync({
                content: fullText,
                chapter_id: chapterId || "",
                chapter_title: chapterTitle || "",
                chapter_type: chapterType,
                book_title: bookContext?.title || "",
                genre: bookContext?.genre || "",
                language: bookLanguage,
                focus: [reviewFocus],
                book_id: bookId || "",
            });
            jobId = submitted.job_id;
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : null;
            notify.error(detail || t("ui.editor.ai_error", "AI nicht erreichbar"), err);
            setAiLoading(false);
            setReviewStatusMsg(null);
            return;
        }

        // Close any previous stream before opening a new one.
        if (reviewEventSource.current) {
            reviewEventSource.current.close();
        }
        const es = new EventSource(`/api/ai/jobs/${jobId}/stream`);
        reviewEventSource.current = es;
        es.onmessage = (ev) => {
            try {
                const parsed = JSON.parse(ev.data) as {
                    type: string;
                    data: Record<string, unknown>;
                };
                if (parsed.type === "review_start") {
                    setReviewStatusMsg(reviewString(bookLanguage, "status_analyzing"));
                } else if (parsed.type === "review_llm_call") {
                    setReviewStatusMsg(reviewString(bookLanguage, "status_generating"));
                } else if (parsed.type === "review_done") {
                    const url =
                        typeof parsed.data.download_url === "string"
                            ? parsed.data.download_url
                            : null;
                    setReviewDownloadUrl(url);
                } else if (parsed.type === "stream_end") {
                    es.close();
                    reviewEventSource.current = null;
                    setAiLoading(false);
                    setReviewStatusMsg(null);
                    // Pull the final result from the poll endpoint.
                    if (jobId) {
                        api.ai
                            .getJob(jobId)
                            .then((payload) => {
                                if (payload?.result?.review) {
                                    setAiReview(payload.result.review);
                                }
                            })
                            .catch(() => {
                                notify.error(t("ui.editor.ai_error", "AI nicht erreichbar"));
                            });
                    }
                }
            } catch {
                // Malformed event - ignore.
            }
        };
        es.onerror = () => {
            es.close();
            reviewEventSource.current = null;
            setAiLoading(false);
            setReviewStatusMsg(null);
            notify.error(t("ui.editor.ai_error", "AI nicht erreichbar"));
        };
    }, [
        editor,
        offline,
        chapterId,
        chapterTitle,
        chapterType,
        bookId,
        bookContext,
        bookLanguage,
        reviewFocus,
        setShowAiPanel,
        setAiLoading,
        setAiReview,
        setAiSuggestion,
        t,
    ]);

    return {
        reviewFocus,
        setReviewFocus,
        reviewDownloadUrl,
        setReviewDownloadUrl,
        reviewStatusMsg,
        reviewCostLabel,
        runReview,
        cleanup,
    };
}

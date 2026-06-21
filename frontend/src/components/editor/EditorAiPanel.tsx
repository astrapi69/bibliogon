import { reviewString, NON_PROSE_CHAPTER_TYPES } from "../../data/ai-review-strings";
import { type FixIssueType } from "../../data/fix-issue-prompts";
import styles from "../Editor.module.css";

type Translator = (key: string, fallback: string) => string;

export type AiPromptType = "improve" | "shorten" | "expand" | "custom" | "review" | "fix_issue";

type ReviewFocus = "style" | "consistency" | "beta_reader";

interface ActiveIssue {
    type: FixIssueType;
    offset: number;
    length: number;
}

const ISSUE_TYPE_LABELS: Record<FixIssueType, (t: Translator) => string> = {
    passive_voice: (t) => t("ui.editor.ai_fix_issue_label_passive", "Passiv"),
    adverb: (t) => t("ui.editor.ai_fix_issue_label_adverb", "Adverb"),
    filler_word: (t) => t("ui.editor.ai_fix_issue_label_filler", "Fuellwort"),
    long_sentence: (t) => t("ui.editor.ai_fix_issue_label_long", "Langer Satz"),
};

export interface EditorAiPanelProps {
    t: Translator;
    activeIssue: ActiveIssue | null;
    aiPromptType: AiPromptType;
    setAiPromptType: (type: AiPromptType) => void;
    setAiSuggestion: (value: string) => void;
    setAiReview: (value: string) => void;
    setShowAiPanel: (open: boolean) => void;
    aiCustomPrompt: string;
    setAiCustomPrompt: (value: string) => void;
    reviewFocus: ReviewFocus;
    setReviewFocus: (focus: ReviewFocus) => void;
    aiLoading: boolean;
    chapterType: string;
    bookLanguage: string;
    onRunReview: () => void;
    aiGenDisabled: boolean;
    aiGenTitle?: string;
    reviewStatusMsg: string | null;
    reviewCostLabel: string | null;
    aiReview: string;
    reviewDownloadUrl: string | null;
    setReviewDownloadUrl: (value: string | null) => void;
    onRunSuggest: () => void;
    aiSuggestion: string;
    onApplySuggestion: () => void;
}

/**
 * Presentational AI-assistant panel for the chapter editor.
 *
 * Renders the prompt-type tab strip (improve/shorten/expand/custom/
 * review + the conditional fix-issue tab), the full-chapter review
 * sub-panel (focus radio group + run button + cost label + result +
 * download), and the selection-rewrite sub-panel (custom prompt input
 * + suggest button + apply/discard). All state lives in the parent
 * Editor; this component only reads it and invokes the passed
 * handlers/setters.
 */
export default function EditorAiPanel(props: EditorAiPanelProps) {
    const {
        t,
        activeIssue,
        aiPromptType,
        setAiPromptType,
        setAiSuggestion,
        setAiReview,
        setShowAiPanel,
        aiCustomPrompt,
        setAiCustomPrompt,
        reviewFocus,
        setReviewFocus,
        aiLoading,
        chapterType,
        bookLanguage,
        onRunReview,
        aiGenDisabled,
        aiGenTitle,
        reviewStatusMsg,
        reviewCostLabel,
        aiReview,
        reviewDownloadUrl,
        setReviewDownloadUrl,
        onRunSuggest,
        aiSuggestion,
        onApplySuggestion,
    } = props;

    return (
        <div className={styles.aiPanel}>
            <div className={styles.aiHeader}>
                <strong>{t("ui.editor.ai_assistant", "AI-Assistent")}</strong>
                <div
                    style={{
                        display: "flex",
                        gap: 4,
                        marginLeft: "auto",
                        flexWrap: "wrap",
                    }}
                >
                    {activeIssue && (
                        <button
                            key="fix_issue"
                            data-testid="ai-fix-issue-mode"
                            className={`btn btn-sm ${aiPromptType === "fix_issue" ? "btn-primary" : "btn-ghost"}`}
                            onClick={() => {
                                setAiPromptType("fix_issue");
                                setAiSuggestion("");
                                setAiReview("");
                            }}
                            style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                        >
                            {t("ui.editor.ai_fix_issue", "Problem beheben")}
                        </button>
                    )}
                    {(["improve", "shorten", "expand", "custom", "review"] as const).map((type) => (
                        <button
                            key={type}
                            className={`btn btn-sm ${aiPromptType === type ? "btn-primary" : "btn-ghost"}`}
                            onClick={() => {
                                setAiPromptType(type);
                                setAiSuggestion("");
                                setAiReview("");
                            }}
                            style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                        >
                            {type === "improve"
                                ? t("ui.editor.ai_improve", "Verbessern")
                                : type === "shorten"
                                  ? t("ui.editor.ai_shorten", "Kürzen")
                                  : type === "expand"
                                    ? t("ui.editor.ai_expand", "Erweitern")
                                    : type === "custom"
                                      ? t("ui.editor.ai_custom", "Eigener Prompt")
                                      : t("ui.editor.ai_review", "Review")}
                        </button>
                    ))}
                </div>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                        setShowAiPanel(false);
                        setAiReview("");
                    }}
                >
                    &times;
                </button>
            </div>
            {aiPromptType === "custom" && (
                <input
                    className="input"
                    style={{
                        margin: "6px 16px",
                        width: "calc(100% - 32px)",
                        fontSize: "0.8125rem",
                    }}
                    placeholder={t(
                        "ui.editor.ai_custom_placeholder",
                        "z.B. Mache den Ton formeller...",
                    )}
                    value={aiCustomPrompt}
                    onChange={(e) => setAiCustomPrompt(e.target.value)}
                />
            )}
            {aiPromptType === "review" ? (
                <>
                    <div style={{ padding: "4px 16px" }}>
                        <small style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                            {t(
                                "ui.editor.ai_review_hint",
                                "Analysiert das gesamte Kapitel auf Stil, Kohaerenz und Pacing.",
                            )}
                        </small>
                    </div>
                    <div
                        role="radiogroup"
                        aria-label={t("ui.editor.ai_review_focus", "Review-Fokus")}
                        style={{
                            padding: "4px 16px",
                            display: "flex",
                            gap: 12,
                            flexWrap: "wrap",
                        }}
                    >
                        {(["style", "consistency", "beta_reader"] as const).map((value) => (
                            <label
                                key={value}
                                data-testid={`ai-review-focus-${value}`}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    fontSize: "0.8125rem",
                                    cursor: "pointer",
                                }}
                            >
                                <input
                                    type="radio"
                                    name="ai-review-focus"
                                    value={value}
                                    checked={reviewFocus === value}
                                    onChange={() => setReviewFocus(value)}
                                    disabled={aiLoading}
                                />
                                {value === "style"
                                    ? t("ui.editor.ai_review_focus_style", "Stil")
                                    : value === "consistency"
                                      ? t("ui.editor.ai_review_focus_consistency", "Konsistenz")
                                      : t("ui.editor.ai_review_focus_beta_reader", "Testleser")}
                            </label>
                        ))}
                    </div>
                    {NON_PROSE_CHAPTER_TYPES.has(chapterType) && (
                        <div
                            data-testid="ai-review-non-prose-warning"
                            style={{
                                padding: "4px 16px",
                                fontSize: "0.75rem",
                                color: "var(--warning, var(--text-muted))",
                            }}
                        >
                            {reviewString(bookLanguage, "non_prose_warning")}
                        </div>
                    )}
                    <div
                        style={{
                            padding: "6px 16px",
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                        }}
                    >
                        <button
                            data-testid="ai-review-start"
                            className="btn btn-primary btn-sm"
                            onClick={onRunReview}
                            disabled={aiLoading || aiGenDisabled}
                            title={aiGenTitle}
                        >
                            {aiLoading
                                ? reviewStatusMsg || t("ui.editor.ai_loading", "Denke nach...")
                                : t("ui.editor.ai_review_start", "Kapitel reviewen")}
                        </button>
                        {reviewCostLabel && !aiLoading && (
                            <small
                                data-testid="ai-review-cost"
                                style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}
                            >
                                {reviewCostLabel}
                            </small>
                        )}
                    </div>
                    {aiReview && (
                        <div className={styles.aiSuggestion}>
                            <div
                                style={{
                                    fontSize: "0.8125rem",
                                    whiteSpace: "pre-wrap",
                                    color: "var(--text-primary)",
                                    lineHeight: 1.6,
                                }}
                            >
                                {aiReview}
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    marginTop: 8,
                                    flexWrap: "wrap",
                                }}
                            >
                                {reviewDownloadUrl && (
                                    <a
                                        data-testid="ai-review-download"
                                        className="btn btn-ghost btn-sm"
                                        href={reviewDownloadUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download
                                    >
                                        {t("ui.editor.ai_review_download", "Bericht herunterladen")}
                                    </a>
                                )}
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => {
                                        setAiReview("");
                                        setReviewDownloadUrl(null);
                                    }}
                                >
                                    {t("ui.editor.ai_review_close", "Schließen")}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <>
                    {aiPromptType === "fix_issue" && activeIssue && (
                        <div data-testid="ai-fix-issue-hint" style={{ padding: "4px 16px" }}>
                            <small style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                                {t(
                                    "ui.editor.ai_fix_issue_hint",
                                    "AI formuliert den markierten Satz um.",
                                )}{" "}
                                ({ISSUE_TYPE_LABELS[activeIssue.type](t)})
                            </small>
                        </div>
                    )}
                    <div style={{ padding: "6px 16px", display: "flex", gap: 8 }}>
                        <button
                            data-testid={aiPromptType === "fix_issue" ? "ai-fix-issue-run" : undefined}
                            className="btn btn-primary btn-sm"
                            onClick={onRunSuggest}
                            disabled={
                                aiLoading ||
                                aiGenDisabled ||
                                (aiPromptType === "fix_issue" && !activeIssue)
                            }
                            title={aiGenTitle}
                        >
                            {aiLoading
                                ? aiPromptType === "fix_issue" && activeIssue
                                    ? t("ui.editor.ai_fix_issue_loading", "AI arbeitet am Satz...")
                                    : t("ui.editor.ai_loading", "Denke nach...")
                                : aiPromptType === "fix_issue"
                                  ? t("ui.editor.ai_fix_issue_run", "Vorschlag generieren")
                                  : t("ui.editor.ai_suggest", "Vorschlag generieren")}
                        </button>
                    </div>
                    {aiSuggestion && (
                        <div className={styles.aiSuggestion}>
                            <div
                                style={{
                                    fontSize: "0.8125rem",
                                    whiteSpace: "pre-wrap",
                                    color: "var(--text-primary)",
                                }}
                            >
                                {aiSuggestion}
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                <button className="btn btn-primary btn-sm" onClick={onApplySuggestion}>
                                    {t("ui.editor.ai_apply", "Übernehmen")}
                                </button>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setAiSuggestion("")}
                                >
                                    {t("ui.editor.ai_discard", "Verwerfen")}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/**
 * Universal textarea wrapper with a small toolbar.
 *
 * Reuses the toolbar pattern from ``HtmlFieldWithPreview``
 * (BookMetadataEditor.tsx) so callers across the app converge on
 * one component. Strategy A from
 * ``docs/explorations/textarea-improvements.md``: zero new
 * dependencies; native clipboard, native ResizeObserver-driven
 * autosize, the existing ``CharCounter`` lifted in.
 *
 * Phase 2 ships the plain wrapper + copy + word/char count +
 * autosize. Phases 3-5 layer on:
 *  - ``language="css"``: lowlight-powered read-only preview tab.
 *  - ``language="markdown"``: react-markdown preview tab.
 *  - ``language="html"``: dompurify-sanitized preview tab.
 *
 * The ``language`` and preview-related props are present in the
 * type but inert until phases 3-4 land. Callers can already wire
 * the prop without code churn later.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import { copyToClipboard } from "../../utils/clipboard";
import { CssPreview } from "./CssPreview";

export type TextareaLanguage = "plain" | "markdown" | "html" | "css";

export interface EnhancedTextareaProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;

    /** Language tag drives Phase 3-4 preview rendering. ``plain``
     * disables preview-tab UI entirely. */
    language?: TextareaLanguage;

    /** Toolbar: copy button. Default ``true``. */
    copy?: boolean;
    /** Footer: word count. Default ``true`` for editable, ``false``
     * for read-only. */
    wordCount?: boolean;
    /** Footer: char count. Default ``true``. */
    charCount?: boolean;
    /** Resize textarea to fit content (capped at viewport / 2).
     * Default ``true``. */
    autosize?: boolean;
    /** Soft character limit. Counter goes red over the threshold;
     * input is NOT capped. */
    maxChars?: number;

    /** ARIA label fallback when no visible label is associated. */
    ariaLabel?: string;
    /** Render hint for the unstyled HTML; tests + screen readers
     * use this. */
    testid?: string;

    /** Initial textarea height in rows. Autosize takes over after
     * mount when content exceeds this. */
    rows?: number;
    /** Force monospaced font. Sensible default for ``css``,
     * ``html``; auto-on when ``language`` says so. */
    mono?: boolean;
}

export function EnhancedTextarea({
    value,
    onChange,
    placeholder,
    disabled = false,
    readOnly = false,
    language = "plain",
    copy = true,
    wordCount,
    charCount = true,
    autosize = true,
    maxChars,
    ariaLabel,
    testid,
    rows = 4,
    mono,
}: EnhancedTextareaProps) {
    const { t } = useI18n();
    const ref = useRef<HTMLTextAreaElement>(null);
    const fallbackId = useId();
    const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">(
        "idle",
    );
    const copyTimerRef = useRef<number | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const previewable = language === "css";

    const isMono =
        mono ?? (language === "css" || language === "html");
    const showWordCount = wordCount ?? !readOnly;

    // Autosize: keep textarea height in sync with content. Capped
    // at half the viewport so a giant paste doesn't push the dialog
    // off-screen. ResizeObserver isn't needed; React re-renders on
    // every keystroke and we sync from the value-change effect.
    useEffect(() => {
        if (!autosize) return;
        const el = ref.current;
        if (!el) return;
        el.style.height = "auto";
        const max = Math.floor(window.innerHeight / 2);
        el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    }, [value, autosize]);

    useEffect(
        () => () => {
            if (copyTimerRef.current !== null) {
                window.clearTimeout(copyTimerRef.current);
            }
        },
        [],
    );

    const handleCopy = async () => {
        const ok = await copyToClipboard(value);
        setCopyState(ok ? "ok" : "fail");
        if (copyTimerRef.current !== null) {
            window.clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = window.setTimeout(() => {
            setCopyState("idle");
            copyTimerRef.current = null;
        }, 1500);
    };

    const wordCountValue = countWords(value);
    const charCountValue = value.length;
    const charOver = maxChars !== undefined && charCountValue > maxChars;

    return (
        <div
            data-testid={testid ? `${testid}-wrapper` : undefined}
            data-language={language}
            style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
            {(copy || previewable) && (
                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 6,
                    }}
                >
                    {previewable && value.trim().length > 0 && (
                        <button
                            type="button"
                            onClick={() => setShowPreview((prev) => !prev)}
                            data-testid={
                                testid
                                    ? `${testid}-preview-toggle`
                                    : "textarea-preview-toggle"
                            }
                            aria-pressed={showPreview}
                            aria-label={
                                showPreview
                                    ? t(
                                          "ui.textarea.hide_preview",
                                          "Vorschau ausblenden",
                                      )
                                    : t(
                                          "ui.textarea.show_preview",
                                          "Vorschau anzeigen",
                                      )
                            }
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 8px",
                                fontSize: "0.75rem",
                                border: "1px solid var(--border)",
                                borderRadius: 4,
                                background: showPreview
                                    ? "var(--bg-hover)"
                                    : "var(--bg-card)",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                            }}
                        >
                            {showPreview ? (
                                <EyeOff size={12} />
                            ) : (
                                <Eye size={12} />
                            )}
                            {showPreview
                                ? t(
                                      "ui.textarea.hide_preview",
                                      "Vorschau ausblenden",
                                  )
                                : t(
                                      "ui.textarea.show_preview",
                                      "Vorschau anzeigen",
                                  )}
                        </button>
                    )}
                    {copy && (
                    <button
                        type="button"
                        onClick={handleCopy}
                        disabled={disabled || value.length === 0}
                        data-testid={
                            testid ? `${testid}-copy` : "textarea-copy"
                        }
                        aria-label={t(
                            "ui.textarea.copy",
                            "In Zwischenablage kopieren",
                        )}
                        title={t(
                            "ui.textarea.copy",
                            "In Zwischenablage kopieren",
                        )}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            fontSize: "0.75rem",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            background:
                                copyState === "ok"
                                    ? "var(--success-bg, var(--bg-hover))"
                                    : "var(--bg-card)",
                            color: "var(--text-secondary)",
                            cursor:
                                disabled || value.length === 0
                                    ? "not-allowed"
                                    : "pointer",
                            opacity:
                                disabled || value.length === 0 ? 0.5 : 1,
                        }}
                    >
                        {copyState === "ok" ? (
                            <Check size={12} />
                        ) : (
                            <Copy size={12} />
                        )}
                        {copyState === "ok"
                            ? t("ui.textarea.copy_success", "Kopiert!")
                            : copyState === "fail"
                              ? t(
                                    "ui.textarea.copy_failed",
                                    "Kopieren fehlgeschlagen",
                                )
                              : t("ui.textarea.copy", "Kopieren")}
                    </button>
                    )}
                </div>
            )}
            {previewable && showPreview && <CssPreview value={value} />}
            <textarea
                ref={ref}
                id={fallbackId}
                className="input"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                readOnly={readOnly}
                rows={rows}
                aria-label={ariaLabel}
                data-testid={testid}
                style={{
                    width: "100%",
                    padding: "6px 8px",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    fontFamily: isMono
                        ? "var(--font-mono)"
                        : undefined,
                    fontSize: isMono ? "0.8125rem" : "0.875rem",
                    resize: autosize ? "none" : "vertical",
                    overflow: "auto",
                    minHeight: 60,
                }}
            />
            {(showWordCount || charCount || maxChars !== undefined) && (
                <div
                    data-testid={
                        testid ? `${testid}-footer` : "textarea-footer"
                    }
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        fontSize: "0.6875rem",
                        color: charOver
                            ? "var(--danger)"
                            : "var(--text-muted)",
                    }}
                >
                    <span>
                        {showWordCount
                            ? `${t(
                                  "ui.textarea.words",
                                  "Wörter",
                              )}: ${wordCountValue}`
                            : ""}
                    </span>
                    <span data-testid={
                        testid ? `${testid}-char-count` : "textarea-char-count"
                    }>
                        {charCount && maxChars !== undefined
                            ? `${charCountValue} / ${maxChars}`
                            : charCount
                              ? `${charCountValue} ${t(
                                    "ui.textarea.characters",
                                    "Zeichen",
                                )}`
                              : ""}
                    </span>
                </div>
            )}
        </div>
    );
}

/** Word counter that mirrors `editor.storage.characterCount`'s
 * notion of words: split on whitespace, drop empties. Stable
 * across DE/EN punctuation; multi-byte CJK falls back to
 * character-grouped counts which is the same behaviour the
 * chapter editor surfaces today. */
function countWords(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
}

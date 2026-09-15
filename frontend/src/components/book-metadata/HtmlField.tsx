import { useState } from "react";
import DOMPurify from "dompurify";
import { Sparkles } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import { looksLikeHtml } from "../../lib/utils/contentShape";
import { markdownToHtml } from "../../lib/utils/markdownToHtml";
import styles from "../BookMetadataEditor.module.css";

function CharCounter({ count, max, label }: { count: number; max: number; label: string }) {
    const over = count > max;
    return (
        <small
            style={{
                display: "block",
                marginTop: 4,
                fontSize: "0.75rem",
                color: over ? "var(--danger)" : "var(--text-muted)",
                fontWeight: over ? 600 : 400,
                textAlign: "right",
            }}
        >
            {count} / {max} {label}
        </small>
    );
}

/** Amazon KDP allows only a limited subset of HTML tags. */
const AMAZON_ALLOWED_TAGS = [
    "b",
    "strong",
    "i",
    "em",
    "u",
    "ul",
    "ol",
    "li",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
];

/** Sanitize HTML to only Amazon-compatible tags. */
export function sanitizeAmazonHtml(html: string): string {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: AMAZON_ALLOWED_TAGS, ALLOWED_ATTR: [] });
}

/**
 * Render a marketing field's stored value as sanitized preview HTML.
 *
 * The three fields sharing this component hold either shape (#814):
 * `html_description` arrives from a `.html` sidecar, the two backpage
 * fields from `.md` sidecars stored verbatim, and the user can paste
 * either into any of them. Detection therefore happens per value, not
 * per field, and stays the permanent contract rather than being fixed
 * at import time - the textarea in this very component writes raw user
 * input back, so any import-time normalisation is one edit away from
 * being wrong again. `EnhancedTextarea`'s explicit `language` prop is
 * the right answer where the caller knows the shape; here it does not.
 *
 * Markdown headings above h3 do not survive the Amazon tag allowlist,
 * so `# Titel` previews as unformatted text. That is honest: the
 * allowlist is what KDP accepts, and showing the heading styled would
 * promise formatting the store will not render.
 */
export function renderFieldPreview(value: string): string {
    const html = looksLikeHtml(value) ? value : markdownToHtml(value);
    return sanitizeAmazonHtml(html);
}

/** Integrated HTML field: toggle between editable textarea and sanitized preview. */
export function HtmlFieldWithPreview({
    label,
    value,
    onChange,
    maxChars,
    rows = 8,
    aiButton,
}: {
    label: string;
    value: string | null | undefined;
    onChange: (v: string) => void;
    maxChars?: number;
    rows?: number;
    aiButton?: { loading: boolean; onClick: () => void; label: string };
}) {
    const { t } = useI18n();
    const [showPreview, setShowPreview] = useState(false);
    const text = value || "";

    return (
        <div className="field" style={{ flex: 1 }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                }}
            >
                <label className="label" style={{ marginBottom: 0 }}>
                    {label}
                </label>
                <div style={{ display: "flex", gap: 4 }}>
                    {aiButton && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={aiButton.loading}
                            onClick={aiButton.onClick}
                            style={{
                                fontSize: "0.75rem",
                                padding: "2px 8px",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                            }}
                        >
                            <Sparkles size={12} />
                            {aiButton.label}
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowPreview((s) => !s)}
                        data-testid="html-preview-toggle"
                        style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                    >
                        {showPreview
                            ? t("ui.metadata.html_field_show_source", "HTML anzeigen")
                            : t("ui.metadata.html_field_show_preview", "Vorschau anzeigen")}
                    </button>
                </div>
            </div>
            {showPreview ? (
                <div
                    className={`input ${styles.multilineInput}`}
                    style={{
                        minHeight: rows * 24,
                        padding: "12px 16px",
                        fontSize: "0.875rem",
                        lineHeight: 1.6,
                        overflow: "auto",
                    }}
                    data-testid="html-field-preview"
                    dangerouslySetInnerHTML={{ __html: renderFieldPreview(text) }}
                />
            ) : (
                <textarea
                    className={`input ${styles.multilineInput}`}
                    style={{ maxWidth: "100%" }}
                    rows={rows}
                    value={text}
                    onChange={(e) => onChange(e.target.value)}
                />
            )}
            {maxChars !== undefined && !showPreview && (
                <CharCounter
                    count={text.length}
                    max={maxChars}
                    label={t("ui.metadata.characters", "Zeichen")}
                />
            )}
        </div>
    );
}

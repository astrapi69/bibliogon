import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import { looksLikeHtml } from "../../lib/utils/content/contentShape";
import { kdpRejectedTags, toKdpHtml } from "../../lib/utils/content/kdpHtml";
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

/**
 * Sanitize HTML to what Amazon KDP accepts in a description (#1119):
 * `strong` and `h1`-`h3` become their accepted equivalents, every other
 * unsupported tag is dropped with its text kept.
 */
export function sanitizeAmazonHtml(html: string): string {
    return toKdpHtml(html);
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
 * The preview shows what KDP accepts: a Markdown `# Titel` or an HTML
 * `h1`-`h3` previews as `h4`, `**fett**` or `strong` as `b` (#1119).
 */
export function renderFieldPreview(value: string): string {
    return sanitizeAmazonHtml(fieldHtml(value));
}

/** A field value as HTML, whichever shape it was stored in. */
function fieldHtml(value: string): string {
    return looksLikeHtml(value) ? value : markdownToHtml(value);
}

/**
 * Names the tags in the stored HTML that KDP rejects and offers to
 * rewrite the value into what KDP accepts. The textarea holds what the
 * author pastes into KDP, so a preview that looks right is not enough.
 */
function KdpTagWarning({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const { t } = useI18n();
    const rejected = looksLikeHtml(value) ? kdpRejectedTags(value) : [];
    if (rejected.length === 0) return null;
    return (
        <div
            role="status"
            data-testid="kdp-tag-warning"
            className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--danger)]"
        >
            <span>
                {t(
                    "ui.metadata.kdp_rejected_tags",
                    "KDP lehnt die Beschreibung mit diesen Tags ab: {tags}",
                ).replace("{tags}", rejected.join(", "))}
            </span>
            <button
                type="button"
                className="btn btn-ghost btn-sm min-h-11"
                data-testid="kdp-tag-fix"
                onClick={() => onChange(toKdpHtml(value))}
            >
                {t("ui.metadata.kdp_fix_tags", "Für KDP umwandeln")}
            </button>
        </div>
    );
}

/** Integrated HTML field: toggle between editable textarea and sanitized preview. */
export function HtmlFieldWithPreview({
    label,
    value,
    onChange,
    maxChars,
    rows = 8,
    aiButton,
    kdpCheck = false,
}: {
    label: string;
    value: string | null | undefined;
    onChange: (v: string) => void;
    maxChars?: number;
    rows?: number;
    aiButton?: { loading: boolean; onClick: () => void; label: string };
    /** Warn about tags KDP rejects (the Amazon description field only). */
    kdpCheck?: boolean;
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
            {kdpCheck && <KdpTagWarning value={text} onChange={onChange} />}
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

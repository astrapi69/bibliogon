/**
 * Read-only Markdown preview pane.
 *
 * Reuses ``react-markdown`` (already on the bundle for the help
 * docs surface). GFM extension is on; rehype-slug /
 * rehype-autolink-headings stay off here — preview-pane
 * anchor links would jump the dialog and we don't want that.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownPreview({ value }: { value: string }) {
    if (!value.trim()) {
        return null;
    }
    return (
        <div
            data-testid="textarea-markdown-preview"
            style={{
                margin: 0,
                padding: "8px 12px",
                background: "var(--bg-secondary, var(--bg-card))",
                border: "1px solid var(--border)",
                borderRadius: 4,
                fontSize: "0.875rem",
                lineHeight: 1.5,
                overflow: "auto",
                maxHeight: "50vh",
            }}
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
        </div>
    );
}

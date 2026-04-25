/**
 * Read-only HTML preview pane with DOMPurify sanitization.
 *
 * Reuses the ``dompurify`` dependency that ``BookMetadataEditor``
 * already pulls in for ``sanitizeAmazonHtml``. The pane is inert
 * — no scripts, no event handlers — so XSS-shaped input renders
 * as inert markup or nothing at all.
 *
 * For Amazon-specific tag-allowlist semantics use the existing
 * ``HtmlFieldWithPreview`` in ``BookMetadataEditor.tsx``. This
 * preview is a more permissive default: any DOMPurify-safe HTML
 * is rendered, suitable for the ``language="html"`` callers that
 * just want a sanity check on their markup.
 */

import DOMPurify from "dompurify";

export function HtmlPreview({ value }: { value: string }) {
    if (!value.trim()) {
        return null;
    }
    const safe = DOMPurify.sanitize(value, {
        // Strip everything that can run JavaScript. The default
        // DOMPurify config already does this; the explicit forbid
        // list documents intent for future readers.
        FORBID_TAGS: ["script", "iframe", "object", "embed"],
        FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover"],
    });
    return (
        <div
            data-testid="textarea-html-preview"
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
            dangerouslySetInnerHTML={{ __html: safe }}
        />
    );
}

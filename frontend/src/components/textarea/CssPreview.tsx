/**
 * Read-only CSS preview pane backed by lowlight.
 *
 * lowlight is already in the bundle via
 * ``@tiptap/extension-code-block-lowlight`` (chapter editor).
 * Adding a CSS-only `<pre><code>` preview to the metadata editor
 * costs nothing extra at the dependency level.
 *
 * Strategy A from textarea-improvements.md keeps editing in a
 * plain textarea and shows the highlighted version on a toggle.
 * Bibliogon's audience (publishers, not developers) edits CSS
 * once per book; the syntax tree is more useful as a sanity
 * check than as a full IDE.
 */

import { Fragment } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { createLowlight } from "lowlight";
import css from "highlight.js/lib/languages/css";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";

const lowlight = createLowlight();
lowlight.register("css", css);

export function CssPreview({ value }: { value: string }) {
    if (!value.trim()) {
        return null;
    }
    const tree = lowlight.highlight("css", value);
    const node = toJsxRuntime(tree, {
        Fragment,
        jsx: jsx as never,
        jsxs: jsxs as never,
    });
    return (
        <pre
            data-testid="textarea-css-preview"
            style={{
                margin: 0,
                padding: "8px 10px",
                background: "var(--bg-secondary, var(--bg-card))",
                border: "1px solid var(--border)",
                borderRadius: 4,
                fontFamily: "var(--font-mono)",
                fontSize: "0.8125rem",
                lineHeight: 1.5,
                overflow: "auto",
                maxHeight: "50vh",
            }}
        >
            <code className="language-css">{node}</code>
        </pre>
    );
}

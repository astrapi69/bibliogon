import type {CSSProperties} from "react"

/**
 * Shared inline style for native ``<select>`` dropdowns in the
 * comic-book editor header. Both header dropdowns MUST render
 * identically (adjudicated 2026-05-30):
 *
 * - ``ComicGridTemplatePicker`` (the Layout picker)
 * - ``PdfExportControls`` format dropdown in ``compact`` mode
 *
 * Extracted here so the two stay in lock-step — a change to the
 * header dropdown look happens in ONE place. Uses semantic theme
 * tokens only (no hardcoded hex), so it themes correctly across
 * all 12 variants. The explicit ``color`` is what fixed the
 * dark-mode readability bug (a native select with a background but
 * no color rendered default black text on the dark ``--bg-card``).
 *
 * Token note: the canonical surface token is ``--bg-card`` (there
 * is no ``--bg-surface``) and the border token is ``--border``
 * (there is no ``--border-primary``); both are defined in every
 * palette in ``global.css``.
 */
export const COMIC_HEADER_SELECT_STYLE: CSSProperties = {
    padding: "4px 8px",
    border: "1px solid var(--border)",
    borderRadius: 4,
    background: "var(--bg-card)",
    color: "var(--text-primary)",
    fontSize: "0.85rem",
}

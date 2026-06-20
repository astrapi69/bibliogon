import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { useIsMobile } from "../../hooks/ui/useIsMobile";
import styles from "../CollapsibleToolbar.module.css";

interface CollapsibleToolbarProps {
    /** The toolbar content (a flex-wrapping row of buttons). */
    children: ReactNode;
    /** Accessible label for the toggle when the toolbar is collapsed. */
    expandLabel: string;
    /** Accessible label for the toggle when the toolbar is expanded. */
    collapseLabel: string;
    /** Viewport width (px) below which the toolbar collapses. Default 768. */
    breakpoint?: number;
}

/**
 * Wraps an editor toolbar so it collapses to a single row on narrow viewports.
 *
 * Below `breakpoint` the toolbar starts collapsed (one row visible) with a
 * full-width toggle bar beneath it; tapping the toggle reveals the remaining
 * rows with a smooth `max-height` transition. At or above the breakpoint the
 * toolbar is always fully expanded and no toggle is rendered. The toggle bar
 * sits below the clipped content rather than overlapping it, so it never
 * covers a button.
 *
 * @example
 * <CollapsibleToolbar expandLabel={t("ui.toolbar.expand_toolbar")} collapseLabel={t("ui.toolbar.collapse_toolbar")}>
 *   <div className={styles.toolbar}>{buttons}</div>
 * </CollapsibleToolbar>
 */
export function CollapsibleToolbar({
    children,
    expandLabel,
    collapseLabel,
    breakpoint = 768,
}: CollapsibleToolbarProps) {
    const isMobile = useIsMobile(breakpoint);
    const [expanded, setExpanded] = useState(false);
    const open = !isMobile || expanded;

    return (
        <div
            className={styles.shell}
            data-mobile={isMobile}
            data-expanded={open}
            data-testid="collapsible-toolbar"
        >
            <div className={styles.clip} data-expanded={open}>
                {children}
            </div>
            {isMobile && (
                <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => setExpanded((prev) => !prev)}
                    aria-expanded={expanded}
                    aria-label={open ? collapseLabel : expandLabel}
                    title={open ? collapseLabel : expandLabel}
                    data-testid="toolbar-collapse-toggle"
                >
                    {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
            )}
        </div>
    );
}

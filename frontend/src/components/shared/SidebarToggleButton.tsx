/**
 * Accessible show/hide control for a collapsible editor sidebar.
 *
 * Shared by BookEditor (chapter list) and ArticleEditor (metadata
 * panel) per the Recurring-Component Unification Rule. A native
 * ``<button>`` provides focus and Enter/Space activation for free;
 * ``aria-expanded`` reflects the sidebar state and ``aria-label``
 * localises the action for screen readers. The icon flips between the
 * collapse and expand affordances.
 *
 * Layout/positioning is the caller's concern, passed via
 * ``className`` (Tailwind utilities); the visual button style reuses
 * the global ``btn-icon`` class so it themes across all variants.
 */

import {PanelLeftClose, PanelLeftOpen} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";

interface SidebarToggleButtonProps {
    /** Current sidebar state. Drives the icon and ``aria-expanded``. */
    open: boolean;
    /** Flip the sidebar open/collapsed. */
    onToggle: () => void;
    /** Extra classes for positioning (e.g. fixed-corner placement). */
    className?: string;
    /** Optional test id for the rendered button. */
    testId?: string;
}

export function SidebarToggleButton({
    open,
    onToggle,
    className = "",
    testId,
}: SidebarToggleButtonProps) {
    const {t} = useI18n();
    const label = open
        ? t("ui.sidebar.collapse_sidebar", "Seitenleiste einklappen")
        : t("ui.sidebar.open_sidebar", "Seitenleiste öffnen");

    return (
        <button
            type="button"
            className={`btn-icon ${className}`.trim()}
            aria-expanded={open}
            aria-label={label}
            title={label}
            onClick={onToggle}
            data-testid={testId}
        >
            {open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
    );
}

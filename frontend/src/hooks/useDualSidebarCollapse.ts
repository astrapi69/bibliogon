/**
 * Two collapsible editor sidebars with mobile mutual-exclusion.
 *
 * Composes two {@link useSidebarCollapse} slots (left + right) for the
 * picture-book ({@link PageEditor}) and comic ({@link ComicBookEditor})
 * editors, which each have a page-list sidebar on the left and a
 * properties sidebar on the right. Each slot keeps its own
 * localStorage-persisted, viewport-aware default (expanded at/above the
 * 75rem menu breakpoint, collapsed below it).
 *
 * The only behaviour layered on top: below
 * {@link SIDEBAR_EXCLUSIVE_BREAKPOINT_PX} (768px) opening one sidebar
 * closes the other, so the canvas keeps the full width on phones where
 * two overlay panels would cover the editing area.
 */

import {useCallback} from "react";
import {useSidebarCollapse, type SidebarCollapseState} from "./useSidebarCollapse";

/** Viewport width (px) below which only one of the two sidebars may be
 *  open at a time. Matches the Tailwind `md` breakpoint. */
export const SIDEBAR_EXCLUSIVE_BREAKPOINT_PX = 768;

function isExclusiveWidth(): boolean {
    if (typeof window === "undefined") return false;
    return window.innerWidth < SIDEBAR_EXCLUSIVE_BREAKPOINT_PX;
}

export interface DualSidebarCollapse {
    left: SidebarCollapseState;
    right: SidebarCollapseState;
}

export function useDualSidebarCollapse(
    leftKey: string,
    rightKey: string,
): DualSidebarCollapse {
    const left = useSidebarCollapse(leftKey);
    const right = useSidebarCollapse(rightKey);

    const toggleLeft = useCallback(() => {
        const next = !left.open;
        left.setOpen(next);
        if (next && isExclusiveWidth()) right.setOpen(false);
    }, [left, right]);

    const toggleRight = useCallback(() => {
        const next = !right.open;
        right.setOpen(next);
        if (next && isExclusiveWidth()) left.setOpen(false);
    }, [left, right]);

    return {
        left: {...left, toggle: toggleLeft},
        right: {...right, toggle: toggleRight},
    };
}

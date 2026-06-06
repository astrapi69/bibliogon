/**
 * Persisted, viewport-aware open/collapsed state for an editor's
 * navigation sidebar (the BookEditor chapter list and the
 * ArticleEditor metadata panel).
 *
 * Persistence and the storage-key convention are delegated to
 * {@link useCollapsibleState}. The only behaviour this hook adds is
 * the first-run default: with no stored preference yet, the sidebar
 * starts expanded on wide viewports and collapsed below the ``menu``
 * breakpoint (75rem / 1200px — the same threshold the header
 * hamburger collapses at), so a narrow screen (phone, GitHub-Pages
 * PWA) opens the editor with the writing area unobstructed.
 *
 * Once the user toggles, the stored value wins on every later mount,
 * so an explicit choice survives reload regardless of viewport.
 */

import {useCallback} from "react";
import {useCollapsibleState} from "./useCollapsibleState";

/** Viewport width (px) at and above which the sidebar defaults to
 *  expanded. Mirrors the Tailwind ``menu`` breakpoint (75rem). */
export const SIDEBAR_MENU_BREAKPOINT_PX = 1200;

export interface SidebarCollapseState {
    open: boolean;
    toggle: () => void;
    setOpen: (open: boolean) => void;
}

/** Returns whether the current viewport is wide enough to default the
 *  sidebar to expanded. SSR-safe (assumes wide when ``window`` is
 *  absent, matching the desktop-first default). */
export function prefersExpandedSidebar(): boolean {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= SIDEBAR_MENU_BREAKPOINT_PX;
}

export function useSidebarCollapse(storageKey: string): SidebarCollapseState {
    const {open, onOpenChange} = useCollapsibleState(
        storageKey,
        prefersExpandedSidebar(),
    );

    const toggle = useCallback(() => onOpenChange(!open), [onOpenChange, open]);

    return {open, toggle, setOpen: onOpenChange};
}

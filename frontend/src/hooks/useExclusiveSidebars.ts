import {useCallback} from "react";
import {SIDEBAR_MOBILE_BREAKPOINT_PX} from "./useSidebarCollapse";

function isExclusiveWidth(): boolean {
    return (
        typeof window !== "undefined" && window.innerWidth < SIDEBAR_MOBILE_BREAKPOINT_PX
    );
}

/**
 * Mobile mutual-exclusion for a pair of overlay sidebars (a left panel
 * driven by {@link useSidebarCollapse} and a right panel driven by a
 * plain boolean setter).
 *
 * Below {@link SIDEBAR_MOBILE_BREAKPOINT_PX} (768px) opening one panel
 * closes the other so the canvas keeps full width on phones, mirroring
 * the picture-book / comic editors' {@link useDualSidebarCollapse}. At or
 * above the breakpoint both handlers are plain pass-throughs (the panels
 * sit side-by-side), so there is no desktop behaviour change.
 *
 * Returns wrapped handlers; the underlying state setters are unchanged.
 *
 * @param leftOpen - Current open state of the left panel.
 * @param toggleLeft - Toggles the left panel (from useSidebarCollapse).
 * @param setLeftOpen - Sets the left panel open state.
 * @param setRightOpen - Sets the right panel open state.
 *
 * @example
 * ```ts
 * const {toggleLeft, openRight} = useExclusiveSidebars(
 *     sidebarOpen, toggleSidebar, setSidebarOpen, setStoryBibleOpen,
 * );
 * // <SidebarToggleButton onToggle={toggleLeft} />
 * // onStoryBible={openRight}
 * ```
 */
export function useExclusiveSidebars(
    leftOpen: boolean,
    toggleLeft: () => void,
    setLeftOpen: (open: boolean) => void,
    setRightOpen: (open: boolean) => void,
): {toggleLeft: () => void; openRight: () => void} {
    const toggleLeftExclusive = useCallback(() => {
        const willOpen = !leftOpen;
        toggleLeft();
        if (willOpen && isExclusiveWidth()) setRightOpen(false);
    }, [leftOpen, toggleLeft, setRightOpen]);

    const openRight = useCallback(() => {
        setRightOpen(true);
        if (isExclusiveWidth()) setLeftOpen(false);
    }, [setLeftOpen, setRightOpen]);

    return {toggleLeft: toggleLeftExclusive, openRight};
}

/**
 * Dim, click-to-close backdrop for an editor's overlay sidebar on narrow
 * viewports.
 *
 * Below the `menu` breakpoint (1200px) the editor sidebars switch from
 * in-flow columns to a fixed overlay that covers the writing area. Without
 * a scrim, an open sidebar hides the editor and the user has to find the
 * collapse control to get back to writing. This renders a semi-transparent
 * backdrop over the rest of the screen while the sidebar is `open`; clicking
 * it — i.e. clicking toward the editor — closes the sidebar, the standard
 * drawer dismissal. It is `menu:hidden`, so on desktop (sidebar in-flow) it
 * never renders and the sidebar stays open on an editor click.
 *
 * Library-Grade: no app imports, own props, usable in isolation.
 *
 * @example
 * ```tsx
 * <SidebarOverlay
 *   open={sidebarOpen}
 *   onClose={() => setSidebarOpen(false)}
 *   testId="book-editor-sidebar-overlay"
 * />
 * ```
 */

export interface SidebarOverlayProps {
    /** Whether the sidebar is open (the overlay renders only when true). */
    open: boolean;
    /** Called when the backdrop is clicked — close the sidebar. */
    onClose: () => void;
    /** `data-testid` for the backdrop element. */
    testId?: string;
}

export function SidebarOverlay({ open, onClose, testId }: SidebarOverlayProps) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-[80] bg-black/40 menu:hidden"
            onClick={onClose}
            aria-hidden="true"
            data-testid={testId}
        />
    );
}

export default SidebarOverlay;

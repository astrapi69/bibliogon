import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type RefObject,
} from "react";

/** Flex `gap` (px) between the primary cluster and the collapsible cluster. */
const GAP_PX = 6;
/** Sub-pixel tolerance so fractional rounding does not flicker the boundary. */
const EPSILON_PX = 1;

export interface OverflowCollapse {
    /**
     * The action bar. Must be laid out so `clientWidth` equals the
     * AVAILABLE width, not the shrink-to-fit content width - i.e.
     * `flex: 1 1 auto; min-width: 0; overflow: hidden; position: relative`
     * with `flex-wrap: nowrap`. Otherwise the bar can never re-expand
     * because its width would track its (collapsed) content.
     */
    containerRef: RefObject<HTMLDivElement | null>;
    /** The always-visible leading cluster (never collapses, e.g. a SplitButton). */
    primaryRef: RefObject<HTMLDivElement | null>;
    /**
     * The collapsible cluster. Render it normally when `!collapsed`; when
     * `collapsed`, add the `overflow-measure-hidden` global class so it
     * stays measurable (it keeps its natural width) but leaves the flow,
     * and render the overflow trigger (hamburger) in its place.
     */
    contentRef: RefObject<HTMLDivElement | null>;
    collapsed: boolean;
}

/**
 * Content-aware overflow collapse for a horizontal action bar.
 *
 * Measures whether `[primary + content]` fit inside the container and
 * returns `collapsed` accordingly. Unlike a viewport media query, this
 * reacts to CONTENT width changes (an i18n language switch; a label whose
 * text follows a configured default type) at a FIXED viewport - the exact
 * triggers that make a `flex-wrap` bar reflow onto a second line. A
 * media-query breakpoint cannot see that the labels grew, so it would
 * still wrap; measuring actual overflow is the only correct fix.
 *
 * `deps` must include every value that changes content width without a
 * resize event firing (e.g. `[lang, primaryLabel]`).
 */
export function useOverflowCollapse(
    deps: ReadonlyArray<unknown> = [],
): OverflowCollapse {
    const containerRef = useRef<HTMLDivElement>(null);
    const primaryRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [collapsed, setCollapsed] = useState(false);

    const measure = useCallback(() => {
        const container = containerRef.current;
        const content = contentRef.current;
        if (!container || !content) return;
        // `clientWidth` is the available width because the container is
        // `flex: 1 1 auto`, so it always fills the space left by the logo.
        const available = container.clientWidth;
        // Natural widths: `content` reports its full content width whether
        // it is in flow (`!collapsed`) or out of flow via
        // `overflow-measure-hidden` (`collapsed`), so `required` does not
        // depend on the current collapse state - the toggle cannot oscillate.
        const primaryWidth =
            primaryRef.current?.getBoundingClientRect().width ?? 0;
        const contentWidth = content.getBoundingClientRect().width;
        const required =
            primaryWidth + (primaryWidth > 0 ? GAP_PX : 0) + contentWidth;
        setCollapsed(required > available + EPSILON_PX);
    }, []);

    // Re-measure before paint when a width-affecting value changes
    // (language, label). useLayoutEffect avoids a one-frame flash.
    useLayoutEffect(() => {
        measure();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [measure, ...deps]);

    // Re-measure on container resize (viewport, sidebar, fullscreen).
    useEffect(() => {
        const container = containerRef.current;
        if (!container || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => measure());
        observer.observe(container);
        return () => observer.disconnect();
    }, [measure]);

    return {containerRef, primaryRef, contentRef, collapsed};
}

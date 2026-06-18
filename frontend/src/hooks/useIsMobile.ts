import { useEffect, useState } from "react";

/**
 * Reactive viewport breakpoint check.
 *
 * Returns `true` while the viewport is narrower than `maxWidth` px (default
 * 768) and updates as the viewport crosses the boundary. Backed by
 * `matchMedia`, so it does not re-run on every resize pixel, only on the
 * boundary crossing. SSR / no-`matchMedia` environments resolve to `false`
 * (treated as desktop).
 *
 * @example
 * const isMobile = useIsMobile();       // < 768px
 * const isNarrow = useIsMobile(600);    // < 600px
 */
export function useIsMobile(maxWidth = 768): boolean {
    const query = `(max-width: ${maxWidth - 1}px)`;

    const [isMobile, setIsMobile] = useState<boolean>(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
            return false;
        }
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
            return;
        }
        const mql = window.matchMedia(query);
        const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
        setIsMobile(mql.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, [query]);

    return isMobile;
}

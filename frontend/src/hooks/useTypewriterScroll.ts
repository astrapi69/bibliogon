/**
 * Typewriter scrolling for the composition / distraction-free mode
 * (COMPOSITION-DISTRACTION-FREE-MODE-01 C2).
 *
 * When enabled, keeps the caret's line vertically centered in the
 * editor's scroll container as the user types or moves the cursor —
 * the page scrolls under a fixed writing line, the way a mechanical
 * typewriter keeps the carriage in place.
 *
 * Driven off the TipTap editor's ``selectionUpdate`` + ``update``
 * events. Recentering is rAF-throttled so a burst of keystrokes
 * collapses to one scroll per frame.
 *
 * Fail-open: every recenter is wrapped in try/catch. ``coordsAtPos``
 * can throw on a position that is briefly stale mid-transaction, and
 * the scroll container may be absent in non-browser test
 * environments. Typewriter scrolling is a convenience — a failure
 * must never break typing (per the "diagnostic features fail open"
 * rule).
 */

import {useEffect} from "react";
import type {Editor} from "@tiptap/react";

/** Walk up from ``el`` to the nearest vertically-scrollable ancestor. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
    let node = el?.parentElement ?? null;
    while (node) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") return node;
        node = node.parentElement;
    }
    return null;
}

export function useTypewriterScroll(editor: Editor | null, enabled: boolean): void {
    useEffect(() => {
        if (!editor || !enabled) return;

        let raf = 0;
        const recenter = () => {
            if (typeof requestAnimationFrame === "undefined") return;
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                try {
                    const head = editor.state.selection.head;
                    const coords = editor.view.coordsAtPos(head); // viewport coords
                    const scroller = findScrollParent(editor.view.dom as HTMLElement);
                    if (!scroller) return;
                    const rect = scroller.getBoundingClientRect();
                    const caretCenter = (coords.top + coords.bottom) / 2;
                    const containerCenter = rect.top + rect.height / 2;
                    scroller.scrollTop += caretCenter - containerCenter;
                } catch {
                    // Stale position mid-transaction, or no layout in a
                    // test environment. Fail open — never block typing.
                }
            });
        };

        editor.on("selectionUpdate", recenter);
        editor.on("update", recenter);
        recenter(); // center immediately on entering the mode

        return () => {
            if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(raf);
            editor.off("selectionUpdate", recenter);
            editor.off("update", recenter);
        };
    }, [editor, enabled]);
}

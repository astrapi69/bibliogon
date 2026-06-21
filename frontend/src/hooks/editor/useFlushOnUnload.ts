/**
 * Registers handlers for the three browser events that signal a tab
 * or page is about to go away:
 *
 *   - `beforeunload` (desktop browsers, fires on navigation/close)
 *   - `pagehide`     (the one that actually fires reliably on mobile
 *                     Safari and iOS; beforeunload does not)
 *   - `visibilitychange` with `document.hidden === true`
 *                    (backgrounding on mobile Safari is often the
 *                     only signal before iOS terminates the tab)
 *
 * The `flush` callback must be SYNCHRONOUS or fire-and-forget:
 * browsers do not allow async work in these handlers. Writes to
 * IndexedDB (Dexie) and `fetch(..., {keepalive: true})` are the two
 * patterns that survive the tab dying.
 */
import {useEffect} from "react";

export function useFlushOnUnload(flush: () => void, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;

    const onBeforeUnload = () => { flush(); };
    const onPageHide = () => { flush(); };
    const onVisibilityChange = () => {
      if (document.hidden) flush();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [flush, enabled]);
}

import {useEffect, useRef} from "react";
import {useLocation} from "react-router-dom";
import {eventRecorder} from "../utils/eventRecorder";

/**
 * Invisible component that installs global event recorders.
 *
 * Mount once at the App root. Captures:
 * - Button clicks (label + testid)
 * - Route changes (from -> to)
 * - Uncaught errors and unhandled promise rejections
 *
 * API calls and toasts are recorded by their respective modules
 * (client.ts and notify.ts) directly.
 */
export default function EventRecorderSetup() {
    const location = useLocation();
    const prevPath = useRef(location.pathname);

    // --- Click listener ---
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const button = target.closest("button") || target.closest("a[class*='btn']");
            if (!button) return;

            const text =
                button.textContent?.trim()?.substring(0, 80) ||
                button.getAttribute("aria-label") ||
                button.getAttribute("title") ||
                "";
            if (!text) return;

            eventRecorder.add({
                type: "click",
                timestamp: performance.now(),
                text,
                testId: (button as HTMLElement).dataset?.testid,
            });
        };

        document.addEventListener("click", handler, {capture: true});
        return () => document.removeEventListener("click", handler, {capture: true});
    }, []);

    // --- Navigation ---
    useEffect(() => {
        if (location.pathname !== prevPath.current) {
            eventRecorder.add({
                type: "navigation",
                timestamp: performance.now(),
                from: prevPath.current,
                to: location.pathname,
            });
            prevPath.current = location.pathname;
        }
    }, [location.pathname]);

    // --- Uncaught errors ---
    useEffect(() => {
        const onError = (e: ErrorEvent) => {
            eventRecorder.add({
                type: "uncaught_error",
                timestamp: performance.now(),
                message: e.message,
                source: e.filename,
                line: e.lineno,
            });
        };

        const onRejection = (e: PromiseRejectionEvent) => {
            eventRecorder.add({
                type: "unhandled_rejection",
                timestamp: performance.now(),
                message: String(e.reason).substring(0, 200),
            });
        };

        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onRejection);
        return () => {
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onRejection);
        };
    }, []);

    return null;
}

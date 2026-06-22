import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../../features/featureConfig";
import { eventRecorder } from "../../utils/eventRecorder/eventRecorder";
import { initEventLogPersistence } from "../../utils/eventRecorder/eventRecorderPersist";

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
 *
 * Gated on the {@link FEATURES.EVENT_RECORDING} feature (EVT-06): the recorder
 * is a declared, always-active feature rather than running ungated, so the
 * registry is the single kill-switch. While inactive it installs no listeners
 * and restores no persisted log.
 *
 * When active, on mount it also restores the persisted event log from Dexie
 * (EVT-02) so the diagnostic history survives a tab-refresh / crash, then
 * wires the recorder's flush-to-Dexie listener.
 */
export default function EventRecorderSetup() {
    const location = useLocation();
    const prevPath = useRef(location.pathname);
    const { isActive } = useFeature(FEATURES.EVENT_RECORDING);

    // --- Persistence restore + flush wiring (EVT-02) ---
    useEffect(() => {
        if (!isActive) return;
        void initEventLogPersistence();
    }, [isActive]);

    // --- Click listener ---
    useEffect(() => {
        if (!isActive) return;
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

        document.addEventListener("click", handler, { capture: true });
        return () => document.removeEventListener("click", handler, { capture: true });
    }, [isActive]);

    // --- Navigation ---
    useEffect(() => {
        if (!isActive) return;
        if (location.pathname !== prevPath.current) {
            eventRecorder.add({
                type: "navigation",
                timestamp: performance.now(),
                from: prevPath.current,
                to: location.pathname,
            });
            prevPath.current = location.pathname;
        }
    }, [isActive, location.pathname]);

    // --- Uncaught errors ---
    useEffect(() => {
        if (!isActive) return;
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
    }, [isActive]);

    return null;
}

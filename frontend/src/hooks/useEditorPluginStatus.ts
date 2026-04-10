import {useCallback, useEffect, useRef, useState} from "react";
import {api} from "../api/client";

export interface PluginStatus {
    available: boolean;
    reason: string | null;
    message?: string;
}

export type EditorPluginStatusMap = Record<string, PluginStatus>;

const POLL_INTERVAL = 30_000; // 30 seconds
const DEFAULT_STATUS: EditorPluginStatusMap = {};

/**
 * Periodically fetches the editor plugin availability status.
 *
 * Returns a map of plugin name -> {available, reason, message}.
 * Re-fetches immediately when the browser tab regains focus and
 * every 30 seconds while the component is mounted.
 */
export function useEditorPluginStatus(): {
    status: EditorPluginStatusMap;
    loading: boolean;
    refresh: () => void;
} {
    const [status, setStatus] = useState<EditorPluginStatusMap>(DEFAULT_STATUS);
    const [loading, setLoading] = useState(true);
    const timer = useRef<number | null>(null);

    const fetch_ = useCallback(async () => {
        try {
            const data = await api.editorPluginStatus();
            setStatus(data);
        } catch {
            // Endpoint missing or server down — treat everything as unavailable
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetch_();
        timer.current = window.setInterval(fetch_, POLL_INTERVAL);

        const onFocus = () => fetch_();
        window.addEventListener("focus", onFocus);

        return () => {
            if (timer.current !== null) clearInterval(timer.current);
            window.removeEventListener("focus", onFocus);
        };
    }, [fetch_]);

    return {status, loading, refresh: fetch_};
}

/** Convenience: check if a specific plugin is available. */
export function isPluginAvailable(
    status: EditorPluginStatusMap,
    name: string,
): boolean {
    return status[name]?.available ?? false;
}

/** Get the disabled tooltip message for a plugin. */
export function pluginDisabledMessage(
    status: EditorPluginStatusMap,
    name: string,
): string {
    return status[name]?.message || "Plugin nicht verfügbar";
}

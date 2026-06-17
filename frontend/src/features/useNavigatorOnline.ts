/**
 * useNavigatorOnline — reactive browser connectivity (#353).
 *
 * Tracks `navigator.onLine` and the window `online`/`offline` events. This is
 * the right signal for features that reach EXTERNAL hosts directly (GitHub
 * REST API, arbitrary URL fetch) rather than the Bibliogon backend — those
 * work in the backendless PWA whenever the browser has general connectivity,
 * regardless of whether any backend is reachable.
 */

import { useEffect, useState } from "react";

export function useNavigatorOnline(): boolean {
    const [online, setOnline] = useState<boolean>(() =>
        typeof navigator === "undefined" ? true : navigator.onLine,
    );

    useEffect(() => {
        const goOnline = () => setOnline(true);
        const goOffline = () => setOnline(false);
        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);
        setOnline(navigator.onLine);
        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);

    return online;
}

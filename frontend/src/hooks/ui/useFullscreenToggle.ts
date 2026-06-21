/**
 * Browser-native Fullscreen API toggle.
 *
 * Wraps document.documentElement.requestFullscreen() +
 * document.exitFullscreen() and keeps an isFullscreen flag in
 * sync with the browser's actual state via the
 * ``fullscreenchange`` event. The event-driven sync is the
 * load-bearing piece - the user can leave fullscreen via the
 * browser's F11 key or Escape without going through our toggle,
 * and the UI must reflect that.
 *
 * Filed under EDITOR-FULLSCREEN-NATIVE-01 (2026-05-18) per the
 * 5-editor-surfaces audit + the Recurring-Component-Unification
 * 2-surfaces threshold.
 *
 * Distinct from EnhancedTextarea's existing app-internal
 * state-CSS fullscreen pattern (see the FULLSCREEN-PATTERN-
 * RECONCILE-01 P4 backlog item). EnhancedTextarea grows its
 * own wrapper to fill its parent; this hook hides the browser
 * chrome entirely.
 *
 * Browser support: modern Chrome / Firefox / Safari / Edge. Old
 * Safari prefixed ``webkitRequestFullscreen`` is no longer
 * needed in Bibliogon's supported browsers; ``isSupported`` is
 * derived from the standard API only.
 */

import {useCallback, useEffect, useState} from "react";

interface FullscreenToggle {
    isFullscreen: boolean;
    toggle: () => Promise<void>;
    isSupported: boolean;
}

function readCurrentFullscreen(): boolean {
    if (typeof document === "undefined") return false;
    return document.fullscreenElement !== null;
}

function readSupport(): boolean {
    if (typeof document === "undefined") return false;
    return typeof document.documentElement?.requestFullscreen === "function";
}

export function useFullscreenToggle(): FullscreenToggle {
    const [isFullscreen, setIsFullscreen] = useState<boolean>(readCurrentFullscreen);
    const isSupported = readSupport();

    useEffect(() => {
        if (!isSupported) return;
        const sync = () => setIsFullscreen(readCurrentFullscreen());
        document.addEventListener("fullscreenchange", sync);
        return () => document.removeEventListener("fullscreenchange", sync);
    }, [isSupported]);

    const toggle = useCallback(async () => {
        if (!isSupported) return;
        try {
            if (document.fullscreenElement === null) {
                await document.documentElement.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch {
            // requestFullscreen() rejects when:
            //  - no recent user gesture (rare, our toggle always
            //    fires from a button click or registered keydown)
            //  - permission denied by browser policy
            //  - already in PIP mode etc.
            // Silently degrade - the fullscreenchange listener will
            // keep state honest, and the toolbar button stays
            // clickable so the user can retry.
        }
    }, [isSupported]);

    return {isFullscreen, toggle, isSupported};
}

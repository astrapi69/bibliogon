import {useI18n} from "../hooks/useI18n";
import {useStorageMode} from "./useStorageMode";

/**
 * Gate for backend-only features in offline (Dexie) storage mode.
 *
 * Some features (export/Pandoc, AI, TTS, Git, .bgb backup/import, Medium
 * import, LAN) genuinely need the backend and cannot work on the static
 * GitHub Pages PWA (no server). In Dexie mode the UI must DISABLE their
 * triggers and explain why - never fire a dead `/api` request that 404s.
 *
 * Usage:
 *   const {offline, message} = useOfflineFeatureGate();
 *   <button disabled={offline || busy} title={offline ? message : undefined}>
 *   // and guard the handler: if (offline) return;
 *
 * `offline` is true exactly when the active storage backend is Dexie
 * (the existing `useStorageMode` mechanism - no second flag). On desktop /
 * LAN-online / prod the mode is "api" and this gate is inert.
 */
export function useOfflineFeatureGate(): {offline: boolean; message: string} {
    const {mode} = useStorageMode();
    const {t} = useI18n();
    return {
        offline: mode === "dexie",
        message: t(
            "ui.feature.requires_desktop_app",
            "This feature requires the Bibliogon desktop app",
        ),
    };
}

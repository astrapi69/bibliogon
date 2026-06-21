import { useDebouncedCallback } from "../../hooks/ui/useDebouncedCallback";

/** Default debounce for settings auto-save (ms). Long enough that a burst
 *  of rapid changes (e.g. clicking five toggles) collapses into a single
 *  write + a single toast, short enough to feel immediate. */
export const SETTINGS_AUTOSAVE_DELAY_MS = 500;

/**
 * Debounced auto-save for a Settings panel.
 *
 * Returns a ``triggerSave`` to call from a panel's field ``onChange``
 * handlers right after updating local state. Consecutive calls within
 * ``delay`` ms collapse into one trailing ``onSave`` — so five quick
 * toggles persist once and toast once, not five times. ``buildData`` is
 * read at fire time (latest-callback ref), so it always reflects the
 * newest local state, not the state captured when the timer was armed.
 *
 * Auto-save is driven only by genuine user interaction (the panel calls
 * ``triggerSave`` from its change handlers). The ``config``-prop sync that
 * re-hydrates a panel after each save sets state directly without calling
 * ``triggerSave``, so there is no save-on-load or save-loop.
 *
 * @example
 * const triggerSave = useSettingsAutoSave(buildSaveData, onSave);
 * // in a field handler:
 * onChange={(v) => { setValue(v); triggerSave(); }}
 */
export function useSettingsAutoSave(
    buildData: () => Record<string, unknown>,
    onSave: (data: Record<string, unknown>) => void | Promise<void>,
    delay: number = SETTINGS_AUTOSAVE_DELAY_MS,
): () => void {
    return useDebouncedCallback(() => {
        void onSave(buildData());
    }, delay);
}

/**
 * Shared fullscreen toggle button.
 *
 * Extracted 2026-05-28 per user direction "If the button is not
 * already a shared component, extract it first" (Fullscreen
 * cross-surface parity). Replaces inline copies in PageEditor +
 * ComicBookEditor + Toolbar's optional fullscreen sub-block and
 * adds the affordance to Dashboard + ArticleList + Settings — 5
 * surface migrations + 3 new sites under one shared component
 * per the Recurring-Component-Unification Rule.
 *
 * Renders only when ``fullscreen.isSupported`` is true (the
 * browser exposes the Fullscreen API). Defaults to the
 * ``btn-icon`` class used by page-header icon buttons; editor
 * sites override with ``btn btn-secondary btn-sm`` to match
 * their existing visual system.
 *
 * Position convention (2026-05-28): in every header that
 * carries one, FullscreenButton mounts BEFORE the trailing
 * ThemeToggle. ThemeToggle is the LAST item per the recent
 * cross-editor parity fix.
 */
import {Maximize2, Minimize2} from "lucide-react";
import {useFullscreenToggle} from "../hooks/ui/useFullscreenToggle";
import {useI18n} from "../hooks/useI18n";

interface Props {
    /** Testid prefix. Renders as ``data-testid="{prefix}-fullscreen"``.
     *  Mirrors the per-surface testid convention already used by
     *  the existing editor inline implementations. */
    testidPrefix: string;
    /** Button CSS class. Defaults to ``btn-icon`` (page-header icon
     *  convention); editors override with
     *  ``btn btn-secondary btn-sm`` for their primary-button row
     *  styling. */
    className?: string;
    /** Lucide icon size in pixels. Defaults to 16 (matches the
     *  Toolbar's existing button size). Editors typically use 14;
     *  page-header icon rows often use 18. */
    iconSize?: number;
}

export default function FullscreenButton({
    testidPrefix,
    className = "btn-icon",
    iconSize = 16,
}: Props) {
    const {t} = useI18n();
    const fullscreen = useFullscreenToggle();

    // The Fullscreen API is not universally supported (e.g. iOS
    // Safari historically rejected document.requestFullscreen).
    // Hide the button rather than render a no-op affordance so the
    // header stays clean on unsupported browsers.
    if (!fullscreen.isSupported) return null;

    const label = fullscreen.isFullscreen
        ? t("ui.editor.exit_fullscreen", "Vollbild verlassen")
        : t("ui.editor.fullscreen", "Vollbild");

    // User direction (2026-05-28): when the user is IN fullscreen,
    // the tooltip should mention the keyboard shortcuts they can
    // use to exit — Esc (browser-driven, fires on any fullscreen
    // element) AND F11 (page-fullscreen, OS-level). Browsers do
    // NOT always render a native "Press Esc to exit" overlay
    // (Safari historically did not), so the hint surfaces inside
    // Bibliogon's own UI for discoverability. Suppressed when the
    // user is NOT in fullscreen — Esc / F11 only apply to the
    // exit path, not the enter path.
    const title = fullscreen.isFullscreen
        ? `${label} — ${t("ui.editor.fullscreen_exit_hint", "Esc oder F11 zum Beenden")}`
        : label;

    return (
        <button
            type="button"
            className={className}
            onClick={() => void fullscreen.toggle()}
            data-testid={`${testidPrefix}-fullscreen`}
            aria-pressed={fullscreen.isFullscreen ? "true" : "false"}
            aria-label={label}
            title={title}
        >
            {fullscreen.isFullscreen ? (
                <Minimize2 size={iconSize} />
            ) : (
                <Maximize2 size={iconSize} />
            )}
        </button>
    );
}

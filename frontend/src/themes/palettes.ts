/**
 * Central palette registry. Each entry maps a ``data-app-theme`` value
 * to a human-readable label rendered in Settings. Light/dark is an
 * orthogonal dimension handled by the ThemeToggle and is NOT part of
 * this registry.
 *
 * The ``id`` must match a CSS selector in ``styles/global.css`` of the
 * form ``[data-app-theme="${id}"]``. Adding a palette here without
 * adding the matching CSS block will leave the base (warm-literary)
 * variables in place and the new option will visually do nothing.
 */

export interface Palette {
    id: string;
    label: string;
}

/**
 * Labels here are English fallbacks only. Settings renders them through
 * `t("ui.themes.<id>", label)`; the YAML keys under `ui.themes.*` are
 * the localized source and take precedence.
 */
export const PALETTES: readonly Palette[] = [
    {id: "warm-literary", label: "Warm Literary"},
    {id: "cool-modern", label: "Cool Modern"},
    {id: "nord", label: "Nord"},
    {id: "classic", label: "Classic"},
    {id: "studio", label: "Studio"},
    {id: "notebook", label: "Notebook"},
];

export const DEFAULT_PALETTE = "warm-literary";

export function isKnownPalette(id: string): boolean {
    return PALETTES.some((p) => p.id === id);
}

/** Per-layout namespace utilities for ``Page.layout_config``.
 *
 * **Fix B — layout_config namespace per-layout**
 * (PICTURE-BOOK-TEXT-CONFIGURATION-01, 4c-B sub-item).
 *
 * Background: before Fix B, ``Page.layout_config`` was a single flat
 * dict that accumulated keys from EVERY layout a page had ever worn.
 * Switching speech_bubble → image_full_text_overlay → image_top
 * left ``anchor_position`` + ``opacity`` + ``text_position`` +
 * ``image_position`` all co-resident in one dict — and stale keys
 * then bled into the renderer. v0.33.1 shipped the conservative
 * **Fix A**: purge layout_config to null on every layout switch.
 * That fixed the renderer but discarded the user's per-layout config.
 *
 * **Fix B namespaces the dict by layout**:
 *
 *     {
 *         "speech_bubble": {"bubbles": [{...}]},
 *         "image_top_text_bottom": {"image_position": "...", "image_fit": "..."},
 *         "image_left_text_right": {"split_ratio": ..., "image_fit": "..."},
 *         "image_full_text_overlay": {"text_position": "...", ...},
 *     }
 *
 * Per-layout configs survive a switch + return-to-previous. Existing
 * config-body components don't change shape: the dispatcher extracts
 * the active layout's namespace via ``readLayoutNamespace`` and
 * passes that to the body, which still calls ``onChange({key: value})``.
 * The PageEditor handler wraps the partial back into the namespace.
 *
 * **Migration**: legacy flat configs are detected via
 * ``looksNamespaced`` (the flat shape has zero keys that match a
 * known layout name + map to an object). When a legacy flat config
 * is read, the helper returns the whole flat dict scoped to the
 * page's current layout — which means the next write migrates it
 * into the proper namespace. Reads always honour the current layout's
 * namespace; non-current-layout flat keys silently drop after one
 * write cycle (acceptable because Fix A's purge already removed most
 * stale keys in production).
 *
 * **Bubbles[0] wrapper unchanged**: speech_bubble's
 * ``bubbles[0]`` inner wrapper (4c-B-2 C1 convention) lives INSIDE
 * the speech_bubble namespace. ``readBubbleConfig`` in PageCanvas
 * still operates on the namespace as before.
 */

import type {PageLayout} from "../api/client"

/** Known layout names that can appear as namespace keys. Mirrors
 *  the ``PageLayout`` Literal but as a runtime array for the
 *  ``looksNamespaced`` heuristic. */
const KNOWN_LAYOUTS: readonly string[] = [
    "speech_bubble",
    "image_top_text_bottom",
    "image_left_text_right",
    "image_full_text_overlay",
    "text_only",
    "comic_panel_grid",
    // Picture-Book Layout Expansion Phase 1 (2026-05-28).
    "image_bottom_text_top",
    "image_right_text_left",
    "image_full_no_text",
]

/** Detect whether a layout_config is in namespaced shape.
 *
 *  Returns true if any top-level key matches a known layout name AND
 *  its value is a plain object (not array, not primitive). False for
 *  legacy flat configs + null/undefined. */
export function looksNamespaced(
    config: Record<string, unknown> | null | undefined,
): boolean {
    if (!config) return false
    for (const key of Object.keys(config)) {
        if (!KNOWN_LAYOUTS.includes(key)) continue
        const value = config[key]
        if (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
        ) {
            return true
        }
    }
    return false
}

/** Extract the active layout's namespace from a layout_config.
 *
 *  - If the config is namespaced (has at least one layout key with
 *    an object value): return ``config[layout] ?? null``. Returning
 *    null when the active layout has no namespace yet is correct —
 *    bodies render their defaults.
 *  - If the config is in legacy-flat shape (no layout keys): return
 *    the whole config. Bodies see their fields directly; the next
 *    write through ``writeLayoutNamespace`` migrates to namespaced
 *    shape automatically.
 *  - If the config is null/undefined: return null. */
export function readLayoutNamespace(
    config: Record<string, unknown> | null | undefined,
    layout: PageLayout,
): Record<string, unknown> | null {
    if (!config) return null
    if (looksNamespaced(config)) {
        const namespaced = config[layout]
        if (
            namespaced &&
            typeof namespaced === "object" &&
            !Array.isArray(namespaced)
        ) {
            return namespaced as Record<string, unknown>
        }
        return null
    }
    // Legacy flat shape: treat the whole config as the current
    // layout's namespace. The next write through
    // ``writeLayoutNamespace`` migrates it into the namespaced form.
    return config
}

/** Merge a partial update into the active layout's namespace.
 *
 *  Returns the new top-level layout_config dict to persist via
 *  ``api.pages.update({layout_config: ...})``. Preserves any
 *  sibling-layout namespaces (the user's prior settings for OTHER
 *  layouts survive untouched).
 *
 *  Handles three input shapes:
 *  1. ``null``/``undefined`` config → returns ``{[layout]: partial}``.
 *  2. Namespaced config → merges partial into ``config[layout]``,
 *     keeps siblings.
 *  3. Legacy flat config → migrates to namespaced shape: returns
 *     ``{[layout]: {...flat, ...partial}}``. Non-current-layout
 *     flat keys silently drop. */
export function writeLayoutNamespace(
    config: Record<string, unknown> | null | undefined,
    layout: PageLayout,
    partial: Record<string, unknown>,
): Record<string, unknown> {
    if (!config) {
        return {[layout]: partial}
    }
    if (looksNamespaced(config)) {
        const priorNamespace =
            config[layout] &&
            typeof config[layout] === "object" &&
            !Array.isArray(config[layout])
                ? (config[layout] as Record<string, unknown>)
                : {}
        return {
            ...config,
            [layout]: {...priorNamespace, ...partial},
        }
    }
    // Legacy flat → migrate to current layout's namespace. Drops any
    // flat keys that don't belong to the current layout (acceptable
    // per Fix A history; Fix A already purged most stale-key cases).
    return {[layout]: {...config, ...partial}}
}

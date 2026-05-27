import React from "react"
import type {Page, PageLayout} from "../api/client"
import {readLayoutNamespace} from "../utils/layoutConfig"
import LayoutConfigSpeechBubble from "./LayoutConfigSpeechBubble"
import {
    LayoutConfigImageTopTextBottom,
    LayoutConfigImageLeftTextRight,
    LayoutConfigImageFullTextOverlay,
} from "./LayoutConfigImageRow"

interface Props {
    /** The currently active page. Its `page.layout` selects the
     *  concrete config body; `page.layout_config` (nullable dict)
     *  carries the current values that the body's controls echo. */
    page: Page
    /** Persist a partial update to the active page's layout_config.
     *  Discrete controls (radio, dropdown) call this directly;
     *  continuous controls (slider) wrap through
     *  `useDebouncedCallback(_, 300)` per the auto-save discipline
     *  in the Session 4c lessons-learned. */
    onChange: (partial: Record<string, unknown>) => void
}

/**
 * PB-PHASE4 Session 4c: per-layout configuration dispatcher.
 *
 * Renders the correct LayoutConfig{Variant} body for the active
 * page's layout. The dispatcher itself is purely a switch; each
 * concrete body lives in its own component for testability.
 *
 * Commit 3 (this commit): ships the dispatcher + the slot in
 * PageEditor's properties pane. The body components arrive in
 * Commit 4 (speech_bubble: anchor presets + opacity) and Commit 5
 * (image_top_text_bottom + image_left_text_right +
 * image_full_text_overlay).
 *
 * text_only has no configuration by design; the dispatcher
 * returns null for it.
 */
export default function LayoutConfig({page, onChange}: Props) {
    // Fix B: extract the active layout's namespace before passing
    // to the body. Legacy-flat configs return the whole flat dict
    // (treated as the current layout's namespace); the next write
    // through PageEditor.handleUpdateLayoutConfig migrates it into
    // namespaced shape via ``writeLayoutNamespace``.
    const layoutNamespace = readLayoutNamespace(
        page.layout_config,
        page.layout as PageLayout,
    )
    return (
        <div
            data-testid="layout-config-root"
            data-layout={page.layout}
            data-config-keys={Object.keys(layoutNamespace ?? {}).join(",")}
        >
            {page.layout === "speech_bubble" && (
                <LayoutConfigSpeechBubble
                    config={layoutNamespace}
                    onChange={onChange}
                />
            )}
            {page.layout === "image_top_text_bottom" && (
                <LayoutConfigImageTopTextBottom
                    config={layoutNamespace}
                    onChange={onChange}
                />
            )}
            {page.layout === "image_left_text_right" && (
                <LayoutConfigImageLeftTextRight
                    config={layoutNamespace}
                    onChange={onChange}
                />
            )}
            {page.layout === "image_full_text_overlay" && (
                <LayoutConfigImageFullTextOverlay
                    config={layoutNamespace}
                    onChange={onChange}
                />
            )}
            {/* text_only has no config by design. */}
        </div>
    )
}

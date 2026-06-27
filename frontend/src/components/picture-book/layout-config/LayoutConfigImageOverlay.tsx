/**
 * image_full_text_overlay config panel (#207 god-file split).
 *
 * Self-contained overlay-layout config: text-position dropdown +
 * backdrop-opacity + text-container width/height sliders + Tier 1/2
 * sections. Split out of LayoutConfigImageRow.tsx; LayoutConfigImageRow
 * re-exports this so the barrel + LayoutConfig.tsx importers are
 * untouched. data-testids unchanged.
 */

import { useDebouncedCallback } from "../../../hooks/ui/useDebouncedCallback"
import { useI18n } from "../../../hooks/useI18n"
import { RadixSelect } from "../../shared/RadixSelect"
import { CollapsibleConfigSection } from "../../shared/CollapsibleConfigSection"
import { Tier1Section } from "../../comics/Tier1Section"
import { Tier2Section } from "../../comics/Tier2Section"
import styles from "../../LayoutConfigImageRow.module.css"
import {
    BACKDROP_OPACITY_MIN,
    BACKDROP_OPACITY_MAX,
    BACKDROP_OPACITY_STEP,
    DEFAULT_BACKDROP_OPACITY,
    type BaseProps,
} from "./layoutConfigImageShared"

type TextPosition = "top" | "middle" | "bottom"
const TEXT_POSITIONS: readonly TextPosition[] = ["top", "middle", "bottom"]
const DEFAULT_TEXT_POSITION: TextPosition = "bottom"

// PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 1 C7 (Bug D scope-add):
// text-container width + height sliders give authors control over
// the text-region dimensions as a % of the page canvas. Defaults
// match the pre-C7 hardcoded behaviour: width 100%, height
// position-derived (middle → max-height 70%; top/bottom → auto).
const TEXT_CONTAINER_WIDTH_MIN = 30
const TEXT_CONTAINER_WIDTH_MAX = 100
const TEXT_CONTAINER_WIDTH_STEP = 5
const DEFAULT_TEXT_CONTAINER_WIDTH = 100
const TEXT_CONTAINER_HEIGHT_MIN = 15
const TEXT_CONTAINER_HEIGHT_MAX = 100
const TEXT_CONTAINER_HEIGHT_STEP = 5

function readTextPosition(config: Record<string, unknown> | null): TextPosition {
    const value = config?.text_position
    if (
        typeof value === "string" &&
        (TEXT_POSITIONS as readonly string[]).includes(value)
    ) {
        return value as TextPosition
    }
    return DEFAULT_TEXT_POSITION
}

function readBackdropOpacity(
    config: Record<string, unknown> | null,
): number {
    const value = config?.text_backdrop_opacity
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(
            BACKDROP_OPACITY_MIN,
            Math.min(BACKDROP_OPACITY_MAX, value),
        )
    }
    return DEFAULT_BACKDROP_OPACITY
}

function readTextContainerWidth(
    config: Record<string, unknown> | null,
): number {
    const value = config?.text_container_width
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(
            TEXT_CONTAINER_WIDTH_MIN,
            Math.min(TEXT_CONTAINER_WIDTH_MAX, value),
        )
    }
    return DEFAULT_TEXT_CONTAINER_WIDTH
}

function readTextContainerHeight(
    config: Record<string, unknown> | null,
): number | null {
    // Height defaults to NULL (no override) so the position-based
    // CSS rules take effect (middle → max-height 70%; top/bottom →
    // auto). Setting any value overrides via an explicit max-height.
    const value = config?.text_container_height
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(
            TEXT_CONTAINER_HEIGHT_MIN,
            Math.min(TEXT_CONTAINER_HEIGHT_MAX, value),
        )
    }
    return null
}

/** image_full_text_overlay config: text-position dropdown +
 *  backdrop-opacity slider. */
export function LayoutConfigImageFullTextOverlay({
    config,
    onChange,
}: BaseProps) {
    const {t} = useI18n()
    const position = readTextPosition(config)
    const opacity = readBackdropOpacity(config)
    const textContainerWidth = readTextContainerWidth(config)
    const textContainerHeight = readTextContainerHeight(config)
    const debouncedOpacityChange = useDebouncedCallback((value: number) => {
        onChange({text_backdrop_opacity: value})
    }, 300)
    const debouncedTextContainerWidthChange = useDebouncedCallback(
        (value: number) => {
            onChange({text_container_width: value})
        },
        300,
    )
    const debouncedTextContainerHeightChange = useDebouncedCallback(
        (value: number) => {
            onChange({text_container_height: value})
        },
        300,
    )
    return (
        <div
            className={styles.container}
            data-testid="layout-config-image-full-text-overlay"
        >
            <CollapsibleConfigSection
                storageKey="bibliogon-collapsible-page-editor-layout-config"
                heading={t( "ui.page_editor.config.image_full_text_overlay.heading", "Vollbild", )}
                testidPrefix="layout-config-image-full-text-overlay"
            >
            <label className={styles.fieldLabel}>
                <span className={styles.legend}>
                    {t("ui.page_editor.config.text_position", "Text position")}
                </span>
                <RadixSelect
                    value={position}
                    onValueChange={(next) =>
                        onChange({text_position: next as TextPosition})
                    }
                    testId="image-full-text-position"
                    className="is-narrow"
                    ariaLabel={t("ui.page_editor.config.text_position", "Text position")}
                    options={[
                        {value: "top", label: t("ui.page_editor.config.text_position_top", "Top")},
                        {value: "middle", label: t("ui.page_editor.config.text_position_middle", "Middle")},
                        {value: "bottom", label: t("ui.page_editor.config.text_position_bottom", "Bottom")},
                    ]}
                />
            </label>
            <label className={styles.fieldLabel}>
                <span className={styles.legend}>
                    {t(
                        "ui.page_editor.config.text_backdrop_opacity",
                        "Backdrop opacity",
                    )}
                </span>
                <input
                    type="range"
                    className="slider"
                    min={BACKDROP_OPACITY_MIN}
                    max={BACKDROP_OPACITY_MAX}
                    step={BACKDROP_OPACITY_STEP}
                    defaultValue={opacity}
                    onChange={(e) =>
                        debouncedOpacityChange(parseFloat(e.target.value))
                    }
                    data-testid="image-full-backdrop-opacity-slider"
                    aria-label={t(
                        "ui.page_editor.config.text_backdrop_opacity",
                        "Backdrop opacity",
                    )}
                />
                <span
                    className={styles.sliderValue}
                    data-testid="image-full-backdrop-opacity-value"
                >
                    {opacity.toFixed(2)}
                </span>
            </label>
            {/*
             * PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 1 C7
             * (Bug D scope-add): text_container_width +
             * text_container_height sliders. Width defaults to
             * 100% (full); height defaults to NULL so the
             * position-based CSS rules take effect (middle →
             * max-height 70%; top/bottom → auto). Setting either
             * overrides via explicit %.
             */}
            <label className={styles.fieldLabel}>
                <span className={styles.legend}>
                    {t(
                        "ui.page_editor.config.text_container_width",
                        "Text container width (%)",
                    )}
                </span>
                <input
                    type="range"
                    className="slider"
                    min={TEXT_CONTAINER_WIDTH_MIN}
                    max={TEXT_CONTAINER_WIDTH_MAX}
                    step={TEXT_CONTAINER_WIDTH_STEP}
                    defaultValue={textContainerWidth}
                    onChange={(e) =>
                        debouncedTextContainerWidthChange(
                            parseInt(e.target.value, 10),
                        )
                    }
                    data-testid="image-full-text-container-width-slider"
                    aria-label={t(
                        "ui.page_editor.config.text_container_width",
                        "Text container width (%)",
                    )}
                />
                <span
                    className={styles.sliderValue}
                    data-testid="image-full-text-container-width-value"
                >
                    {textContainerWidth}%
                </span>
            </label>
            <label className={styles.fieldLabel}>
                <span className={styles.legend}>
                    {t(
                        "ui.page_editor.config.text_container_height",
                        "Text container height (%)",
                    )}
                </span>
                <input
                    type="range"
                    className="slider"
                    min={TEXT_CONTAINER_HEIGHT_MIN}
                    max={TEXT_CONTAINER_HEIGHT_MAX}
                    step={TEXT_CONTAINER_HEIGHT_STEP}
                    defaultValue={
                        textContainerHeight ??
                        Math.round(
                            (TEXT_CONTAINER_HEIGHT_MIN +
                                TEXT_CONTAINER_HEIGHT_MAX) /
                                2,
                        )
                    }
                    onChange={(e) =>
                        debouncedTextContainerHeightChange(
                            parseInt(e.target.value, 10),
                        )
                    }
                    data-testid="image-full-text-container-height-slider"
                    aria-label={t(
                        "ui.page_editor.config.text_container_height",
                        "Text container height (%)",
                    )}
                />
                <span
                    className={styles.sliderValue}
                    data-testid="image-full-text-container-height-value"
                >
                    {textContainerHeight !== null
                        ? `${textContainerHeight}%`
                        : t(
                              "ui.page_editor.config.text_container_height_auto",
                              "auto",
                          )}
                </span>
            </label>
            {/*
             * PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01 +
             * PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 1 C5.
             * Tier-Property sections (8-field Visual Style +
             * 6-field Typography) extracted from speech_bubble.
             *
             * Overlay differs from speech_bubble: no bubbles[0]
             * wrapping (single text region per page). Tier1/Tier2
             * onChange writes go DIRECTLY through the dispatcher's
             * onChange — the new key + value land flat inside the
             * image_full_text_overlay namespace.
             *
             * Tier1 + Tier2 readers in bubbleConfigReads.ts call
             * readBubbleConfig under the hood, which honours flat
             * top-level keys (the legacy bubble fallback), so the
             * non-bubbles[0] shape works transparently.
             *
             * background_color composes with text_backdrop_opacity
             * at render time (PageCanvas extends its overlayTextStyle
             * derivation in the same commit); default #ffffff +
             * legacy backdrop-opacity behaviour preserved.
             */}
            <Tier1Section
                config={config}
                onChange={onChange}
                testidPrefix="overlay-text"
                i18nKeyPrefix="ui.page_editor.config.overlay_text"
            />
            <Tier2Section
                config={config}
                onChange={onChange}
                testidPrefix="overlay-text"
                i18nKeyPrefix="ui.page_editor.config.overlay_text"
            />
        </CollapsibleConfigSection>
        </div>
    )
}

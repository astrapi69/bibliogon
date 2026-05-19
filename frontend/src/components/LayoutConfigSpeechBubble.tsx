import React from "react"
import * as Collapsible from "@radix-ui/react-collapsible"
import {useDebouncedCallback} from "../hooks/useDebouncedCallback"
import {useI18n} from "../hooks/useI18n"
import {
    PICTURE_BOOK_FONTS,
    DEFAULT_PICTURE_BOOK_FONT_ID,
} from "../data/picture-book-fonts"
import styles from "./LayoutConfigSpeechBubble.module.css"

interface Props {
    /** Active page's persisted layout_config dict (or null when the
     *  user hasn't picked anything yet — defaults apply). */
    config: Record<string, unknown> | null
    /** Persist a partial update via PageEditor's
     *  handleUpdateLayoutConfig. Discrete (radio) calls immediately;
     *  the slider goes through useDebouncedCallback below. */
    onChange: (partial: Record<string, unknown>) => void
}

/** PB-PHASE4 Session 4c-B-1 manual smoke Finding A: extended to a
 *  full 9-cell anchor grid (3×3) per user expectation. Original
 *  Session 4c D4 shipped 5 presets (4 corners + center, 4 edge-
 *  midpoints intentionally empty); user smoke surfaced the missing
 *  positions as friction. Now: all 9 cells selectable. Drag-to-
 *  position is the deferred follow-up
 *  (PICTURE-BOOK-SPEECH-BUBBLE-DRAG-POSITION-01 P5). */
type AnchorPreset =
    | "top-left"
    | "top-center"
    | "top-right"
    | "middle-left"
    | "center"
    | "middle-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right"

const ANCHOR_PRESETS: readonly AnchorPreset[] = [
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "center",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
]

const DEFAULT_OPACITY = 1.0
const OPACITY_MIN = 0.3
const OPACITY_MAX = 1.0
const OPACITY_STEP = 0.05

// PB-PHASE4 Session 4c-B-1 smoke Bug 1 (2026-05-18):
// bubble-width replaces the single ``size`` knob; bubble-height
// is the new dimension control. Per the user's 2026-05-17
// Tier-Property Pre-Inspection adjustment + the 2026-05-18 smoke
// direct-action: picture-book authors need independent W + H to
// shape bubbles for portrait-vs-landscape compositions and
// (future) comic-foundation work. Backward-compat: read ``size``
// as a legacy fallback for ``bubble_width`` when the new key is
// absent; on next write the dispatcher always writes
// ``bubble_width`` so ``size`` fades out without a backfill.
const WIDTH_MIN = 20
const WIDTH_MAX = 80
const WIDTH_STEP = 5
const DEFAULT_WIDTH = 40
const HEIGHT_MIN = 15
const HEIGHT_MAX = 60
const HEIGHT_STEP = 5
const DEFAULT_HEIGHT = 30

// --- 4c-B-2 C2: Tier 1 Visual Style ---
//
// Six per-bubble visual-style properties land here. Field names
// match the comic_bubbles.bubble_config keys per
// docs/explorations/comic-foundation.md (NQ2 scope-anticipate):
// plugin-comics Session 2 reads the same key set from its own
// schema, so picture-book single-bubble + comics multi-bubble
// share the same property names.

const BORDER_WIDTH_MIN = 0
const BORDER_WIDTH_MAX = 8
const BORDER_WIDTH_STEP = 1
const DEFAULT_BORDER_WIDTH = 2

const BORDER_RADIUS_MIN = 0
const BORDER_RADIUS_MAX = 50
const BORDER_RADIUS_STEP = 5
const DEFAULT_BORDER_RADIUS = 50

const SHADOW_INTENSITY_MIN = 0
const SHADOW_INTENSITY_MAX = 10
const SHADOW_INTENSITY_STEP = 1
const DEFAULT_SHADOW_INTENSITY = 5

const DEFAULT_BACKGROUND_COLOR = "#ffffff"
const DEFAULT_BORDER_COLOR = "#000000"
const DEFAULT_BORDER_STYLE: BorderStyle = "solid"
const DEFAULT_SHADOW = true

type BorderStyle = "solid" | "dashed" | "dotted" | "none"
const BORDER_STYLES: readonly BorderStyle[] = [
    "solid",
    "dashed",
    "dotted",
    "none",
]

// --- 4c-B-2 C3: Tier 2 Typography ---

const FONT_SIZE_MIN = 10
const FONT_SIZE_MAX = 32
const FONT_SIZE_STEP = 1
const DEFAULT_FONT_SIZE = 14

type FontWeight = "normal" | "bold"
const FONT_WEIGHTS: readonly FontWeight[] = ["normal", "bold"]
const DEFAULT_FONT_WEIGHT: FontWeight = "normal"

type TextAlign = "left" | "center" | "right"
const TEXT_ALIGNS: readonly TextAlign[] = ["left", "center", "right"]
const DEFAULT_TEXT_ALIGN: TextAlign = "center"

const DEFAULT_TEXT_COLOR = "#000000"

/** 4c-B-2 C1 (Q1 decision γ — Inclusive-on-write, flat-fallback-on-read):
 *  per-bubble fields are stored under ``layout_config.bubbles[0]``.
 *  Flat top-level keys are accepted as a legacy fallback so pages
 *  authored before C1 continue to render. Read precedence:
 *  ``bubbles[0].X`` overrides flat ``X``; write-path always writes
 *  to ``bubbles[0]`` so the flat shape fades out naturally (same
 *  template as ``size`` → ``bubble_width`` from c63db21).
 *
 *  Plugin-comics Session 2 inherits this single per-bubble shape
 *  via the ``comic_bubbles`` schema (NQ2 scope-anticipate).
 */
export function readBubbleConfig(
    config: Record<string, unknown> | null,
): Record<string, unknown> {
    if (!config) return {}
    const flat: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(config)) {
        if (k !== "bubbles") flat[k] = v
    }
    const bubbles = config.bubbles
    const bubblesZero =
        Array.isArray(bubbles) &&
        bubbles.length > 0 &&
        typeof bubbles[0] === "object" &&
        bubbles[0] !== null
            ? (bubbles[0] as Record<string, unknown>)
            : {}
    return {...flat, ...bubblesZero}
}

/** Returns the picked preset, or null when no preset has been
 *  chosen yet (PageCanvas falls back to "bottom-center" per
 *  Session 4 D2a default in that case). null means "no radio is
 *  selected"; once the user picks any preset, the config persists
 *  and the radio reflects it. */
function readAnchor(
    config: Record<string, unknown> | null,
): AnchorPreset | null {
    const value = readBubbleConfig(config).anchor_position
    if (
        typeof value === "string" &&
        (ANCHOR_PRESETS as readonly string[]).includes(value)
    ) {
        return value as AnchorPreset
    }
    return null
}

function readBubbleWidth(config: Record<string, unknown> | null): number {
    // Prefer the new bubble_width key; fall back to the legacy
    // size key when bubble_width is absent. D11-style backward-
    // compat: pre-Bug-1 pages keep their authored width.
    const merged = readBubbleConfig(config)
    const primary = merged.bubble_width
    if (typeof primary === "number" && Number.isFinite(primary)) {
        return Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, primary))
    }
    const legacy = merged.size
    if (typeof legacy === "number" && Number.isFinite(legacy)) {
        return Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, legacy))
    }
    return DEFAULT_WIDTH
}

function readBubbleHeight(config: Record<string, unknown> | null): number {
    const value = readBubbleConfig(config).bubble_height
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, value))
    }
    return DEFAULT_HEIGHT
}

function readOpacity(config: Record<string, unknown> | null): number {
    const value = readBubbleConfig(config).opacity
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, value))
    }
    return DEFAULT_OPACITY
}

// --- 4c-B-2 C2: Tier 1 reads ---

/** Hex colors only (``#rrggbb`` or ``rrggbb``). Unknown shapes
 *  fall back to the default. The renderer uses the same hex shape
 *  to compose ``rgba(r, g, b, opacity)``. */
function readHexColor(
    config: Record<string, unknown> | null,
    key: string,
    fallback: string,
): string {
    const value = readBubbleConfig(config)[key]
    if (
        typeof value === "string" &&
        /^#?[a-fA-F0-9]{6}$/.test(value.trim())
    ) {
        const trimmed = value.trim()
        return trimmed.startsWith("#") ? trimmed : `#${trimmed}`
    }
    return fallback
}

function readBorderWidth(config: Record<string, unknown> | null): number {
    const value = readBubbleConfig(config).border_width
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(BORDER_WIDTH_MIN, Math.min(BORDER_WIDTH_MAX, value))
    }
    return DEFAULT_BORDER_WIDTH
}

function readBorderStyle(config: Record<string, unknown> | null): BorderStyle {
    const value = readBubbleConfig(config).border_style
    if (
        typeof value === "string" &&
        (BORDER_STYLES as readonly string[]).includes(value)
    ) {
        return value as BorderStyle
    }
    return DEFAULT_BORDER_STYLE
}

function readBorderRadius(config: Record<string, unknown> | null): number {
    const value = readBubbleConfig(config).border_radius
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(
            BORDER_RADIUS_MIN,
            Math.min(BORDER_RADIUS_MAX, value),
        )
    }
    return DEFAULT_BORDER_RADIUS
}

function readShadow(config: Record<string, unknown> | null): boolean {
    const value = readBubbleConfig(config).shadow
    if (typeof value === "boolean") return value
    return DEFAULT_SHADOW
}

function readShadowIntensity(config: Record<string, unknown> | null): number {
    const value = readBubbleConfig(config).shadow_intensity
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(
            SHADOW_INTENSITY_MIN,
            Math.min(SHADOW_INTENSITY_MAX, value),
        )
    }
    return DEFAULT_SHADOW_INTENSITY
}

// --- 4c-B-2 C3: Tier 2 reads ---

function readFontFamily(config: Record<string, unknown> | null): string {
    const value = readBubbleConfig(config).font_family
    if (
        typeof value === "string" &&
        PICTURE_BOOK_FONTS.some((f) => f.id === value)
    ) {
        return value
    }
    return DEFAULT_PICTURE_BOOK_FONT_ID
}

function readFontSize(config: Record<string, unknown> | null): number {
    const value = readBubbleConfig(config).font_size
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, value))
    }
    return DEFAULT_FONT_SIZE
}

function readFontWeight(config: Record<string, unknown> | null): FontWeight {
    const value = readBubbleConfig(config).font_weight
    if (
        typeof value === "string" &&
        (FONT_WEIGHTS as readonly string[]).includes(value)
    ) {
        return value as FontWeight
    }
    return DEFAULT_FONT_WEIGHT
}

function readTextAlign(config: Record<string, unknown> | null): TextAlign {
    const value = readBubbleConfig(config).text_align
    if (
        typeof value === "string" &&
        (TEXT_ALIGNS as readonly string[]).includes(value)
    ) {
        return value as TextAlign
    }
    return DEFAULT_TEXT_ALIGN
}

export default function LayoutConfigSpeechBubble({config, onChange}: Props) {
    const {t} = useI18n()
    const currentAnchor = readAnchor(config)
    const currentOpacity = readOpacity(config)
    const currentWidth = readBubbleWidth(config)
    const currentHeight = readBubbleHeight(config)
    const currentBackgroundColor = readHexColor(
        config,
        "background_color",
        DEFAULT_BACKGROUND_COLOR,
    )
    const currentBorderColor = readHexColor(
        config,
        "border_color",
        DEFAULT_BORDER_COLOR,
    )
    const currentBorderWidth = readBorderWidth(config)
    const currentBorderStyle = readBorderStyle(config)
    const currentBorderRadius = readBorderRadius(config)
    const currentShadow = readShadow(config)
    const currentShadowIntensity = readShadowIntensity(config)
    const currentFontFamily = readFontFamily(config)
    const currentFontSize = readFontSize(config)
    const currentFontWeight = readFontWeight(config)
    const currentTextColor = readHexColor(
        config,
        "text_color",
        DEFAULT_TEXT_COLOR,
    )
    const currentTextAlign = readTextAlign(config)
    const [tier1Open, setTier1Open] = React.useState(false)
    const [tier2Open, setTier2Open] = React.useState(false)

    /** 4c-B-2 C1: every write goes through bubbles[0]. The
     *  prior per-bubble state (from readBubbleConfig — which
     *  honours flat fallback) is preserved so a single-field
     *  edit does not clobber siblings. PageEditor's
     *  handleUpdateLayoutConfig still does a shallow merge at
     *  the top level; bubbles[] is replaced as a whole, which
     *  is correct because we always send the full bubble. */
    const writeBubble = React.useCallback(
        (fields: Record<string, unknown>): void => {
            const prior = readBubbleConfig(config)
            onChange({bubbles: [{...prior, ...fields}]})
        },
        [config, onChange],
    )

    const debouncedOpacityChange = useDebouncedCallback((value: number) => {
        writeBubble({opacity: value})
    }, 300)
    const debouncedWidthChange = useDebouncedCallback((value: number) => {
        writeBubble({bubble_width: value})
    }, 300)
    const debouncedHeightChange = useDebouncedCallback((value: number) => {
        writeBubble({bubble_height: value})
    }, 300)
    const debouncedBorderWidthChange = useDebouncedCallback(
        (value: number) => {
            writeBubble({border_width: value})
        },
        300,
    )
    const debouncedBorderRadiusChange = useDebouncedCallback(
        (value: number) => {
            writeBubble({border_radius: value})
        },
        300,
    )
    const debouncedShadowIntensityChange = useDebouncedCallback(
        (value: number) => {
            writeBubble({shadow_intensity: value})
        },
        300,
    )
    const debouncedBackgroundColorChange = useDebouncedCallback(
        (value: string) => {
            writeBubble({background_color: value})
        },
        300,
    )
    const debouncedBorderColorChange = useDebouncedCallback(
        (value: string) => {
            writeBubble({border_color: value})
        },
        300,
    )
    const debouncedFontSizeChange = useDebouncedCallback((value: number) => {
        writeBubble({font_size: value})
    }, 300)
    const debouncedTextColorChange = useDebouncedCallback((value: string) => {
        writeBubble({text_color: value})
    }, 300)

    return (
        <div
            className={styles.container}
            data-testid="layout-config-speech-bubble"
        >
            <h4 className={styles.heading}>
                {t("ui.page_editor.config.speech_bubble.heading", "Sprechblase")}
            </h4>

            <fieldset
                className={styles.anchorFieldset}
                data-testid="speech-bubble-anchor-grid"
            >
                <legend className={styles.legend}>
                    {t(
                        "ui.page_editor.config.speech_bubble.anchor",
                        "Position",
                    )}
                </legend>
                <div className={styles.anchorGrid}>
                    {ANCHOR_PRESETS.map((preset) => {
                        const selected = preset === currentAnchor
                        // PB-PHASE4 Session 4c-B-1 manual smoke Finding A:
                        // a11y label per cell. i18n key uses underscore-
                        // form (top_left) since YAML keys cannot contain
                        // hyphens cleanly. TypeScript preset is the
                        // canonical value (hyphenated to match the
                        // anchor_position stored values).
                        const i18nKey = preset.replace(/-/g, "_")
                        const fallback = preset
                            .split("-")
                            .map((p) => p[0].toUpperCase() + p.slice(1))
                            .join(" ")
                        const label = t(
                            `ui.page_editor.config.speech_bubble.anchor_position.${i18nKey}`,
                            fallback,
                        )
                        return (
                            <label
                                key={preset}
                                className={[
                                    styles.anchorCell,
                                    selected ? styles.anchorCellSelected : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                                data-cell={preset}
                                title={label}
                            >
                                <input
                                    type="radio"
                                    name="speech_bubble_anchor"
                                    value={preset}
                                    checked={selected}
                                    onChange={() =>
                                        writeBubble({anchor_position: preset})
                                    }
                                    data-testid={`speech-bubble-anchor-${preset}`}
                                    className={styles.anchorInput}
                                    aria-label={label}
                                />
                                <span className={styles.anchorDot} aria-hidden />
                            </label>
                        )
                    })}
                </div>
            </fieldset>

            <label className={styles.sliderLabel}>
                <span className={styles.legend}>
                    {t(
                        "ui.page_editor.config.speech_bubble.opacity",
                        "Deckkraft",
                    )}
                </span>
                <input
                    type="range"
                    min={OPACITY_MIN}
                    max={OPACITY_MAX}
                    step={OPACITY_STEP}
                    defaultValue={currentOpacity}
                    onChange={(e) =>
                        debouncedOpacityChange(parseFloat(e.target.value))
                    }
                    data-testid="speech-bubble-opacity-slider"
                    aria-label={t(
                        "ui.page_editor.config.speech_bubble.opacity",
                        "Deckkraft",
                    )}
                />
                <span
                    className={styles.sliderValue}
                    data-testid="speech-bubble-opacity-value"
                >
                    {currentOpacity.toFixed(2)}
                </span>
            </label>

            <label className={styles.sliderLabel}>
                <span className={styles.legend}>
                    {t(
                        "ui.page_editor.config.speech_bubble.width",
                        "Breite",
                    )}
                </span>
                <input
                    type="range"
                    min={WIDTH_MIN}
                    max={WIDTH_MAX}
                    step={WIDTH_STEP}
                    defaultValue={currentWidth}
                    onChange={(e) =>
                        debouncedWidthChange(parseInt(e.target.value, 10))
                    }
                    data-testid="speech-bubble-width-slider"
                    aria-label={t(
                        "ui.page_editor.config.speech_bubble.width",
                        "Breite",
                    )}
                />
                <span
                    className={styles.sliderValue}
                    data-testid="speech-bubble-width-value"
                >
                    {currentWidth}%
                </span>
            </label>

            <label className={styles.sliderLabel}>
                <span className={styles.legend}>
                    {t(
                        "ui.page_editor.config.speech_bubble.height",
                        "Höhe",
                    )}
                </span>
                <input
                    type="range"
                    min={HEIGHT_MIN}
                    max={HEIGHT_MAX}
                    step={HEIGHT_STEP}
                    defaultValue={currentHeight}
                    onChange={(e) =>
                        debouncedHeightChange(parseInt(e.target.value, 10))
                    }
                    data-testid="speech-bubble-height-slider"
                    aria-label={t(
                        "ui.page_editor.config.speech_bubble.height",
                        "Höhe",
                    )}
                />
                <span
                    className={styles.sliderValue}
                    data-testid="speech-bubble-height-value"
                >
                    {currentHeight}%
                </span>
            </label>

            {/* --- 4c-B-2 C2: Tier 1 Visual Style --- */}
            <Collapsible.Root
                open={tier1Open}
                onOpenChange={setTier1Open}
                data-testid="speech-bubble-tier1-section"
            >
                <Collapsible.Trigger asChild>
                    <button
                        type="button"
                        className={styles.sectionTrigger}
                        data-testid="speech-bubble-tier1-trigger"
                        aria-expanded={tier1Open}
                    >
                        <span className={styles.sectionChevron} aria-hidden>
                            {tier1Open ? "▾" : "▸"}
                        </span>
                        {t(
                            "ui.page_editor.config.speech_bubble.tier1.heading",
                            "Visueller Stil",
                        )}
                    </button>
                </Collapsible.Trigger>
                <Collapsible.Content className={styles.sectionContent}>
                    <label className={styles.colorLabel}>
                        <span className={styles.legend}>
                            {t(
                                "ui.page_editor.config.speech_bubble.tier1.background_color",
                                "Hintergrundfarbe",
                            )}
                        </span>
                        <input
                            type="color"
                            value={currentBackgroundColor}
                            onChange={(e) =>
                                debouncedBackgroundColorChange(e.target.value)
                            }
                            data-testid="speech-bubble-background-color"
                            aria-label={t(
                                "ui.page_editor.config.speech_bubble.tier1.background_color",
                                "Hintergrundfarbe",
                            )}
                            className={styles.colorInput}
                        />
                    </label>

                    <label className={styles.colorLabel}>
                        <span className={styles.legend}>
                            {t(
                                "ui.page_editor.config.speech_bubble.tier1.border_color",
                                "Rahmenfarbe",
                            )}
                        </span>
                        <input
                            type="color"
                            value={currentBorderColor}
                            onChange={(e) =>
                                debouncedBorderColorChange(e.target.value)
                            }
                            data-testid="speech-bubble-border-color"
                            aria-label={t(
                                "ui.page_editor.config.speech_bubble.tier1.border_color",
                                "Rahmenfarbe",
                            )}
                            className={styles.colorInput}
                        />
                    </label>

                    <label className={styles.sliderLabel}>
                        <span className={styles.legend}>
                            {t(
                                "ui.page_editor.config.speech_bubble.tier1.border_width",
                                "Rahmenbreite",
                            )}
                        </span>
                        <input
                            type="range"
                            min={BORDER_WIDTH_MIN}
                            max={BORDER_WIDTH_MAX}
                            step={BORDER_WIDTH_STEP}
                            defaultValue={currentBorderWidth}
                            onChange={(e) =>
                                debouncedBorderWidthChange(
                                    parseInt(e.target.value, 10),
                                )
                            }
                            data-testid="speech-bubble-border-width-slider"
                            aria-label={t(
                                "ui.page_editor.config.speech_bubble.tier1.border_width",
                                "Rahmenbreite",
                            )}
                        />
                        <span
                            className={styles.sliderValue}
                            data-testid="speech-bubble-border-width-value"
                        >
                            {currentBorderWidth}px
                        </span>
                    </label>

                    <label className={styles.selectLabel}>
                        <span className={styles.legend}>
                            {t(
                                "ui.page_editor.config.speech_bubble.tier1.border_style",
                                "Rahmenstil",
                            )}
                        </span>
                        <select
                            value={currentBorderStyle}
                            onChange={(e) =>
                                writeBubble({
                                    border_style: e.target.value as BorderStyle,
                                })
                            }
                            data-testid="speech-bubble-border-style-select"
                            className={styles.selectInput}
                            aria-label={t(
                                "ui.page_editor.config.speech_bubble.tier1.border_style",
                                "Rahmenstil",
                            )}
                        >
                            {BORDER_STYLES.map((style) => (
                                <option key={style} value={style}>
                                    {t(
                                        `ui.page_editor.config.speech_bubble.tier1.border_style_${style}`,
                                        style.charAt(0).toUpperCase() +
                                            style.slice(1),
                                    )}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className={styles.sliderLabel}>
                        <span className={styles.legend}>
                            {t(
                                "ui.page_editor.config.speech_bubble.tier1.border_radius",
                                "Eckenradius",
                            )}
                        </span>
                        <input
                            type="range"
                            min={BORDER_RADIUS_MIN}
                            max={BORDER_RADIUS_MAX}
                            step={BORDER_RADIUS_STEP}
                            defaultValue={currentBorderRadius}
                            onChange={(e) =>
                                debouncedBorderRadiusChange(
                                    parseInt(e.target.value, 10),
                                )
                            }
                            data-testid="speech-bubble-border-radius-slider"
                            aria-label={t(
                                "ui.page_editor.config.speech_bubble.tier1.border_radius",
                                "Eckenradius",
                            )}
                        />
                        <span
                            className={styles.sliderValue}
                            data-testid="speech-bubble-border-radius-value"
                        >
                            {currentBorderRadius}%
                        </span>
                    </label>

                    {/* Shadow toggle + intensity. Q3 decision (a):
                     *  intensity stays visible but disabled when
                     *  shadow=false, preserving last value so the
                     *  user can flip back without losing their pick. */}
                    <label className={styles.checkboxLabel}>
                        <input
                            type="checkbox"
                            checked={currentShadow}
                            onChange={(e) =>
                                writeBubble({shadow: e.target.checked})
                            }
                            data-testid="speech-bubble-shadow-toggle"
                            aria-label={t(
                                "ui.page_editor.config.speech_bubble.tier1.shadow",
                                "Schatten",
                            )}
                        />
                        <span>
                            {t(
                                "ui.page_editor.config.speech_bubble.tier1.shadow",
                                "Schatten",
                            )}
                        </span>
                    </label>

                    <label className={styles.sliderLabel}>
                        <span className={styles.legend}>
                            {t(
                                "ui.page_editor.config.speech_bubble.tier1.shadow_intensity",
                                "Schattenintensität",
                            )}
                        </span>
                        <input
                            type="range"
                            min={SHADOW_INTENSITY_MIN}
                            max={SHADOW_INTENSITY_MAX}
                            step={SHADOW_INTENSITY_STEP}
                            defaultValue={currentShadowIntensity}
                            disabled={!currentShadow}
                            onChange={(e) =>
                                debouncedShadowIntensityChange(
                                    parseInt(e.target.value, 10),
                                )
                            }
                            data-testid="speech-bubble-shadow-intensity-slider"
                            aria-label={t(
                                "ui.page_editor.config.speech_bubble.tier1.shadow_intensity",
                                "Schattenintensität",
                            )}
                        />
                        <span
                            className={styles.sliderValue}
                            data-testid="speech-bubble-shadow-intensity-value"
                        >
                            {currentShadowIntensity}
                        </span>
                    </label>
                </Collapsible.Content>
            </Collapsible.Root>

            {/* --- 4c-B-2 C3: Tier 2 Typography --- */}
            <Collapsible.Root
                open={tier2Open}
                onOpenChange={setTier2Open}
                data-testid="speech-bubble-tier2-section"
            >
                <Collapsible.Trigger asChild>
                    <button
                        type="button"
                        className={styles.sectionTrigger}
                        data-testid="speech-bubble-tier2-trigger"
                        aria-expanded={tier2Open}
                    >
                        <span className={styles.sectionChevron} aria-hidden>
                            {tier2Open ? "▾" : "▸"}
                        </span>
                        {t(
                            "ui.page_editor.config.speech_bubble.tier2.heading",
                            "Typografie",
                        )}
                    </button>
                </Collapsible.Trigger>
                <Collapsible.Content className={styles.sectionContent}>
                    <label className={styles.selectLabel}>
                        <span className={styles.legend}>
                            {t(
                                "ui.page_editor.config.speech_bubble.tier2.font_family",
                                "Schriftart",
                            )}
                        </span>
                        <select
                            value={currentFontFamily}
                            onChange={(e) =>
                                writeBubble({font_family: e.target.value})
                            }
                            data-testid="speech-bubble-font-family-select"
                            className={styles.selectInput}
                            aria-label={t(
                                "ui.page_editor.config.speech_bubble.tier2.font_family",
                                "Schriftart",
                            )}
                        >
                            {PICTURE_BOOK_FONTS.map((font) => (
                                <option key={font.id} value={font.id}>
                                    {font.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className={styles.sliderLabel}>
                        <span className={styles.legend}>
                            {t(
                                "ui.page_editor.config.speech_bubble.tier2.font_size",
                                "Schriftgröße",
                            )}
                        </span>
                        <input
                            type="range"
                            min={FONT_SIZE_MIN}
                            max={FONT_SIZE_MAX}
                            step={FONT_SIZE_STEP}
                            defaultValue={currentFontSize}
                            onChange={(e) =>
                                debouncedFontSizeChange(
                                    parseInt(e.target.value, 10),
                                )
                            }
                            data-testid="speech-bubble-font-size-slider"
                            aria-label={t(
                                "ui.page_editor.config.speech_bubble.tier2.font_size",
                                "Schriftgröße",
                            )}
                        />
                        <span
                            className={styles.sliderValue}
                            data-testid="speech-bubble-font-size-value"
                        >
                            {currentFontSize}pt
                        </span>
                    </label>

                    <label className={styles.selectLabel}>
                        <span className={styles.legend}>
                            {t(
                                "ui.page_editor.config.speech_bubble.tier2.font_weight",
                                "Schriftstärke",
                            )}
                        </span>
                        <select
                            value={currentFontWeight}
                            onChange={(e) =>
                                writeBubble({
                                    font_weight: e.target.value as FontWeight,
                                })
                            }
                            data-testid="speech-bubble-font-weight-select"
                            className={styles.selectInput}
                            aria-label={t(
                                "ui.page_editor.config.speech_bubble.tier2.font_weight",
                                "Schriftstärke",
                            )}
                        >
                            {FONT_WEIGHTS.map((weight) => (
                                <option key={weight} value={weight}>
                                    {t(
                                        `ui.page_editor.config.speech_bubble.tier2.font_weight_${weight}`,
                                        weight.charAt(0).toUpperCase() +
                                            weight.slice(1),
                                    )}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className={styles.colorLabel}>
                        <span className={styles.legend}>
                            {t(
                                "ui.page_editor.config.speech_bubble.tier2.text_color",
                                "Textfarbe",
                            )}
                        </span>
                        <input
                            type="color"
                            value={currentTextColor}
                            onChange={(e) =>
                                debouncedTextColorChange(e.target.value)
                            }
                            data-testid="speech-bubble-text-color"
                            aria-label={t(
                                "ui.page_editor.config.speech_bubble.tier2.text_color",
                                "Textfarbe",
                            )}
                            className={styles.colorInput}
                        />
                    </label>

                    <label className={styles.selectLabel}>
                        <span className={styles.legend}>
                            {t(
                                "ui.page_editor.config.speech_bubble.tier2.text_align",
                                "Textausrichtung",
                            )}
                        </span>
                        <select
                            value={currentTextAlign}
                            onChange={(e) =>
                                writeBubble({
                                    text_align: e.target.value as TextAlign,
                                })
                            }
                            data-testid="speech-bubble-text-align-select"
                            className={styles.selectInput}
                            aria-label={t(
                                "ui.page_editor.config.speech_bubble.tier2.text_align",
                                "Textausrichtung",
                            )}
                        >
                            {TEXT_ALIGNS.map((align) => (
                                <option key={align} value={align}>
                                    {t(
                                        `ui.page_editor.config.speech_bubble.tier2.text_align_${align}`,
                                        align.charAt(0).toUpperCase() +
                                            align.slice(1),
                                    )}
                                </option>
                            ))}
                        </select>
                    </label>
                </Collapsible.Content>
            </Collapsible.Root>
        </div>
    )
}

import React from "react"
import {useDebouncedCallback} from "../hooks/useDebouncedCallback"
import {useI18n} from "../hooks/useI18n"
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

/** PB-PHASE4 Session 4c D4: 5 anchor presets — 4 corners + center.
 *  Layout grid is 3×3 with the 4 corners + center cell active; the
 *  4 edge-midpoint cells are intentionally empty. Drag-to-position
 *  is the deferred follow-up
 *  (PICTURE-BOOK-SPEECH-BUBBLE-DRAG-POSITION-01 P5). */
type AnchorPreset =
    | "top-left"
    | "top-right"
    | "center"
    | "bottom-left"
    | "bottom-right"

const ANCHOR_PRESETS: readonly AnchorPreset[] = [
    "top-left",
    "top-right",
    "center",
    "bottom-left",
    "bottom-right",
]

const DEFAULT_OPACITY = 1.0
const OPACITY_MIN = 0.3
const OPACITY_MAX = 1.0
const OPACITY_STEP = 0.05

// Session 4c refinement: bubble-size slider. Default 40% matches
// the Session 4 D2a width; range 20-60% covers tight-quote
// bubbles all the way to wide-narrative bubbles without making
// the bubble dominate the image.
const SIZE_MIN = 20
const SIZE_MAX = 60
const SIZE_STEP = 5
const DEFAULT_SIZE = 40

/** Returns the picked preset, or null when no preset has been
 *  chosen yet (PageCanvas falls back to "bottom-center" per
 *  Session 4 D2a default in that case). null means "no radio is
 *  selected"; once the user picks any preset, the config persists
 *  and the radio reflects it. */
function readAnchor(
    config: Record<string, unknown> | null,
): AnchorPreset | null {
    const value = config?.anchor_position
    if (
        typeof value === "string" &&
        (ANCHOR_PRESETS as readonly string[]).includes(value)
    ) {
        return value as AnchorPreset
    }
    return null
}

function readSize(config: Record<string, unknown> | null): number {
    const value = config?.size
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(SIZE_MIN, Math.min(SIZE_MAX, value))
    }
    return DEFAULT_SIZE
}

function readOpacity(config: Record<string, unknown> | null): number {
    const value = config?.opacity
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, value))
    }
    return DEFAULT_OPACITY
}

export default function LayoutConfigSpeechBubble({config, onChange}: Props) {
    const {t} = useI18n()
    const currentAnchor = readAnchor(config)
    const currentOpacity = readOpacity(config)
    const currentSize = readSize(config)

    const debouncedOpacityChange = useDebouncedCallback((value: number) => {
        onChange({opacity: value})
    }, 300)
    const debouncedSizeChange = useDebouncedCallback((value: number) => {
        onChange({size: value})
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
                            >
                                <input
                                    type="radio"
                                    name="speech_bubble_anchor"
                                    value={preset}
                                    checked={selected}
                                    onChange={() => onChange({anchor_position: preset})}
                                    data-testid={`speech-bubble-anchor-${preset}`}
                                    className={styles.anchorInput}
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
                        "ui.page_editor.config.speech_bubble.size",
                        "Größe",
                    )}
                </span>
                <input
                    type="range"
                    min={SIZE_MIN}
                    max={SIZE_MAX}
                    step={SIZE_STEP}
                    defaultValue={currentSize}
                    onChange={(e) =>
                        debouncedSizeChange(parseInt(e.target.value, 10))
                    }
                    data-testid="speech-bubble-size-slider"
                    aria-label={t(
                        "ui.page_editor.config.speech_bubble.size",
                        "Größe",
                    )}
                />
                <span
                    className={styles.sliderValue}
                    data-testid="speech-bubble-size-value"
                >
                    {currentSize}%
                </span>
            </label>
        </div>
    )
}

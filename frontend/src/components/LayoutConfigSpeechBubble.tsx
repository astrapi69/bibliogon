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

export default function LayoutConfigSpeechBubble({config, onChange}: Props) {
    const {t} = useI18n()
    const currentAnchor = readAnchor(config)
    const currentOpacity = readOpacity(config)
    const currentWidth = readBubbleWidth(config)
    const currentHeight = readBubbleHeight(config)

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
        </div>
    )
}

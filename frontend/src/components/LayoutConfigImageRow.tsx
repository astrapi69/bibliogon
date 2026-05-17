import React from "react"
import {useDebouncedCallback} from "../hooks/useDebouncedCallback"
import {useI18n} from "../hooks/useI18n"
import styles from "./LayoutConfigImageRow.module.css"

type ImagePosition = "left" | "center" | "right"
type ImageFit = "contain" | "cover"

interface BaseProps {
    config: Record<string, unknown> | null
    onChange: (partial: Record<string, unknown>) => void
}

const IMAGE_POSITIONS: readonly ImagePosition[] = ["left", "center", "right"]
const IMAGE_FITS: readonly ImageFit[] = ["contain", "cover"]
const DEFAULT_IMAGE_POSITION: ImagePosition = "center"
const DEFAULT_IMAGE_FIT: ImageFit = "contain"

const SPLIT_RATIO_MIN = 50
const SPLIT_RATIO_MAX = 70
const SPLIT_RATIO_STEP = 5
const DEFAULT_SPLIT_RATIO = 60

function readImagePosition(
    config: Record<string, unknown> | null,
): ImagePosition {
    const value = config?.image_position
    if (
        typeof value === "string" &&
        (IMAGE_POSITIONS as readonly string[]).includes(value)
    ) {
        return value as ImagePosition
    }
    return DEFAULT_IMAGE_POSITION
}

function readImageFit(config: Record<string, unknown> | null): ImageFit {
    const value = config?.image_fit
    if (
        typeof value === "string" &&
        (IMAGE_FITS as readonly string[]).includes(value)
    ) {
        return value as ImageFit
    }
    return DEFAULT_IMAGE_FIT
}

function readSplitRatio(config: Record<string, unknown> | null): number {
    const value = config?.split_ratio
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(SPLIT_RATIO_MIN, Math.min(SPLIT_RATIO_MAX, value))
    }
    return DEFAULT_SPLIT_RATIO
}

function ImageFitDropdown({
    value,
    onChange,
    testid,
}: {
    value: ImageFit
    onChange: (next: ImageFit) => void
    testid: string
}) {
    const {t} = useI18n()
    return (
        <label className={styles.fieldLabel}>
            <span className={styles.legend}>
                {t("ui.page_editor.config.image_fit", "Image fit")}
            </span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value as ImageFit)}
                data-testid={testid}
                className={styles.select}
            >
                <option value="contain">
                    {t("ui.page_editor.config.image_fit_contain", "Contain")}
                </option>
                <option value="cover">
                    {t("ui.page_editor.config.image_fit_cover", "Cover")}
                </option>
            </select>
        </label>
    )
}

function ImagePositionRadio({
    value,
    onChange,
}: {
    value: ImagePosition
    onChange: (next: ImagePosition) => void
}) {
    const {t} = useI18n()
    return (
        <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>
                {t("ui.page_editor.config.image_position", "Image position")}
            </legend>
            <div className={styles.radioRow}>
                {IMAGE_POSITIONS.map((pos) => (
                    <label
                        key={pos}
                        className={[
                            styles.radioCell,
                            value === pos ? styles.radioCellSelected : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                    >
                        <input
                            type="radio"
                            name="image_position"
                            value={pos}
                            checked={value === pos}
                            onChange={() => onChange(pos)}
                            data-testid={`image-position-${pos}`}
                            className={styles.radioInput}
                        />
                        <span>
                            {t(`ui.page_editor.config.image_position_${pos}`, pos)}
                        </span>
                    </label>
                ))}
            </div>
        </fieldset>
    )
}

/** image_top_text_bottom config: image-position radio +
 *  image-fit dropdown. */
export function LayoutConfigImageTopTextBottom({config, onChange}: BaseProps) {
    const {t} = useI18n()
    const position = readImagePosition(config)
    const fit = readImageFit(config)
    return (
        <div
            className={styles.container}
            data-testid="layout-config-image-top-text-bottom"
        >
            <h4 className={styles.heading}>
                {t(
                    "ui.page_editor.config.image_top_text_bottom.heading",
                    "Bild oben",
                )}
            </h4>
            <ImagePositionRadio
                value={position}
                onChange={(next) => onChange({image_position: next})}
            />
            <ImageFitDropdown
                value={fit}
                onChange={(next) => onChange({image_fit: next})}
                testid="image-top-image-fit"
            />
        </div>
    )
}

/** image_left_text_right config: split-ratio slider (50-70%
 *  image) + image-fit dropdown. */
export function LayoutConfigImageLeftTextRight({
    config,
    onChange,
}: BaseProps) {
    const {t} = useI18n()
    const splitRatio = readSplitRatio(config)
    const fit = readImageFit(config)
    const debouncedSplitChange = useDebouncedCallback((value: number) => {
        onChange({split_ratio: value})
    }, 300)
    return (
        <div
            className={styles.container}
            data-testid="layout-config-image-left-text-right"
        >
            <h4 className={styles.heading}>
                {t(
                    "ui.page_editor.config.image_left_text_right.heading",
                    "Bild links",
                )}
            </h4>
            <label className={styles.fieldLabel}>
                <span className={styles.legend}>
                    {t(
                        "ui.page_editor.config.split_ratio",
                        "Split ratio (image %)",
                    )}
                </span>
                <input
                    type="range"
                    min={SPLIT_RATIO_MIN}
                    max={SPLIT_RATIO_MAX}
                    step={SPLIT_RATIO_STEP}
                    defaultValue={splitRatio}
                    onChange={(e) =>
                        debouncedSplitChange(parseInt(e.target.value, 10))
                    }
                    data-testid="image-left-split-ratio-slider"
                    aria-label={t(
                        "ui.page_editor.config.split_ratio",
                        "Split ratio (image %)",
                    )}
                />
                <span
                    className={styles.sliderValue}
                    data-testid="image-left-split-ratio-value"
                >
                    {splitRatio}%
                </span>
            </label>
            <ImageFitDropdown
                value={fit}
                onChange={(next) => onChange({image_fit: next})}
                testid="image-left-image-fit"
            />
        </div>
    )
}

type TextPosition = "top" | "middle" | "bottom"
const TEXT_POSITIONS: readonly TextPosition[] = ["top", "middle", "bottom"]
const DEFAULT_TEXT_POSITION: TextPosition = "bottom"

const BACKDROP_OPACITY_MIN = 0.3
const BACKDROP_OPACITY_MAX = 0.8
const BACKDROP_OPACITY_STEP = 0.05
const DEFAULT_BACKDROP_OPACITY = 0.45

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

/** image_full_text_overlay config: text-position dropdown +
 *  backdrop-opacity slider. */
export function LayoutConfigImageFullTextOverlay({
    config,
    onChange,
}: BaseProps) {
    const {t} = useI18n()
    const position = readTextPosition(config)
    const opacity = readBackdropOpacity(config)
    const debouncedOpacityChange = useDebouncedCallback((value: number) => {
        onChange({text_backdrop_opacity: value})
    }, 300)
    return (
        <div
            className={styles.container}
            data-testid="layout-config-image-full-text-overlay"
        >
            <h4 className={styles.heading}>
                {t(
                    "ui.page_editor.config.image_full_text_overlay.heading",
                    "Vollbild",
                )}
            </h4>
            <label className={styles.fieldLabel}>
                <span className={styles.legend}>
                    {t("ui.page_editor.config.text_position", "Text position")}
                </span>
                <select
                    value={position}
                    onChange={(e) =>
                        onChange({text_position: e.target.value as TextPosition})
                    }
                    data-testid="image-full-text-position-select"
                    className={styles.select}
                >
                    <option value="top">
                        {t(
                            "ui.page_editor.config.text_position_top",
                            "Top",
                        )}
                    </option>
                    <option value="middle">
                        {t(
                            "ui.page_editor.config.text_position_middle",
                            "Middle",
                        )}
                    </option>
                    <option value="bottom">
                        {t(
                            "ui.page_editor.config.text_position_bottom",
                            "Bottom",
                        )}
                    </option>
                </select>
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
        </div>
    )
}

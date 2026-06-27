/**
 * Shared primitives for the picture-book image-layout config panels
 * (#207 god-file split). Types, config readers, the image-fit dropdown
 * and the image-position radio used by both the row layouts
 * (LayoutConfigImageRow.tsx) and the overlay layout
 * (LayoutConfigImageOverlay.tsx). Extracted verbatim; data-testids
 * unchanged.
 */

import { useI18n } from "../../../hooks/useI18n"
import { RadixSelect } from "../../shared/RadixSelect"
import styles from "../../LayoutConfigImageRow.module.css"

export type ImagePosition = "left" | "center" | "right"
export type ImageFit = "contain" | "cover"

export interface BaseProps {
    config: Record<string, unknown> | null
    onChange: (partial: Record<string, unknown>) => void
}

/** Per the adjudicated Q6 of the layout-expansion plan: mirror
 *  layouts (image_bottom_text_top / image_right_text_left)
 *  share the same body component as their parents via a
 *  flipDirection prop. Only the heading label + testid differ;
 *  every other control + Tier-section mount is identical. */
export interface DirectionalProps extends BaseProps {
    flipDirection?: boolean
}

export const IMAGE_POSITIONS: readonly ImagePosition[] = ["left", "center", "right"]
export const IMAGE_FITS: readonly ImageFit[] = ["contain", "cover"]
export const DEFAULT_IMAGE_POSITION: ImagePosition = "center"
export const DEFAULT_IMAGE_FIT: ImageFit = "contain"

export const SPLIT_RATIO_MIN = 50
export const SPLIT_RATIO_MAX = 70
export const SPLIT_RATIO_STEP = 5
export const DEFAULT_SPLIT_RATIO = 60

export const BACKDROP_OPACITY_MIN = 0.3
export const BACKDROP_OPACITY_MAX = 0.8
export const BACKDROP_OPACITY_STEP = 0.05
export const DEFAULT_BACKDROP_OPACITY = 0.45

export function readImagePosition(
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

export function readImageFit(config: Record<string, unknown> | null): ImageFit {
    const value = config?.image_fit
    if (
        typeof value === "string" &&
        (IMAGE_FITS as readonly string[]).includes(value)
    ) {
        return value as ImageFit
    }
    return DEFAULT_IMAGE_FIT
}

export function readSplitRatio(config: Record<string, unknown> | null): number {
    const value = config?.split_ratio
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(SPLIT_RATIO_MIN, Math.min(SPLIT_RATIO_MAX, value))
    }
    return DEFAULT_SPLIT_RATIO
}

export function ImageFitDropdown({
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
            <RadixSelect
                value={value}
                onValueChange={(next) => onChange(next as ImageFit)}
                testId={testid}
                className="is-narrow"
                ariaLabel={t("ui.page_editor.config.image_fit", "Image fit")}
                options={[
                    {value: "contain", label: t("ui.page_editor.config.image_fit_contain", "Contain")},
                    {value: "cover", label: t("ui.page_editor.config.image_fit_cover", "Cover")},
                ]}
            />
        </label>
    )
}

export function ImagePositionRadio({
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

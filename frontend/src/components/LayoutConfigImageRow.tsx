import React from "react"
import {useDebouncedCallback} from "../hooks/useDebouncedCallback"
import {useI18n} from "../hooks/useI18n"
import {RadixSelect} from "./RadixSelect"
import {CollapsibleConfigSection} from "./CollapsibleConfigSection"
import {Tier1Section} from "./comics/Tier1Section"
import {Tier2Section} from "./comics/Tier2Section"
import styles from "./LayoutConfigImageRow.module.css"

type ImagePosition = "left" | "center" | "right"
type ImageFit = "contain" | "cover"

interface BaseProps {
    config: Record<string, unknown> | null
    onChange: (partial: Record<string, unknown>) => void
}

/** Per the adjudicated Q6 of the layout-expansion plan: mirror
 *  layouts (image_bottom_text_top / image_right_text_left)
 *  share the same body component as their parents via a
 *  flipDirection prop. Only the heading label + testid differ;
 *  every other control + Tier-section mount is identical. */
interface DirectionalProps extends BaseProps {
    flipDirection?: boolean
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
 *  image-fit dropdown + Tier 1+2 sections.
 *
 *  ``flipDirection`` (Phase 1 C4, 2026-05-28): when true, the
 *  same body renders as the mirror layout image_bottom_text_top
 *  (image below, text above). The heading + testid change; every
 *  other control + namespace flow is shared. Q6 adjudication:
 *  share via prop, not separate file. */
export function LayoutConfigImageTopTextBottom({
    config,
    onChange,
    flipDirection,
}: DirectionalProps) {
    const {t} = useI18n()
    const position = readImagePosition(config)
    const fit = readImageFit(config)
    const testid = flipDirection
        ? "layout-config-image-bottom-text-top"
        : "layout-config-image-top-text-bottom"
    const headingKey = flipDirection
        ? "ui.page_editor.config.image_bottom_text_top.heading"
        : "ui.page_editor.config.image_top_text_bottom.heading"
    const headingFallback = flipDirection ? "Bild unten" : "Bild oben"
    const tierPrefix = flipDirection ? "image-bottom-text" : "image-top-text"
    const tierI18nPrefix = flipDirection
        ? "ui.page_editor.config.image_bottom_text"
        : "ui.page_editor.config.image_top_text"
    return (
        <div className={styles.container} data-testid={testid}>
            <CollapsibleConfigSection
                storageKey="bibliogon-collapsible-page-editor-layout-config"
                heading={t(headingKey, headingFallback)}
                testidPrefix={testid}
            >
            <ImagePositionRadio
                value={position}
                onChange={(next) => onChange({image_position: next})}
            />
            <ImageFitDropdown
                value={fit}
                onChange={(next) => onChange({image_fit: next})}
                testid={`${tierPrefix.replace("-text", "")}-image-fit`}
            />
            {/*
             * PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 2 C1.
             * Tier 1+2 sections mounted with the prefix +
             * namespaced i18n keys. Per the same pattern as
             * overlay (Session 1 C5): no bubbles[0] wrapping
             * (single text region per page); writes flow flat
             * into the active layout's namespace via the
             * dispatcher's onChange + writeLayoutNamespace.
             */}
            <Tier1Section
                config={config}
                onChange={onChange}
                testidPrefix={tierPrefix}
                i18nKeyPrefix={tierI18nPrefix}
            />
            <Tier2Section
                config={config}
                onChange={onChange}
                testidPrefix={tierPrefix}
                i18nKeyPrefix={tierI18nPrefix}
            />
        </CollapsibleConfigSection>
        </div>
    )
}

/** image_left_text_right config: split-ratio slider (50-70%
 *  image) + image-fit dropdown.
 *
 *  ``flipDirection`` (Phase 1 C4, 2026-05-28): when true, the
 *  same body renders as the mirror layout image_right_text_left
 *  (image on right, text on left). Same controls + namespace
 *  flow; the canvas-side CSS flips the column order. Q6
 *  adjudication: share via prop. */
export function LayoutConfigImageLeftTextRight({
    config,
    onChange,
    flipDirection,
}: DirectionalProps) {
    const {t} = useI18n()
    const splitRatio = readSplitRatio(config)
    const fit = readImageFit(config)
    const debouncedSplitChange = useDebouncedCallback((value: number) => {
        onChange({split_ratio: value})
    }, 300)
    const testid = flipDirection
        ? "layout-config-image-right-text-left"
        : "layout-config-image-left-text-right"
    const headingKey = flipDirection
        ? "ui.page_editor.config.image_right_text_left.heading"
        : "ui.page_editor.config.image_left_text_right.heading"
    const headingFallback = flipDirection ? "Bild rechts" : "Bild links"
    const tierPrefix = flipDirection ? "image-right-text" : "image-left-text"
    const tierI18nPrefix = flipDirection
        ? "ui.page_editor.config.image_right_text"
        : "ui.page_editor.config.image_left_text"
    const sliderTestidBase = flipDirection ? "image-right" : "image-left"
    return (
        <div className={styles.container} data-testid={testid}>
            <CollapsibleConfigSection
                storageKey="bibliogon-collapsible-page-editor-layout-config"
                heading={t(headingKey, headingFallback)}
                testidPrefix={testid}
            >
            <label className={styles.fieldLabel}>
                <span className={styles.legend}>
                    {t(
                        "ui.page_editor.config.split_ratio",
                        "Split ratio (image %)",
                    )}
                </span>
                <input
                    type="range"
                    className="slider"
                    min={SPLIT_RATIO_MIN}
                    max={SPLIT_RATIO_MAX}
                    step={SPLIT_RATIO_STEP}
                    defaultValue={splitRatio}
                    onChange={(e) =>
                        debouncedSplitChange(parseInt(e.target.value, 10))
                    }
                    data-testid={`${sliderTestidBase}-split-ratio-slider`}
                    aria-label={t(
                        "ui.page_editor.config.split_ratio",
                        "Split ratio (image %)",
                    )}
                />
                <span
                    className={styles.sliderValue}
                    data-testid={`${sliderTestidBase}-split-ratio-value`}
                >
                    {splitRatio}%
                </span>
            </label>
            <ImageFitDropdown
                value={fit}
                onChange={(next) => onChange({image_fit: next})}
                testid={`${sliderTestidBase}-image-fit`}
            />
            {/*
             * PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 2 C2.
             * Tier 1+2 sections mounted with the dynamic testid
             * prefix + namespaced i18n keys. Same shape as
             * Session 2 C1 — single text region, no bubbles[0]
             * wrapping, writes flat into the active namespace.
             */}
            <Tier1Section
                config={config}
                onChange={onChange}
                testidPrefix={tierPrefix}
                i18nKeyPrefix={tierI18nPrefix}
            />
            <Tier2Section
                config={config}
                onChange={onChange}
                testidPrefix={tierPrefix}
                i18nKeyPrefix={tierI18nPrefix}
            />
        </CollapsibleConfigSection>
        </div>
    )
}

/** two_images_text_center config (Picture-Book Layout Expansion
 *  Phase 2 C2, 2026-05-28).
 *
 *  Multi-image layout: 3-row grid — primary image on top, centred
 *  text band, secondary image on bottom. M1 storage: PRIMARY image
 *  stays on Page.image_asset_id (uploaded via PageCanvas's primary
 *  image affordance, unchanged); SECONDARY image lives in
 *  layout_config[layout].secondary_image_asset_id (uploaded via
 *  PageCanvas's secondary image affordance, which mirrors the
 *  primary's CTA but writes through writeSecondaryImageAssetId).
 *
 *  Body controls: ``image_fit`` (shared across both images per the
 *  M1 design — both images share the same fit; differentiating per
 *  image-slot is a Phase 3 collage decision) + Tier 1+2 sections
 *  for the central text band (Tier-Property layout per the
 *  adjudicated Q4).
 *
 *  The body does NOT carry a secondary-asset picker — the asset
 *  upload affordance is on the canvas itself (mirrors the primary
 *  image upload), not in the properties pane. */
export function LayoutConfigTwoImagesTextCenter({
    config,
    onChange,
}: BaseProps) {
    const {t} = useI18n()
    const fit = readImageFit(config)
    return (
        <div
            className={styles.container}
            data-testid="layout-config-two-images-text-center"
        >
            <CollapsibleConfigSection
                storageKey="bibliogon-collapsible-page-editor-layout-config"
                heading={t( "ui.page_editor.config.two_images_text_center.heading", "Zwei Bilder mit zentriertem Text", )}
                testidPrefix="layout-config-two-images-text-center"
            >
            <ImageFitDropdown
                value={fit}
                onChange={(next) => onChange({image_fit: next})}
                testid="two-images-text-center-image-fit"
            />
            <Tier1Section
                config={config}
                onChange={onChange}
                testidPrefix="two-images-text-center"
                i18nKeyPrefix="ui.page_editor.config.two_images_text_center"
            />
            <Tier2Section
                config={config}
                onChange={onChange}
                testidPrefix="two-images-text-center"
                i18nKeyPrefix="ui.page_editor.config.two_images_text_center"
            />
        </CollapsibleConfigSection>
        </div>
    )
}

/** split_horizontal config (Picture-Book Layout Expansion
 *  Phase 2 C3, 2026-05-28).
 *
 *  Multi-image layout: two equal-width images side by side, with
 *  an optional Tier-Property caption row below (spanning both
 *  columns). Same body shape as two_images_text_center
 *  (``image_fit`` + Tier 1+2 for the caption) — both layouts
 *  share the M1 design where both images use a single image_fit
 *  field. The structural difference is purely in the grid
 *  template (CSS module); the controls are identical. */
export function LayoutConfigSplitHorizontal({config, onChange}: BaseProps) {
    const {t} = useI18n()
    const fit = readImageFit(config)
    return (
        <div
            className={styles.container}
            data-testid="layout-config-split-horizontal"
        >
            <CollapsibleConfigSection
                storageKey="bibliogon-collapsible-page-editor-layout-config"
                heading={t( "ui.page_editor.config.split_horizontal.heading", "Zwei Bilder nebeneinander", )}
                testidPrefix="layout-config-split-horizontal"
            >
            <ImageFitDropdown
                value={fit}
                onChange={(next) => onChange({image_fit: next})}
                testid="split-horizontal-image-fit"
            />
            <Tier1Section
                config={config}
                onChange={onChange}
                testidPrefix="split-horizontal"
                i18nKeyPrefix="ui.page_editor.config.split_horizontal"
            />
            <Tier2Section
                config={config}
                onChange={onChange}
                testidPrefix="split-horizontal"
                i18nKeyPrefix="ui.page_editor.config.split_horizontal"
            />
        </CollapsibleConfigSection>
        </div>
    )
}

/** split_vertical config (Picture-Book Layout Expansion
 *  Phase 2 C4, 2026-05-28).
 *
 *  Multi-image layout: two equal-height images directly stacked,
 *  with an optional thin Tier-Property caption strip at the
 *  bottom (45 / 45 / 10 row split). Distinct from
 *  two_images_text_center (40 / 20 / 40) — the images are
 *  adjacent here, so a 2-photo spread reads as one visual unit
 *  with a quiet footer instead of two halves split by text.
 *  Same body shape as the other multi-image bodies: image_fit +
 *  Tier 1+2 for the caption. */
export function LayoutConfigSplitVertical({config, onChange}: BaseProps) {
    const {t} = useI18n()
    const fit = readImageFit(config)
    return (
        <div
            className={styles.container}
            data-testid="layout-config-split-vertical"
        >
            <CollapsibleConfigSection
                storageKey="bibliogon-collapsible-page-editor-layout-config"
                heading={t( "ui.page_editor.config.split_vertical.heading", "Zwei Bilder gestapelt", )}
                testidPrefix="layout-config-split-vertical"
            >
            <ImageFitDropdown
                value={fit}
                onChange={(next) => onChange({image_fit: next})}
                testid="split-vertical-image-fit"
            />
            <Tier1Section
                config={config}
                onChange={onChange}
                testidPrefix="split-vertical"
                i18nKeyPrefix="ui.page_editor.config.split_vertical"
            />
            <Tier2Section
                config={config}
                onChange={onChange}
                testidPrefix="split-vertical"
                i18nKeyPrefix="ui.page_editor.config.split_vertical"
            />
        </CollapsibleConfigSection>
        </div>
    )
}

/** image_border_text_center config (Picture-Book Layout Expansion
 *  Phase 2 C5, 2026-05-28).
 *
 *  Single-image layout (NOT in MULTI_IMAGE_LAYOUTS — no secondary
 *  image affordance): the PRIMARY image fills the page; a centred,
 *  semi-transparent text panel sits on top. Visual effect: the
 *  image showing around the panel reads as a decorative "frame /
 *  border". Per the adjudicated Q4 it's a Tier-Property layout
 *  (text band carries Tier 1+2 styles).
 *
 *  Body controls: ``image_fit`` (contain vs cover for the frame)
 *  + ``text_backdrop_opacity`` (mirrors image_full_text_overlay
 *  but defaults to 0.5 not 0.45 so the frame visual is more
 *  prominent) + Tier 1+2 sections for the text panel content. */
export function LayoutConfigImageBorderTextCenter({
    config,
    onChange,
}: BaseProps) {
    const {t} = useI18n()
    const fit = readImageFit(config)
    const backdropOpacity =
        typeof config?.text_backdrop_opacity === "number" &&
        Number.isFinite(config.text_backdrop_opacity)
            ? Math.max(
                  BACKDROP_OPACITY_MIN,
                  Math.min(
                      BACKDROP_OPACITY_MAX,
                      config.text_backdrop_opacity as number,
                  ),
              )
            : 0.5
    const debouncedBackdropChange = useDebouncedCallback((value: number) => {
        onChange({text_backdrop_opacity: value})
    }, 300)
    return (
        <div
            className={styles.container}
            data-testid="layout-config-image-border-text-center"
        >
            <CollapsibleConfigSection
                storageKey="bibliogon-collapsible-page-editor-layout-config"
                heading={t( "ui.page_editor.config.image_border_text_center.heading", "Bild als Rahmen, zentrierter Text", )}
                testidPrefix="layout-config-image-border-text-center"
            >
            <ImageFitDropdown
                value={fit}
                onChange={(next) => onChange({image_fit: next})}
                testid="image-border-text-center-image-fit"
            />
            <label className={styles.fieldLabel}>
                <span className={styles.legend}>
                    {t(
                        "ui.page_editor.config.text_backdrop_opacity",
                        "Text-Hintergrund Deckkraft",
                    )}
                </span>
                <input
                    type="range"
                    className="slider"
                    min={BACKDROP_OPACITY_MIN}
                    max={BACKDROP_OPACITY_MAX}
                    step={BACKDROP_OPACITY_STEP}
                    defaultValue={backdropOpacity}
                    onChange={(e) =>
                        debouncedBackdropChange(parseFloat(e.target.value))
                    }
                    data-testid="image-border-text-center-backdrop-opacity-slider"
                    aria-label={t(
                        "ui.page_editor.config.text_backdrop_opacity",
                        "Text-Hintergrund Deckkraft",
                    )}
                />
                <span
                    className={styles.sliderValue}
                    data-testid="image-border-text-center-backdrop-opacity-value"
                >
                    {backdropOpacity.toFixed(2)}
                </span>
            </label>
            <Tier1Section
                config={config}
                onChange={onChange}
                testidPrefix="image-border-text-center"
                i18nKeyPrefix="ui.page_editor.config.image_border_text_center"
            />
            <Tier2Section
                config={config}
                onChange={onChange}
                testidPrefix="image-border-text-center"
                i18nKeyPrefix="ui.page_editor.config.image_border_text_center"
            />
        </CollapsibleConfigSection>
        </div>
    )
}

/** image_full_no_text config (Phase 1 C4, 2026-05-28).
 *
 *  Minimal body: image_fit only (no text region → no Tier1/2,
 *  no image_position semantics — the image fills the panel).
 *  Per the adjudicated Q5: text_content is silent-ignored at
 *  render so there's nothing to style in the text region. */
export function LayoutConfigImageFullNoText({config, onChange}: BaseProps) {
    const {t} = useI18n()
    const fit = readImageFit(config)
    return (
        <div
            className={styles.container}
            data-testid="layout-config-image-full-no-text"
        >
            <CollapsibleConfigSection
                storageKey="bibliogon-collapsible-page-editor-layout-config"
                heading={t( "ui.page_editor.config.image_full_no_text.heading", "Vollbild (kein Text)", )}
                testidPrefix="layout-config-image-full-no-text"
            >
            <ImageFitDropdown
                value={fit}
                onChange={(next) => onChange({image_fit: next})}
                testid="image-full-no-text-image-fit"
            />
        </CollapsibleConfigSection>
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

/**
 * Picture-book image-row layout config panels (#207 god-file split).
 *
 * The row / split / border / full-no-text layout config bodies. Shared
 * primitives (readers, image-fit dropdown, image-position radio, consts)
 * live in layoutConfigImageShared.tsx; the full-text-overlay config lives
 * in LayoutConfigImageOverlay.tsx and is re-exported here so the barrel
 * (index.ts) and LayoutConfig.tsx importers are unchanged. data-testids
 * unchanged.
 */

import {useDebouncedCallback} from "../../hooks/ui/useDebouncedCallback"
import {useI18n} from "../../hooks/useI18n"
import {CollapsibleConfigSection} from "../shared/CollapsibleConfigSection"
import {Tier1Section} from "../comics/Tier1Section"
import {Tier2Section} from "../comics/Tier2Section"
import styles from "../LayoutConfigImageRow.module.css"
import {
    type BaseProps,
    type DirectionalProps,
    ImageFitDropdown,
    ImagePositionRadio,
    readImageFit,
    readImagePosition,
    readSplitRatio,
    SPLIT_RATIO_MIN,
    SPLIT_RATIO_MAX,
    SPLIT_RATIO_STEP,
    BACKDROP_OPACITY_MIN,
    BACKDROP_OPACITY_MAX,
    BACKDROP_OPACITY_STEP,
} from "./layout-config/layoutConfigImageShared"

export {LayoutConfigImageFullTextOverlay} from "./layout-config/LayoutConfigImageOverlay"

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

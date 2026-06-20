/**
 * Tier1Section — Visual-Style section of a bubble's per-bubble
 * config.
 *
 * Comics-Session-2 C5 — Recurring-Component-Unification canonical
 * 2-site extraction from
 * ``frontend/src/components/LayoutConfigSpeechBubble.tsx`` lines
 * 609-866.
 *
 * Used at two surfaces:
 * - Picture-book single-bubble (``LayoutConfigSpeechBubble``)
 * - Comic-book multi-bubble (``LayoutConfigComicBubble``)
 *
 * Backward-compat with the picture-book test surface is preserved
 * via the ``testidPrefix`` prop default ``"speech-bubble"`` and
 * the ``i18nKeyPrefix`` prop default
 * ``"ui.page_editor.config.speech_bubble"``. Comic-book passes
 * ``"comic-bubble"`` + ``"ui.page_editor.config.comic_bubble"``.
 *
 * 8 fields: background_color, border_color, border_width,
 * border_style, border_radius, shadow (toggle),
 * shadow_intensity, padding.
 */

import * as Collapsible from "@radix-ui/react-collapsible";

import {COLLAPSIBLE_CONTENT_ANIMATION} from "../CollapsibleConfigSection";
import {useCollapsibleState} from "../../hooks/ui/useCollapsibleState";
import {useDebouncedCallback} from "../../hooks/useDebouncedCallback";
import {useI18n} from "../../hooks/useI18n";
import {RadixSelect} from "../RadixSelect";

import styles from "./tier-section.module.css";
import {
    BORDER_RADIUS_MAX,
    BORDER_RADIUS_MIN,
    BORDER_RADIUS_STEP,
    BORDER_STYLES,
    type BorderStyle,
    BORDER_WIDTH_MAX,
    BORDER_WIDTH_MIN,
    BORDER_WIDTH_STEP,
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_BORDER_COLOR,
    PADDING_MAX,
    PADDING_MIN,
    PADDING_STEP,
    SHADOW_INTENSITY_MAX,
    SHADOW_INTENSITY_MIN,
    SHADOW_INTENSITY_STEP,
    readBorderRadius,
    readBorderStyle,
    readBorderWidth,
    readHexColor,
    readPadding,
    readShadow,
    readShadowIntensity,
} from "./bubbleConfigReads";

interface Tier1SectionProps {
    config: Record<string, unknown> | null;
    onChange: (partial: Record<string, unknown>) => void;
    testidPrefix?: string;
    i18nKeyPrefix?: string;
    defaultOpen?: boolean;
}

export function Tier1Section({
    config,
    onChange,
    testidPrefix = "speech-bubble",
    i18nKeyPrefix = "ui.page_editor.config.speech_bubble",
    defaultOpen = false,
}: Tier1SectionProps) {
    const {t} = useI18n();
    const {open, onOpenChange} = useCollapsibleState(
        `bibliogon-collapsible-${testidPrefix}-tier1`,
        defaultOpen,
    );

    const currentBackgroundColor = readHexColor(
        config,
        "background_color",
        DEFAULT_BACKGROUND_COLOR,
    );
    const currentBorderColor = readHexColor(
        config,
        "border_color",
        DEFAULT_BORDER_COLOR,
    );
    const currentBorderWidth = readBorderWidth(config);
    const currentBorderStyle = readBorderStyle(config);
    const currentBorderRadius = readBorderRadius(config);
    const currentShadow = readShadow(config);
    const currentShadowIntensity = readShadowIntensity(config);
    const currentPadding = readPadding(config);

    const debouncedBackgroundColorChange = useDebouncedCallback(
        (value: string) => onChange({background_color: value}),
        300,
    );
    const debouncedBorderColorChange = useDebouncedCallback(
        (value: string) => onChange({border_color: value}),
        300,
    );
    const debouncedBorderWidthChange = useDebouncedCallback(
        (value: number) => onChange({border_width: value}),
        300,
    );
    const debouncedBorderRadiusChange = useDebouncedCallback(
        (value: number) => onChange({border_radius: value}),
        300,
    );
    const debouncedShadowIntensityChange = useDebouncedCallback(
        (value: number) => onChange({shadow_intensity: value}),
        300,
    );
    const debouncedPaddingChange = useDebouncedCallback(
        (value: number) => onChange({padding: value}),
        300,
    );

    return (
        <Collapsible.Root
            open={open}
            onOpenChange={onOpenChange}
            data-testid={`${testidPrefix}-tier1-section`}
        >
            <Collapsible.Trigger asChild>
                <button
                    type="button"
                    className={styles.sectionTrigger}
                    data-testid={`${testidPrefix}-tier1-trigger`}
                    aria-expanded={open}
                >
                    <span className={styles.sectionChevron} aria-hidden>
                        {open ? "▾" : "▸"}
                    </span>
                    {t(`${i18nKeyPrefix}.tier1.heading`, "Visueller Stil")}
                </button>
            </Collapsible.Trigger>
            <Collapsible.Content
                className={`${styles.sectionContent} ${COLLAPSIBLE_CONTENT_ANIMATION}`}
            >
                <label className={styles.colorLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier1.background_color`,
                            "Hintergrundfarbe",
                        )}
                    </span>
                    <input
                        type="color"
                        value={currentBackgroundColor}
                        onChange={(e) =>
                            debouncedBackgroundColorChange(e.target.value)
                        }
                        data-testid={`${testidPrefix}-background-color`}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier1.background_color`,
                            "Hintergrundfarbe",
                        )}
                        className={styles.colorInput}
                    />
                </label>

                <label className={styles.colorLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier1.border_color`,
                            "Rahmenfarbe",
                        )}
                    </span>
                    <input
                        type="color"
                        value={currentBorderColor}
                        onChange={(e) =>
                            debouncedBorderColorChange(e.target.value)
                        }
                        data-testid={`${testidPrefix}-border-color`}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier1.border_color`,
                            "Rahmenfarbe",
                        )}
                        className={styles.colorInput}
                    />
                </label>

                <label className={styles.sliderLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier1.border_width`,
                            "Rahmenbreite",
                        )}
                    </span>
                    <input
                        type="range"
                        className="slider"
                        min={BORDER_WIDTH_MIN}
                        max={BORDER_WIDTH_MAX}
                        step={BORDER_WIDTH_STEP}
                        defaultValue={currentBorderWidth}
                        onChange={(e) =>
                            debouncedBorderWidthChange(
                                parseInt(e.target.value, 10),
                            )
                        }
                        data-testid={`${testidPrefix}-border-width-slider`}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier1.border_width`,
                            "Rahmenbreite",
                        )}
                    />
                    <span
                        className={styles.sliderValue}
                        data-testid={`${testidPrefix}-border-width-value`}
                    >
                        {currentBorderWidth}px
                    </span>
                </label>

                <label className={styles.selectLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier1.border_style`,
                            "Rahmenstil",
                        )}
                    </span>
                    <RadixSelect
                        value={currentBorderStyle}
                        onValueChange={(next) =>
                            onChange({border_style: next as BorderStyle})
                        }
                        testId={`${testidPrefix}-border-style`}
                        className="is-narrow"
                        ariaLabel={t(
                            `${i18nKeyPrefix}.tier1.border_style`,
                            "Rahmenstil",
                        )}
                        options={BORDER_STYLES.map((style) => ({
                            value: style,
                            label: t(
                                `${i18nKeyPrefix}.tier1.border_style_${style}`,
                                style.charAt(0).toUpperCase() + style.slice(1),
                            ),
                        }))}
                    />
                </label>

                <label className={styles.sliderLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier1.border_radius`,
                            "Eckenradius",
                        )}
                    </span>
                    <input
                        type="range"
                        className="slider"
                        min={BORDER_RADIUS_MIN}
                        max={BORDER_RADIUS_MAX}
                        step={BORDER_RADIUS_STEP}
                        defaultValue={currentBorderRadius}
                        onChange={(e) =>
                            debouncedBorderRadiusChange(
                                parseInt(e.target.value, 10),
                            )
                        }
                        data-testid={`${testidPrefix}-border-radius-slider`}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier1.border_radius`,
                            "Eckenradius",
                        )}
                    />
                    <span
                        className={styles.sliderValue}
                        data-testid={`${testidPrefix}-border-radius-value`}
                    >
                        {currentBorderRadius}%
                    </span>
                </label>

                <label className={styles.checkboxLabel}>
                    <input
                        type="checkbox"
                        checked={currentShadow}
                        onChange={(e) =>
                            onChange({shadow: e.target.checked})
                        }
                        data-testid={`${testidPrefix}-shadow-toggle`}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier1.shadow`,
                            "Schatten",
                        )}
                    />
                    <span>
                        {t(`${i18nKeyPrefix}.tier1.shadow`, "Schatten")}
                    </span>
                </label>

                <label className={styles.sliderLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier1.shadow_intensity`,
                            "Schattenintensität",
                        )}
                    </span>
                    <input
                        type="range"
                        className="slider"
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
                        data-testid={`${testidPrefix}-shadow-intensity-slider`}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier1.shadow_intensity`,
                            "Schattenintensität",
                        )}
                    />
                    <span
                        className={styles.sliderValue}
                        data-testid={`${testidPrefix}-shadow-intensity-value`}
                    >
                        {currentShadowIntensity}
                    </span>
                </label>

                <label className={styles.sliderLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier1.padding`,
                            "Innenabstand",
                        )}
                    </span>
                    <input
                        type="range"
                        className="slider"
                        min={PADDING_MIN}
                        max={PADDING_MAX}
                        step={PADDING_STEP}
                        defaultValue={currentPadding}
                        onChange={(e) =>
                            debouncedPaddingChange(
                                parseInt(e.target.value, 10),
                            )
                        }
                        data-testid={`${testidPrefix}-padding-slider`}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier1.padding`,
                            "Innenabstand",
                        )}
                    />
                    <span
                        className={styles.sliderValue}
                        data-testid={`${testidPrefix}-padding-value`}
                    >
                        {currentPadding}px
                    </span>
                </label>
            </Collapsible.Content>
        </Collapsible.Root>
    );
}

export default Tier1Section;

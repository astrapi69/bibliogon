/**
 * Tier2Section — Typography section of a bubble's per-bubble
 * config.
 *
 * Comics-Session-2 C5 — Recurring-Component-Unification canonical
 * 2-site extraction from
 * ``frontend/src/components/LayoutConfigSpeechBubble.tsx`` lines
 * 868-1063.
 *
 * Used at two surfaces:
 * - Picture-book single-bubble (``LayoutConfigSpeechBubble``)
 * - Comic-book multi-bubble (``LayoutConfigComicBubble``)
 *
 * Backward-compat with picture-book test surface preserved via
 * ``testidPrefix`` default ``"speech-bubble"`` and ``i18nKeyPrefix``
 * default ``"ui.page_editor.config.speech_bubble"``.
 *
 * 6 fields: font_family, font_size, font_weight, text_color,
 * text_align, italic (toggle).
 */

import * as Collapsible from "@radix-ui/react-collapsible";

import {COLLAPSIBLE_CONTENT_ANIMATION} from "../CollapsibleConfigSection";
import {useCollapsibleState} from "../../hooks/ui/useCollapsibleState";
import {useDebouncedCallback} from "../../hooks/useDebouncedCallback";
import {useI18n} from "../../hooks/useI18n";
import {RadixSelect} from "../RadixSelect";
import {
    PICTURE_BOOK_FONTS,
} from "../../data/picture-book-fonts";

import styles from "./tier-section.module.css";
import {
    DEFAULT_TEXT_COLOR,
    FONT_SIZE_MAX,
    FONT_SIZE_MIN,
    FONT_SIZE_STEP,
    FONT_WEIGHTS,
    type FontWeight,
    TEXT_ALIGNS,
    type TextAlign,
    readFontFamily,
    readFontSize,
    readFontWeight,
    readHexColor,
    readItalic,
    readTextAlign,
} from "./bubbleConfigReads";

interface Tier2SectionProps {
    config: Record<string, unknown> | null;
    onChange: (partial: Record<string, unknown>) => void;
    testidPrefix?: string;
    i18nKeyPrefix?: string;
    defaultOpen?: boolean;
}

export function Tier2Section({
    config,
    onChange,
    testidPrefix = "speech-bubble",
    i18nKeyPrefix = "ui.page_editor.config.speech_bubble",
    defaultOpen = false,
}: Tier2SectionProps) {
    const {t} = useI18n();
    const {open, onOpenChange} = useCollapsibleState(
        `bibliogon-collapsible-${testidPrefix}-tier2`,
        defaultOpen,
    );

    const currentFontFamily = readFontFamily(config);
    const currentFontSize = readFontSize(config);
    const currentFontWeight = readFontWeight(config);
    const currentTextColor = readHexColor(
        config,
        "text_color",
        DEFAULT_TEXT_COLOR,
    );
    const currentTextAlign = readTextAlign(config);
    const currentItalic = readItalic(config);

    const debouncedFontSizeChange = useDebouncedCallback(
        (value: number) => onChange({font_size: value}),
        300,
    );
    const debouncedTextColorChange = useDebouncedCallback(
        (value: string) => onChange({text_color: value}),
        300,
    );

    return (
        <Collapsible.Root
            open={open}
            onOpenChange={onOpenChange}
            data-testid={`${testidPrefix}-tier2-section`}
        >
            <Collapsible.Trigger asChild>
                <button
                    type="button"
                    className={styles.sectionTrigger}
                    data-testid={`${testidPrefix}-tier2-trigger`}
                    aria-expanded={open}
                >
                    <span className={styles.sectionChevron} aria-hidden>
                        {open ? "▾" : "▸"}
                    </span>
                    {t(`${i18nKeyPrefix}.tier2.heading`, "Typografie")}
                </button>
            </Collapsible.Trigger>
            <Collapsible.Content
                className={`${styles.sectionContent} ${COLLAPSIBLE_CONTENT_ANIMATION}`}
            >
                <label className={styles.selectLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier2.font_family`,
                            "Schriftart",
                        )}
                    </span>
                    <RadixSelect
                        value={currentFontFamily}
                        onValueChange={(next) =>
                            onChange({font_family: next})
                        }
                        testId={`${testidPrefix}-font-family`}
                        className="is-narrow"
                        ariaLabel={t(
                            `${i18nKeyPrefix}.tier2.font_family`,
                            "Schriftart",
                        )}
                        options={PICTURE_BOOK_FONTS.map((font) => ({
                            value: font.id,
                            label: font.label,
                        }))}
                    />
                </label>

                <label className={styles.sliderLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier2.font_size`,
                            "Schriftgröße",
                        )}
                    </span>
                    <input
                        type="range"
                        className="slider"
                        min={FONT_SIZE_MIN}
                        max={FONT_SIZE_MAX}
                        step={FONT_SIZE_STEP}
                        defaultValue={currentFontSize}
                        onChange={(e) =>
                            debouncedFontSizeChange(
                                parseInt(e.target.value, 10),
                            )
                        }
                        data-testid={`${testidPrefix}-font-size-slider`}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier2.font_size`,
                            "Schriftgröße",
                        )}
                    />
                    <span
                        className={styles.sliderValue}
                        data-testid={`${testidPrefix}-font-size-value`}
                    >
                        {currentFontSize}pt
                    </span>
                </label>

                <label className={styles.selectLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier2.font_weight`,
                            "Schriftstärke",
                        )}
                    </span>
                    <RadixSelect
                        value={currentFontWeight}
                        onValueChange={(next) =>
                            onChange({font_weight: next as FontWeight})
                        }
                        testId={`${testidPrefix}-font-weight`}
                        className="is-narrow"
                        ariaLabel={t(
                            `${i18nKeyPrefix}.tier2.font_weight`,
                            "Schriftstärke",
                        )}
                        options={FONT_WEIGHTS.map((weight) => ({
                            value: weight,
                            label: t(
                                `${i18nKeyPrefix}.tier2.font_weight_${weight}`,
                                weight.charAt(0).toUpperCase() + weight.slice(1),
                            ),
                        }))}
                    />
                </label>

                <label className={styles.colorLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier2.text_color`,
                            "Textfarbe",
                        )}
                    </span>
                    <input
                        type="color"
                        value={currentTextColor}
                        onChange={(e) =>
                            debouncedTextColorChange(e.target.value)
                        }
                        data-testid={`${testidPrefix}-text-color`}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier2.text_color`,
                            "Textfarbe",
                        )}
                        className={styles.colorInput}
                    />
                </label>

                <label className={styles.selectLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier2.text_align`,
                            "Textausrichtung",
                        )}
                    </span>
                    <RadixSelect
                        value={currentTextAlign}
                        onValueChange={(next) =>
                            onChange({text_align: next as TextAlign})
                        }
                        testId={`${testidPrefix}-text-align`}
                        className="is-narrow"
                        ariaLabel={t(
                            `${i18nKeyPrefix}.tier2.text_align`,
                            "Textausrichtung",
                        )}
                        options={TEXT_ALIGNS.map((align) => ({
                            value: align,
                            label: t(
                                `${i18nKeyPrefix}.tier2.text_align_${align}`,
                                align.charAt(0).toUpperCase() + align.slice(1),
                            ),
                        }))}
                    />
                </label>

                <label className={styles.checkboxLabel}>
                    <input
                        type="checkbox"
                        checked={currentItalic}
                        onChange={(e) =>
                            onChange({italic: e.target.checked})
                        }
                        data-testid={`${testidPrefix}-italic-toggle`}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier2.italic`,
                            "Kursiv",
                        )}
                    />
                    <span>
                        {t(`${i18nKeyPrefix}.tier2.italic`, "Kursiv")}
                    </span>
                </label>
            </Collapsible.Content>
        </Collapsible.Root>
    );
}

export default Tier2Section;

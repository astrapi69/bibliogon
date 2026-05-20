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

import {useState} from "react";
import * as Collapsible from "@radix-ui/react-collapsible";

import {useDebouncedCallback} from "../../hooks/useDebouncedCallback";
import {useI18n} from "../../hooks/useI18n";
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
    const [open, setOpen] = useState(defaultOpen);

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
            onOpenChange={setOpen}
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
            <Collapsible.Content className={styles.sectionContent}>
                <label className={styles.selectLabel}>
                    <span className={styles.legend}>
                        {t(
                            `${i18nKeyPrefix}.tier2.font_family`,
                            "Schriftart",
                        )}
                    </span>
                    <select
                        value={currentFontFamily}
                        onChange={(e) =>
                            onChange({font_family: e.target.value})
                        }
                        data-testid={`${testidPrefix}-font-family-select`}
                        className={styles.selectInput}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier2.font_family`,
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
                            `${i18nKeyPrefix}.tier2.font_size`,
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
                    <select
                        value={currentFontWeight}
                        onChange={(e) =>
                            onChange({
                                font_weight: e.target.value as FontWeight,
                            })
                        }
                        data-testid={`${testidPrefix}-font-weight-select`}
                        className={styles.selectInput}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier2.font_weight`,
                            "Schriftstärke",
                        )}
                    >
                        {FONT_WEIGHTS.map((weight) => (
                            <option key={weight} value={weight}>
                                {t(
                                    `${i18nKeyPrefix}.tier2.font_weight_${weight}`,
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
                    <select
                        value={currentTextAlign}
                        onChange={(e) =>
                            onChange({
                                text_align: e.target.value as TextAlign,
                            })
                        }
                        data-testid={`${testidPrefix}-text-align-select`}
                        className={styles.selectInput}
                        aria-label={t(
                            `${i18nKeyPrefix}.tier2.text_align`,
                            "Textausrichtung",
                        )}
                    >
                        {TEXT_ALIGNS.map((align) => (
                            <option key={align} value={align}>
                                {t(
                                    `${i18nKeyPrefix}.tier2.text_align_${align}`,
                                    align.charAt(0).toUpperCase() +
                                        align.slice(1),
                                )}
                            </option>
                        ))}
                    </select>
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

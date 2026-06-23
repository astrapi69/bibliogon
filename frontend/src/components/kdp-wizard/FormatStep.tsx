/**
 * KDP Publishing Wizard — format-selection step
 * (KDP-WIZARD-FORMAT-STEP-01).
 *
 * Lets the author choose the publication format (eBook / paperback /
 * hardcover) plus, for print formats, a KDP trim size and a margin
 * preset. The choice flows through the machine context and is consumed
 * by the KDP upload-guide step (which tells the author which file to
 * upload as which format, at which trim). Pure UI; offline-safe.
 *
 * Per-format PDF re-rendering with the applied bleed/trim is a noted
 * follow-up on #580 — this step captures + surfaces the decision.
 */

import {useI18n} from "../../hooks/useI18n";
import type {
    FormatState,
    KdpFormatKind,
    KdpMargin,
    KdpTrimSize,
} from "./machines/types";

interface Props {
    format: FormatState;
    onChange: (partial: Partial<FormatState>) => void;
}

const KINDS: KdpFormatKind[] = ["ebook", "paperback", "hardcover"];
const TRIM_SIZES: KdpTrimSize[] = ["5x8", "5.25x8", "5.5x8.5", "6x9", "7x10", "8.5x11"];
const MARGINS: KdpMargin[] = ["narrow", "normal", "wide"];

export default function FormatStep({format, onChange}: Props) {
    const {t} = useI18n();
    const isPrint = format.kind === "paperback" || format.kind === "hardcover";

    return (
        <div style={styles.stepContent} data-testid="kdp-publishing-wizard-step-2-format">
            <p style={styles.intro}>
                {t(
                    "ui.kdp_publishing_wizard.format_intro",
                    "Wähle das Veröffentlichungsformat. eBook ist EPUB; Taschenbuch und Hardcover sind Druck-PDFs mit Beschnitt.",
                )}
            </p>

            <fieldset
                style={styles.fieldset}
                role="radiogroup"
                aria-label={t("ui.kdp_publishing_wizard.format_kind_label", "Format")}
            >
                {KINDS.map((kind) => (
                    <label key={kind} style={styles.radioRow}>
                        <input
                            type="radio"
                            name="kdp-format-kind"
                            checked={format.kind === kind}
                            onChange={() => onChange({kind})}
                            data-testid={`kdp-publishing-wizard-format-kind-${kind}`}
                        />
                        <span>
                            {t(`ui.kdp_publishing_wizard.format_kind_${kind}`, FORMAT_FALLBACK[kind])}
                        </span>
                    </label>
                ))}
            </fieldset>

            {isPrint && (
                <div style={styles.printRow} data-testid="kdp-publishing-wizard-format-print-options">
                    <label style={styles.selectLabel}>
                        <span>{t("ui.kdp_publishing_wizard.format_trim_label", "Trim-Größe")}</span>
                        <select
                            className="input"
                            value={format.trim_size}
                            onChange={(e) =>
                                onChange({trim_size: e.target.value as KdpTrimSize})
                            }
                            data-testid="kdp-publishing-wizard-format-trim"
                        >
                            {TRIM_SIZES.map((size) => (
                                <option key={size} value={size}>
                                    {size.replace("x", " × ")} in
                                </option>
                            ))}
                        </select>
                    </label>
                    <label style={styles.selectLabel}>
                        <span>{t("ui.kdp_publishing_wizard.format_margin_label", "Ränder")}</span>
                        <select
                            className="input"
                            value={format.margin}
                            onChange={(e) =>
                                onChange({margin: e.target.value as KdpMargin})
                            }
                            data-testid="kdp-publishing-wizard-format-margin"
                        >
                            {MARGINS.map((margin) => (
                                <option key={margin} value={margin}>
                                    {t(
                                        `ui.kdp_publishing_wizard.format_margin_${margin}`,
                                        MARGIN_FALLBACK[margin],
                                    )}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            )}
        </div>
    );
}

const FORMAT_FALLBACK: Record<KdpFormatKind, string> = {
    ebook: "eBook (EPUB/KPF)",
    paperback: "Taschenbuch (PDF mit Beschnitt)",
    hardcover: "Hardcover (PDF mit Beschnitt)",
};

const MARGIN_FALLBACK: Record<KdpMargin, string> = {
    narrow: "Schmal",
    normal: "Normal",
    wide: "Breit",
};

const styles: Record<string, React.CSSProperties> = {
    stepContent: {
        minHeight: 280,
    },
    intro: {
        fontSize: "0.875rem",
        color: "var(--text-muted)",
        marginBottom: 16,
        lineHeight: 1.5,
    },
    fieldset: {
        border: "none",
        margin: 0,
        padding: 0,
        display: "grid",
        gap: 8,
    },
    radioRow: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: "0.875rem",
        color: "var(--text-primary)",
    },
    printRow: {
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        marginTop: 20,
    },
    selectLabel: {
        display: "grid",
        gap: 4,
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
    },
};

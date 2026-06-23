/**
 * KDP Publishing Wizard — final step: KDP upload guide
 * (KDP-WIZARD-UPLOAD-GUIDE-01).
 *
 * Pure content/UI: Bibliogon deliberately does NOT upload to KDP for
 * the user (see the export step's hint), so this step gives the
 * ordered "which file goes where" walkthrough plus a link to the KDP
 * bookshelf. No backend, no machine side effects — offline-safe.
 */

import {ExternalLink, BookOpen} from "lucide-react"

import {useI18n} from "../../hooks/useI18n"
import type {FormatState, KdpFormatKind} from "./machines/types"

const KDP_URL = "https://kdp.amazon.com";

const FORMAT_LABEL: Record<KdpFormatKind, string> = {
    ebook: "eBook",
    paperback: "Taschenbuch",
    hardcover: "Hardcover",
};

interface Props {
    /** The format chosen in the format step (KDP-WIZARD-FORMAT-STEP-01).
     *  Optional so per-step tests can render the guide standalone. */
    format?: FormatState;
}

export default function KdpGuideStep({format}: Props) {
    const {t} = useI18n();
    const steps = [
        t(
            "ui.kdp_publishing_wizard.guide_step_create",
            "Erstelle bei KDP einen neuen Titel (eBook oder Taschenbuch/Hardcover).",
        ),
        t(
            "ui.kdp_publishing_wizard.guide_step_manuscript",
            "Lade die Manuskript-Datei aus dem ZIP hoch: manuscript-ebook.epub für eBook, manuscript-paperback.pdf für den Druck.",
        ),
        t(
            "ui.kdp_publishing_wizard.guide_step_cover",
            "Lade die Cover-Datei hoch (cover.*).",
        ),
        t(
            "ui.kdp_publishing_wizard.guide_step_metadata",
            "Übertrage die Angaben aus metadata.json (Titel, Autor, Beschreibung, Kategorien, Keywords).",
        ),
        t(
            "ui.kdp_publishing_wizard.guide_step_price",
            "Lege den Preis fest (siehe den Preise-Schritt für Tantiemen + Mindestpreis) und veröffentliche.",
        ),
    ];

    return (
        <div style={styles.stepContent} data-testid="kdp-publishing-wizard-step-5-guide">
            <p style={styles.intro}>
                {t(
                    "ui.kdp_publishing_wizard.guide_intro",
                    "Bibliogon lädt nicht für dich hoch. So veröffentlichst du dein Paket bei KDP:",
                )}
            </p>

            <a
                href={KDP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={styles.kdpLink}
                data-testid="kdp-publishing-wizard-step-5-open-kdp"
            >
                <BookOpen size={14} />{" "}
                {t("ui.kdp_publishing_wizard.guide_open_kdp", "KDP-Bookshelf öffnen")}
                <ExternalLink size={12} />
            </a>

            {format && (
                <p
                    style={styles.formatSummary}
                    data-testid="kdp-publishing-wizard-step-5-format-summary"
                >
                    {t("ui.kdp_publishing_wizard.guide_format_label", "Gewähltes Format")}:{" "}
                    <strong>
                        {t(
                            `ui.kdp_publishing_wizard.format_kind_${format.kind}`,
                            FORMAT_LABEL[format.kind],
                        )}
                    </strong>
                    {format.kind !== "ebook" && (
                        <> · {format.trim_size.replace("x", " × ")} in</>
                    )}
                </p>
            )}

            <ol style={styles.list} data-testid="kdp-publishing-wizard-step-5-steps">
                {steps.map((stepText, index) => (
                    <li key={index} style={styles.listItem}>
                        {stepText}
                    </li>
                ))}
            </ol>

            <p style={styles.note}>
                {t(
                    "ui.kdp_publishing_wizard.guide_note",
                    "Prüfe den Cover-Validierungsbericht (cover-validation-report.json) im ZIP, falls KDP das Cover ablehnt.",
                )}
            </p>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    stepContent: {
        minHeight: 280,
    },
    intro: {
        fontSize: "0.875rem",
        color: "var(--text-muted)",
        marginBottom: 12,
        lineHeight: 1.5,
    },
    kdpLink: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 16,
        textDecoration: "none",
    },
    formatSummary: {
        fontSize: "0.8125rem",
        color: "var(--text-primary)",
        marginBottom: 12,
    },
    list: {
        margin: "0 0 16px",
        paddingLeft: "1.25rem",
        display: "grid",
        gap: 8,
        fontSize: "0.875rem",
        color: "var(--text-primary)",
        lineHeight: 1.5,
    },
    listItem: {
        paddingLeft: 4,
    },
    note: {
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
        lineHeight: 1.5,
    },
};

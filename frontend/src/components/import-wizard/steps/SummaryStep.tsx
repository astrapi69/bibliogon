import { AlertTriangle, FileText, Image as ImageIcon, Tag } from "lucide-react";
import { useI18n } from "../../../hooks/useI18n";
import type { DetectedProject } from "../../../api/import";

/**
 * Step 2 Summary — a deliberate user-acknowledgment step between
 * detection and configuration.
 *
 * Replaces the earlier "minimum-duration spinner" pattern: rather
 * than flashing a spinner and jumping straight to the preview, the
 * wizard now shows a short summary (format, counts, key filenames,
 * warnings) and requires a click to proceed. The user sees what
 * was found BEFORE the more demanding field-selection step.
 */
export function SummaryStep({
    detected,
    onNext,
    onBack,
}: {
    detected: DetectedProject;
    onNext: () => void;
    onBack: () => void;
}) {
    const { t } = useI18n();
    const cover = detected.assets.find(
        (a) => a.purpose === "cover" || a.purpose === "covers",
    );
    const cssAsset = detected.assets.find((a) => a.purpose === "css");

    return (
        <div data-testid="summary-step" style={{ padding: "4px 0" }}>
            <h3
                style={{
                    margin: "0 0 12px 0",
                    fontSize: "1.125rem",
                    fontWeight: 600,
                }}
            >
                {t(
                    "ui.import_wizard.summary_title",
                    "Detection complete",
                )}
            </h3>

            <dl
                data-testid="summary-list"
                style={{
                    margin: 0,
                    display: "grid",
                    gridTemplateColumns: "max-content 1fr",
                    columnGap: 12,
                    rowGap: 6,
                    fontSize: "0.875rem",
                }}
            >
                <dt style={dtStyle}>
                    {t("ui.import_wizard.summary_format", "Format")}
                </dt>
                <dd data-testid="summary-format" style={ddStyle}>
                    {detected.format_name}
                </dd>

                <dt style={dtStyle}>
                    <FileText size={12} style={{ verticalAlign: "-1px" }} />{" "}
                    {t("ui.import_wizard.summary_chapters", "Chapters")}
                </dt>
                <dd data-testid="summary-chapters" style={ddStyle}>
                    {detected.chapters.length}
                </dd>

                <dt style={dtStyle}>
                    <Tag size={12} style={{ verticalAlign: "-1px" }} />{" "}
                    {t("ui.import_wizard.summary_assets", "Assets")}
                </dt>
                <dd data-testid="summary-assets" style={ddStyle}>
                    {detected.assets.length}
                </dd>

                {cover && (
                    <>
                        <dt style={dtStyle}>
                            <ImageIcon
                                size={12}
                                style={{ verticalAlign: "-1px" }}
                            />{" "}
                            {t("ui.import_wizard.summary_cover", "Cover")}
                        </dt>
                        <dd data-testid="summary-cover" style={ddStyle}>
                            {cover.filename}
                        </dd>
                    </>
                )}

                {cssAsset && (
                    <>
                        <dt style={dtStyle}>
                            {t("ui.import_wizard.summary_css", "Custom CSS")}
                        </dt>
                        <dd data-testid="summary-css" style={ddStyle}>
                            {cssAsset.filename}
                        </dd>
                    </>
                )}
            </dl>

            {detected.warnings.length > 0 && (
                <div
                    data-testid="summary-warnings"
                    style={{
                        marginTop: 14,
                        padding: 10,
                        border: "1px solid var(--accent)",
                        background: "var(--accent-light)",
                        borderRadius: 6,
                    }}
                >
                    <strong
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: "0.875rem",
                            color: "var(--accent-hover)",
                        }}
                    >
                        <AlertTriangle size={14} />
                        {t(
                            "ui.import_wizard.warnings_heading",
                            "Warnings",
                        )}
                    </strong>
                    <ul style={{ margin: "6px 0 0 20px", padding: 0 }}>
                        {detected.warnings.map((w, i) => (
                            <li
                                key={i}
                                data-testid="summary-warning"
                                style={{ fontSize: "0.8125rem" }}
                            >
                                {w}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div
                data-testid="summary-step-footer"
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 20,
                    paddingTop: 16,
                    paddingBottom: 12,
                    borderTop: "1px solid var(--border)",
                    background: "var(--bg-primary)",
                    position: "sticky",
                    bottom: 0,
                    zIndex: 2,
                }}
            >
                <button
                    className="btn btn-secondary"
                    data-testid="summary-back"
                    onClick={onBack}
                >
                    {t("ui.import_wizard.button_back", "Back")}
                </button>
                <button
                    className="btn btn-primary"
                    data-testid="summary-next"
                    onClick={onNext}
                >
                    {t(
                        "ui.import_wizard.summary_next",
                        "Next: Review & Configure",
                    )}
                </button>
            </div>
        </div>
    );
}

const dtStyle: React.CSSProperties = {
    fontWeight: 500,
    color: "var(--text-secondary)",
};

const ddStyle: React.CSSProperties = {
    margin: 0,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
};

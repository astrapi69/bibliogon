import { useI18n } from "../../../../hooks/useI18n";
import type { DetectedAsset } from "../../../../api/import";
import { CoverThumbnail } from "./CoverThumbnail";
import { humanSize } from "./model";
import {
    muteStyle,
    sectionHeadingStyle,
    sectionStyle,
} from "./styles";

/**
 * Multi-cover selector: one radio per cover asset with a thumbnail.
 *
 * Rendered only when the source project ships more than one file
 * under ``assets/cover`` or ``assets/covers``. Picking a cover sends
 * the meta-override ``primary_cover: <filename>`` to the backend, which
 * promotes it onto ``book.cover_image`` and imports the rest as
 * ``asset_type="cover"`` rows for later swapping in the metadata editor.
 */
export function CoverGridSection({
    covers,
    primaryCover,
    onSelect,
    tempRef,
}: {
    covers: DetectedAsset[];
    primaryCover: string | null;
    onSelect: (filename: string) => void;
    tempRef?: string;
}) {
    const { t } = useI18n();
    return (
        <section
            data-testid="preview-section-covers"
            style={sectionStyle}
        >
            <h4 style={sectionHeadingStyle}>
                {t("ui.import_wizard.section_covers", "Covers")}
            </h4>
            <p style={{ ...muteStyle, margin: "4px 0 8px 0" }}>
                {t(
                    "ui.import_wizard.covers_hint",
                    "Multiple covers detected. Pick the primary cover for book.cover_image. All files are imported as cover assets and can be swapped later in the metadata editor.",
                )}
            </p>
            <div
                data-testid="preview-cover-grid"
                role="radiogroup"
                aria-label={t(
                    "ui.import_wizard.section_covers",
                    "Covers",
                )}
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fill, minmax(88px, 1fr))",
                    gap: 10,
                }}
            >
                {covers.map((cover) => {
                    const selected = cover.filename === primaryCover;
                    return (
                        <label
                            key={cover.filename}
                            data-testid={`preview-cover-option-${cover.filename}`}
                            data-selected={selected ? "true" : "false"}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                cursor: "pointer",
                                padding: 6,
                                border: selected
                                    ? "2px solid var(--accent)"
                                    : "1px solid var(--border)",
                                borderRadius: 6,
                                background: selected
                                    ? "var(--bg-hover)"
                                    : "var(--bg-primary)",
                                gap: 4,
                            }}
                        >
                            <input
                                type="radio"
                                name="preview-primary-cover"
                                value={cover.filename}
                                checked={selected}
                                onChange={() => onSelect(cover.filename)}
                                data-testid={`preview-cover-radio-${cover.filename}`}
                                style={{ position: "absolute", opacity: 0 }}
                                aria-label={cover.filename}
                            />
                            <CoverThumbnail cover={cover} tempRef={tempRef} />
                            <span
                                style={{
                                    fontSize: "0.6875rem",
                                    color: "var(--text-secondary)",
                                    textAlign: "center",
                                    wordBreak: "break-all",
                                    maxWidth: "100%",
                                }}
                                title={cover.path}
                            >
                                {cover.filename}
                            </span>
                        </label>
                    );
                })}
            </div>
        </section>
    );
}

/**
 * Author assets section: portraits, signatures, bio images.
 *
 * Read-only preview. All files classified with purpose="author-asset"
 * (``assets/author/``, ``assets/authors/``, ``assets/about-author/``)
 * are imported verbatim with asset_type="author-asset" so the metadata
 * editor Design tab can surface them separately from chapter figures.
 * The user cannot deselect here; imports track source fidelity.
 */
export function AuthorAssetsSection({
    assets,
    tempRef,
}: {
    assets: DetectedAsset[];
    tempRef?: string;
}) {
    const { t } = useI18n();
    return (
        <section
            data-testid="preview-section-author-assets"
            style={sectionStyle}
        >
            <h4 style={sectionHeadingStyle}>
                {t(
                    "ui.import_wizard.section_author_assets",
                    "Author assets",
                )}{" "}
                <span
                    data-testid="preview-author-assets-count"
                    style={muteStyle}
                >
                    ({assets.length})
                </span>
            </h4>
            <p style={{ ...muteStyle, margin: "4px 0 8px 0" }}>
                {t(
                    "ui.import_wizard.author_assets_hint",
                    "Portrait, signature, or bio images imported for the Design tab of the metadata editor.",
                )}
            </p>
            <div
                data-testid="preview-author-assets-grid"
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fill, minmax(88px, 1fr))",
                    gap: 10,
                }}
            >
                {assets.map((asset) => (
                    <div
                        key={asset.filename}
                        data-testid={`preview-author-asset-${asset.filename}`}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            padding: 6,
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            background: "var(--bg-primary)",
                            gap: 4,
                        }}
                    >
                        <CoverThumbnail cover={asset} tempRef={tempRef} />
                        <span
                            style={{
                                fontSize: "0.6875rem",
                                color: "var(--text-secondary)",
                                textAlign: "center",
                                wordBreak: "break-all",
                                maxWidth: "100%",
                            }}
                            title={asset.path}
                        >
                            {asset.filename}
                        </span>
                        <span
                            style={{
                                fontSize: "0.625rem",
                                color: "var(--text-muted)",
                            }}
                        >
                            {humanSize(asset.size_bytes)}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

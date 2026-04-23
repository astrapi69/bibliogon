import { useState } from "react";
import { BookOpen, ChevronRight, ImageOff } from "lucide-react";
import { useI18n } from "../../../hooks/useI18n";
import type {
    DetectedAsset,
    DetectedChapter,
    DetectedProject,
} from "../../../api/import";

function humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function groupAssetsByPurpose(
    assets: DetectedAsset[],
): Record<string, DetectedAsset[]> {
    const groups: Record<string, DetectedAsset[]> = {};
    for (const a of assets) {
        const key = a.purpose || "other";
        groups[key] = groups[key] || [];
        groups[key].push(a);
    }
    return groups;
}

export function PreviewPanel({ detected }: { detected: DetectedProject }) {
    const { t } = useI18n();
    const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
    const assetGroups = groupAssetsByPurpose(detected.assets);
    const hasCover =
        (assetGroups["cover"] ?? []).length > 0 ||
        (assetGroups["covers"] ?? []).length > 0;

    return (
        <div data-testid="preview-panel" className="preview-panel">
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 200px) minmax(0, 1fr)",
                    gap: 24,
                }}
                className="preview-panel-grid"
            >
                {/* Left: metadata + cover */}
                <div>
                    <CoverThumbnail
                        cover={
                            (assetGroups["cover"] ?? [])[0] ??
                            (assetGroups["covers"] ?? [])[0] ??
                            null
                        }
                    />
                    <h3
                        data-testid="preview-title"
                        style={{ margin: "12px 0 4px 0", fontSize: "1.125rem" }}
                    >
                        {detected.title ??
                            t("ui.import_wizard.untitled_book", "Untitled")}
                    </h3>
                    <p
                        data-testid="preview-author"
                        style={{
                            margin: "0 0 12px 0",
                            fontSize: "0.875rem",
                            color: "var(--text-secondary)",
                        }}
                    >
                        {detected.author ??
                            t("ui.import_wizard.unknown_author", "Unknown author")}
                    </p>
                    {detected.language && (
                        <p
                            data-testid="preview-language"
                            style={{
                                margin: 0,
                                fontSize: "0.75rem",
                                color: "var(--text-muted)",
                            }}
                        >
                            {t("ui.import_wizard.language_label", "Language")}:{" "}
                            {detected.language}
                        </p>
                    )}
                    <p
                        data-testid="preview-source-identifier"
                        style={{
                            marginTop: 8,
                            fontSize: "0.6875rem",
                            fontFamily: "var(--font-mono)",
                            color: "var(--text-muted)",
                            wordBreak: "break-all",
                        }}
                    >
                        {detected.source_identifier}
                    </p>
                </div>

                {/* Right: chapters + assets */}
                <div>
                    <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9375rem" }}>
                        <BookOpen size={14} style={{ verticalAlign: "-2px" }} />{" "}
                        {t(
                            "ui.import_wizard.chapters_count",
                            "{count} chapters detected",
                        ).replace("{count}", String(detected.chapters.length))}
                    </h4>
                    {detected.chapters.length === 0 ? (
                        <p
                            data-testid="preview-no-chapters"
                            style={{
                                fontSize: "0.8125rem",
                                color: "var(--text-muted)",
                                fontStyle: "italic",
                            }}
                        >
                            {t(
                                "ui.import_wizard.no_chapters_detected",
                                "No chapters detected.",
                            )}
                        </p>
                    ) : (
                        <ul
                            data-testid="preview-chapter-list"
                            style={{
                                listStyle: "none",
                                padding: 0,
                                margin: 0,
                                maxHeight: 240,
                                overflowY: "auto",
                                border: "1px solid var(--border)",
                                borderRadius: 6,
                            }}
                        >
                            {detected.chapters.map((ch, idx) => (
                                <ChapterRow
                                    key={idx}
                                    chapter={ch}
                                    expanded={expandedChapter === idx}
                                    onToggle={() =>
                                        setExpandedChapter(
                                            expandedChapter === idx ? null : idx,
                                        )
                                    }
                                />
                            ))}
                        </ul>
                    )}

                    <h4
                        style={{
                            margin: "16px 0 8px 0",
                            fontSize: "0.9375rem",
                        }}
                    >
                        {t(
                            "ui.import_wizard.assets_count",
                            "{count} assets detected",
                        ).replace("{count}", String(detected.assets.length))}
                    </h4>
                    {detected.assets.length === 0 ? (
                        <p
                            data-testid="preview-no-assets"
                            style={{
                                fontSize: "0.8125rem",
                                color: "var(--text-muted)",
                                fontStyle: "italic",
                            }}
                        >
                            {t(
                                "ui.import_wizard.no_assets_detected",
                                "No assets detected.",
                            )}
                        </p>
                    ) : (
                        <AssetGroups groups={assetGroups} />
                    )}
                </div>
            </div>

            {/* Warnings below both columns */}
            {detected.warnings.length > 0 && (
                <div
                    data-testid="preview-warnings"
                    style={{
                        marginTop: 20,
                        padding: 12,
                        border: "1px solid var(--accent)",
                        background: "var(--accent-light)",
                        borderRadius: 6,
                    }}
                >
                    <h4
                        style={{
                            margin: "0 0 6px 0",
                            fontSize: "0.875rem",
                            color: "var(--accent-hover)",
                        }}
                    >
                        {t("ui.import_wizard.warnings_heading", "Warnings")}
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {detected.warnings.map((w, i) => (
                            <li
                                key={i}
                                data-testid="preview-warning"
                                style={{ fontSize: "0.8125rem" }}
                            >
                                {w}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {!hasCover && detected.assets.length > 0 && (
                <p
                    data-testid="preview-no-cover-hint"
                    style={{
                        marginTop: 12,
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                    }}
                >
                    {t(
                        "ui.import_wizard.hint_no_cover",
                        "No cover image detected; you can assign one below.",
                    )}
                </p>
            )}
        </div>
    );
}

function ChapterRow({
    chapter,
    expanded,
    onToggle,
}: {
    chapter: DetectedChapter;
    expanded: boolean;
    onToggle: () => void;
}) {
    return (
        <li
            data-testid="preview-chapter-row"
            style={{ borderBottom: "1px solid var(--border)", padding: "8px 10px" }}
        >
            <button
                onClick={onToggle}
                style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    textAlign: "left",
                }}
                aria-expanded={expanded}
            >
                <ChevronRight
                    size={12}
                    style={{
                        transform: expanded ? "rotate(90deg)" : "rotate(0)",
                        transition: "transform 120ms",
                    }}
                />
                <span
                    style={{
                        flex: 1,
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {chapter.position + 1}. {chapter.title}
                </span>
                <span
                    style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                    }}
                >
                    {chapter.word_count}w
                </span>
            </button>
            {expanded && chapter.content_preview && (
                <p
                    data-testid="preview-chapter-expanded"
                    style={{
                        margin: "6px 0 0 18px",
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-mono)",
                        whiteSpace: "pre-wrap",
                    }}
                >
                    {chapter.content_preview}
                </p>
            )}
        </li>
    );
}

function AssetGroups({ groups }: { groups: Record<string, DetectedAsset[]> }) {
    const { t } = useI18n();
    const order = ["cover", "covers", "figure", "css", "font", "other"];
    const keys = [
        ...order.filter((k) => groups[k] && groups[k].length),
        ...Object.keys(groups).filter((k) => !order.includes(k)),
    ];
    return (
        <div
            data-testid="preview-asset-groups"
            style={{
                maxHeight: 200,
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: 6,
            }}
        >
            {keys.map((purpose) => (
                <div key={purpose} style={{ padding: "6px 10px" }}>
                    <div
                        style={{
                            fontSize: "0.6875rem",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--text-muted)",
                            marginBottom: 4,
                        }}
                    >
                        {t(`ui.import_wizard.purpose_${purpose}`, purpose)} (
                        {groups[purpose].length})
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {groups[purpose].map((asset, i) => (
                            <li
                                key={i}
                                data-testid="preview-asset-row"
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    fontSize: "0.8125rem",
                                    padding: "2px 0",
                                }}
                            >
                                <span
                                    style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                    title={asset.path}
                                >
                                    {asset.filename}
                                </span>
                                <span
                                    style={{
                                        color: "var(--text-muted)",
                                        flexShrink: 0,
                                    }}
                                >
                                    {humanSize(asset.size_bytes)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

function CoverThumbnail({ cover }: { cover: DetectedAsset | null }) {
    if (!cover || !cover.mime_type.startsWith("image/")) {
        return (
            <div
                data-testid="preview-cover-placeholder"
                style={{
                    width: "100%",
                    aspectRatio: "3/4",
                    background: "var(--bg-hover)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 6,
                    color: "var(--text-muted)",
                }}
                aria-label="No cover"
            >
                <ImageOff size={32} strokeWidth={1.25} />
            </div>
        );
    }
    // We can't load the asset here (it's not extracted yet); show a
    // filename-labelled placeholder box in cover shape.
    return (
        <div
            data-testid="preview-cover-thumbnail"
            style={{
                width: "100%",
                aspectRatio: "3/4",
                background: "var(--bg-hover)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                textAlign: "center",
                padding: 8,
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
            }}
        >
            {cover.filename}
        </div>
    );
}

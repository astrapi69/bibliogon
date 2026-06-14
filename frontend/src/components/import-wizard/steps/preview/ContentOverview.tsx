import { useState } from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import { useI18n } from "../../../../hooks/useI18n";
import type {
    DetectedAsset,
    DetectedChapter,
    DetectedProject,
} from "../../../../api/import";
import { humanSize } from "./model";

export function ChapterAndAssetOverview({
    detected,
    assetGroups,
}: {
    detected: DetectedProject;
    assetGroups: Record<string, DetectedAsset[]>;
}) {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState<number | null>(null);
    return (
        <>
            <h5 style={{ margin: "0 0 6px 0", fontSize: "0.875rem" }}>
                <BookOpen size={12} style={{ verticalAlign: "-1px" }} />{" "}
                {t(
                    "ui.import_wizard.chapters_count",
                    "{count} chapters detected",
                ).replace("{count}", String(detected.chapters.length))}
            </h5>
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
                        maxHeight: 180,
                        overflowY: "auto",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                    }}
                >
                    {detected.chapters.map((ch, idx) => (
                        <ChapterRow
                            key={idx}
                            chapter={ch}
                            expanded={expanded === idx}
                            onToggle={() =>
                                setExpanded(expanded === idx ? null : idx)
                            }
                        />
                    ))}
                </ul>
            )}
            <h5 style={{ margin: "12px 0 6px 0", fontSize: "0.875rem" }}>
                {t(
                    "ui.import_wizard.assets_count",
                    "{count} assets detected",
                ).replace("{count}", String(detected.assets.length))}
            </h5>
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
        </>
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
            style={{ borderBottom: "1px solid var(--border)", padding: "6px 8px" }}
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
                    size={10}
                    style={{
                        transform: expanded ? "rotate(90deg)" : "rotate(0)",
                        transition: "transform 120ms",
                    }}
                />
                <span
                    style={{
                        flex: 1,
                        fontSize: "0.8125rem",
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
                        fontSize: "0.6875rem",
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
                        margin: "6px 0 0 16px",
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
    const order = [
        "cover",
        "covers",
        "author-asset",
        "figure",
        "css",
        "font",
        "other",
    ];
    const keys = [
        ...order.filter((k) => groups[k] && groups[k].length),
        ...Object.keys(groups).filter((k) => !order.includes(k)),
    ];
    return (
        <div
            data-testid="preview-asset-groups"
            style={{
                maxHeight: 160,
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: 6,
            }}
        >
            {keys.map((purpose) => (
                <div key={purpose} style={{ padding: "4px 8px" }}>
                    <div
                        style={{
                            fontSize: "0.6875rem",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--text-muted)",
                            marginBottom: 2,
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
                                    gap: 10,
                                    fontSize: "0.75rem",
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

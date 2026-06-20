import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { getStorage } from "../../storage";
import { useAssetUrl } from "../../hooks/useAssetUrl";
import { notify } from "../../utils/platform/notify";
import { useI18n } from "../../hooks/useI18n";

/**
 * Author-assets panel: read-only thumbnail grid for files imported
 * under ``assets/author/``, ``assets/authors/``, or
 * ``assets/about-author/`` (purpose="author-asset" at detect time,
 * asset_type="author-asset" at execute time).
 *
 * Rendered in the Design tab so portraits, signatures, and bio images
 * are discoverable in the metadata editor. Delete per file; upload
 * support lives behind a separate backend validator bump and is not
 * wired here.
 */
/** A single author-asset thumbnail. Resolves the image src across storage
 *  modes (served URL online, IndexedDB blob URL offline). */
function AuthorAssetImage({ bookId, filename }: { bookId: string; filename: string }) {
    const src = useAssetUrl(bookId, filename);
    return (
        <img
            src={src ?? undefined}
            alt={filename}
            style={{
                width: "100%",
                aspectRatio: "3/4",
                objectFit: "cover",
                borderRadius: 4,
                background: "var(--bg-hover)",
            }}
        />
    );
}

export function AuthorAssetsPanel({ bookId }: { bookId: string }) {
    const { t } = useI18n();
    const [assets, setAssets] = useState<
        { id: string; filename: string; asset_type: string; path: string }[]
    >([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getStorage()
            .assets.list(bookId)
            .then((rows) => {
                if (cancelled) return;
                setAssets(rows.filter((a) => a.asset_type === "author-asset"));
            })
            .catch(() => {
                if (!cancelled) setAssets([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [bookId]);

    const handleDelete = async (assetId: string) => {
        try {
            await getStorage().assets.delete(bookId, assetId);
            setAssets((prev) => prev.filter((a) => a.id !== assetId));
            notify.success(t("ui.metadata.author_asset_deleted", "Autor-Asset gelöscht"));
        } catch (err) {
            notify.error(
                t("ui.metadata.author_asset_delete_failed", "Löschen fehlgeschlagen"),
                err,
            );
        }
    };

    if (loading || assets.length === 0) {
        return null;
    }

    return (
        <div className="field" data-testid="author-assets-panel" style={{ flex: 1, marginTop: 16 }}>
            <label className="label">
                {t("ui.metadata.author_assets", "Autoren-Bilder")}{" "}
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                    ({assets.length})
                </span>
            </label>
            <p style={{ margin: "4px 0 8px 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {t(
                    "ui.metadata.author_assets_hint",
                    "Portrait-, Signatur- oder Bio-Bilder aus dem Import (assets/author/).",
                )}
            </p>
            <div
                data-testid="author-assets-grid"
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: 10,
                }}
            >
                {assets.map((asset) => (
                    <div
                        key={asset.id}
                        data-testid={`author-asset-${asset.filename}`}
                        style={{
                            position: "relative",
                            padding: 6,
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            background: "var(--bg-primary)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 4,
                        }}
                    >
                        <AuthorAssetImage bookId={bookId} filename={asset.filename} />
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
                        <button
                            type="button"
                            data-testid={`author-asset-delete-${asset.filename}`}
                            onClick={() => handleDelete(asset.id)}
                            aria-label={t("ui.metadata.author_asset_delete", "Löschen")}
                            style={{
                                position: "absolute",
                                top: 4,
                                right: 4,
                                padding: "2px 6px",
                                border: "1px solid var(--border)",
                                borderRadius: 4,
                                background: "var(--bg-card)",
                                color: "var(--danger)",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                            }}
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

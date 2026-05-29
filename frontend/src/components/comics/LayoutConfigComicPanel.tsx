/**
 * LayoutConfigComicPanel — per-panel config pane for a comic panel.
 *
 * PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01 (plugin-comics).
 *
 * C1: scaffold + Tier1Section RCU 3rd-site application.
 * C3: image-upload UI (file input + clear-image button) mirroring
 *     PageCanvas's upload pattern.
 *
 * Comic-book panel-side counterpart to ``LayoutConfigComicBubble``.
 * Differs in:
 *
 * 1. Operates on a SINGLE panel's row (NOT a layout_config dict).
 *    The active panel's full row is passed in; ``onChange`` carries
 *    a partial update merged at the API layer
 *    (``api.comics.updatePanel``).
 * 2. Reuses ``Tier1Section`` for visual-style knobs (RCU canonical
 *    3rd-site application, after picture-book single-bubble +
 *    comic-book bubble).
 * 3. Mounts a panel-image upload affordance. File input +
 *    ``api.assets.upload(bookId, file, "figure")`` -> ``onChange({
 *    image_asset_id: asset.id})``. Mirror of
 *    ``PageCanvas.handleFileChange``. The persisted image is
 *    surfaced in the editor body via the ``assetUrls`` map closed
 *    in C4.
 *
 * The Tier1Section receives ``testidPrefix="comic-panel"`` +
 * ``i18nKeyPrefix="ui.page_editor.config.comic_panel"`` so its
 * testids + i18n keys are namespace-scoped to comic-book-panel.
 */

import {useRef, useState} from "react";

import {api} from "../../api/client";
import {useI18n} from "../../hooks/useI18n";

import {Tier1Section} from "./Tier1Section";
import type {ComicPanelData} from "./ComicPanel";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

interface LayoutConfigComicPanelProps {
    panel: ComicPanelData;
    bookId: string;
    onChange: (partial: Partial<ComicPanelData>) => void;
}

export function LayoutConfigComicPanel({
    panel,
    bookId,
    onChange,
}: LayoutConfigComicPanelProps) {
    const {t} = useI18n();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const writePanelConfig = (partial: Record<string, unknown>): void => {
        const prior = panel.panel_config ?? {};
        onChange({panel_config: {...prior, ...partial}});
    };

    const handleFileChange = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ): Promise<void> => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setUploadError(null);
        try {
            const asset = await api.assets.upload(bookId, file, "figure");
            onChange({image_asset_id: asset.id});
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : String(err));
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleClearImage = (): void => {
        setUploadError(null);
        onChange({image_asset_id: null});
    };

    const hasImage = !!panel.image_asset_id;

    return (
        <div
            data-testid="layout-config-comic-panel"
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                padding: "14px",
            }}
        >
            <h4 style={{margin: 0}}>
                {t(
                    "ui.page_editor.config.comic_panel.heading",
                    "Panel",
                )}
            </h4>

            <div
                data-testid="comic-panel-image-section"
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                }}
            >
                <label style={{display: "flex", flexDirection: "column", gap: "4px"}}>
                    <span>
                        {t(
                            "ui.page_editor.config.comic_panel.image",
                            "Bild",
                        )}
                    </span>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPT}
                        onChange={handleFileChange}
                        disabled={uploading}
                        data-testid="comic-panel-image-input"
                        aria-label={t(
                            "ui.page_editor.config.comic_panel.image",
                            "Bild",
                        )}
                    />
                </label>
                {hasImage ? (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleClearImage}
                        disabled={uploading}
                        data-testid="comic-panel-image-clear"
                    >
                        {t(
                            "ui.page_editor.config.comic_panel.image_clear",
                            "Bild entfernen",
                        )}
                    </button>
                ) : null}
                {uploading ? (
                    <span
                        data-testid="comic-panel-image-uploading"
                        role="status"
                    >
                        {t(
                            "ui.page_editor.config.comic_panel.uploading",
                            "Wird hochgeladen...",
                        )}
                    </span>
                ) : null}
                {uploadError ? (
                    <div
                        role="alert"
                        data-testid="comic-panel-image-upload-error"
                        style={{color: "var(--danger, #c00)"}}
                    >
                        {uploadError}
                    </div>
                ) : null}
            </div>

            <Tier1Section
                config={panel.panel_config ?? null}
                onChange={writePanelConfig}
                testidPrefix="comic-panel"
                i18nKeyPrefix="ui.page_editor.config.comic_panel"
            />
        </div>
    );
}

export default LayoutConfigComicPanel;

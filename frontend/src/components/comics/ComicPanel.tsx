/**
 * ComicPanel — renders one comic_panels row as a CSS-Grid cell.
 *
 * Comics-Session-2 C5. Editor-side mirror of the walker's
 * ``_render_comic_panel`` in
 * ``plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py``.
 *
 * Each panel hosts N bubbles via N ``ComicBubble`` children. The
 * panel's image (if ``image_asset_id`` is set) fills the cell as
 * the background; bubbles render absolutely on top.
 *
 * When ``onUploadImage`` is provided the panel also hosts a
 * per-panel image-upload affordance (a centered placeholder on an
 * empty panel, a subtle corner button on a filled one), so a user
 * can set the panel image without the right sidebar — mirrors
 * PageCanvas's in-canvas upload for picture-book pages.
 *
 * The panel itself is ``position: relative`` so its absolutely-
 * positioned bubble children resolve correctly.
 */

import {useRef, type CSSProperties} from "react";
import {ImageUp} from "lucide-react";

import {useI18n} from "../../hooks/useI18n";
import ImageDropZone from "../../lib/components/ImageDropZone";
import {ComicBubble, type ComicBubbleData} from "./ComicBubble";

export interface ComicPanelData {
    id: string;
    page_id: string;
    position: number;
    image_asset_id?: string | null;
    bounds: Record<string, unknown>;
    panel_config?: Record<string, unknown> | null;
}

const UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

interface ComicPanelProps {
    panel: ComicPanelData;
    bubbles: ComicBubbleData[];
    imageUrl?: string | null;
    selected?: boolean;
    onClick?: () => void;
    onBubbleClick?: (bubbleId: string) => void;
    /** Fires once on bubble pointer-up after a drag exceeded the
     *  5px threshold. The receiver should persist the new anchor
     *  via the existing ``getStorage().comics.updateBubble`` path. */
    onBubbleDragEnd?: (bubbleId: string, x_pct: number, y_pct: number) => void;
    /** Fires once on tail-handle pointer-up after a drag exceeded
     *  the 5px threshold. Persists the new (direction, position,
     *  length) triple via the existing getStorage().comics.updateBubble. */
    onBubbleTailDragEnd?: (
        bubbleId: string,
        direction: string,
        positionPct: number,
        lengthPx: number,
    ) => void;
    selectedBubbleId?: string | null;
    /** When provided, renders an in-panel upload affordance whose file
     *  picker uploads + assigns the image to THIS panel. The handler
     *  receives the picked file; the caller owns the upload + persist
     *  (``assets.upload`` -> ``comics.updatePanel`` image_asset_id).
     *  Omitted on read-only grids (PageCanvas preview, template picker). */
    onUploadImage?: (file: File) => void;
}

export function ComicPanel({
    panel,
    bubbles,
    imageUrl,
    selected,
    onClick,
    onBubbleClick,
    onBubbleDragEnd,
    onBubbleTailDragEnd,
    selectedBubbleId,
    onUploadImage,
}: ComicPanelProps) {
    const {t} = useI18n();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const config = panel.panel_config ?? {};
    const borderStyle =
        typeof config.border_style === "string" ? config.border_style : "solid";

    const style: CSSProperties = {
        position: "relative",
        // Editor chrome (NOT the printed comic — the PDF walker keeps
        // black-framed white panels). Theme-aware so empty panels +
        // the panel frame stay visible/legible in all 12 variants.
        border: `1px ${borderStyle} var(--border-strong)`,
        overflow: "hidden",
        boxSizing: "border-box",
        background: "var(--bg-card)",
        outline: selected ? "2px solid var(--accent, #b45309)" : "none",
        outlineOffset: "2px",
        cursor: onClick ? "pointer" : "default",
        width: "100%",
        height: "100%",
    };

    const sortedBubbles = [...bubbles].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );

    const openPicker = (e: React.MouseEvent) => {
        e.stopPropagation();
        fileInputRef.current?.click();
    };

    const uploadLabel = t("ui.comic_book_editor.panel_upload_image", "Upload image");
    const replaceLabel = t(
        "ui.comic_book_editor.panel_replace_image",
        "Replace image",
    );
    const dropLabel = t(
        "ui.comic_book_editor.panel_drop_image",
        "Bild hier ablegen",
    );

    return (
        <div
            data-testid={`comic-panel-${panel.id}`}
            className="group"
            style={style}
            onClick={onClick}
            role={onClick ? "button" : undefined}
            aria-label={onClick ? `Comic panel ${panel.position + 1}` : undefined}
        >
            <ImageDropZone
                disabled={!onUploadImage}
                onDropImage={onUploadImage ?? (() => {})}
                overlayLabel={dropLabel}
                className="h-full w-full"
                testId={`comic-drop-zone-${panel.id}`}
            >
            {imageUrl ? (
                <img
                    src={imageUrl}
                    alt=""
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                    }}
                />
            ) : null}
            {onUploadImage ? (
                <>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={UPLOAD_ACCEPT}
                        data-testid={`comic-panel-upload-input-${panel.id}`}
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onUploadImage(file);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                    />
                    {imageUrl ? (
                        <button
                            type="button"
                            data-testid={`comic-panel-upload-${panel.id}`}
                            onClick={openPicker}
                            aria-label={replaceLabel}
                            title={replaceLabel}
                            className="absolute right-1 top-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-[var(--bg-card)] text-[var(--text)] opacity-0 shadow-[var(--shadow-sm)] transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
                        >
                            <ImageUp size={18} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            data-testid={`comic-panel-upload-${panel.id}`}
                            onClick={openPicker}
                            aria-label={uploadLabel}
                            className="absolute left-1/2 top-1/2 flex min-h-[44px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-md px-3 py-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                        >
                            <ImageUp size={24} />
                            <span className="text-xs">{uploadLabel}</span>
                        </button>
                    )}
                </>
            ) : null}
            {sortedBubbles.map((bubble) => (
                <ComicBubble
                    key={bubble.id}
                    bubble={bubble}
                    selected={selectedBubbleId === bubble.id}
                    onClick={
                        onBubbleClick ? () => onBubbleClick(bubble.id) : undefined
                    }
                    onDragEnd={
                        onBubbleDragEnd
                            ? (x_pct, y_pct) =>
                                  onBubbleDragEnd(bubble.id, x_pct, y_pct)
                            : undefined
                    }
                    onTailDragEnd={
                        onBubbleTailDragEnd
                            ? (direction, positionPct, lengthPx) =>
                                  onBubbleTailDragEnd(
                                      bubble.id,
                                      direction,
                                      positionPct,
                                      lengthPx,
                                  )
                            : undefined
                    }
                />
            ))}
            </ImageDropZone>
        </div>
    );
}

export default ComicPanel;

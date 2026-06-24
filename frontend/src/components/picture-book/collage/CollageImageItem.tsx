/**
 * Per-image draggable wrapper for the collage canvas.
 *
 * Extracted from CollageCanvas.tsx (god-file split, #207). Lifted out of
 * the parent's render loop so each image can host a ``useDragPosition``
 * call without violating the Rules of Hooks (hooks can't fire inside
 * .map). Hosts the per-image controls overlay (delete + bring-forward +
 * send-back).
 */

import React from "react";
import {ChevronsDown, ChevronsUp, Image as ImageIcon, Trash2} from "lucide-react";
import {useDragPosition} from "../../../hooks/ui/useDragPosition";
import {useI18n} from "../../../hooks/useI18n";
import {imageUrlFor} from "../../../utils/platform/imageUrl";
import {
    type CollageImage,
    DEFAULT_IMAGE_HEIGHT_PCT,
    DEFAULT_IMAGE_WIDTH_PCT,
} from "./collageConfig";
import styles from "../../CollageCanvas.module.css";

export function CollageImageItem({
    image,
    index,
    bookId,
    onDragEnd,
    onDelete,
    onMoveForward,
    onMoveBackward,
    canMoveForward,
    canMoveBackward,
}: {
    image: CollageImage;
    index: number;
    bookId: string;
    onDragEnd?: (x_pct: number, y_pct: number) => void;
    onDelete?: () => void;
    onMoveForward?: () => void;
    onMoveBackward?: () => void;
    canMoveForward?: boolean;
    canMoveBackward?: boolean;
}) {
    const {t} = useI18n();
    const {handlers, draftPosition, isDragging} = useDragPosition({
        x_pct: image.x_pct ?? 0,
        y_pct: image.y_pct ?? 0,
        width_pct: image.width_pct ?? DEFAULT_IMAGE_WIDTH_PCT,
        height_pct: image.height_pct ?? DEFAULT_IMAGE_HEIGHT_PCT,
        onDragEnd,
    });
    const effectiveX = draftPosition?.x_pct ?? image.x_pct ?? 0;
    const effectiveY = draftPosition?.y_pct ?? image.y_pct ?? 0;
    const wrapperStyle: React.CSSProperties = {
        left: `${effectiveX}%`,
        top: `${effectiveY}%`,
        width: `${image.width_pct}%`,
        height: `${image.height_pct}%`,
        zIndex: image.z_index,
        cursor: onDragEnd ? (isDragging ? "grabbing" : "grab") : undefined,
    };
    if (image.rotation_deg !== 0) {
        wrapperStyle.transform = `rotate(${image.rotation_deg}deg)`;
    }
    const imageStyle: React.CSSProperties = {
        objectFit: image.fit,
    };
    return (
        <div
            data-testid={`collage-image-${index}`}
            data-image-index={index}
            data-x-pct={image.x_pct}
            data-y-pct={image.y_pct}
            data-width-pct={image.width_pct}
            data-height-pct={image.height_pct}
            data-z-index={image.z_index}
            data-rotation-deg={image.rotation_deg}
            data-dragging={isDragging ? "true" : "false"}
            className={styles.imageWrapper}
            style={wrapperStyle}
            onPointerDown={onDragEnd ? handlers.onPointerDown : undefined}
            onPointerMove={onDragEnd ? handlers.onPointerMove : undefined}
            onPointerUp={onDragEnd ? handlers.onPointerUp : undefined}
            onPointerCancel={onDragEnd ? handlers.onPointerCancel : undefined}
        >
            {image.asset_id ? (
                <img
                    src={imageUrlFor(bookId, image.asset_id)}
                    alt=""
                    className={styles.image}
                    style={imageStyle}
                    data-testid={`collage-image-img-${index}`}
                    draggable={false}
                />
            ) : (
                <div
                    className={styles.imagePlaceholder}
                    data-testid={`collage-image-placeholder-${index}`}
                >
                    <ImageIcon size={28} aria-hidden />
                </div>
            )}
            {/* Phase 3 C3 (2026-05-28). Per-image controls overlay.
             *  Hover-revealed, top-right of the image. The overlay
             *  is suppressed when no edit handlers are wired (read-
             *  only mode). pointer-events on the buttons themselves
             *  block the drag-handler from claiming the click. */}
            {(onDelete || onMoveForward || onMoveBackward) && (
                <div
                    className={styles.imageControls}
                    data-testid={`collage-image-controls-${index}`}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {onMoveBackward && (
                        <button
                            type="button"
                            className={styles.controlBtn}
                            disabled={canMoveBackward === false}
                            onClick={(e) => {
                                e.stopPropagation();
                                onMoveBackward();
                            }}
                            data-testid={`collage-image-move-backward-${index}`}
                            title={t(
                                "ui.page_editor.collage.move_backward",
                                "Nach hinten",
                            )}
                            aria-label={t(
                                "ui.page_editor.collage.move_backward",
                                "Nach hinten",
                            )}
                        >
                            <ChevronsDown size={14} />
                        </button>
                    )}
                    {onMoveForward && (
                        <button
                            type="button"
                            className={styles.controlBtn}
                            disabled={canMoveForward === false}
                            onClick={(e) => {
                                e.stopPropagation();
                                onMoveForward();
                            }}
                            data-testid={`collage-image-move-forward-${index}`}
                            title={t(
                                "ui.page_editor.collage.move_forward",
                                "Nach vorne",
                            )}
                            aria-label={t(
                                "ui.page_editor.collage.move_forward",
                                "Nach vorne",
                            )}
                        >
                            <ChevronsUp size={14} />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            type="button"
                            className={styles.controlBtn}
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                            data-testid={`collage-image-delete-${index}`}
                            title={t(
                                "ui.page_editor.collage.delete_image",
                                "Bild entfernen",
                            )}
                            aria-label={t(
                                "ui.page_editor.collage.delete_image",
                                "Bild entfernen",
                            )}
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

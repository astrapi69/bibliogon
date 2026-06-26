/**
 * Per-text-region wrapper for the collage canvas.
 *
 * Extracted from CollageCanvas.tsx (god-file split, #207). Lifted out of
 * the parent's text_regions.map so each region can host its own
 * ``useDragPosition`` + local-state textarea draft without violating the
 * Rules of Hooks. Read-only mode (no ``onContentChange``) renders a static
 * div for parity with the C1 read-only shape.
 */

import React, {useEffect, useState} from "react";
import {Trash2} from "lucide-react";
import {useDragPosition} from "../../../hooks/ui/useDragPosition";
import {useI18n} from "../../../hooks/useI18n";
import {
    type CollageTextRegion,
    DEFAULT_TEXT_HEIGHT_PCT,
    DEFAULT_TEXT_WIDTH_PCT,
} from "./collageConfig";
import styles from "../../CollageCanvas.module.css";

export function CollageTextRegionItem({
    region,
    onDragEnd,
    onContentChange,
    onDelete,
}: {
    region: CollageTextRegion;
    onDragEnd?: (x_pct: number, y_pct: number) => void;
    onContentChange?: (content: string) => void;
    onDelete?: () => void;
}) {
    const {t} = useI18n();
    const editable = Boolean(onContentChange);

    // Local draft so keystrokes don't trigger a per-character
    // network round-trip. Commit on blur (matches the existing
    // PageCanvas textarea pattern).
    const [draft, setDraft] = useState(region.content ?? "");
    useEffect(() => {
        setDraft(region.content ?? "");
    }, [region.content]);

    const {handlers, draftPosition, isDragging} = useDragPosition({
        x_pct: region.x_pct ?? 0,
        y_pct: region.y_pct ?? 0,
        width_pct: region.width_pct ?? DEFAULT_TEXT_WIDTH_PCT,
        height_pct: region.height_pct ?? DEFAULT_TEXT_HEIGHT_PCT,
        onDragEnd,
    });
    const effectiveX = draftPosition?.x_pct ?? region.x_pct ?? 0;
    const effectiveY = draftPosition?.y_pct ?? region.y_pct ?? 0;
    const style: React.CSSProperties = {
        left: `${effectiveX}%`,
        top: `${effectiveY}%`,
        width: `${region.width_pct}%`,
        height: `${region.height_pct}%`,
        zIndex: region.z_index,
    };

    const handleBlur = () => {
        if (!onContentChange) return;
        const trimmed = draft;
        if (trimmed === (region.content ?? "")) return;
        onContentChange(trimmed);
    };

    if (!editable) {
        // Read-only mode (C1 parity): static div, no drag, no
        // textarea.
        return (
            <div
                data-testid={`collage-text-region-${region.id}`}
                data-region-id={region.id}
                data-x-pct={region.x_pct}
                data-y-pct={region.y_pct}
                data-z-index={region.z_index}
                className={styles.textRegion}
                style={style}
            >
                {region.content}
            </div>
        );
    }

    return (
        <div
            data-testid={`collage-text-region-${region.id}`}
            data-region-id={region.id}
            data-x-pct={region.x_pct}
            data-y-pct={region.y_pct}
            data-z-index={region.z_index}
            data-dragging={isDragging ? "true" : "false"}
            className={`${styles.textRegion} ${styles.textRegionEditable}`}
            style={style}
        >
            {/* Top drag handle — the ONLY surface that triggers
             *  the drag handlers. The textarea below stays
             *  focusable + editable without competing pointer
             *  events. */}
            <div
                className={styles.textRegionDragHandle}
                data-testid={`collage-text-region-drag-${region.id}`}
                onPointerDown={onDragEnd ? handlers.onPointerDown : undefined}
                onPointerMove={onDragEnd ? handlers.onPointerMove : undefined}
                onPointerUp={onDragEnd ? handlers.onPointerUp : undefined}
                onPointerCancel={
                    onDragEnd ? handlers.onPointerCancel : undefined
                }
                aria-hidden
            />
            <textarea
                className={styles.textRegionTextarea}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={handleBlur}
                placeholder={t(
                    "ui.page_editor.collage.text_placeholder",
                    "Text eingeben...",
                )}
                data-testid={`collage-text-region-input-${region.id}`}
            />
            {onDelete && (
                <div
                    className={styles.textRegionControls}
                    data-testid={`collage-text-region-controls-${region.id}`}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        className={styles.controlBtn}
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        data-testid={`collage-text-region-delete-${region.id}`}
                        title={t(
                            "ui.page_editor.collage.delete_text_region",
                            "Textbereich entfernen",
                        )}
                        aria-label={t(
                            "ui.page_editor.collage.delete_text_region",
                            "Textbereich entfernen",
                        )}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}

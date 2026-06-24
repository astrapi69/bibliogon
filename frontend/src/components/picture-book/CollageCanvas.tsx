/**
 * Picture-Book Layout Expansion Phase 3 C1 (2026-05-28).
 *
 * Collage layout canvas: renders N freely-positioned images +
 * N optional text regions at absolute percentage-based
 * coordinates. M1 rich-JSON storage in
 * ``page.layout_config.collage`` — zero schema migration.
 *
 * C1 ships READ-ONLY rendering — images + text regions display
 * at their stored positions, no interaction yet. C2 adds
 * drag-to-position (extracting a shared useDragPosition hook
 * from the ComicBubble pattern). C3 adds image CRUD + resize +
 * z-index controls. C4 adds text-region CRUD + Tier-Property
 * styling. C5 ships the matching PDF walker branch.
 *
 * Dispatch contract: PageCanvas early-returns ``<CollageCanvas/>``
 * when ``page.layout === "collage"``. The grid-based default
 * canvas does not render for collage pages.
 *
 * The M1 storage shapes + defensive readers live in
 * ``collage/collageConfig`` and the per-image / per-text-region
 * draggable items in ``collage/CollageImageItem`` +
 * ``collage/CollageTextRegionItem`` (god-file split, #207).
 */

import React, {useRef, useState} from "react";
import {Plus, Type as TypeIcon, Upload} from "lucide-react";
import {type Page, type PageUpdate} from "../../api/client";
import {getStorage} from "../../storage";
import {useI18n} from "../../hooks/useI18n";
import {
    readLayoutNamespace,
    writeLayoutNamespace,
} from "../../utils/editor/layoutConfig";
import {warnIfOfflineStorageNearlyFull} from "../../utils/platform/storageQuota";
import {
    type CollageImage,
    type CollageTextRegion,
    DEFAULT_TEXT_HEIGHT_PCT,
    DEFAULT_TEXT_WIDTH_PCT,
    readCollageBackgroundColor,
    readCollageImages,
    readCollageTextRegions,
} from "./collage/collageConfig";
import {CollageImageItem} from "./collage/CollageImageItem";
import {CollageTextRegionItem} from "./collage/CollageTextRegionItem";
import styles from "../CollageCanvas.module.css";

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/gif";

interface Props {
    /** The active page. Its ``layout`` MUST be ``"collage"`` —
     *  PageCanvas's dispatch enforces this contract; the body
     *  reads ``page.layout_config.collage`` for the M1 namespace. */
    page: Page;
    /** The owning book's id, used to resolve asset URLs via
     *  ``imageUrlFor`` (same helper PageCanvas's primary image
     *  uses). */
    bookId: string;
    /** Phase 3 C2 (2026-05-28): persist a partial update to the
     *  active page. CollageCanvas calls this on pointer-up when
     *  an image drag commits new coords. Optional so C1's read-
     *  only Vitest cases still pass without wiring it; future C3
     *  CRUD work will require it. Return type matches PageCanvas's
     *  prop shape (sync or async). */
    onUpdate?: (update: PageUpdate) => void | Promise<void>;
}

export default function CollageCanvas({page, bookId, onUpdate}: Props) {
    const {t} = useI18n();

    const images = readCollageImages(page.layout_config);
    const textRegions = readCollageTextRegions(page.layout_config);
    const backgroundColor = readCollageBackgroundColor(page.layout_config);
    const isEmpty = images.length === 0 && textRegions.length === 0;

    /** Phase 3 C3 (2026-05-28). Upload state + handlers for the
     *  "Add image" affordance. Same shape as PageCanvas's
     *  handleFileChange but writes a NEW image entry into the
     *  collage namespace's ``images`` array. */
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    /** Apply a partial update to the collage namespace via
     *  ``writeLayoutNamespace``. Preserves background_color +
     *  text_regions + sibling layouts' configs automatically. */
    const updateNamespace = (
        next: Partial<{
            images: CollageImage[];
            text_regions: CollageTextRegion[];
            background_color: string;
        }>,
    ) => {
        if (!onUpdate) return;
        const current = readLayoutNamespace(page.layout_config, "collage") ?? {};
        const nextConfig = writeLayoutNamespace(page.layout_config, "collage", {
            ...current,
            ...next,
        });
        void onUpdate({layout_config: nextConfig});
    };

    /** Phase 3 C2 (2026-05-28). On drag-end: persist new coords
     *  for the dragged image. */
    const handleImageDragEnd = (index: number) =>
        onUpdate
            ? (newX: number, newY: number) => {
                  const nextImages = images.map((img, i) =>
                      i === index ? {...img, x_pct: newX, y_pct: newY} : img,
                  );
                  updateNamespace({images: nextImages});
              }
            : undefined;

    /** Phase 3 C3 (2026-05-28). Delete the image at ``index``.
     *  Filters the array down + writes back; sibling
     *  text_regions + background stay untouched via the shared
     *  updateNamespace path. */
    const handleDeleteImage = (index: number) =>
        onUpdate
            ? () => {
                  const nextImages = images.filter((_, i) => i !== index);
                  updateNamespace({images: nextImages});
              }
            : undefined;

    /** Phase 3 C3 (2026-05-28). Bring forward / send back.
     *  Increments / decrements z_index by 1. Bounded by the
     *  current min/max z_index across all images so the value
     *  doesn't grow unbounded across many invocations. */
    const handleMoveForward = (index: number) =>
        onUpdate
            ? () => {
                  const maxZ = Math.max(...images.map((img) => img.z_index ?? 1));
                  const nextImages = images.map((img, i) =>
                      i === index
                          ? {...img, z_index: (img.z_index ?? 1) + 1}
                          : img,
                  );
                  // No-op if already at the top.
                  if ((images[index].z_index ?? 1) >= maxZ) return;
                  updateNamespace({images: nextImages});
              }
            : undefined;

    const handleMoveBackward = (index: number) =>
        onUpdate
            ? () => {
                  const minZ = Math.min(...images.map((img) => img.z_index ?? 1));
                  const nextImages = images.map((img, i) =>
                      i === index
                          ? {...img, z_index: (img.z_index ?? 1) - 1}
                          : img,
                  );
                  if ((images[index].z_index ?? 1) <= minZ) return;
                  updateNamespace({images: nextImages});
              }
            : undefined;

    /** Phase 3 C3 (2026-05-28). Add a new image entry. Triggered
     *  by the "Bild hinzufügen" button: opens the hidden file
     *  input → on change uploads the asset → appends an entry
     *  with default position (10/10) + size (30/30) + the next
     *  available z_index. */
    const handleAddImageClick = () => {
        if (!onUpdate || uploading) return;
        fileInputRef.current?.click();
    };

    const handleAddImageFile = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setUploadError(null);
        try {
            const asset = await getStorage().assets.upload(bookId, file, "figure");
            const nextZ =
                images.length === 0
                    ? 1
                    : Math.max(...images.map((img) => img.z_index ?? 1)) + 1;
            const nextImages: CollageImage[] = [
                ...images,
                {
                    asset_id: asset.id,
                    x_pct: 10,
                    y_pct: 10,
                    width_pct: 30,
                    height_pct: 30,
                    z_index: nextZ,
                    rotation_deg: 0,
                    fit: "cover",
                },
            ];
            updateNamespace({images: nextImages});
            void warnIfOfflineStorageNearlyFull(
                t(
                    "ui.offline.storage_almost_full",
                    "Browser-Speicher fast voll. Entferne nicht benötigte Offline-Bücher, um Platz zu schaffen.",
                ),
            );
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : String(err));
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // Sort z_index-ordered for canMoveForward/Backward checks.
    const sortedZ = [...images.map((img) => img.z_index ?? 1)].sort(
        (a, b) => a - b,
    );
    const minZ = sortedZ[0];
    const maxZ = sortedZ[sortedZ.length - 1];

    /** Phase 3 C4 (2026-05-28). Text region handlers — drag, edit,
     *  delete, add. All compose via the shared ``updateNamespace``
     *  path so sibling images + background stay untouched. */
    const handleTextRegionDragEnd = (regionIndex: number) =>
        onUpdate
            ? (newX: number, newY: number) => {
                  const nextRegions = textRegions.map((region, i) =>
                      i === regionIndex
                          ? {...region, x_pct: newX, y_pct: newY}
                          : region,
                  );
                  updateNamespace({text_regions: nextRegions});
              }
            : undefined;

    const handleTextRegionContentChange = (regionIndex: number) =>
        onUpdate
            ? (content: string) => {
                  const nextRegions = textRegions.map((region, i) =>
                      i === regionIndex ? {...region, content} : region,
                  );
                  updateNamespace({text_regions: nextRegions});
              }
            : undefined;

    const handleDeleteTextRegion = (regionIndex: number) =>
        onUpdate
            ? () => {
                  const nextRegions = textRegions.filter(
                      (_, i) => i !== regionIndex,
                  );
                  updateNamespace({text_regions: nextRegions});
              }
            : undefined;

    const handleAddTextRegion = () => {
        if (!onUpdate) return;
        // Append a new region with a unique id + default geometry.
        // ``text-${timestamp}`` is sufficient for client-side
        // uniqueness; the field is a free-form string per the M1
        // schema. Default position (10, 10), size (40, 15) — small
        // band the user can drag/edit immediately.
        const newId = `text-${Date.now()}`;
        const nextRegions: CollageTextRegion[] = [
            ...textRegions,
            {
                id: newId,
                x_pct: 10,
                y_pct: 10,
                width_pct: DEFAULT_TEXT_WIDTH_PCT,
                height_pct: DEFAULT_TEXT_HEIGHT_PCT,
                z_index: 1,
                content: "",
            },
        ];
        updateNamespace({text_regions: nextRegions});
    };

    const canvasStyle: React.CSSProperties = {};
    if (backgroundColor) {
        canvasStyle.background = backgroundColor;
    }

    return (
        <div
            className={styles.canvasWrapper}
            data-testid="page-canvas-wrapper"
        >
            <div
                data-testid="page-canvas-root"
                data-page-id={page.id}
                data-layout="collage"
                data-image-count={images.length}
                data-text-region-count={textRegions.length}
                className={styles.canvas}
                style={canvasStyle}
            >
                {images.map((image, index) => {
                    const z = image.z_index ?? 1;
                    return (
                        <CollageImageItem
                            key={`collage-image-${index}`}
                            image={image}
                            index={index}
                            bookId={bookId}
                            onDragEnd={handleImageDragEnd(index)}
                            onDelete={handleDeleteImage(index)}
                            onMoveForward={handleMoveForward(index)}
                            onMoveBackward={handleMoveBackward(index)}
                            canMoveForward={z < maxZ}
                            canMoveBackward={z > minZ}
                        />
                    );
                })}
                {textRegions.map((region, regionIndex) => (
                    <CollageTextRegionItem
                        key={`collage-text-${region.id}`}
                        region={region}
                        onDragEnd={handleTextRegionDragEnd(regionIndex)}
                        onContentChange={handleTextRegionContentChange(
                            regionIndex,
                        )}
                        onDelete={handleDeleteTextRegion(regionIndex)}
                    />
                ))}
                {isEmpty && (
                    <div
                        className={styles.emptyHint}
                        data-testid="collage-empty-hint"
                    >
                        {t(
                            "ui.page_editor.collage.empty_hint",
                            "Leere Collage — füge Bilder und Textbereiche hinzu.",
                        )}
                    </div>
                )}
            </div>
            {/* Phase 3 C3 (2026-05-28). Toolbar with the Add image
             *  button. Hidden in read-only mode (no onUpdate).
             *  Sits below the canvas so the drag-affordance has
             *  the canvas's full surface; placement mirrors
             *  PageEditor's existing footer-affordance pattern. */}
            {onUpdate && (
                <div className={styles.toolbar} data-testid="collage-toolbar">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={uploading}
                        onClick={handleAddImageClick}
                        data-testid="collage-add-image"
                    >
                        {uploading ? (
                            <>
                                <Upload size={14} />
                                <span style={{marginLeft: 6}}>
                                    {t(
                                        "ui.page_editor.uploading",
                                        "Lade hoch ...",
                                    )}
                                </span>
                            </>
                        ) : (
                            <>
                                <Plus size={14} />
                                <span style={{marginLeft: 6}}>
                                    {t(
                                        "ui.page_editor.collage.add_image",
                                        "Bild hinzufügen",
                                    )}
                                </span>
                            </>
                        )}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPT}
                        onChange={handleAddImageFile}
                        className={styles.fileInput}
                        data-testid="collage-add-image-file-input"
                    />
                    {/* Phase 3 C4 (2026-05-28). Add text region.
                     *  Appends a new entry to text_regions with
                     *  default geometry; the user can drag/resize/
                     *  edit it immediately. */}
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleAddTextRegion}
                        data-testid="collage-add-text-region"
                    >
                        <TypeIcon size={14} />
                        <span style={{marginLeft: 6}}>
                            {t(
                                "ui.page_editor.collage.add_text_region",
                                "Textbereich hinzufügen",
                            )}
                        </span>
                    </button>
                    {uploadError && (
                        <span
                            className={styles.uploadError}
                            role="alert"
                            data-testid="collage-upload-error"
                        >
                            {uploadError}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

// Re-exported for back-compat with existing import sites (the
// CollageCanvas test imports these helpers + types from
// "./CollageCanvas"). The implementations live in ./collage/collageConfig.
export {
    readCollageImages,
    readCollageTextRegions,
    readCollageBackgroundColor,
} from "./collage/collageConfig";
export type {CollageImage, CollageTextRegion} from "./collage/collageConfig";

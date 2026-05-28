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
 * Defensive shape-guards: every field in the collage namespace
 * is optional / nullable. Missing/malformed entries silently
 * fall back to sane defaults (e.g. position 0/0, size 30/30,
 * z-index 1, rotation 0, fit cover). The renderer never crashes
 * on a half-typed layout_config from an external tool / earlier
 * version.
 */

import React, {useEffect, useRef, useState} from "react";
import {
    ChevronsDown,
    ChevronsUp,
    Image as ImageIcon,
    Plus,
    Trash2,
    Type as TypeIcon,
    Upload,
} from "lucide-react";
import {api, type Page, type PageUpdate} from "../api/client";
import {useDragPosition} from "../hooks/useDragPosition";
import {useI18n} from "../hooks/useI18n";
import {
    readLayoutNamespace,
    writeLayoutNamespace,
} from "../utils/layoutConfig";
import {imageUrlFor} from "../utils/imageUrl";
import styles from "./CollageCanvas.module.css";

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

/** M1 storage shape — one image entry in the collage namespace's
 *  ``images`` array. Every field except ``asset_id`` is optional;
 *  reads fall back to defaults. */
export interface CollageImage {
    asset_id: string | null;
    x_pct?: number;
    y_pct?: number;
    width_pct?: number;
    height_pct?: number;
    z_index?: number;
    rotation_deg?: number;
    fit?: "contain" | "cover";
}

/** M1 storage shape — one text region in the collage namespace's
 *  ``text_regions`` array. ``content`` may be empty (renders as
 *  a positioned but blank region — pinned by the editor's
 *  resize handle). */
export interface CollageTextRegion {
    id: string;
    x_pct?: number;
    y_pct?: number;
    width_pct?: number;
    height_pct?: number;
    z_index?: number;
    content?: string;
    tier1?: Record<string, unknown>;
    tier2?: Record<string, unknown>;
}

const DEFAULT_IMAGE_WIDTH_PCT = 30;
const DEFAULT_IMAGE_HEIGHT_PCT = 30;
const DEFAULT_TEXT_WIDTH_PCT = 40;
const DEFAULT_TEXT_HEIGHT_PCT = 15;

function clampPct(value: unknown, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(100, value));
}

function clampZ(value: unknown, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.round(value);
}

function clampRotation(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    // Normalise to -180..180 so consumers don't need to handle
    // unbounded rotations. WeasyPrint accepts any value but
    // visual parity is cleaner with a bounded range.
    let normalised = value % 360;
    if (normalised > 180) normalised -= 360;
    if (normalised < -180) normalised += 360;
    return normalised;
}

function readImageFit(value: unknown): "contain" | "cover" {
    return value === "contain" ? "contain" : "cover";
}

function readBackgroundColor(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return undefined;
    return value;
}

/** Read the collage namespace's ``images`` array from the page's
 *  layout_config, normalising each entry's optional fields. Empty
 *  / missing / malformed namespaces yield an empty array — the
 *  renderer shows the empty-collage hint. */
export function readCollageImages(
    layoutConfig: Record<string, unknown> | null | undefined,
): CollageImage[] {
    const namespace = readLayoutNamespace(layoutConfig, "collage");
    if (!namespace) return [];
    const raw = namespace.images;
    if (!Array.isArray(raw)) return [];
    return raw
        .filter(
            (entry): entry is Record<string, unknown> =>
                entry !== null && typeof entry === "object",
        )
        .map((entry) => ({
            asset_id:
                typeof entry.asset_id === "string"
                    ? entry.asset_id
                    : null,
            x_pct: clampPct(entry.x_pct, 0),
            y_pct: clampPct(entry.y_pct, 0),
            width_pct: clampPct(entry.width_pct, DEFAULT_IMAGE_WIDTH_PCT),
            height_pct: clampPct(entry.height_pct, DEFAULT_IMAGE_HEIGHT_PCT),
            z_index: clampZ(entry.z_index, 1),
            rotation_deg: clampRotation(entry.rotation_deg),
            fit: readImageFit(entry.fit),
        }));
}

/** Read the collage namespace's ``text_regions`` array. Same
 *  shape as ``readCollageImages`` — defensive across every
 *  optional field. */
export function readCollageTextRegions(
    layoutConfig: Record<string, unknown> | null | undefined,
): CollageTextRegion[] {
    const namespace = readLayoutNamespace(layoutConfig, "collage");
    if (!namespace) return [];
    const raw = namespace.text_regions;
    if (!Array.isArray(raw)) return [];
    return raw
        .filter(
            (entry): entry is Record<string, unknown> =>
                entry !== null && typeof entry === "object",
        )
        .map((entry, index) => ({
            id: typeof entry.id === "string" ? entry.id : `text-${index}`,
            x_pct: clampPct(entry.x_pct, 0),
            y_pct: clampPct(entry.y_pct, 0),
            width_pct: clampPct(entry.width_pct, DEFAULT_TEXT_WIDTH_PCT),
            height_pct: clampPct(entry.height_pct, DEFAULT_TEXT_HEIGHT_PCT),
            z_index: clampZ(entry.z_index, 1),
            content: typeof entry.content === "string" ? entry.content : "",
            tier1:
                entry.tier1 && typeof entry.tier1 === "object"
                    ? (entry.tier1 as Record<string, unknown>)
                    : undefined,
            tier2:
                entry.tier2 && typeof entry.tier2 === "object"
                    ? (entry.tier2 as Record<string, unknown>)
                    : undefined,
        }));
}

/** Read the collage namespace's optional ``background_color``.
 *  Only accepts ``#rrggbb`` shape — invalid / missing returns
 *  undefined so the CSS module's default tinted background
 *  applies. */
export function readCollageBackgroundColor(
    layoutConfig: Record<string, unknown> | null | undefined,
): string | undefined {
    const namespace = readLayoutNamespace(layoutConfig, "collage");
    if (!namespace) return undefined;
    return readBackgroundColor(namespace.background_color);
}

/** Phase 3 C2 + C3 (2026-05-28). Per-image draggable wrapper.
 *  Lifted out of the parent's render loop so each image can host
 *  a ``useDragPosition`` call without violating the Rules of
 *  Hooks (hooks can't fire inside .map). C3 adds the per-image
 *  controls overlay (delete + bring-forward + send-back). */
function CollageImageItem({
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

/** Phase 3 C4 (2026-05-28). Per-text-region wrapper. Lifted out
 *  of the parent's text_regions.map so each region can host its
 *  own useDragPosition + local-state textarea draft without
 *  violating the Rules of Hooks. Read-only mode (no onUpdate)
 *  renders a static div for parity with C1's shape. */
function CollageTextRegionItem({
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
            const asset = await api.assets.upload(bookId, file, "figure");
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

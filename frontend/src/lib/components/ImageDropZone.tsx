/**
 * Single-image drag-and-drop zone (#437).
 *
 * App-agnostic — no app imports. Wraps arbitrary content and surfaces a drop
 * overlay while an image file is dragged over it, then hands the FIRST dropped
 * image file to `onDropImage`. Non-image files and every file after the first
 * are ignored. Uses the HTML5 drag-and-drop API with drag-depth tracking
 * (adopted from `DropZone`) so nested children don't flicker the overlay on
 * `dragleave`.
 *
 * Unlike the generic `DropZone` (which filters by extension and yields the
 * full file list), this one is purpose-built for "drop one image onto a
 * target" surfaces — comic panels, picture-book page images — where exactly
 * one image is the result and a renamed non-image must not slip through.
 *
 * @example
 * ```tsx
 * <ImageDropZone
 *   onDropImage={(file) => uploadPanelImage(file)}
 *   disabled={readOnly}
 *   overlayLabel="Drop image here"
 *   className="h-full w-full"
 * >
 *   <img src={url} alt="" />
 * </ImageDropZone>
 * ```
 */

import {
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";

interface ImageDropZoneProps {
  /** Called with the first dropped image file. */
  onDropImage: (file: File) => void;
  /** When true, drag/drop is ignored and no overlay shows. */
  disabled?: boolean;
  /** Text for the drag-over overlay. */
  overlayLabel?: string;
  /** Extra classes on the wrapper (the wrapper is always `relative`). */
  className?: string;
  /** Inline style forwarded to the wrapper. */
  style?: CSSProperties;
  /** Root `data-testid`; defaults to `"image-dropzone"`. */
  testId?: string;
  children: ReactNode;
}

/** Whether a drag event carries files (vs. text / element drags). */
function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

/** First file whose MIME type is an image, or `null` when there is none. */
function firstImageFile(files: FileList): File | null {
  for (const file of Array.from(files)) {
    if (file.type.startsWith("image/")) return file;
  }
  return null;
}

/** Wrap content in a single-image drop target with a drag-over overlay. */
export default function ImageDropZone({
  onDropImage,
  disabled = false,
  overlayLabel = "Drop image here",
  className,
  style,
  testId = "image-dropzone",
  children,
}: ImageDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const onDragEnter = (e: DragEvent) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    setDragging(true);
  };

  const onDragOver = (e: DragEvent) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
  };

  const onDragLeave = (e: DragEvent) => {
    if (disabled || !hasFiles(e)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    depth.current = 0;
    setDragging(false);
    const file = firstImageFile(e.dataTransfer.files);
    if (file) onDropImage(file);
  };

  return (
    <div
      className={`relative ${className ?? ""}`}
      style={style}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      data-testid={testId}
      data-dragging={dragging}
    >
      {children}
      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center rounded border-2 border-dashed border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-sm font-semibold text-[var(--accent)]"
          data-testid={`${testId}-overlay`}
        >
          <span>{overlayLabel}</span>
        </div>
      )}
    </div>
  );
}

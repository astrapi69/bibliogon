/**
 * Generic file drag-and-drop zone (#312).
 *
 * App-agnostic — no app imports. Wraps arbitrary content and surfaces a
 * drop overlay while a file is dragged over it, then hands the dropped
 * files to `onDrop`. Optional `accept` filters by file extension. Uses the
 * HTML5 drag-and-drop API with drag-depth tracking so nested children don't
 * cause the overlay to flicker on `dragleave`.
 */

import { useRef, useState, type DragEvent, type ReactNode } from "react";

interface DropZoneProps {
  /** Called with the dropped files (after optional `accept` filtering). */
  onDrop: (files: File[]) => void;
  /** Allowed extensions (e.g. `[".md", ".bgb"]`); omit to accept anything. */
  accept?: string[];
  /** Custom overlay node; defaults to a centered `overlayLabel`. */
  overlay?: ReactNode;
  /** Text for the default overlay. */
  overlayLabel?: string;
  /** When true, drag/drop is ignored and no overlay shows. */
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/** Whether a drag event carries files (vs. text / element drags). */
function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

function matchesAccept(file: File, accept?: string[]): boolean {
  if (!accept || accept.length === 0) return true;
  const lower = file.name.toLowerCase();
  return accept.some((ext) => lower.endsWith(ext.toLowerCase()));
}

/** Wrap content in a drop target with a drag-over overlay. */
export default function DropZone({
  onDrop,
  accept,
  overlay,
  overlayLabel = "Drop a file here to import",
  disabled = false,
  className,
  children,
}: DropZoneProps) {
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
    depth.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      matchesAccept(f, accept),
    );
    if (files.length > 0) onDrop(files);
  };

  return (
    <div
      className={`relative ${className ?? ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      data-testid="dropzone"
      data-dragging={dragging}
    >
      {children}
      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded border-2 border-dashed text-sm font-semibold"
          style={{
            borderColor: "var(--accent)",
            background: "color-mix(in srgb, var(--accent) 10%, transparent)",
            color: "var(--accent)",
          }}
          data-testid="dropzone-overlay"
        >
          {overlay ?? <span>{overlayLabel}</span>}
        </div>
      )}
    </div>
  );
}

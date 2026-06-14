import { ImageOff } from "lucide-react";
import type { DetectedAsset } from "../../../../api/import";

export function CoverThumbnail({
    cover,
    tempRef,
}: {
    cover: DetectedAsset | null;
    tempRef?: string;
}) {
    if (!cover || !cover.mime_type.startsWith("image/")) {
        return (
            <div
                data-testid="preview-cover-placeholder"
                style={{
                    width: 80,
                    aspectRatio: "3/4",
                    background: "var(--bg-hover)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 6,
                    color: "var(--text-muted)",
                    flexShrink: 0,
                }}
                aria-label="No cover"
            >
                <ImageOff size={24} strokeWidth={1.25} />
            </div>
        );
    }
    // Render the actual image when we have a temp_ref to fetch from
    // the staging endpoint; otherwise fall back to the filename-as-
    // label placeholder. Filename fallback also shows when the
    // server refuses the asset (stale temp_ref, path rejected).
    if (tempRef) {
        const src = `/api/import/staged/${encodeURIComponent(tempRef)}/file?path=${encodeURIComponent(cover.path)}`;
        return (
            <img
                data-testid="preview-cover-thumbnail"
                src={src}
                alt={cover.filename}
                style={{
                    width: 80,
                    aspectRatio: "3/4",
                    background: "var(--bg-hover)",
                    borderRadius: 6,
                    objectFit: "cover",
                    flexShrink: 0,
                }}
            />
        );
    }
    return (
        <div
            data-testid="preview-cover-thumbnail"
            style={{
                width: 80,
                aspectRatio: "3/4",
                background: "var(--bg-hover)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                textAlign: "center",
                padding: 4,
                fontSize: "0.625rem",
                color: "var(--text-secondary)",
                flexShrink: 0,
            }}
        >
            {cover.filename}
        </div>
    );
}

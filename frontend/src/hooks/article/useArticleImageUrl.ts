/**
 * useArticleImageUrl — resolve an article's featured image to a displayable
 * `<img>` src across storage modes (#157), mirroring {@link useAssetUrl} for
 * books.
 *
 * - **api mode:** returns `featuredImageUrl` synchronously (the server-served
 *   `/api/articles/{id}/assets/file/...` path or a remote CDN URL) — zero
 *   behaviour change from the previous inline `article.featured_image_url`.
 * - **dexie mode (offline):**
 *   - with an `assetId`: reads the stored bytes from IndexedDB and returns a
 *     `blob:` object URL (revoked on unmount / input change). This is what
 *     makes the dashboard thumbnail show offline.
 *   - without an `assetId`: falls back to `featuredImageUrl` (a remote CDN
 *     URL that only resolves while online), then to the placeholder offline.
 *
 * Returns null while a dexie blob is loading or when nothing resolves, so the
 * caller renders its existing `CoverPlaceholder` fallback.
 *
 * @param articleId - The owning article id (re-resolves when it changes).
 * @param featuredImageUrl - The article's `featured_image_url` (CDN / served).
 * @param assetId - The article's `featured_image_asset_id` (dexie-only blob ref).
 */
import { useEffect, useState } from "react";

import { getStorage } from "../../storage";

export function useArticleImageUrl(
    articleId: string | null | undefined,
    featuredImageUrl: string | null | undefined,
    assetId: string | null | undefined,
): string | null {
    const mode = getStorage().mode;
    // api mode resolves synchronously, so there is no null-then-url flash on
    // the desktop path.
    const apiUrl = mode === "api" ? (featuredImageUrl ?? null) : null;

    const [dexieUrl, setDexieUrl] = useState<string | null>(null);

    useEffect(() => {
        if (mode !== "dexie") {
            setDexieUrl(null);
            return;
        }
        // No stored blob: use the remote URL directly (online-only; offline it
        // fails to load and the card renders the placeholder).
        if (!assetId) {
            setDexieUrl(featuredImageUrl ?? null);
            return;
        }
        let cancelled = false;
        let objectUrl: string | null = null;
        void getStorage()
            .articleAssets.getBlob(assetId)
            .then((blob) => {
                if (cancelled) return;
                if (blob) {
                    objectUrl = URL.createObjectURL(blob);
                    setDexieUrl(objectUrl);
                } else {
                    // Blob missing (e.g. asset id set but bytes never cached): fall back
                    // to the remote URL so an online session still shows something.
                    setDexieUrl(featuredImageUrl ?? null);
                }
            })
            .catch(() => {
                if (!cancelled) setDexieUrl(featuredImageUrl ?? null);
            });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [mode, articleId, assetId, featuredImageUrl]);

    return mode === "api" ? apiUrl : dexieUrl;
}

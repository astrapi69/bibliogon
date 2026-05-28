/**
 * Resolve the asset-serving URL for a book asset.
 *
 * Extracted 2026-05-28 in Phase 3 C1 (Picture-Book Layout
 * Expansion — collage layout) per the Recurring-Component-
 * Unification Rule's 2-surfaces threshold. The same single-line
 * helper was duplicated inline in PageCanvas.tsx + Storyboard
 * .tsx + the new CollageCanvas.tsx — third surface forced
 * extraction.
 *
 * The URL shape matches ``backend/app/routers/assets.py``'s
 * file-serve route: ``GET /api/books/{book_id}/assets/{asset_id}/file``.
 * Returning a relative URL lets the frontend dev server proxy
 * and the production reverse-proxy both serve the request from
 * the same code path.
 */
export function imageUrlFor(bookId: string, assetId: string): string {
    return `/api/books/${bookId}/assets/${assetId}/file`;
}

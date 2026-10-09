/**
 * Backend-only read namespaces. Offline these return the empty defaults the
 * editor expects so opening an article / probing plugins never fires a doomed
 * `/api` request. The publish mutations are not seam-routed (they push to
 * external platforms via the desktop backend).
 *
 * Two namespaces have left: `articlePlatforms`, whose schemas are
 * reference data and moved to `reference.ts` plus the seed (#1015), and
 * `publications`, which turned out to be per-article record-keeping with
 * no external call and moved to `publishing/publications.ts` (#747).
 */

import type { IStorageService } from "../types";

// AI / grammar / audiobook / ms-tools are backend plugins. Offline the
// probe returns an empty map, so every editor plugin reads as
// unavailable (the toolbar already degrades gracefully on that shape).
export const editorPluginStatus: IStorageService["editorPluginStatus"] = {
    get: async () => ({}),
};

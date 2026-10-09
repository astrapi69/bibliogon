/**
 * Backend-only read namespaces. Offline these return the empty defaults the
 * editor expects so opening an article / probing plugins never fires a doomed
 * `/api` request. The publish mutations are not seam-routed (they push to
 * external platforms via the desktop backend).
 *
 * `articlePlatforms` used to live here answering `{}`. The schemas are
 * reference data, so they moved to `reference.ts` and the seed (#1015) -
 * with an empty map the publish form had no fields to render offline.
 */

import type { IStorageService } from "../types";

// Publications read as an empty list offline so opening an article never
// fires a doomed `/api` request. The mutations are not seam-routed yet
// (#747).
export const publications: IStorageService["publications"] = {
    list: async () => [],
};

// AI / grammar / audiobook / ms-tools are backend plugins. Offline the
// probe returns an empty map, so every editor plugin reads as
// unavailable (the toolbar already degrades gracefully on that shape).
export const editorPluginStatus: IStorageService["editorPluginStatus"] = {
    get: async () => ({}),
};

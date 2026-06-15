/**
 * Backend-only read namespaces. Offline these return the empty defaults the
 * editor expects so opening an article / probing plugins never fires a doomed
 * `/api` request. The publish mutations are not seam-routed (they push to
 * external platforms via the desktop backend).
 */

import type { IStorageService } from "../types";

// Publishing surfaces are backend-only: offline these reads return the
// empty defaults the editor expects (no publications, no platform
// schemas) so opening an article offline never fires a doomed `/api`
// request. The publish MUTATIONS are not seam-routed (they push to
// external platforms via the desktop backend).
export const publications: IStorageService["publications"] = {
    list: async () => [],
};

export const articlePlatforms: IStorageService["articlePlatforms"] = {
    list: async () => ({}),
};

// AI / grammar / audiobook / ms-tools are backend plugins. Offline the
// probe returns an empty map, so every editor plugin reads as
// unavailable (the toolbar already degrades gracefully on that shape).
export const editorPluginStatus: IStorageService["editorPluginStatus"] = {
    get: async () => ({}),
};

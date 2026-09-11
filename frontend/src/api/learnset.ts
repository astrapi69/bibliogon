import { ApiError } from "./errors";
import { BASE, guardedFetch, _filenameFromContentDisposition } from "./http";

/**
 * Learnset plugin client (#763): download a book's Phase-1 learn-set
 * scaffold as a ZIP in the alc content-repo layout. Desktop-only
 * surface (the plugin needs the backend); the caller gates offline.
 */
export const learnsetApi = {
  learnset: {
    download: async (bookId: string): Promise<{ blob: Blob; filename: string }> => {
      const url = `${BASE}/learnset/${bookId}/export`;
      const res = await guardedFetch(url, { method: "GET" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          typeof err.detail === "string"
            ? err.detail
            : err.detail?.message || "Learnset export failed",
          url,
          "GET",
          err.stacktrace || "",
          typeof err.detail === "object" ? err.detail : undefined,
        );
      }
      const blob = await res.blob();
      const filename =
        _filenameFromContentDisposition(res.headers.get("Content-Disposition")) ??
        `${bookId}-learnset.zip`;
      return { blob, filename };
    },
  },
};

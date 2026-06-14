/**
 * Chapter, template, document-export, and backup API namespaces.
 *
 * Part of the api/client.ts barrel split (Batch 2). Exposes the namespace
 * sub-object spread into the single `api` object in api/apiObject.ts.
 */
import { ApiError, SaveAbortedError } from "./errors";
import {
  BASE,
  guardedFetch,
  request,
  _filenameFromContentDisposition,
} from "./http";
import type {
  AudiobookChapterFile,
  AudiobookClassification,
  BackupCompareResult,
  BookAudiobook,
  BookTemplate,
  BookTemplateCreate,
  Chapter,
  ChapterCreate,
  ChapterTemplate,
  ChapterTemplateCreate,
  ChapterTemplateUpdate,
  ChapterUpdatePayload,
  ChapterVersionDiff,
  ChapterVersionRead,
  ChapterVersionSummary,
  DryRunResult,
} from "./client";

// Per-chapter in-flight save controllers for dedup/abort (see
// `chaptersApi.chapters.update`). Module-local shared map.
const saveControllers = new Map<string, AbortController>();

export const chaptersApi = {
  chapters: {
    list: (bookId: string) => request<Chapter[]>(`/books/${bookId}/chapters`),

    get: (bookId: string, chapterId: string) =>
      request<Chapter>(`/books/${bookId}/chapters/${chapterId}`),

    create: (bookId: string, data: ChapterCreate) =>
      request<Chapter>(`/books/${bookId}/chapters`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    /** PS-13: clone the user's local edit into a NEW chapter
     *  inserted directly after the source. Used by the
     *  ConflictResolutionDialog "Save as new chapter" action so the
     *  user preserves their unsaved draft without overwriting the
     *  server's copy of the source chapter. */
    fork: (
      bookId: string,
      chapterId: string,
      data: { content: string; title?: string },
    ) =>
      request<Chapter>(`/books/${bookId}/chapters/${chapterId}/fork`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: async (
      bookId: string,
      chapterId: string,
      data: ChapterUpdatePayload,
    ): Promise<Chapter> => {
      // Per-chapter abort: if a save for this chapter is already
      // in flight when a new one starts, cancel the old one. The
      // latest save always wins. Aborts surface as
      // SaveAbortedError so callers can treat them as no-ops.
      const prior = saveControllers.get(chapterId);
      if (prior) prior.abort();
      const controller = new AbortController();
      saveControllers.set(chapterId, controller);
      try {
        const result = await request<Chapter>(
          `/books/${bookId}/chapters/${chapterId}`,
          {
            method: "PATCH",
            body: JSON.stringify(data),
            signal: controller.signal,
          },
        );
        if (saveControllers.get(chapterId) === controller) {
          saveControllers.delete(chapterId);
        }
        return result;
      } catch (err) {
        if (saveControllers.get(chapterId) === controller) {
          saveControllers.delete(chapterId);
        }
        if (err instanceof Error && err.name === "AbortError") {
          throw new SaveAbortedError();
        }
        throw err;
      }
    },

    /** Best-effort save that survives tab close / page unload.
     *
     * Uses `guardedFetch(..., {keepalive: true})` so the browser completes
     * the request after the tab is gone. Does NOT go through the
     * normal `request` helper: keepalive requests cannot be
     * cancelled and we intentionally skip the abort-controller
     * queue (see commit 8). Errors are swallowed - the IndexedDB
     * draft is the authoritative fallback for unload-time saves.
     */
    updateKeepalive: (
      bookId: string,
      chapterId: string,
      data: ChapterUpdatePayload,
    ): void => {
      try {
        void guardedFetch(`${BASE}/books/${bookId}/chapters/${chapterId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          keepalive: true,
        }).catch(() => {
          // IndexedDB draft covers this case.
        });
      } catch {
        // Some browsers reject keepalive bodies > 64KB. The draft covers it.
      }
    },

    delete: (bookId: string, chapterId: string) =>
      request<void>(`/books/${bookId}/chapters/${chapterId}`, {
        method: "DELETE",
      }),

    reorder: (bookId: string, chapterIds: string[]) =>
      request<Chapter[]>(`/books/${bookId}/chapters/reorder`, {
        method: "PUT",
        body: JSON.stringify({ chapter_ids: chapterIds }),
      }),

    listVersions: (bookId: string, chapterId: string) =>
      request<ChapterVersionSummary[]>(
        `/books/${bookId}/chapters/${chapterId}/versions`,
      ),

    getVersion: (bookId: string, chapterId: string, versionId: string) =>
      request<ChapterVersionRead>(
        `/books/${bookId}/chapters/${chapterId}/versions/${versionId}`,
      ),

    restoreVersion: (bookId: string, chapterId: string, versionId: string) =>
      request<Chapter>(
        `/books/${bookId}/chapters/${chapterId}/versions/${versionId}/restore`,
        {
          method: "POST",
        },
      ),

    /** Take a Scrivener-style manual snapshot of the chapter's current
     *  saved state (CHAPTER-SNAPSHOTS-01). Optional ``name`` labels it;
     *  manual snapshots survive the last-20 retention trim. */
    createSnapshot: (bookId: string, chapterId: string, name?: string | null) =>
      request<ChapterVersionRead>(
        `/books/${bookId}/chapters/${chapterId}/snapshots`,
        {
          method: "POST",
          body: JSON.stringify({ name: name ?? null }),
        },
      ),

    /** Line-diff of a stored version against the chapter's current
     *  content. ``added`` = present now but not in the snapshot. */
    diffVersion: (bookId: string, chapterId: string, versionId: string) =>
      request<ChapterVersionDiff>(
        `/books/${bookId}/chapters/${chapterId}/versions/${versionId}/diff`,
      ),

    /** Delete a MANUAL snapshot. Auto versions are rejected (400). */
    deleteVersion: (bookId: string, chapterId: string, versionId: string) =>
      request<void>(
        `/books/${bookId}/chapters/${chapterId}/versions/${versionId}`,
        { method: "DELETE" },
      ),

    validateToc: (bookId: string) =>
      request<{
        valid: boolean;
        toc_found: boolean;
        total_links: number;
        broken_count: number;
        links: { text: string; anchor: string; toc_chapter_id: string }[];
        broken: { text: string; anchor: string; toc_chapter_id: string }[];
        valid_anchors: string[];
      }>(`/books/${bookId}/chapters/validate-toc`, { method: "POST" }),
  },

  /** Per-book chapter labels (CHAPTER-STATUS-LABELS-01). */
  templates: {
    list: () => request<BookTemplate[]>("/templates"),

    get: (id: string) => request<BookTemplate>(`/templates/${id}`),

    create: (data: BookTemplateCreate) =>
      request<BookTemplate>("/templates", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/templates/${id}`, { method: "DELETE" }),
  },

  chapterTemplates: {
    list: () => request<ChapterTemplate[]>("/chapter-templates"),

    get: (id: string) => request<ChapterTemplate>(`/chapter-templates/${id}`),

    create: (data: ChapterTemplateCreate) =>
      request<ChapterTemplate>("/chapter-templates", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (id: string, data: ChapterTemplateUpdate) =>
      request<ChapterTemplate>(`/chapter-templates/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/chapter-templates/${id}`, { method: "DELETE" }),

    /** TM-04b: trigger a browser download of the template as a
     *  portable JSON file. Filename comes from the backend's
     *  Content-Disposition header. */
    exportJson: async (id: string): Promise<void> => {
      const url = `${BASE}/chapter-templates/${id}/export`;
      const res = await guardedFetch(url, { method: "GET" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          err.detail || "Export failed",
          url,
          "GET",
          err.stacktrace || "",
        );
      }
      const cd = res.headers.get("content-disposition") ?? "";
      const filename =
        _filenameFromContentDisposition(cd) ?? "chapter-template.json";
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    },

    /** TM-04b: create a chapter template from a previously-exported
     *  JSON file. Multipart upload; the backend validates the
     *  ``format`` marker, required fields, and chapter_type enum. */
    importJson: async (file: File): Promise<ChapterTemplate> => {
      const formData = new FormData();
      formData.append("file", file);
      const url = `${BASE}/chapter-templates/import`;
      const res = await guardedFetch(url, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          err.detail || "Import failed",
          url,
          "POST",
          err.stacktrace || "",
        );
      }
      return res.json();
    },
  },

  documentExport: {
    download: async (
      bookId: string,
      format: string,
      params: URLSearchParams,
    ): Promise<void> => {
      const query = params.toString();
      const url = `${BASE}/books/${bookId}/export/${format}${query ? `?${query}` : ""}`;
      const res = await guardedFetch(url, { method: "GET" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          typeof err.detail === "string"
            ? err.detail
            : err.detail?.message || "Export failed",
          url,
          "GET",
          err.stacktrace || "",
          typeof err.detail === "object" ? err.detail : undefined,
        );
      }
      const blob = await res.blob();
      const filename =
        _filenameFromContentDisposition(
          res.headers.get("Content-Disposition"),
        ) ?? `${bookId}.${format}`;
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    },
  },

  exportJobs: {
    /** POST /api/books/{id}/export/async/audiobook -> {job_id, status}
     *
     * When ``confirmOverwrite`` is false (default) and the book already
     * has a persisted audiobook on disk, the backend returns 409 with
     * an ``audiobook_exists`` payload that the caller must surface as
     * a confirm dialog before retrying with confirmOverwrite=true.
     */
    startAudiobook: async (
      bookId: string,
      confirmOverwrite: boolean = false,
      generationMode: string = "missing_and_outdated",
    ): Promise<{ job_id: string; status: string }> => {
      const params = new URLSearchParams();
      if (confirmOverwrite) params.set("confirm_overwrite", "true");
      if (generationMode !== "missing_and_outdated")
        params.set("generation_mode", generationMode);
      const qs = params.toString();
      const url = `${BASE}/books/${bookId}/export/async/audiobook${qs ? `?${qs}` : ""}`;
      const res = await guardedFetch(url, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          typeof err.detail === "string"
            ? err.detail
            : err.detail?.message || "Audiobook export failed",
          url,
          "POST",
          err.stacktrace || "",
          typeof err.detail === "object" ? err.detail : undefined,
        );
      }
      return res.json();
    },
    /** DELETE /api/export/jobs/{id} -> 204 on success, 409 if already done */
    cancel: (jobId: string) =>
      request<void>(`/export/jobs/${jobId}`, { method: "DELETE" }),
    /** Per-chapter MP3 download URL (no API call, just the URL string) */
    chapterFileUrl: (jobId: string, filename: string) =>
      `${BASE}/export/jobs/${jobId}/files/${encodeURIComponent(filename)}`,
    /** Bundled audiobook download URL */
    downloadUrl: (jobId: string) => `${BASE}/export/jobs/${jobId}/download`,
  },

  backup: {
    exportUrl: (includeAudiobook: boolean = false) =>
      `${BASE}/backup/export${includeAudiobook ? "?include_audiobook=true" : ""}`,

    history: (limit = 50) =>
      request<
        {
          timestamp: string;
          action: string;
          book_count: number;
          chapter_count: number;
          file_size_bytes: number;
          filename: string;
          details: string;
        }[]
      >(`/backup/history?limit=${limit}`),

    deleteHistoryEntry: (timestamp: string) =>
      request<{ status: string }>(
        `/backup/history/${encodeURIComponent(timestamp)}`,
        {
          method: "DELETE",
        },
      ),

    clearHistory: () =>
      request<{ status: string }>(`/backup/history`, {
        method: "DELETE",
      }),

    import: async (
      file: File,
    ): Promise<{ imported_books: number; imported_articles?: number }> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await guardedFetch(`${BASE}/backup/import`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          err.detail || "Import failed",
          `${BASE}/backup/import`,
          "POST",
          err.stacktrace || "",
        );
      }
      return res.json();
    },

    compare: async (fileA: File, fileB: File): Promise<BackupCompareResult> => {
      const formData = new FormData();
      formData.append("file_a", fileA);
      formData.append("file_b", fileB);
      const res = await guardedFetch(`${BASE}/backup/compare`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          err.detail || "Compare failed",
          `${BASE}/backup/compare`,
          "POST",
          err.stacktrace || "",
        );
      }
      return res.json();
    },
  },

  bookAudiobook: {
    /** GET /api/books/{id}/audiobook -> persisted audiobook metadata */
    get: (bookId: string) =>
      request<BookAudiobook>(`/books/${bookId}/audiobook`),

    /** GET /api/books/{id}/audiobook/classify -> chapter classification */
    classify: (bookId: string) =>
      request<AudiobookClassification>(`/books/${bookId}/audiobook/classify`),

    /** DELETE /api/books/{id}/audiobook -> remove persisted files */
    delete: (bookId: string) =>
      request<void>(`/books/${bookId}/audiobook`, { method: "DELETE" }),

    /** Dry-run: generate a short sample from the first paragraph.
     *  Returns a blob URL for playback + cost estimate from headers. */
    dryRun: async (bookId: string): Promise<DryRunResult> => {
      const res = await guardedFetch(`${BASE}/books/${bookId}/audiobook/dry-run`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          err.detail || "Dry-run failed",
          `${BASE}/books/${bookId}/audiobook/dry-run`,
          "POST",
          err.stacktrace || "",
        );
      }
      const blob = await res.blob();
      return {
        audioUrl: URL.createObjectURL(blob),
        estimatedCostUsd: res.headers.get("X-Estimated-Cost-USD") || "free",
        estimatedChapters: parseInt(
          res.headers.get("X-Estimated-Chapters") || "0",
          10,
        ),
        engine: res.headers.get("X-Sample-Engine") || "",
        voice: res.headers.get("X-Sample-Voice") || "",
      };
    },

    /** List persisted preview MP3s for a book */
    listPreviews: (bookId: string) =>
      request<AudiobookChapterFile[]>(`/books/${bookId}/audiobook/previews`),

    /** Delete a single preview file */
    deletePreview: (bookId: string, filename: string) =>
      request<void>(
        `/books/${bookId}/audiobook/previews/${encodeURIComponent(filename)}`,
        { method: "DELETE" },
      ),

    /** Delete all previews for a book */
    deleteAllPreviews: (bookId: string) =>
      request<void>(`/books/${bookId}/audiobook/previews`, {
        method: "DELETE",
      }),

    /** Delete a single chapter MP3 from the persisted audiobook */
    deleteChapter: (bookId: string, filename: string) =>
      request<void>(
        `/books/${bookId}/audiobook/chapters/${encodeURIComponent(filename)}`,
        { method: "DELETE" },
      ),

    /** Direct download URLs (no API call) */
    mergedUrl: (bookId: string) => `${BASE}/books/${bookId}/audiobook/merged`,
    zipUrl: (bookId: string) => `${BASE}/books/${bookId}/audiobook/zip`,
    chapterUrl: (bookId: string, filename: string) =>
      `${BASE}/books/${bookId}/audiobook/chapters/${encodeURIComponent(filename)}`,
  },

};

/**
 * Audiobook, Medium-import, comics, story-bible, and tooling API namespaces.
 *
 * Part of the api/client.ts barrel split (Batch 2). Exposes the namespace
 * sub-object spread into the single `api` object in api/apiObject.ts.
 */
import { ApiError } from "./errors";
import {
  BASE,
  guardedFetch,
  request,
} from "./http";
import type {
  AudiobookVoice,
  ChapterMetricsResponse,
  ComicBubbleCreate,
  ComicBubbleOut,
  ComicBubbleUpdate,
  ComicPanelCreate,
  ComicPanelOut,
  ComicPanelUpdate,
  ComicsPluginInfo,
  ContinuityWarning,
  GoogleCloudTTSConfig,
  GoogleCloudTTSUploadResponse,
  GrammarCheckResponse,
  MediumImportCancelPreviewResponse,
  MediumImportPreviewResponse,
  MediumImportResponse,
  StoryBiblePluginInfo,
  StoryEntityAutoDetectProposal,
  StoryEntityCreate,
  StoryEntityLinkCreate,
  StoryEntityLinkOut,
  StoryEntityOut,
  StoryEntityRelationshipResolved,
  StoryEntityTypeDef,
  StoryEntityUpdate,
  StyleFinding,
} from "./client";

export const mediaApi = {
  audiobook: {
    /** GET /api/audiobook/config/elevenlabs -> {configured} */
    getElevenLabsConfig: () =>
      request<{ configured: boolean }>("/audiobook/config/elevenlabs"),

    /** POST /api/audiobook/config/elevenlabs -> verifies and persists */
    setElevenLabsKey: (apiKey: string) =>
      request<{
        configured: boolean;
        tier?: string;
        character_count?: number;
        character_limit?: number;
      }>("/audiobook/config/elevenlabs", {
        method: "POST",
        body: JSON.stringify({ api_key: apiKey }),
      }),

    /** DELETE /api/audiobook/config/elevenlabs */
    deleteElevenLabsKey: () =>
      request<void>("/audiobook/config/elevenlabs", { method: "DELETE" }),

    /** Google Cloud TTS credentials (Service Account JSON upload) */
    getGoogleCloudConfig: () =>
      request<GoogleCloudTTSConfig>("/audiobook/config/google-cloud-tts"),

    uploadGoogleCloudCredentials: async (
      file: File,
    ): Promise<GoogleCloudTTSUploadResponse> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await guardedFetch(`${BASE}/audiobook/config/google-cloud-tts`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          err.detail || "Upload failed",
          `${BASE}/audiobook/config/google-cloud-tts`,
          "POST",
          err.stacktrace || "",
        );
      }
      return res.json();
    },

    testGoogleCloudCredentials: () =>
      request<{ valid: boolean; message: string }>(
        "/audiobook/config/google-cloud-tts/test",
        { method: "POST" },
      ),

    deleteGoogleCloudCredentials: () =>
      request<void>("/audiobook/config/google-cloud-tts", { method: "DELETE" }),

    /** Fetch voices for a specific engine + language combination.
     *
     *  Tries the core ``/api/voices`` cache first; falls back to the
     *  audiobook plugin's live ``/api/audiobook/voices`` endpoint if
     *  the cache is empty (e.g. for non-Edge engines that have no
     *  seeded rows in ``audio_voices``). Returns ``[]`` for any
     *  unknown engine or empty language - the dropdown then shows a
     *  clear "no voices for this engine/language" empty state and
     *  the user knows to switch engines instead of staring at a
     *  silently misfilled dropdown of voices that do not actually
     *  belong to the selected engine.
     *
     *  Critically, there is NO hardcoded Edge-TTS fallback list any
     *  more. The previous implementation showed Edge German voices
     *  whenever ``/api/voices`` returned empty - which the user
     *  experienced as the dropdown leaking voices for engines they
     *  did not pick.
     */
    listVoices: async (
      engine: string,
      language: string,
    ): Promise<AudiobookVoice[]> => {
      if (!engine || !language) return [];
      const params = new URLSearchParams({ engine, language });

      // 1) Core cache
      try {
        const cached = await request<AudiobookVoice[]>(`/voices?${params}`);
        if (cached && cached.length > 0) return cached;
      } catch {
        // Core endpoint may be missing in odd test setups - fall
        // through to the plugin endpoint instead of giving up.
      }

      // 2) Live plugin endpoint (only meaningful for the engines
      //    the audiobook plugin actually knows how to query).
      try {
        const live = await request<AudiobookVoice[]>(
          `/audiobook/voices?${params}`,
        );
        return Array.isArray(live) ? live : [];
      } catch {
        return [];
      }
    },

    /** Synthesise a short preview MP3 for the editor's "Vorlesen"
     *  button. Returns the audio bytes as a Blob so the caller
     *  can `URL.createObjectURL` it into an <audio> element. */
    preview: async (
      text: string,
      bookId: string,
      chapterTitle: string,
    ): Promise<Blob> => {
      const url = `${BASE}/audiobook/preview`;
      const res = await guardedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          book_id: bookId,
          chapter_title: chapterTitle,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          err.detail || "Preview failed",
          url,
          "POST",
          err.stacktrace || "",
        );
      }
      return res.blob();
    },
  },

  mediumImport: {
    importZip: (
      file: File,
      onUploadProgress?: (loaded: number, total: number) => void,
    ): Promise<MediumImportResponse> => {
      const endpoint = `${BASE}/medium-import/import`;
      const formData = new FormData();
      formData.append("file", file);

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);

        if (onUploadProgress) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              onUploadProgress(event.loaded, event.total);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText) as MediumImportResponse);
            } catch (parseError) {
              reject(
                new ApiError(
                  xhr.status,
                  "Antwort konnte nicht geparst werden",
                  endpoint,
                  "POST",
                  String(parseError),
                ),
              );
            }
            return;
          }
          let detail = xhr.statusText || "Import fehlgeschlagen";
          let stacktrace = "";
          try {
            const body = JSON.parse(xhr.responseText) as {
              detail?: string;
              stacktrace?: string;
            };
            if (body.detail) detail = body.detail;
            if (body.stacktrace) stacktrace = body.stacktrace;
          } catch {
            // Non-JSON body; surface the raw status text above.
          }
          reject(
            new ApiError(xhr.status, detail, endpoint, "POST", stacktrace),
          );
        };

        xhr.onerror = () => {
          reject(
            new ApiError(0, "Netzwerkfehler beim Upload", endpoint, "POST", ""),
          );
        };

        xhr.send(formData);
      });
    },

    /** MEDIUM-IMPORT-V2-01: Phase 1 of the dry-run preview
     *  workflow. Uploads the ZIP, returns the per-post table
     *  + a ``preview_id`` token without persisting anything.
     *  Same XHR shape as ``importZip`` because the upload is
     *  still the slow part for typical Medium archives. */
    preview: (
      file: File,
      onUploadProgress?: (loaded: number, total: number) => void,
    ): Promise<MediumImportPreviewResponse> => {
      const endpoint = `${BASE}/medium-import/preview`;
      const formData = new FormData();
      formData.append("file", file);

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);

        if (onUploadProgress) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              onUploadProgress(event.loaded, event.total);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(
                JSON.parse(xhr.responseText) as MediumImportPreviewResponse,
              );
            } catch (parseError) {
              reject(
                new ApiError(
                  xhr.status,
                  "Antwort konnte nicht geparst werden",
                  endpoint,
                  "POST",
                  String(parseError),
                ),
              );
            }
            return;
          }
          let detail = xhr.statusText || "Vorschau fehlgeschlagen";
          let stacktrace = "";
          try {
            const body = JSON.parse(xhr.responseText) as {
              detail?: string;
              stacktrace?: string;
            };
            if (body.detail) detail = body.detail;
            if (body.stacktrace) stacktrace = body.stacktrace;
          } catch {
            // Non-JSON body; surface the raw status text above.
          }
          reject(
            new ApiError(xhr.status, detail, endpoint, "POST", stacktrace),
          );
        };

        xhr.onerror = () => {
          reject(
            new ApiError(0, "Netzwerkfehler beim Upload", endpoint, "POST", ""),
          );
        };

        xhr.send(formData);
      });
    },

    /** MEDIUM-IMPORT-V2-01: Phase 2 of the dry-run preview
     *  workflow. Triggers the actual import of the
     *  user-selected rows from a previously-previewed ZIP.
     *  The backend reads the cached ZIP for ``previewId``,
     *  passes ``selected_filenames`` through to ``import_zip``,
     *  and reaps the cache on success. 404 when the preview
     *  has expired (TTL 30 min) — the wizard surfaces a
     *  "please upload again" toast in that case. */
    importSelected: (
      previewId: string,
      selectedFilenames: string[],
    ): Promise<MediumImportResponse> =>
      request<MediumImportResponse>(`/medium-import/import/${previewId}`, {
        method: "POST",
        body: JSON.stringify({ selected_filenames: selectedFilenames }),
      }),

    /** MEDIUM-IMPORT-V2-01: explicit cancel-from-UI. Reaps the
     *  cached ZIP for ``previewId`` so it doesn't sit on disk
     *  until the TTL fires. Idempotent — unknown ids return
     *  ``{deleted: false}`` with HTTP 200, not 404. */
    cancelPreview: (
      previewId: string,
    ): Promise<MediumImportCancelPreviewResponse> =>
      request<MediumImportCancelPreviewResponse>(
        `/medium-import/preview/${previewId}`,
        { method: "DELETE" },
      ),

    /** ASYNC-IMPORT-PROGRESS-01: kick off an async import job
     *  for the user's selection. Returns immediately (HTTP 202)
     *  with the job_id; per-post progress streams via SSE at
     *  /api/export/jobs/{job_id}/stream and the final
     *  ImportResponse is fetched via getJobResult once
     *  stream_end arrives. */
    importSelectedAsync: (
      previewId: string,
      selectedFilenames: string[],
    ): Promise<{ job_id: string; status: string }> =>
      request<{ job_id: string; status: string }>(
        `/medium-import/import/async/${previewId}`,
        {
          method: "POST",
          body: JSON.stringify({ selected_filenames: selectedFilenames }),
        },
      ),

    /** ASYNC-IMPORT-PROGRESS-01: fetch the full ImportResponse
     *  for a completed async job. The MediumImportJobContext
     *  calls this when SSE stream_end fires with status=completed.
     *  Returns 404 (unknown job) or 409 (not yet completed); see
     *  the route docstring in the plugin for the per-status
     *  decision table. */
    getJobResult: (jobId: string): Promise<MediumImportResponse> =>
      request<MediumImportResponse>(`/medium-import/jobs/${jobId}/result`),

    /** ASYNC-IMPORT-PROGRESS-01: cancel an in-flight async
     *  import job. Reuses the generic
     *  DELETE /api/export/jobs/{id} endpoint that the export
     *  plugin owns - the job_store cancel path is generic, the
     *  worker stops at the next ``await asyncio.sleep(0)``
     *  yield-point between posts. Idempotent: returns 204 for
     *  running jobs, 409 for already-terminal jobs. */
    cancelJob: (jobId: string): Promise<void> =>
      request<void>(`/export/jobs/${jobId}`, { method: "DELETE" }),
  },

  comics: {
    getInfo: () => request<ComicsPluginInfo>("/comics/info"),

    listPanels: (bookId: string, pageId: string) =>
      request<ComicPanelOut[]>(`/books/${bookId}/comic-pages/${pageId}/panels`),

    createPanel: (bookId: string, pageId: string, data: ComicPanelCreate) =>
      request<ComicPanelOut>(`/books/${bookId}/comic-pages/${pageId}/panels`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    updatePanel: (bookId: string, panelId: string, data: ComicPanelUpdate) =>
      request<ComicPanelOut>(`/books/${bookId}/comic-panels/${panelId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    deletePanel: (bookId: string, panelId: string) =>
      request<void>(`/books/${bookId}/comic-panels/${panelId}`, {
        method: "DELETE",
      }),

    /** Bulk same-page panel reorder (COMIC-PANEL-CROSS-PAGE-
     *  MOVE-01 Phase 1). ``panelIds`` is the full ordered id-list
     *  of the page's panels; the backend runs a two-phase
     *  position update in one transaction (mirrors
     *  ``api.pages.reorder``) and returns the post-reorder list. */
    reorderPanels: (bookId: string, pageId: string, panelIds: string[]) =>
      request<ComicPanelOut[]>(
        `/books/${bookId}/comic-pages/${pageId}/panels/reorder`,
        { method: "POST", body: JSON.stringify({ panel_ids: panelIds }) },
      ),

    listBubbles: (bookId: string, panelId: string) =>
      request<ComicBubbleOut[]>(
        `/books/${bookId}/comic-panels/${panelId}/bubbles`,
      ),

    createBubble: (bookId: string, panelId: string, data: ComicBubbleCreate) =>
      request<ComicBubbleOut>(
        `/books/${bookId}/comic-panels/${panelId}/bubbles`,
        { method: "POST", body: JSON.stringify(data) },
      ),

    updateBubble: (bookId: string, bubbleId: string, data: ComicBubbleUpdate) =>
      request<ComicBubbleOut>(`/books/${bookId}/comic-bubbles/${bubbleId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    deleteBubble: (bookId: string, bubbleId: string) =>
      request<void>(`/books/${bookId}/comic-bubbles/${bubbleId}`, {
        method: "DELETE",
      }),
  },

  /** plugin-story-bible Session 2 client (STORY-BIBLE-PLUGIN-01).
   *  Per-book fiction-writing entity database. ``getInfo`` doubles
   *  as the plugin-availability probe (404 when the plugin is
   *  disabled). Field-name parity with the backend Pydantic
   *  StoryEntity* schemas + the story-bible-entities.yaml SSoT. */
  storyBible: {
    getInfo: () => request<StoryBiblePluginInfo>("/story-bible/info"),

    listEntityTypes: () =>
      request<Record<string, StoryEntityTypeDef>>("/story-bible/entity-types"),

    listEntities: (bookId: string, entityType?: string, search?: string) => {
      const params = new URLSearchParams();
      if (entityType) params.set("entity_type", entityType);
      if (search) params.set("search", search);
      const qs = params.toString();
      return request<StoryEntityOut[]>(
        `/story-bible/books/${bookId}/entities` + (qs ? `?${qs}` : ""),
      );
    },

    createEntity: (bookId: string, data: StoryEntityCreate) =>
      request<StoryEntityOut>(`/story-bible/books/${bookId}/entities`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    getEntity: (entityId: string) =>
      request<StoryEntityOut>(`/story-bible/entities/${entityId}`),

    updateEntity: (entityId: string, data: StoryEntityUpdate) =>
      request<StoryEntityOut>(`/story-bible/entities/${entityId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    deleteEntity: (entityId: string) =>
      request<void>(`/story-bible/entities/${entityId}`, {
        method: "DELETE",
      }),

    /** Resolve an entity's relationships to full target entity objects
     *  (STORY-BIBLE C10). Stale (deleted-target) relationships are
     *  dropped server-side. */
    getRelationships: (bookId: string, entityId: string) =>
      request<StoryEntityRelationshipResolved[]>(
        `/story-bible/books/${bookId}/entities/${entityId}/relationships`,
      ),

    /** Scan the book's chapter/page text for unlinked entity-name
     *  mentions and return proposed links (STORY-BIBLE C14). */
    autoDetect: (bookId: string) =>
      request<StoryEntityAutoDetectProposal[]>(
        `/story-bible/books/${bookId}/auto-detect`,
        { method: "POST" },
      ),

    /** Entity-page/chapter links (STORY-BIBLE-STORYBOARD-INTEGRATION-01).
     *  appearances = where an entity shows up; pageEntities = which
     *  entities appear on a page (storyboard badges). */
    appearances: (entityId: string) =>
      request<StoryEntityLinkOut[]>(
        `/story-bible/entities/${entityId}/appearances`,
      ),

    pageEntities: (pageId: string) =>
      request<StoryEntityLinkOut[]>(`/story-bible/pages/${pageId}/entities`),

    createLink: (data: StoryEntityLinkCreate) =>
      request<StoryEntityLinkOut>("/story-bible/links", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    deleteLink: (linkId: string) =>
      request<void>(`/story-bible/links/${linkId}`, { method: "DELETE" }),

    /** Advisory continuity warnings for a book's Storyboard (C11). */
    continuityCheck: (bookId: string) =>
      request<ContinuityWarning[]>(
        `/story-bible/books/${bookId}/continuity-check`,
      ),

    /** Export the Story Bible as a downloadable Markdown payload (C12). */
    exportBible: (bookId: string) =>
      request<{ filename: string; content: string; format: string }>(
        `/story-bible/books/${bookId}/export`,
      ),
  },

  /** About-Dialog backend client. Single cohesive payload — app
   *  identity + Python runtime + bundled dependency versions —
   *  fetched on Settings > About tab mount. Stable shape per the
   *  D1.A decision (2026-05-18 audit). */
  msTools: {
    /** GET /api/ms-tools/metrics/{bookId} -> per-chapter quality metrics */
    chapterMetrics: (bookId: string) =>
      request<ChapterMetricsResponse>(`/ms-tools/metrics/${bookId}`),

    /** POST /api/ms-tools/check -> style analysis with findings */
    check: (text: string, language: string = "de", bookId?: string) => {
      const params = new URLSearchParams({ text, language });
      if (bookId) params.set("book_id", bookId);
      return request<{
        total_words: number;
        total_sentences: number;
        finding_count: number;
        filler_count: number;
        passive_count: number;
        long_sentence_count: number;
        repetition_count: number;
        adverb_count: number;
        adjective_count: number;
        redundant_phrase_count: number;
        filler_ratio: number;
        passive_ratio: number;
        adverb_ratio: number;
        adjective_ratio: number;
        findings: StyleFinding[];
      }>("/ms-tools/check", {
        method: "POST",
        body: JSON.stringify({ text, language, book_id: bookId }),
      });
    },
  },

  grammar: {
    check: (text: string) =>
      request<GrammarCheckResponse>("/grammar/check", {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
  },

};

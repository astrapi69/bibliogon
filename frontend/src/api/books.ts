/**
 * Book, page, asset, publication, and writing-stat API namespaces.
 *
 * Part of the api/client.ts barrel split (Batch 2). Exposes the namespace
 * sub-object spread into the single `api` object in api/apiObject.ts.
 */
import { ApiError } from "./errors";
import {
  BASE,
  guardedFetch,
  request,
  _filenameFromContentDisposition,
} from "./http";
import type {
  AiFillRequest,
  AiFillResponse,
  AiTemplateImportResult,
  Asset,
  Book,
  BookCreate,
  BookDetail,
  BookFromArticlesCreate,
  BookFromTemplateCreate,
  BookFullGraph,
  BookTypeDef,
  BulkAiFillEstimate,
  BulkAiFillJobStatus,
  BulkAiFillRequest,
  BulkAiFillStartResponse,
  BulkAiTemplateImportResult,
  BulkDeleteResponse,
  BulkRestoreResponse,
  ChapterLabel,
  ContentTypeDef,
  CoverLimits,
  CoverUploadResponse,
  LanAccessInfo,
  MarkPublishedRequest,
  Page,
  PageCreate,
  PageUpdate,
  PlatformSchema,
  Publication,
  PublicationCreate,
  PublicationUpdate,
  WritingBookStats,
  WritingChapterStats,
  WritingSession,
  WritingStatsSummary,
} from "./client";

export const booksApi = {
  lanAuth: {
    /** LAN-mode access details. Throws ApiError(404) when LAN mode
     *  is off, which the Settings card treats as "hide the section". */
    info: () => request<LanAccessInfo>("/lan-auth/info"),
  },

  books: {
    list: () => request<Book[]>("/books"),

    /** Complete book graph in one request (chapters + pages + comic
     *  panels/bubbles + story entities/links + chapter labels + asset
     *  metadata) for the offline-download flow (mobile-sync P3-C3). */
    full: (id: string) => request<BookFullGraph>(`/books/${id}/full`),

    get: (id: string, includeContent = false) =>
      request<BookDetail>(
        `/books/${id}${includeContent ? "" : "?include_content=false"}`,
      ),

    create: (data: BookCreate) =>
      request<Book>("/books", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    createFromTemplate: (data: BookFromTemplateCreate) =>
      request<BookDetail>("/books/from-template", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    /** Article-to-book conversion (Phase 2 wizard). Copies the
     *  selected Articles into a brand-new Book as Chapters; the
     *  original Articles are left untouched (decoupled lifecycle).
     *
     *  On 422 the wizard inspects ``ApiError.detailBody`` for the
     *  ``BookFromArticlesValidationError`` shape so it can list
     *  every offending article in a single review screen. */
    fromArticles: (data: BookFromArticlesCreate) =>
      request<BookDetail>("/books/from-articles", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (
      id: string,
      // Writing-goals fields (WRITING-GOALS-PROGRESS-TRACKING-01) are
      // PATCH-only, so they widen Partial<BookCreate> inline rather
      // than polluting the create shape.
      data: Partial<BookCreate> & {
        word_target?: number | null;
        word_target_deadline?: string | null;
        /** Relationship-graph node positions (STORY-BIBLE-RELATIONSHIP-GRAPH-01 C5). */
        graph_layout?: Record<string, { x: number; y: number }> | null;
        /** Cover reference (``assets/covers/cover-x.png``). PATCH-only -
         *  the .bgb importer re-points it onto the restored cover asset. */
        cover_image?: string | null;
      },
    ) =>
      request<Book>(`/books/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    delete: (id: string) => request<void>(`/books/${id}`, { method: "DELETE" }),

    exportUrl: (id: string, fmt: string) => `${BASE}/books/${id}/export/${fmt}`,

    // Trash
    listTrash: () => request<Book[]>("/books/trash/list"),

    restore: (id: string) =>
      request<Book>(`/books/trash/${id}/restore`, { method: "POST" }),

    permanentDelete: (id: string) =>
      request<void>(`/books/trash/${id}`, { method: "DELETE" }),

    emptyTrash: () => request<void>("/books/trash/empty", { method: "DELETE" }),

    /** Bulk-restore (counterpart to ``bulkDelete`` soft path).
     *  Single round-trip replacing ``Promise.all(ids.map(restore))``
     *  in the Undo-toast flow. Mirrors ``articles.bulkRestore``. */
    bulkRestore: (ids: string[]) =>
      request<BulkRestoreResponse>("/books/trash/bulk-restore", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),

    /** Bulk-delete books. ``permanent=false`` moves to trash;
     *  ``true`` hard-deletes and cascades to Chapter / Asset /
     *  BookImportSource. Server-side cap MAX_BULK_DELETE=200
     *  rejects oversize requests with 422. */
    bulkDelete: (ids: string[], permanent: boolean) =>
      request<BulkDeleteResponse>("/books/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids, permanent }),
      }),

    /** Bulk export. POSTs an explicit ID list (already in display
     *  order on the dashboard) plus a format and returns a ZIP-of-
     *  books. ZIP is the only mode for books — combined-multi-book
     *  is conceptually wrong because the per-book pipeline already
     *  goes through manuscripta + write-book-template scaffolding
     *  (see backend AR-BULK-BOOKS-PARITY-01 commit for reasoning).
     *  Errors surface as ApiError with the server's fail-loud
     *  message so the toast names the offending book directly. */
    bulkExport: async (
      bookIds: string[],
      format: "epub" | "pdf" | "docx",
    ): Promise<{ blob: Blob; filename: string }> => {
      const res = await guardedFetch(`${BASE}/books/bulk-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_ids: bookIds, format }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          typeof err.detail === "string"
            ? err.detail
            : "Bulk book export failed",
          `${BASE}/books/bulk-export`,
          "POST",
        );
      }
      const blob = await res.blob();
      const filename =
        _filenameFromContentDisposition(
          res.headers.get("Content-Disposition"),
        ) || `books.zip`;
      return { blob, filename };
    },

    /** UNIVERSAL-AI-TEMPLATE-02: AI-template export / import /
     *  empty + AI-fill for one book. The .biblio.yaml template
     *  format is self-explanatory; see docs/help/{en,de}/ai/
     *  ai-templates.md. */
    aiTemplate: {
      /** Download the book's filled template as a
       *  ``.biblio.yaml`` blob. */
      export: async (id: string): Promise<{ blob: Blob; filename: string }> => {
        const res = await guardedFetch(`${BASE}/books/${id}/ai-template`);
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ detail: res.statusText }));
          throw new ApiError(
            res.status,
            typeof err.detail === "string"
              ? err.detail
              : "Book template export failed",
            `${BASE}/books/${id}/ai-template`,
            "GET",
          );
        }
        const blob = await res.blob();
        const filename =
          _filenameFromContentDisposition(
            res.headers.get("Content-Disposition"),
          ) || `book-${id}.biblio.yaml`;
        return { blob, filename };
      },

      /** Import a filled template YAML against an existing book.
       *  Force=true overwrites populated fields; the AI-null /
       *  AI-empty branch always skips regardless of force. */
      import: (id: string, yamlText: string, force = false) =>
        request<AiTemplateImportResult>(
          `/books/${id}/ai-template?force=${force}`,
          {
            method: "POST",
            headers: { "Content-Type": "text/yaml" },
            body: yamlText,
          },
        ),

      /** Download an empty (new-idea) book template in the
       *  requested language. No reference block. */
      empty: async (
        language = "en",
      ): Promise<{ blob: Blob; filename: string }> => {
        const url = `${BASE}/ai-templates/book?language=${encodeURIComponent(language)}`;
        const res = await guardedFetch(url);
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ detail: res.statusText }));
          throw new ApiError(
            res.status,
            typeof err.detail === "string"
              ? err.detail
              : "Empty template failed",
            url,
            "GET",
          );
        }
        const blob = await res.blob();
        const filename =
          _filenameFromContentDisposition(
            res.headers.get("Content-Disposition"),
          ) || `new-book-${language}.biblio.yaml`;
        return { blob, filename };
      },
    },

    /** Create a fresh book from a filled ``.biblio.yaml``
     *  template ("New from template" workflow). Symmetric
     *  with ``api.articles.fromAiTemplate``; backend endpoint
     *  lands in commit 5 of Session 2. Calling this before
     *  the backend is up returns 404; the typed surface is
     *  already here so the frontend doesn't churn at commit
     *  5 ship time. */
    fromAiTemplate: async (yamlText: string): Promise<BookDetail> => {
      const url = `${BASE}/books/from-ai-template`;
      const res = await guardedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/yaml" },
        body: yamlText,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          typeof err.detail === "string"
            ? err.detail
            : "Create-from-template failed",
          url,
          "POST",
        );
      }
      return (await res.json()) as BookDetail;
    },

    /** AI-fill one book. Per-class failure is isolated; the
     *  response carries ``field_class_errors`` so the UI can
     *  surface which classes failed. Tokens used bump
     *  ``Book.ai_tokens_used``. */
    aiFill: (id: string, req: AiFillRequest) =>
      request<AiFillResponse>(`/books/${id}/ai-fill`, {
        method: "POST",
        body: JSON.stringify(req),
      }),

    /** Bulk template export / import for books. Cap is 50 per
     *  request (S8). Import is multipart with a ZIP file. */
    bulkAiTemplate: {
      export: async (
        ids: string[],
      ): Promise<{ blob: Blob; filename: string }> => {
        const res = await guardedFetch(`${BASE}/books/bulk-ai-template/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ detail: res.statusText }));
          throw new ApiError(
            res.status,
            typeof err.detail === "string"
              ? err.detail
              : "Bulk template export failed",
            `${BASE}/books/bulk-ai-template/export`,
            "POST",
          );
        }
        const blob = await res.blob();
        const filename =
          _filenameFromContentDisposition(
            res.headers.get("Content-Disposition"),
          ) || "books-ai-templates.zip";
        return { blob, filename };
      },

      import: async (
        zipFile: File,
        force = false,
      ): Promise<BulkAiTemplateImportResult> => {
        const form = new FormData();
        form.append("file", zipFile);
        const url = `${BASE}/books/bulk-ai-template/import?force=${force}`;
        const res = await guardedFetch(url, { method: "POST", body: form });
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ detail: res.statusText }));
          throw new ApiError(
            res.status,
            typeof err.detail === "string"
              ? err.detail
              : "Bulk template import failed",
            url,
            "POST",
          );
        }
        return (await res.json()) as BulkAiTemplateImportResult;
      },
    },

    /** Bulk AI-fill with per-item cost-estimate breakdown,
     *  async job, and SSE streaming. ``estimate`` does NOT run
     *  the LLM; it builds the same prompts a real run would and
     *  applies the pricing heuristic. ``start`` submits the job
     *  and returns its id; subscribe to ``streamUrl(jobId)`` via
     *  ``EventSource`` for live progress. ``status`` is a poll
     *  fallback when SSE isn't available. */
    bulkAiFill: {
      estimate: (req: BulkAiFillRequest) =>
        request<BulkAiFillEstimate>("/books/bulk-ai-fill/estimate", {
          method: "POST",
          body: JSON.stringify(req),
        }),

      start: (req: BulkAiFillRequest) =>
        request<BulkAiFillStartResponse>("/books/bulk-ai-fill/start", {
          method: "POST",
          body: JSON.stringify(req),
        }),

      streamUrl: (jobId: string) =>
        `${BASE}/books/bulk-ai-fill/jobs/${jobId}/stream`,

      status: (jobId: string) =>
        request<BulkAiFillJobStatus>(`/books/bulk-ai-fill/jobs/${jobId}`),
    },
  },

  /** AR-02 Phase 2: per-Article publications + drift detection. */
  publications: {
    list: (articleId: string) =>
      request<Publication[]>(`/articles/${articleId}/publications`),

    get: (articleId: string, pubId: string) =>
      request<Publication>(`/articles/${articleId}/publications/${pubId}`),

    create: (articleId: string, data: PublicationCreate) =>
      request<Publication>(`/articles/${articleId}/publications`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (articleId: string, pubId: string, data: PublicationUpdate) =>
      request<Publication>(`/articles/${articleId}/publications/${pubId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    delete: (articleId: string, pubId: string) =>
      request<void>(`/articles/${articleId}/publications/${pubId}`, {
        method: "DELETE",
      }),

    markPublished: (
      articleId: string,
      pubId: string,
      data: MarkPublishedRequest,
    ) =>
      request<Publication>(
        `/articles/${articleId}/publications/${pubId}/mark-published`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),

    verifyLive: (articleId: string, pubId: string) =>
      request<Publication>(
        `/articles/${articleId}/publications/${pubId}/verify-live`,
        { method: "POST" },
      ),
  },

  /** AR-02 Phase 2: platform schemas loaded from
   *  backend/app/data/platform_schemas.yaml. Top-level path so it
   *  doesn't collide with /articles/{article_id}. */
  articlePlatforms: {
    list: () => request<Record<string, PlatformSchema>>("/article-platforms"),
  },

  /** BOOK-TYPES-SSOT-YAML-01: book-type registry loaded from
   *  backend/config/book-types.yaml. Returns the {id: BookTypeDef}
   *  mapping. Frontend's useBookTypes() hook + BookTypesProvider
   *  consume this; per-component direct callers are also valid. */
  bookTypes: {
    list: () => request<Record<string, BookTypeDef>>("/book-types"),
  },

  /** ARTICLE-TYPES-SSOT-01: article-type registry loaded from
   *  backend/config/content-types.yaml. Returns the
   *  {id: ContentTypeDef} mapping. Frontend's useContentTypes()
   *  hook + ContentTypesProvider consume this; mirrors the
   *  bookTypes shape exactly. */
  contentTypes: {
    list: () => request<Record<string, ContentTypeDef>>("/content-types"),
  },

  /** AR-01 Phase 1: standalone Article CRUD. Article is its own
   *  entity, NOT a Book - no chapters, no front-matter, no ISBN.
   *  Phase 2 layers on Publications + drift detection (see
   *  api.publications) and SEO fields on Article itself. */
  covers: {
    upload: async (
      bookId: string,
      file: File,
    ): Promise<CoverUploadResponse> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await guardedFetch(`${BASE}/books/${bookId}/cover`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          err.detail || "Cover upload failed",
          `${BASE}/books/${bookId}/cover`,
          "POST",
          err.stacktrace || "",
        );
      }
      return res.json();
    },

    delete: (bookId: string) =>
      request<void>(`/books/${bookId}/cover`, { method: "DELETE" }),

    limits: (bookId: string) =>
      request<CoverLimits>(`/books/${bookId}/cover/limits`),
  },

  /** Document export (epub/pdf/docx/html/markdown). Fetches the file
   *  via blob so 4xx errors (e.g. 422 missing_images) surface as
   *  ApiError with detailBody, instead of being lost in window.open. */
  assets: {
    list: (bookId: string) => request<Asset[]>(`/books/${bookId}/assets`),

    upload: async (
      bookId: string,
      file: File,
      assetType: string,
    ): Promise<Asset> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await guardedFetch(
        `${BASE}/books/${bookId}/assets?asset_type=${assetType}`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          err.detail || "Upload failed",
          `${BASE}/books/assets`,
          "POST",
          err.stacktrace || "",
        );
      }
      return res.json();
    },

    delete: (bookId: string, assetId: string) =>
      request<void>(`/books/${bookId}/assets/${assetId}`, { method: "DELETE" }),
  },

  pages: {
    list: (bookId: string) => request<Page[]>(`/books/${bookId}/pages`),

    create: (bookId: string, data: PageCreate) =>
      request<Page>(`/books/${bookId}/pages`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (bookId: string, pageId: string, data: PageUpdate) =>
      request<Page>(`/books/${bookId}/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    delete: (bookId: string, pageId: string) =>
      request<void>(`/books/${bookId}/pages/${pageId}`, {
        method: "DELETE",
      }),

    /** Bulk-reorder by full id-list. Backend runs the position
     *  updates in a single transaction; partial failure leaves
     *  no half-reordered state. Returns the post-reorder
     *  ordered list. */
    reorder: (bookId: string, pageIds: string[]) =>
      request<Page[]>(`/books/${bookId}/pages/reorder`, {
        method: "POST",
        body: JSON.stringify({ page_ids: pageIds }),
      }),
  },

  chapterLabels: {
    list: (bookId: string) =>
      request<ChapterLabel[]>(`/books/${bookId}/chapter-labels`),

    create: (bookId: string, data: { name: string; color: string }) =>
      request<ChapterLabel>(`/books/${bookId}/chapter-labels`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (
      bookId: string,
      labelId: string,
      data: { name?: string; color?: string; position?: number },
    ) =>
      request<ChapterLabel>(`/books/${bookId}/chapter-labels/${labelId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    remove: (bookId: string, labelId: string) =>
      request<void>(`/books/${bookId}/chapter-labels/${labelId}`, {
        method: "DELETE",
      }),
  },

  /** Per-day writing-session history (WRITING-GOALS-PROGRESS-TRACKING-01).
   *  The daily-goal + streak are computed client-side from this. */
  writingSessions: {
    list: (days = 30) =>
      request<WritingSession[]>(`/writing-sessions?days=${days}`),
  },

  /** Writing-History stats (WRITING-HISTORY-STATS-01): global summary,
   *  per-book + per-chapter breakdowns, and a CSV export URL. */
  writingStats: {
    summary: (days = 90) =>
      request<WritingStatsSummary>(`/writing-stats/summary?days=${days}`),
    byBook: (days = 90) =>
      request<WritingBookStats[]>(`/writing-stats/by-book?days=${days}`),
    byChapter: (bookId: string, days = 90) =>
      request<WritingChapterStats[]>(
        `/writing-stats/by-chapter/${bookId}?days=${days}`,
      ),
    /** Absolute URL for the CSV download (used as an <a href>). */
    exportCsvUrl: (days = 90) =>
      `${BASE}/writing-stats/export.csv?days=${days}`,
  },

  /** PB-PHASE4 picture-book pages CRUD. Endpoints come from the
   *  kinderbuch plugin's ``pages.py`` router (mounted under
   *  ``/api/books/{book_id}/pages*``). Domain conventions
   *  intentionally diverge from ``api.chapters`` in two ways:
   *
   *    - No abort-controller on ``update`` (Page fields are
   *      manually-saved, not auto-saved per keystroke like
   *      Chapter content).
   *    - ``reorder`` is POST, not PUT (honours the deployed
   *      backend — the Session-2 router shipped with POST).
   *
   *  These are deliberate domain-specific patterns, not
   *  inconsistencies; see PB-PHASE4 Session 3 handover. */
};

/**
 * Article, comment, author, and article-asset API namespaces.
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
  Article,
  ArticleAsset,
  ArticleComment,
  ArticleCreate,
  ArticleStatus,
  ArticleUpdate,
  Author,
  AuthorCreate,
  AuthorUpdate,
  BulkAiFillEstimate,
  BulkAiFillJobStatus,
  BulkAiFillRequest,
  BulkAiFillStartResponse,
  BulkAiTemplateImportResult,
  BulkDeleteResponse,
  BulkRestoreResponse,
} from "./client";

export const articlesApi = {
  articles: {
    list: (status?: ArticleStatus) => {
      const qs = status ? `?status=${status}` : "";
      return request<Article[]>(`/articles${qs}`);
    },

    get: (id: string) => request<Article>(`/articles/${id}`),

    create: (data: ArticleCreate) =>
      request<Article>("/articles", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (id: string, data: ArticleUpdate) =>
      request<Article>(`/articles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/articles/${id}`, { method: "DELETE" }),

    /** Reclassify an article as an ArticleComment. Transactional
     *  move (insert comment + delete article in one commit).
     *  Returns the new comment id + the deleted article id so the
     *  caller can deep-link a "View in Comments admin" toast and
     *  drop the article from any local cache. Companion to the
     *  reciprocal ``comments.reclassifyAsArticle``. */
    reclassifyAsComment: (
      id: string,
      payload: {
        respondsToUrl?: string;
        respondsToArticleId?: string;
      } = {},
    ) =>
      request<{
        success: boolean;
        comment_id: string;
        deleted_article_id: string;
      }>(`/articles/${id}/reclassify-as-comment`, {
        method: "POST",
        body: JSON.stringify({
          responds_to_url: payload.respondsToUrl ?? null,
          responds_to_article_id: payload.respondsToArticleId ?? null,
        }),
      }),

    /** Single-shot AI generation for SEO title / description /
     *  tags. Backend extracts plain text from the article body,
     *  builds a language-aware prompt, calls the configured AI
     *  provider, and returns either ``generated_text`` (string
     *  fields) or ``generated_tags`` (list). Tokens used bump
     *  ``Article.ai_tokens_used`` for the per-article cost
     *  dashboard. */
    generateMeta: (
      id: string,
      field: "seo_title" | "seo_description" | "tags",
    ) =>
      request<{
        generated_text?: string;
        generated_tags?: string[];
        tokens_used: number;
      }>(`/articles/${id}/ai/generate-meta`, {
        method: "POST",
        body: JSON.stringify({ field }),
      }),

    /** MEDIUM-COMMENTS-UI-01. Read-only listing of comments
     *  that respond to this article. Returns a soft-delete-
     *  filtered list ordered by ``published_at`` ASC (NULLs
     *  last). 404 when the article id is unknown - distinct
     *  from "no comments yet" (200 + []). Drives the editor
     *  sidebar's read-only comments section. */
    getComments: (id: string) =>
      request<ArticleComment[]>(`/articles/${id}/comments`),

    // Trash bin parity with books. ``delete`` above moves to
    // trash by default (or hard-deletes when
    // ``app.delete_permanently`` is true in app.yaml). The trash
    // endpoints below are dedicated to managing trashed rows.
    listTrash: () => request<Article[]>("/articles/trash/list"),
    restore: (id: string) =>
      request<Article>(`/articles/trash/${id}/restore`, { method: "POST" }),
    permanentDelete: (id: string) =>
      request<void>(`/articles/trash/${id}`, { method: "DELETE" }),
    emptyTrash: () =>
      request<void>("/articles/trash/empty", { method: "DELETE" }),

    /** Bulk-delete. ``permanent=false`` moves rows to trash; ``true``
     *  hard-deletes and cascades to children. Response includes
     *  ``deleted_count``, ``skipped_already_trashed`` (soft path only)
     *  and ``failed[]`` so the caller's toast can surface partial
     *  failures transparently. Server-side cap matches MAX_BULK_DELETE
     *  (200) and rejects oversize requests with 422. */
    bulkDelete: (ids: string[], permanent: boolean) =>
      request<BulkDeleteResponse>("/articles/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids, permanent }),
      }),

    /** Bulk-restore (counterpart to ``bulkDelete`` soft path).
     *  Single round-trip replacing ``Promise.all(ids.map(restore))``
     *  in the Undo-toast flow. Returns per-id status so the caller
     *  can render "X restored, Y already live, Z failed". Mirrors
     *  the existing ``comments.bulkRestore`` shape. */
    bulkRestore: (ids: string[]) =>
      request<BulkRestoreResponse>("/articles/trash/bulk-restore", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),

    /** Bulk export. POSTs an explicit ID list (already in display
     *  order on the dashboard) plus a format and a mode, downloads
     *  the resulting blob via a synthetic anchor click. The
     *  request bypasses the JSON wrapper because the response is a
     *  binary file (ZIP / PDF / DOCX) or a non-JSON document
     *  (Markdown / HTML); anything other than 200 surfaces as
     *  ApiError so the caller's catch block can toast the
     *  fail-loud message coming back from the server (e.g.
     *  "Failed exporting article 'X': pandoc broke on image Y"). */
    bulkExport: async (
      articleIds: string[],
      format: "markdown" | "html" | "pdf" | "docx",
      mode: "zip" | "combined",
    ): Promise<{ blob: Blob; filename: string }> => {
      const res = await guardedFetch(`${BASE}/articles/bulk-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article_ids: articleIds, format, mode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          typeof err.detail === "string" ? err.detail : "Bulk export failed",
          `${BASE}/articles/bulk-export`,
          "POST",
        );
      }
      const blob = await res.blob();
      const filename =
        _filenameFromContentDisposition(
          res.headers.get("Content-Disposition"),
        ) || (mode === "zip" ? "articles.zip" : `articles.${format}`);
      return { blob, filename };
    },

    /** UNIVERSAL-AI-TEMPLATE-02: AI-template export / import /
     *  empty + AI-fill for one article. Symmetrical with
     *  ``api.books.aiTemplate``. */
    aiTemplate: {
      export: async (id: string): Promise<{ blob: Blob; filename: string }> => {
        const res = await guardedFetch(`${BASE}/articles/${id}/ai-template`);
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ detail: res.statusText }));
          throw new ApiError(
            res.status,
            typeof err.detail === "string"
              ? err.detail
              : "Article template export failed",
            `${BASE}/articles/${id}/ai-template`,
            "GET",
          );
        }
        const blob = await res.blob();
        const filename =
          _filenameFromContentDisposition(
            res.headers.get("Content-Disposition"),
          ) || `article-${id}.biblio.yaml`;
        return { blob, filename };
      },

      import: (id: string, yamlText: string, force = false) =>
        request<AiTemplateImportResult>(
          `/articles/${id}/ai-template?force=${force}`,
          {
            method: "POST",
            headers: { "Content-Type": "text/yaml" },
            body: yamlText,
          },
        ),

      empty: async (
        language = "en",
      ): Promise<{ blob: Blob; filename: string }> => {
        const url = `${BASE}/ai-templates/article?language=${encodeURIComponent(language)}`;
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
          ) || `new-article-${language}.biblio.yaml`;
        return { blob, filename };
      },
    },

    /** Create a fresh article from a filled
     *  ``.biblio.yaml`` template (the "New from template"
     *  workflow). Backend mirrors the per-record import
     *  pipeline but with force=True implicit since every
     *  column starts empty. Requires the template's
     *  title.current_value to be a non-empty string. */
    fromAiTemplate: async (yamlText: string): Promise<Article> => {
      const url = `${BASE}/articles/from-ai-template`;
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
      return (await res.json()) as Article;
    },

    aiFill: (id: string, req: AiFillRequest) =>
      request<AiFillResponse>(`/articles/${id}/ai-fill`, {
        method: "POST",
        body: JSON.stringify(req),
      }),

    bulkAiTemplate: {
      export: async (
        ids: string[],
      ): Promise<{ blob: Blob; filename: string }> => {
        const res = await guardedFetch(`${BASE}/articles/bulk-ai-template/export`, {
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
            `${BASE}/articles/bulk-ai-template/export`,
            "POST",
          );
        }
        const blob = await res.blob();
        const filename =
          _filenameFromContentDisposition(
            res.headers.get("Content-Disposition"),
          ) || "articles-ai-templates.zip";
        return { blob, filename };
      },

      import: async (
        zipFile: File,
        force = false,
      ): Promise<BulkAiTemplateImportResult> => {
        const form = new FormData();
        form.append("file", zipFile);
        const url = `${BASE}/articles/bulk-ai-template/import?force=${force}`;
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

    bulkAiFill: {
      estimate: (req: BulkAiFillRequest) =>
        request<BulkAiFillEstimate>("/articles/bulk-ai-fill/estimate", {
          method: "POST",
          body: JSON.stringify(req),
        }),

      start: (req: BulkAiFillRequest) =>
        request<BulkAiFillStartResponse>("/articles/bulk-ai-fill/start", {
          method: "POST",
          body: JSON.stringify(req),
        }),

      streamUrl: (jobId: string) =>
        `${BASE}/articles/bulk-ai-fill/jobs/${jobId}/stream`,

      status: (jobId: string) =>
        request<BulkAiFillJobStatus>(`/articles/bulk-ai-fill/jobs/${jobId}`),
    },
  },

  /** AR editor-parity Phase 2: translate an Article into a new
   *  target-language Article. Backend route lives in the
   *  translation plugin (POST /api/translation/translate-article).
   *  Returns the new article id; caller navigates to it. */
  articleTranslation: {
    translate: (
      articleId: string,
      targetLang: string,
      opts: {
        sourceLang?: string;
        provider?: "deepl" | "lmstudio";
        titleSuffix?: string;
      } = {},
    ) =>
      request<{
        article_id: string;
        title: string;
        language: string;
        original_article_id: string;
        provider: string;
      }>("/translation/translate-article", {
        method: "POST",
        body: JSON.stringify({
          article_id: articleId,
          target_lang: targetLang,
          source_lang: opts.sourceLang,
          provider: opts.provider ?? "deepl",
          title_suffix: opts.titleSuffix ?? "",
        }),
      }),

    /** Available providers + their configured/health state.
     *  Read this before showing the translate panel so the user
     *  is not surprised by a 400 "No API key configured". */
    providers: () =>
      request<
        Array<{
          id: string;
          name: string;
          configured: boolean;
          description: string;
        }>
      >("/translation/providers"),

    /** Live health check for each provider (DeepL: validates the
     *  API key with a usage call; LMStudio: pings /models on the
     *  configured base_url). Use this to filter the translate
     *  dropdown so the user does not pick a provider that will
     *  120s-timeout on submit. */
    health: () =>
      request<
        Record<
          string,
          { status: "ok" | "error" | "not_configured"; error?: string }
        >
      >("/translation/health"),
  },

  /** AR editor-parity Phase 3: download an article as
   *  Markdown / HTML / PDF / DOCX. Triggers a browser download
   *  via fetch + Blob (instead of a plain link click) so the
   *  caller can show progress and surface backend errors via
   *  the standard ApiError toast path. */
  articleExport: {
    download: async (
      articleId: string,
      fmt: "markdown" | "html" | "pdf" | "docx",
    ): Promise<void> => {
      const url = `${BASE}/articles/${articleId}/export/${fmt}`;
      const res = await guardedFetch(url, { method: "GET" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          err.detail || "Article export failed",
          url,
          "GET",
          err.stacktrace || "",
        );
      }
      // Filename comes from Content-Disposition; fall back to
      // a generic article.{ext} when missing.
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="?([^";]+)"?/i);
      const ext = fmt === "markdown" ? "md" : fmt;
      const filename = match ? match[1] : `article.${ext}`;
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

    formats: (articleId: string) =>
      request<{ formats: string[]; pandoc_required: string[] }>(
        `/articles/${articleId}/export`,
      ),
  },

  /** UX-FU-02: per-article asset uploads (currently
   *  ``featured_image``). Mirrors ``api.covers`` for books. */
  articleAssets: {
    upload: async (
      articleId: string,
      file: File,
      assetType: string = "featured_image",
    ): Promise<ArticleAsset> => {
      const formData = new FormData();
      formData.append("file", file);
      const url = `${BASE}/articles/${articleId}/assets?asset_type=${encodeURIComponent(assetType)}`;
      const res = await guardedFetch(url, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          err.detail || "Article asset upload failed",
          url,
          "POST",
          err.stacktrace || "",
        );
      }
      return res.json();
    },

    list: (articleId: string) =>
      request<ArticleAsset[]>(`/articles/${articleId}/assets`),

    delete: (articleId: string, assetId: string) =>
      request<void>(`/articles/${articleId}/assets/${assetId}`, {
        method: "DELETE",
      }),

    /** Build the served URL for an uploaded asset. The backend
     *  serves files by filename via ``GET /file/{filename}``. */
    urlFor: (articleId: string, filename: string): string =>
      `/api/articles/${articleId}/assets/file/${encodeURIComponent(filename)}`,
  },

  /** MEDIUM-COMMENTS-UI-01. Admin-side comments management.
   *  Article-scoped read access lives on api.articles.getComments
   *  (where it semantically belongs with the article). This
   *  namespace is for cross-article admin operations: filtered
   *  listing + soft-delete. Future v2 work in this namespace:
   *  bulk-delete, re-link to article, hard-delete. */
  comments: {
    /** List comments across all articles. ``importedFrom``
     *  narrows to one source (e.g. ``"medium"``);
     *  ``orphansOnly=true`` restricts to comments with
     *  ``responds_to_article_id IS NULL``. Soft-deleted
     *  comments are excluded by the backend. Server cap is
     *  500; default is 100. */
    list: (
      params: {
        importedFrom?: string;
        orphansOnly?: boolean;
        limit?: number;
      } = {},
    ) => {
      const qs = new URLSearchParams();
      if (params.importedFrom) qs.set("imported_from", params.importedFrom);
      if (params.orphansOnly) qs.set("orphans_only", "true");
      if (params.limit != null) qs.set("limit", String(params.limit));
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return request<ArticleComment[]>(`/comments${suffix}`);
    },

    /** Soft-delete a single comment. Idempotent: re-deletes
     *  return 204 so a bulk-by-id flow stays clean. 404 only
     *  when the id is unknown. */
    delete: (id: string) =>
      request<void>(`/comments/${id}`, { method: "DELETE" }),

    /** Reciprocal of ``articles.reclassifyAsComment``: move an
     *  ArticleComment to Article. Article.title is auto-derived
     *  from the comment body (truncated at 200 chars + ``"..."``).
     *  The caller typically navigates straight to
     *  ``/articles/{article_id}`` so the user can edit the title
     *  if the auto-derivation reads awkwardly. */
    reclassifyAsArticle: (id: string) =>
      request<{
        success: boolean;
        article_id: string;
        deleted_comment_id: string;
      }>(`/comments/${id}/reclassify-as-article`, {
        method: "POST",
        body: JSON.stringify({}),
      }),

    /** Bulk soft- (default) or permanent-delete a list of comment
     *  ids. Mirrors ``articles.bulkDelete`` and
     *  ``books.bulkDelete``. Uncapped — comments-admin selections
     *  can run into the hundreds and the backend is DB-bound
     *  (sub-second). Response carries per-row outcomes so the
     *  caller's toast can surface partial failures. */
    bulkDelete: (ids: string[], permanent: boolean) =>
      request<BulkDeleteResponse>("/comments/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids, permanent }),
      }),

    // --- Bug 10: trash-lifecycle methods ---

    /** List every comment currently in the trash, newest-trashed
     *  first. Mirror of ``articles.listTrash`` / ``books`` trash
     *  list. Soft-deleted comments only — the active ``list``
     *  endpoint filters them out by ``deleted_at IS NULL``. */
    listTrashed: () => request<ArticleComment[]>("/comments/trash/list"),

    /** Restore a trashed comment. Returns the restored row.
     *  404 when the id is unknown OR not currently in trash
     *  (protects multi-tab races where another tab restored
     *  first). */
    restore: (id: string) =>
      request<ArticleComment>(`/comments/trash/${id}/restore`, {
        method: "POST",
      }),

    /** Permanently remove one comment from the trash. 404 when
     *  the id is not currently in trash — the caller MUST
     *  soft-delete first via ``delete()``. No single-step
     *  hard-delete-without-trash path exists by design. */
    permanentDelete: (id: string) =>
      request<void>(`/comments/trash/${id}`, { method: "DELETE" }),

    /** Permanently delete every comment currently in trash.
     *  Returns 204 even when the trash was already empty
     *  (idempotent). */
    emptyTrash: () =>
      request<void>("/comments/trash/empty", { method: "DELETE" }),

    /** Bulk-restore the given trashed ids. Per-id outcomes:
     *  ``restored_count`` (success), ``skipped_not_in_trash``
     *  (already live — idempotent), ``failed`` (unknown id or
     *  unexpected error). Bulk-permanent-delete is NOT a
     *  separate endpoint — use ``bulkDelete(ids, true)`` which
     *  hard-deletes regardless of soft-delete state. */
    bulkRestore: (ids: string[]) =>
      request<{
        restored_count: number;
        skipped_not_in_trash: string[];
        failed: { id: string; error: string }[];
      }>("/comments/trash/bulk-restore", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
  },

  authors: {
    /** List authors ordered by name. ``search`` is a
     *  case-insensitive substring filter on ``name``;
     *  whitespace-only is treated as omitted. ``limit``
     *  defaults to 200, capped at 1000 server-side. */
    list: (params: { search?: string; limit?: number } = {}) => {
      const qs = new URLSearchParams();
      if (params.search) qs.set("search", params.search);
      if (params.limit != null) qs.set("limit", String(params.limit));
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return request<Author[]>(`/authors${suffix}`);
    },

    get: (id: string) => request<Author>(`/authors/${id}`),

    /** Slug is server-generated from ``name`` (lowercase +
     *  hyphenated, German + Nordic diacritics transliterated,
     *  NFKD-fold for other diacritics). Collisions append a
     *  numeric suffix (``-2``, ``-3`` ...). Empty result (all-
     *  emoji input) falls back to ``"author"``. */
    create: (data: AuthorCreate) =>
      request<Author>("/authors", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    /** Partial update. Slug is immutable; name edits do NOT
     *  regenerate it. */
    update: (id: string, data: AuthorUpdate) =>
      request<Author>(`/authors/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    /** Hard-delete. Idempotent: 204 even on already-gone. */
    delete: (id: string) =>
      request<void>(`/authors/${id}`, { method: "DELETE" }),
  },

};

/**
 * AI, KDP, settings, help, git, and system API namespaces.
 *
 * Part of the api/client.ts barrel split (Batch 2). Exposes the namespace
 * sub-object spread into the single `api` object in api/apiObject.ts.
 */
import { ApiError } from "./errors";
import {
  BASE,
  guardedFetch,
  isBackendlessOffline,
  request,
  _filenameFromContentDisposition,
} from "./http";
import type {
  AiAsyncJobSubmit,
  AiGenerateMarketingRequest,
  AiGenerateResponse,
  AiJobStatus,
  AiReviewEstimate,
  AiReviewSubmitRequest,
  AiTestConnectionResult,
  ArcReviewerApi,
  ArcReviewerCreatePayload,
  ArcReviewerUpdatePayload,
  BookPublishingStateApi,
  BookPublishingStateGetResponse,
  BookPublishingStateUpdatePayload,
  BookType,
  DiscoveredPlugin,
  GitCommitEntry,
  GitConflictAnalysis,
  GitMergeResult,
  GitPullResult,
  GitPushResult,
  GitRemoteConfig,
  GitRepoStatus,
  GitSyncCommitRequest,
  GitSyncCommitResult,
  GitSyncDiffResponse,
  GitSyncMappingStatus,
  GitSyncResolutionEntry,
  GitSyncResolveResult,
  GitSyncStatus,
  GitSyncUnifiedCommitRequest,
  GitSyncUnifiedCommitResult,
  HelpNavItem,
  HelpPage,
  HelpSearchResult,
  KdpCheckMetadataRequest,
  KdpMetadataCheckResult,
  SshKeyInfo,
  SystemInfo,
  TranslationLinkResult,
  TranslationMultiBranchImportResult,
  TranslationSiblingsResponse,
} from "./client";

export const platformApi = {
  ai: {
    /** Cheap pre-flight estimate for the AI review cost label. */
    estimateReview: (content: string) =>
      request<AiReviewEstimate>("/ai/review/estimate", {
        method: "POST",
        body: JSON.stringify({ content }),
      }),

    /** Free-form generation used by the editor's AI panel. */
    generate: (prompt: string, system: string, bookId: string) =>
      request<AiGenerateResponse>("/ai/generate", {
        method: "POST",
        body: JSON.stringify({ prompt, system, book_id: bookId }),
      }),

    /** Submit an async chapter review. The caller subscribes to
     *  `/api/ai/jobs/{id}/stream` (SSE) afterwards via the native
     *  EventSource - that lifecycle is not part of the API client. */
    reviewAsync: (request_body: AiReviewSubmitRequest) =>
      request<AiAsyncJobSubmit>("/ai/review/async", {
        method: "POST",
        body: JSON.stringify(request_body),
      }),

    /** Poll the final job result once SSE reports `stream_end`. */
    getJob: (jobId: string) => request<AiJobStatus>(`/ai/jobs/${jobId}`),

    /** Generate marketing copy for a book metadata field. */
    generateMarketing: (request_body: AiGenerateMarketingRequest) =>
      request<AiGenerateResponse>("/ai/generate-marketing", {
        method: "POST",
        body: JSON.stringify(request_body),
      }),

    /** Test the current AI configuration with a minimal request.
     *  Backend GET /api/ai/test-connection returns
     *  {success, error_key, error_detail}. Consumers branch on
     *  success and may map error_key to localized strings. */
    testConnection: () =>
      request<AiTestConnectionResult>("/ai/test-connection"),
  },

  kdp: {
    /** List the bundled KDP category catalog. Returns the 26
     *  Amazon-canonical category names (verified by
     *  test_kdp_categories_returns_full_26_catalog). The catalog
     *  is dictated by Amazon and stable across the editor's
     *  lifetime, so callers typically fetch once on mount and
     *  cache for the duration of the surface (BookMetadataEditor
     *  pattern). KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01. */
    listCategories: () => request<string[]>("/kdp/categories"),

    /** Metadata-completeness check for KDP publishing. Returns
     *  errors (block publishing) + warnings (recommended).
     *  Used by Phase 1 MVP wizard Step 1. */
    checkMetadata: (payload: KdpCheckMetadataRequest) =>
      request<KdpMetadataCheckResult>("/kdp/check-metadata", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    /** Build the KDP-ready ZIP for a book. Returns the blob +
     *  the server-supplied filename. Used by Phase 1 MVP
     *  wizard Step 3. Returns a 400 with a readable detail
     *  when metadata is incomplete (defence-in-depth gate). */
    buildPackage: async (
      bookId: string,
    ): Promise<{ blob: Blob; filename: string }> => {
      const res = await guardedFetch(`${BASE}/kdp/package/${bookId}`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          typeof err.detail === "string"
            ? err.detail
            : "KDP package build failed",
          `${BASE}/kdp/package/${bookId}`,
          "POST",
        );
      }
      const blob = await res.blob();
      const filename =
        _filenameFromContentDisposition(
          res.headers.get("Content-Disposition"),
        ) || `${bookId}-kdp-package.zip`;
      return { blob, filename };
    },

    // --- ARC reviewer CRUD (Phase 2 C9) ---------------------

    /** List ARC reviewers for a book. Returns ``[]`` when no
     *  publishing-state row exists yet. */
    listReviewers: (bookId: string) =>
      request<ArcReviewerApi[]>(`/kdp/publishing-state/${bookId}/reviewers`),

    /** Add a reviewer to the book's ARC list. Server auto-
     *  creates the publishing-state row if absent + assigns
     *  ``review_status="invited"`` + ``invited_at=now``. */
    addReviewer: (bookId: string, payload: ArcReviewerCreatePayload) =>
      request<ArcReviewerApi>(`/kdp/publishing-state/${bookId}/reviewers`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    /** Update an ARC reviewer's status / permalink / excerpt.
     *  Server auto-stamps ``reviewed_at`` when status flips to
     *  ``reviewed`` and the payload didn't supply one. */
    updateReviewer: (
      bookId: string,
      reviewerId: string,
      payload: ArcReviewerUpdatePayload,
    ) =>
      request<ArcReviewerApi>(
        `/kdp/publishing-state/${bookId}/reviewers/${reviewerId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      ),

    /** Hard-delete an ARC reviewer (no soft-delete per A25). */
    deleteReviewer: async (
      bookId: string,
      reviewerId: string,
    ): Promise<void> => {
      const res = await guardedFetch(
        `${BASE}/kdp/publishing-state/${bookId}/reviewers/${reviewerId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new ApiError(
          res.status,
          `Reviewer delete failed (${res.status})`,
          `${BASE}/kdp/publishing-state/${bookId}/reviewers/${reviewerId}`,
          "DELETE",
        );
      }
    },

    // --- BookPublishingState (Phase 2 C10) -------------------

    /** Load the publishing-state row + the related book's
     *  ``updated_at`` for client-side conflict detection.
     *  Returns ``state: null`` when no row exists yet. */
    getPublishingState: (bookId: string) =>
      request<BookPublishingStateGetResponse>(
        `/kdp/publishing-state/${bookId}`,
      ),

    /** Upsert the publishing-state row. Missing row → created
     *  with defaults + payload overrides; existing row →
     *  partial-updated with the explicitly-set payload
     *  fields. */
    upsertPublishingState: (
      bookId: string,
      payload: BookPublishingStateUpdatePayload,
    ) =>
      request<BookPublishingStateApi>(`/kdp/publishing-state/${bookId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
  },

  i18n: {
    get: (lang: string) =>
      request<Record<string, unknown>>(`/i18n/${encodeURIComponent(lang)}`),
  },

  settings: {
    getApp: () => request<Record<string, unknown>>("/settings/app"),

    updateApp: (data: Record<string, unknown>) =>
      request<Record<string, unknown>>("/settings/app", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    /** Append a name to the user's author profile. The wizard's
     * AuthorPicker calls this on the "Create new" path when the
     * imported source references an author not yet in Settings.
     * Returns the updated `{name, pen_names}` block. */
    addPenName: (name: string) =>
      request<{ name: string; pen_names: string[] }>(
        "/settings/author/pen-name",
        {
          method: "POST",
          body: JSON.stringify({ name }),
        },
      ),

    listPlugins: () => request<Record<string, unknown>>("/settings/plugins"),

    discoveredPlugins: () =>
      request<DiscoveredPlugin[]>("/settings/plugins/discovered"),

    getPlugin: (name: string) =>
      request<Record<string, unknown>>(`/settings/plugins/${name}`),

    createPlugin: (data: {
      name: string;
      display_name?: string;
      description?: string;
      version?: string;
      license?: string;
      settings?: Record<string, unknown>;
    }) =>
      request<Record<string, unknown>>("/settings/plugins", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    deletePlugin: (name: string) =>
      request<{ plugin: string; status: string }>(`/settings/plugins/${name}`, {
        method: "DELETE",
      }),

    updatePlugin: (name: string, settings: Record<string, unknown>) =>
      request<Record<string, unknown>>(`/settings/plugins/${name}`, {
        method: "PATCH",
        body: JSON.stringify({ settings }),
      }),

    enablePlugin: (name: string) =>
      request<{ plugin: string; status: string }>(
        `/settings/plugins/${name}/enable`,
        { method: "POST" },
      ),

    disablePlugin: (name: string) =>
      request<{ plugin: string; status: string }>(
        `/settings/plugins/${name}/disable`,
        { method: "POST" },
      ),
  },

  editorPluginStatus: () =>
    request<
      Record<
        string,
        { available: boolean; reason: string | null; message?: string }
      >
    >("/editor/plugin-status"),

  // Help content is bundled into the offline seed (generated from the
  // docs/help markdown + help.yaml SSoT). On the backendless PWA these
  // methods resolve from that seed via a lazy import so the help page +
  // panel work offline; online they hit the backend help plugin. The
  // lazy import keeps the ~1 MB of help docs out of the eager bundle.
  help: {
    // Legacy endpoints (kept for backward compat)
    shortcuts: async (lang: string = "de") => {
      if (isBackendlessOffline()) {
        return (await import("../help/offlineHelp")).offlineShortcuts(lang);
      }
      return request<{ keys: string; action: string }[]>(
        `/help/shortcuts?lang=${lang}`,
      );
    },

    faq: async (lang: string = "de") => {
      if (isBackendlessOffline()) {
        return (await import("../help/offlineHelp")).offlineFaq(lang);
      }
      return request<{ question: string; answer: string }[]>(
        `/help/faq?lang=${lang}`,
      );
    },

    about: async () => {
      if (isBackendlessOffline()) {
        return (await import("../help/offlineHelp")).offlineAbout();
      }
      return request<Record<string, string>>("/help/about");
    },

    // New docs-based endpoints
    navigation: async (locale: string = "de") => {
      if (isBackendlessOffline()) {
        return (await import("../help/offlineHelp")).offlineNavigation(locale);
      }
      return request<HelpNavItem[]>(`/help/navigation/${locale}`);
    },

    page: async (locale: string, slug: string) => {
      if (isBackendlessOffline()) {
        return (await import("../help/offlineHelp")).offlinePage(locale, slug);
      }
      return request<HelpPage>(`/help/page/${locale}/${slug}`);
    },

    search: async (locale: string, query: string) => {
      if (isBackendlessOffline()) {
        return (await import("../help/offlineHelp")).offlineSearch(
          locale,
          query,
        );
      }
      return request<{ results: HelpSearchResult[] }>(
        `/help/search/${locale}?q=${encodeURIComponent(query)}`,
      );
    },
  },

  getStarted: {
    guide: async (lang: string = "de") => {
      if (isBackendlessOffline()) {
        return (await import("../help/offlineHelp")).offlineGuide(lang);
      }
      return request<
        { id: string; title: string; description: string; icon: string }[]
      >(`/get-started/guide?lang=${lang}`);
    },

    // GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 C3: sample-book response
    // varies by book_type:
    //   - prose: carries ``chapters: [...]``
    //   - picture_book / comic_book: carries ``pages: [...]``
    // The TypeScript shape unions both so the caller branches on
    // ``book_type`` (or just checks ``"chapters" in resp``).
    sampleBook: async (lang: string = "de", bookType: BookType = "prose") => {
      if (isBackendlessOffline()) {
        return (await import("../help/offlineHelp")).offlineSampleBook(
          lang,
          bookType,
        );
      }
      return request<{
        title: string;
        author: string;
        language: string;
        book_type: BookType;
        description: string;
        chapters?: { title: string; content: string }[];
        pages?: {
          layout: string;
          text_content?: string;
          layout_config?: Record<string, unknown>;
          image_asset_id?: string | null;
        }[];
      }>(`/get-started/sample-book?lang=${lang}&book_type=${bookType}`);
    },
  },

  pluginInstall: {
    install: async (
      file: File,
    ): Promise<{
      plugin: string;
      version: string;
      status: string;
      message: string;
      error: string | null;
    }> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await guardedFetch(`${BASE}/plugins/install`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(
          res.status,
          err.detail || "Installation fehlgeschlagen",
          `${BASE}/plugins/install`,
          "POST",
          err.stacktrace || "",
        );
      }
      return res.json();
    },

    uninstall: (name: string) =>
      request<{ plugin: string; status: string }>(`/plugins/install/${name}`, {
        method: "DELETE",
      }),

    listInstalled: () =>
      request<
        {
          name: string;
          display_name: string;
          description: string;
          version: string;
          license: string;
          active: boolean;
          path: string;
        }[]
      >("/plugins/installed"),

    manifests: () =>
      request<Record<string, Record<string, unknown>>>("/plugins/manifests"),
  },

  /** Medium-import plugin client. The importZip helper is the only
   *  XHR-based call in the codebase; XHR is required because guardedFetch()
   *  does not expose upload-progress events and Medium archives can
   *  be large enough that a determinate progress bar matters. */
  licenses: {
    list: () => request<Record<string, unknown>>("/licenses"),

    activate: (pluginName: string, licenseKey: string) =>
      request<Record<string, unknown>>("/licenses", {
        method: "POST",
        body: JSON.stringify({
          plugin_name: pluginName,
          license_key: licenseKey,
        }),
      }),

    deactivate: (pluginName: string) =>
      request<Record<string, unknown>>(`/licenses/${pluginName}`, {
        method: "DELETE",
      }),
  },

  git: {
    init: (bookId: string) =>
      request<GitRepoStatus>(`/books/${bookId}/git/init`, { method: "POST" }),

    commit: (bookId: string, message: string) =>
      request<GitCommitEntry>(`/books/${bookId}/git/commit`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),

    log: (bookId: string, limit: number = 50) =>
      request<GitCommitEntry[]>(`/books/${bookId}/git/log?limit=${limit}`),

    status: (bookId: string) =>
      request<GitRepoStatus>(`/books/${bookId}/git/status`),

    getRemote: (bookId: string) =>
      request<GitRemoteConfig>(`/books/${bookId}/git/remote`),

    setRemote: (bookId: string, url: string, pat: string | null) =>
      request<GitRemoteConfig>(`/books/${bookId}/git/remote`, {
        method: "POST",
        body: JSON.stringify({ url, pat }),
      }),

    deleteRemote: (bookId: string) =>
      request<void>(`/books/${bookId}/git/remote`, { method: "DELETE" }),

    push: (bookId: string, force: boolean = false) =>
      request<GitPushResult>(`/books/${bookId}/git/push`, {
        method: "POST",
        body: JSON.stringify({ force }),
      }),

    pull: (bookId: string) =>
      request<GitPullResult>(`/books/${bookId}/git/pull`, { method: "POST" }),

    syncStatus: (bookId: string) =>
      request<GitSyncStatus>(`/books/${bookId}/git/sync-status`),

    analyzeConflict: (bookId: string) =>
      request<GitConflictAnalysis>(`/books/${bookId}/git/conflict/analyze`),

    merge: (bookId: string) =>
      request<GitMergeResult>(`/books/${bookId}/git/merge`, { method: "POST" }),

    resolveConflict: (
      bookId: string,
      resolutions: Record<string, "mine" | "theirs">,
    ) =>
      request<GitMergeResult>(`/books/${bookId}/git/conflict/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolutions }),
      }),

    abortMerge: (bookId: string) =>
      request<GitMergeResult>(`/books/${bookId}/git/conflict/abort`, {
        method: "POST",
      }),
  },

  translations: {
    /** PGS-04: list translation siblings of a book.
     *  ``translation_group_id`` is null for unlinked books. */
    list: (bookId: string) =>
      request<TranslationSiblingsResponse>(`/translations/${bookId}`),

    /** PGS-04: group two or more books under one
     *  ``translation_group_id``. Pre-existing groups merge
     *  deterministically. */
    link: (bookIds: string[]) =>
      request<TranslationLinkResult>(`/translations/link`, {
        method: "POST",
        body: JSON.stringify({ book_ids: bookIds }),
      }),

    /** PGS-04: remove a single book from its group. Idempotent. */
    unlink: (bookId: string) =>
      request<void>(`/translations/${bookId}/unlink`, { method: "POST" }),

    /** PGS-04: clone a multi-language repo and import every
     *  ``main`` / ``main-XX`` branch as a linked book. */
    importMultiBranch: (gitUrl: string) =>
      request<TranslationMultiBranchImportResult>(
        `/translations/import-multi-branch`,
        {
          method: "POST",
          body: JSON.stringify({ git_url: gitUrl }),
        },
      ),
  },

  gitSync: {
    /** PGS-02: per-book sync state for the plugin-git-sync flow.
     *  ``mapped=false`` means the book wasn't imported via the
     *  git-URL wizard - the BookEditor uses that to hide the
     *  "Commit to Repo" button entirely.
     */
    status: (bookId: string) =>
      request<GitSyncMappingStatus>(`/git-sync/${bookId}`),

    commit: (bookId: string, payload: GitSyncCommitRequest) =>
      request<GitSyncCommitResult>(`/git-sync/${bookId}/commit`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    /** PGS-03: three-way diff between Bibliogon, the imported
     *  base commit, and current branch HEAD. Read-only. */
    diff: (bookId: string) =>
      request<GitSyncDiffResponse>(`/git-sync/${bookId}/diff`, {
        method: "POST",
      }),

    /** PGS-03: apply per-chapter resolutions. Mutates the local
     *  DB; bumps ``last_imported_commit_sha`` so the next diff
     *  starts fresh. Does NOT push. */
    resolve: (bookId: string, resolutions: GitSyncResolutionEntry[]) =>
      request<GitSyncResolveResult>(`/git-sync/${bookId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolutions }),
      }),

    /** PGS-05: fan one user-facing commit out to both core git
     *  and plugin-git-sync. Skipped subsystems return
     *  ``status: "skipped"`` rather than failing the whole call. */
    unifiedCommit: (bookId: string, payload: GitSyncUnifiedCommitRequest) =>
      request<GitSyncUnifiedCommitResult>(
        `/git-sync/${bookId}/unified-commit`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),

    /** PGS-02-FU-01: per-book Personal Access Token used for HTTPS
     *  push/pull. Shared with core git_backup, so setting here also
     *  unblocks the core git remote. The PAT is never returned. */
    getCredentialStatus: (bookId: string) =>
      request<{ has_credential: boolean }>(`/git-sync/${bookId}/credentials`),

    putCredential: (bookId: string, pat: string) =>
      request<{ has_credential: boolean }>(`/git-sync/${bookId}/credentials`, {
        method: "PUT",
        body: JSON.stringify({ pat }),
      }),

    deleteCredential: (bookId: string) =>
      request<void>(`/git-sync/${bookId}/credentials`, {
        method: "DELETE",
      }),
  },

  ssh: {
    info: () => request<SshKeyInfo>("/ssh"),

    generate: (comment: string | null = null, overwrite: boolean = false) =>
      request<SshKeyInfo>("/ssh/generate", {
        method: "POST",
        body: JSON.stringify({ comment, overwrite }),
      }),

    publicKey: () => request<{ public_key: string }>("/ssh/public-key"),

    remove: () => request<void>("/ssh", { method: "DELETE" }),
  },

  /** plugin-comics Session 2 client. Session 2 adds full
   *  panel + bubble CRUD on top of the Session 1 info gate.
   *  The bubble-list endpoint was added in C6 as the
   *  Half-Wired-Lifecycle closure of C2 (which shipped C+U+D
   *  without R; gap surfaced by the C6 Pre-Coding-Reality-Check
   *  when the full editor needed to populate ``ComicPanelGrid``). */
  system: {
    info: () => request<SystemInfo>("/system/info"),

    /** Danger-Zone two-phase reset. Step 1: obtain a 5-min HMAC
     *  token via ``resetPrepare``. Step 2: post the token + the
     *  literal ``"RESET"`` to ``reset`` to execute the wipe. The
     *  backend rejects either step on its own (missing token →
     *  400; wrong confirmation literal → 400). See
     *  ``backend/app/routers/system.py`` for the contract. */
    resetPrepare: () =>
      request<{ token: string; expires_at: number; ttl_seconds: number }>(
        "/system/reset/prepare",
        { method: "POST" },
      ),

    reset: (token: string, confirmation: string) =>
      request<{
        status: string;
        jobs_cancelled: number;
        rows_deleted: number;
        uploads_cleared: boolean;
        tmp_cleared: boolean;
        backup_history_cleared: boolean;
        config_overlays_cleared: number;
        installed_plugins_cleared: number;
        secrets_cleared: boolean;
      }>("/system/reset", {
        method: "POST",
        body: JSON.stringify({ token, confirmation }),
      }),
  },

};

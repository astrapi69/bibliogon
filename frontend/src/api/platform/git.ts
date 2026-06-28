/**
 * Git, translation-link, git-sync and SSH API namespaces. Extracted
 * from api/platform.ts (#679).
 */
import { request } from "../http";
import type {
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
  SshKeyInfo,
  TranslationLinkResult,
  TranslationMultiBranchImportResult,
  TranslationSiblingsResponse,
} from "../client";

export const git = {
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
};

export const translations = {
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
};

export const gitSync = {
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
};

export const ssh = {
  info: () => request<SshKeyInfo>("/ssh"),

  generate: (comment: string | null = null, overwrite: boolean = false) =>
    request<SshKeyInfo>("/ssh/generate", {
      method: "POST",
      body: JSON.stringify({ comment, overwrite }),
    }),

  publicKey: () => request<{ public_key: string }>("/ssh/public-key"),

  remove: () => request<void>("/ssh", { method: "DELETE" }),
};

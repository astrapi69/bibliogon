/**
 * KDP API namespace: category catalog, metadata check, package build,
 * ARC reviewers, and the publishing-state row. Extracted from
 * api/platform.ts (#679).
 */
import { ApiError } from "../errors";
import { BASE, guardedFetch, request, _filenameFromContentDisposition } from "../http";
import type {
  ArcReviewerApi,
  ArcReviewerCreatePayload,
  ArcReviewerUpdatePayload,
  BookPublishingStateApi,
  BookPublishingStateGetResponse,
  BookPublishingStateUpdatePayload,
  KdpCheckMetadataRequest,
  KdpMetadataCheckResult,
} from "../client";

/**
 * KDP package print-format selection sent to
 * ``POST /kdp/package/{id}``. Maps the wizard's ``FormatState``
 * (``components/kdp-wizard/machines/types.ts``): ``format_kind`` is the
 * FormatState ``kind``. eBook → EPUB only; paperback / hardcover add a
 * PDF rendered at ``trim_size`` + ``margin`` with crop / bleed marks.
 */
export interface KdpPackageFormat {
  format_kind: string;
  trim_size: string;
  margin: string;
}

export const kdp = {
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
   *  when metadata is incomplete (defence-in-depth gate).
   *
   *  ``format`` carries the wizard's FormatStep selection so the
   *  bundled PDF is rendered at the chosen KDP trim size + margins
   *  (eBook → EPUB only). Omitting it keeps the legacy
   *  paperback-at-6x9 default. */
  buildPackage: async (
    bookId: string,
    format?: KdpPackageFormat,
  ): Promise<{ blob: Blob; filename: string }> => {
    const res = await guardedFetch(`${BASE}/kdp/package/${bookId}`, {
      method: "POST",
      ...(format
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(format),
          }
        : {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new ApiError(
        res.status,
        typeof err.detail === "string" ? err.detail : "KDP package build failed",
        `${BASE}/kdp/package/${bookId}`,
        "POST",
      );
    }
    const blob = await res.blob();
    const filename =
      _filenameFromContentDisposition(res.headers.get("Content-Disposition")) ||
      `${bookId}-kdp-package.zip`;
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
  deleteReviewer: async (bookId: string, reviewerId: string): Promise<void> => {
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
    request<BookPublishingStateGetResponse>(`/kdp/publishing-state/${bookId}`),

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
};

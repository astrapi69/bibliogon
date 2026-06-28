/**
 * Shared prop types for the comments-admin sub-components, derived from
 * the useCommentsAdmin bag so the sub-components and the orchestrator
 * stay in lock-step. Extracted from CommentsAdminSection.tsx (#683).
 */

import type {useCommentsAdmin} from "../../comments/useCommentsAdmin";

export type CommentsAdminBag = ReturnType<typeof useCommentsAdmin>;
export type CommentAdminRow = CommentsAdminBag["rows"][number];
export type T = CommentsAdminBag["t"];
export type CommentSelection = CommentsAdminBag["selection"];
export type CommentFilters = CommentsAdminBag["filters"];
export type CommentViewMode = CommentsAdminBag["viewMode"];

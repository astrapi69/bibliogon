/**
 * Body-truncation + date-format helpers for the comments-admin table.
 * Extracted from CommentsAdminSection.tsx (#683).
 */

import {formatLocaleDate} from "../../../utils/format/formatDate";

/** Single-line truncation length used on the body cell. Keeps the
 *  admin table dense; the full text lives in the preview modal that
 *  opens on row click. 120 chars matches D1 in the pre-inspection
 *  (single-line cell, max-width: 400, ellipsis is real DOM). */
export const ROW_BODY_TRUNCATE_AT = 120;

export function truncateBody(text: string): string {
    if (text.length <= ROW_BODY_TRUNCATE_AT) return text;
    return text.slice(0, ROW_BODY_TRUNCATE_AT).trimEnd() + "…";
}

export function formatDate(iso: string | null, lang: string): string {
    return formatLocaleDate(iso, lang);
}

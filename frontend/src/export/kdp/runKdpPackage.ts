/**
 * The one place that decides whether a KDP package is built in the
 * browser or on the backend (#741).
 *
 * Same shape as `runBookBulkExport` and `runStyleCheck`: the pure halves
 * live in `kdpPackage.ts` + `lib/kdp/*`, the seam-aware half in
 * `gatherKdpPackage.ts`, and this module is the branch. One branch, in one
 * file, for the reason #1042 exists - a second one is a second thing to
 * forget when the contract changes.
 *
 * Online keeps the backend endpoint: WeasyPrint typesets the interior with
 * a real bleed box and crop marks, which pdfmake cannot, and a user with a
 * backend should get the better file.
 *
 * @example
 * const {blob, filename} = await runKdpPackage(book, {
 *     formatKind: "paperback", trimSize: "6x9", margin: "normal",
 * });
 */

import {api} from "../../api/client";
import type {BookDetail} from "../../api/client";
import {getStorage} from "../../storage";
import {DEFAULT_KDP_MARGIN, DEFAULT_KDP_TRIM} from "../../lib/kdp/trim";
import {
    buildClientKdpPackage,
    type ClientKdpPackageOptions,
} from "./gatherKdpPackage";

export interface KdpPackageResult {
    blob: Blob;
    filename: string;
}

/** True when this build will assemble the package itself. Exported so the
 *  wizard step can say so BEFORE the user clicks, rather than explaining
 *  the fidelity difference afterwards. */
export function usesClientKdpPackage(): boolean {
    return getStorage().mode === "dexie";
}

export async function runKdpPackage(
    book: BookDetail,
    options: ClientKdpPackageOptions,
): Promise<KdpPackageResult> {
    if (!usesClientKdpPackage()) {
        // The endpoint's payload has no optional fields, and the backend
        // falls back on an unknown id anyway - so the defaults are named
        // here rather than sending an empty string the server has to
        // interpret.
        return api.kdp.buildPackage(book.id, {
            format_kind: options.formatKind,
            trim_size: options.trimSize || DEFAULT_KDP_TRIM,
            margin: options.margin || DEFAULT_KDP_MARGIN,
        });
    }
    return buildClientKdpPackage(book, options);
}

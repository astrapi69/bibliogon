/**
 * Clipboard utilities.
 *
 * Wraps `navigator.clipboard.writeText` so callers can ignore the
 * permission/security failure paths. Returns a boolean instead of
 * throwing — UI sites just need to render a success/failure badge.
 *
 * The native API needs a secure context (HTTPS or localhost). On
 * non-secure pages or when the user denies clipboard permission,
 * the call rejects and we surface ``false``.
 */

export async function copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
        return false;
    }
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

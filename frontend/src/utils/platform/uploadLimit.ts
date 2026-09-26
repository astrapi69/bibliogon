export const DEFAULT_MAX_UPLOAD_MB = 500;

export function resolveMaxUploadMb(
    config: Record<string, unknown> | null | undefined,
): number | null {
    const app = (config?.app ?? {}) as Record<string, unknown>;
    const raw = app.max_upload_mb;
    if (raw === undefined || raw === null) return DEFAULT_MAX_UPLOAD_MB;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_UPLOAD_MB;
    const mb = Math.trunc(parsed);
    if (mb < 0) return DEFAULT_MAX_UPLOAD_MB;
    if (mb === 0) return null;
    return mb;
}

export function maxUploadBytes(maxUploadMb: number | null): number | null {
    if (maxUploadMb === null) return null;
    return maxUploadMb * 1024 * 1024;
}

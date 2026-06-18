/**
 * Single-flight wrapper for an idempotent async read.
 *
 * Collapses concurrent calls of the same fetcher into ONE in-flight call: while
 * a call is pending every caller receives the SAME promise; once it settles the
 * in-flight slot clears, so the next call fetches fresh. This deduplicates the
 * burst of identical requests that fire when many components independently read
 * the same resource on mount (e.g. ~15 parallel `GET /settings/app` on a single
 * page load) without retaining a stale value across navigations — and, because
 * nothing survives a settle, without leaking state across test boundaries.
 *
 * Errors are not cached: a rejected fetch clears the in-flight slot, so the next
 * call retries.
 *
 * @example
 * const getConfig = singleFlight(() => fetch("/config").then((r) => r.json()));
 * // 10 components call getConfig() in the same tick -> 1 network request.
 * await Promise.all([getConfig(), getConfig(), getConfig()]);
 */
export function singleFlight<T>(fetcher: () => Promise<T>): () => Promise<T> {
    let inflight: Promise<T> | null = null;
    return () => {
        if (inflight === null) {
            inflight = fetcher().finally(() => {
                inflight = null;
            });
        }
        return inflight;
    };
}

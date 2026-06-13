// --- API error type ---
//
// `ApiError` lives here (not in `client.ts`) so leaf modules that only need
// the error type - e.g. `help/offlineHelp.ts` - can import it without pulling
// in the full API client. `client.ts` re-exports it for backward
// compatibility, and the offline-help fallback dynamically imports back into
// `offlineHelp`; importing `ApiError` from the client would close that loop
// into a circular dependency (#114).

/**
 * Error thrown by every `api.*` call on a non-2xx response (or by the
 * backendless-offline guard before any network request).
 *
 * Consumers pass the instance to `toast.error(...)` and, on 5xx, build a
 * "Report issue" GitHub link from `status` + `stacktrace`.
 */
export class ApiError extends Error {
  status: number;
  detail: string;
  endpoint: string;
  method: string;
  stacktrace: string;
  timestamp: string;
  /** Structured error body when the backend returned a dict in `detail`.
   *  Used by the audiobook overwrite warning (409 audiobook_exists). */
  detailBody?: Record<string, unknown>;
  /** True when this error is the backendless-offline guard rejecting an `/api`
   *  call before any network request (see `guardedFetch`). Consumers downgrade
   *  it to a console warning instead of a user-facing error toast: a
   *  backend-only surface being unavailable offline is expected, not a fault. */
  offline = false;

  constructor(
    status: number,
    detail: string,
    endpoint: string,
    method: string,
    stacktrace = "",
    detailBody?: Record<string, unknown>,
  ) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.endpoint = endpoint;
    this.method = method;
    this.stacktrace = stacktrace;
    this.timestamp = new Date().toISOString();
    this.detailBody = detailBody;
  }
}

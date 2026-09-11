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
  /** True when the request died at the NETWORK level (fetch TypeError:
   *  backend down, connection refused, DNS). Classified centrally in
   *  `guardedFetch` (#765) with `status: 0`. Says nothing about WHY;
   *  see `backendDown` for that. */
  network = false;
  /** True when an immediate `/api/health` probe confirmed the backend
   *  is gone, i.e. this network failure is a global outage rather than
   *  one request's problem. Only then must the error stay silent: the
   *  persistent banner is the one surface and `notify.error` downgrades
   *  it like `offline`. A network failure the probe did NOT confirm
   *  (a reset on one oversized upload, a stalled long-running export)
   *  keeps its toast, because the banner would flicker away without
   *  ever telling the user what failed (#770). */
  backendDown = false;

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

/** Thrown by `api.chapters.update` when a newer save for the same
 *  chapter superseded the in-flight request. Consumers should treat
 *  this as a no-op, not an error.
 */
export class SaveAbortedError extends Error {
  constructor() {
    super("Save superseded by a newer save for the same chapter");
    this.name = "SaveAbortedError";
  }
}

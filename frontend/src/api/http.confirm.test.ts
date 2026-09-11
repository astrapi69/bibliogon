/**
 * Request-specific vs global-outage classification in guardedFetch (#770).
 *
 * guardedFetch awaits the reachability store's confirm probe before it
 * rejects, so the ApiError it hands the caller already carries the
 * verdict in ``backendDown``. That keeps ``notify.error`` synchronous:
 * a confirmed outage is suppressed in favour of the banner, while a
 * request-specific failure on a healthy backend keeps its toast.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { guardedFetch } from "./http";
import { ApiError } from "./errors";
import { backendReachability } from "./backendReachability";

/** Fail the request, then answer the /api/health confirm probe. */
function failRequestThenHealthy() {
  const spy = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

async function expectRejection(path: string, init?: RequestInit) {
  try {
    await guardedFetch(path, init);
  } catch (error) {
    return error as ApiError;
  }
  throw new Error(`expected ${path} to reject`);
}

describe("guardedFetch outage classification (#770)", () => {
  beforeEach(() => {
    backendReachability.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    backendReachability.resetForTests();
  });

  it("leaves a request-specific failure unflagged on a healthy backend", async () => {
    failRequestThenHealthy();

    const error = await expectRejection("/api/books/huge/upload", { method: "POST" });

    expect(error.network).toBe(true);
    expect(error.backendDown).toBe(false);
    expect(backendReachability.isDown()).toBe(false);
  });

  it("flags a genuine outage so the banner owns the surface", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await expectRejection("/api/books");

    expect(error.network).toBe(true);
    expect(error.backendDown).toBe(true);
    expect(backendReachability.isDown()).toBe(true);
  });

  it("treats a one-off proxy 502 with a healthy backend as request-specific", async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 502, headers: { "Content-Type": "text/plain" } }),
      )
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", spy);

    const error = await expectRejection("/api/books");

    expect(error.status).toBe(502);
    expect(error.backendDown).toBe(false);
    expect(backendReachability.isDown()).toBe(false);
  });

  it("does not spend a confirm probe per request during an established outage", async () => {
    const spy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", spy);

    await expectRejection("/api/books");
    const callsAfterFirst = spy.mock.calls.length; // request + confirm probe
    await expectRejection("/api/authors");

    expect(spy.mock.calls.length).toBe(callsAfterFirst + 1);
    expect(backendReachability.isDown()).toBe(true);
  });
});

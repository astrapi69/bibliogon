/**
 * Network-failure classification in guardedFetch (#765).
 *
 * A fetch-level rejection ("TypeError: Failed to fetch") previously
 * escaped RAW, so toast behavior depended on the call site's catch
 * shape and the report dialog got no endpoint/method. guardedFetch
 * now classifies it centrally into ApiError{status: 0, network: true}
 * and feeds the backend-reachability store; deliberate aborts stay
 * untouched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { guardedFetch } from "./http";
import { ApiError } from "./errors";
import { backendReachability } from "./backendReachability";

function jsonResponse(status: number): Response {
  return new Response(JSON.stringify({ ok: true }), { status });
}

describe("guardedFetch network classification", () => {
  beforeEach(() => {
    backendReachability.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    backendReachability.resetForTests();
  });

  it("wraps a fetch-level rejection into ApiError status 0 with network=true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    let caught: unknown;
    try {
      await guardedFetch("/api/books", { method: "DELETE" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const apiError = caught as ApiError;
    expect(apiError.status).toBe(0);
    expect(apiError.network).toBe(true);
    expect(apiError.endpoint).toBe("/api/books");
    expect(apiError.method).toBe("DELETE");
  });

  it("marks the backend unreachable on failure and reachable again on any response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await guardedFetch("/api/books").catch(() => {});
    await guardedFetch("/api/authors").catch(() => {});
    expect(backendReachability.isDown()).toBe(true);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500)));
    await guardedFetch("/api/books");
    expect(backendReachability.isDown()).toBe(false);
  });

  it("a non-2xx HTTP response is NOT a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404)));
    const res = await guardedFetch("/api/books/nope");
    expect(res.status).toBe(404);
    expect(backendReachability.isDown()).toBe(false);
  });

  // A dead backend BEHIND a live proxy never produces a fetch rejection.
  // Measured 2026-09-11: the Vite dev proxy answers 502 text/plain with an
  // empty body; nginx (docker-compose.prod) answers 502 text/html. Only the
  // "everything down" case (make dev-down) yields the TypeError. Without
  // this branch the banner would never appear in production.
  it("classifies a proxy gateway error (non-JSON 502) as backend unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", { status: 502, headers: { "Content-Type": "text/plain" } }),
      ),
    );
    let caught: unknown;
    try {
      await guardedFetch("/api/books");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).network).toBe(true);
    expect((caught as ApiError).status).toBe(502);
    expect(backendReachability.isDown()).toBe(true);
  });

  it("does NOT hijack a FastAPI 502 (ExternalServiceError carries JSON)", async () => {
    // app.exceptions.ExternalServiceError -> HTTP 502 application/json for
    // Pandoc / TTS / LanguageTool outages. That is a business error with a
    // `detail` the user must see - it must keep toasting.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "LanguageTool: not reachable" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const res = await guardedFetch("/api/grammar/check");
    expect(res.status).toBe(502);
    expect(backendReachability.isDown()).toBe(false);
  });

  it("a deliberate AbortError is rethrown untouched", async () => {
    const abortError = new DOMException("The user aborted a request.", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));
    let caught: unknown;
    try {
      await guardedFetch("/api/books");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(abortError);
    expect(backendReachability.isDown()).toBe(false);
  });
});

/**
 * Confirm-before-flip semantics for the outage banner (#770).
 *
 * ``reportNetworkFailure`` used to mark the backend down on the FIRST
 * network-level failure. A request-specific failure on a healthy backend
 * - a reset on one oversized upload, a stalled long-running export -
 * therefore raised the global outage banner AND had its own toast
 * suppressed by #765's dedup. The banner then vanished on the next
 * successful response, so the user was told nothing about what actually
 * failed.
 *
 * The store now confirms with one immediate /api/health probe and only
 * marks down when THAT fails. ``isDown()`` stays synchronous so the
 * toast-suppression path is unchanged; the verdict is returned so
 * ``guardedFetch`` can classify the error it rejects with.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { backendReachability } from "./backendReachability";

/** A backend that answers the confirm probe. */
function healthyBackend() {
  const spy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** A backend that is genuinely gone. */
function deadBackend() {
  const spy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("backendReachability confirm-before-flip (#770)", () => {
  beforeEach(() => {
    backendReachability.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    backendReachability.resetForTests();
  });

  it("does not raise the banner when the confirm probe answers", async () => {
    const listener = vi.fn();
    backendReachability.subscribe(listener);
    const probe = healthyBackend();

    const confirmed = await backendReachability.reportNetworkFailure();

    expect(confirmed).toBe(false);
    expect(backendReachability.isDown()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(String(probe.mock.calls[0][0])).toContain("/api/health");
  });

  it("marks down only after the confirm probe also fails", async () => {
    const listener = vi.fn();
    backendReachability.subscribe(listener);
    deadBackend();

    const confirmed = await backendReachability.reportNetworkFailure();

    expect(confirmed).toBe(true);
    expect(backendReachability.isDown()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("collapses parallel failures into ONE confirm probe", async () => {
    const probe = deadBackend();
    const listener = vi.fn();
    backendReachability.subscribe(listener);

    const verdicts = await Promise.all([
      backendReachability.reportNetworkFailure(),
      backendReachability.reportNetworkFailure(),
      backendReachability.reportNetworkFailure(),
    ]);

    expect(verdicts).toEqual([true, true, true]);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("skips the confirm probe once the outage is already established", async () => {
    const probe = deadBackend();
    await backendReachability.reportNetworkFailure();
    expect(probe).toHaveBeenCalledTimes(1);

    const confirmed = await backendReachability.reportNetworkFailure();

    expect(confirmed).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  // A dead backend behind a LIVE proxy is the common production shape:
  // the proxy answers the probe with a non-JSON 502. Reading that as
  // proof of life would keep the banner down during a real outage, and
  // would clear it again on the interval probe while still down.
  it("does not read a proxy 502 on /api/health as proof of life", async () => {
    const probe = vi.fn().mockResolvedValue(
      new Response("", { status: 502, headers: { "Content-Type": "text/plain" } }),
    );
    vi.stubGlobal("fetch", probe);

    const confirmed = await backendReachability.reportNetworkFailure();

    expect(confirmed).toBe(true);
    expect(backendReachability.isDown()).toBe(true);
  });

  // ...while a FastAPI-authored 502 (ExternalServiceError for Pandoc /
  // TTS / LanguageTool) is application/json and does prove the backend
  // is answering.
  it("accepts a backend-authored JSON 502 as proof of life", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "LanguageTool down" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const confirmed = await backendReachability.reportNetworkFailure();

    expect(confirmed).toBe(false);
    expect(backendReachability.isDown()).toBe(false);
  });

  it("re-confirms after a recovery instead of trusting the old verdict", async () => {
    deadBackend();
    await backendReachability.reportNetworkFailure();
    expect(backendReachability.isDown()).toBe(true);

    backendReachability.reportBackendResponse();
    expect(backendReachability.isDown()).toBe(false);

    const probe = healthyBackend();
    const confirmed = await backendReachability.reportNetworkFailure();

    expect(confirmed).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(backendReachability.isDown()).toBe(false);
  });
});

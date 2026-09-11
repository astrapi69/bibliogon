/**
 * Backend-reachability store semantics (#765).
 *
 * Event-driven, not poll-driven: guardedFetch reports failures and
 * responses; a light /api/health probe runs ONLY while down (10s) and
 * stops on recovery - no polling in the healthy state.
 *
 * Since #770 a reported failure costs ONE confirm probe before the
 * banner goes up, so the first describe establishes its outages against
 * a backend that stays dead; the second covers the confirm-before-flip
 * semantics themselves.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { backendReachability } from "./backendReachability";

/** Stub fetch so every call (request AND probe) fails. */
function deadBackend() {
  const spy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Stub fetch so the confirm probe answers: the backend is fine. */
function healthyBackend() {
  const spy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("backendReachability store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    backendReachability.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    backendReachability.resetForTests();
  });

  it("many parallel failures collapse into one down transition", async () => {
    const listener = vi.fn();
    backendReachability.subscribe(listener);
    deadBackend();
    await Promise.all([
      backendReachability.reportNetworkFailure(),
      backendReachability.reportNetworkFailure(),
      backendReachability.reportNetworkFailure(),
    ]);
    expect(backendReachability.isDown()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("recovers on the next backend response and notifies once", async () => {
    const listener = vi.fn();
    backendReachability.subscribe(listener);
    deadBackend();
    await backendReachability.reportNetworkFailure();
    backendReachability.reportBackendResponse();
    backendReachability.reportBackendResponse();
    expect(backendReachability.isDown()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("probes /api/health only while down and stops after recovery", async () => {
    deadBackend();
    await backendReachability.reportNetworkFailure();
    expect(backendReachability.isDown()).toBe(true);

    // The backend comes back; the interval probe is what notices.
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/health");
    expect(backendReachability.isDown()).toBe(false);

    // Healthy again: no polling at all.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps probing while the backend stays down", async () => {
    const fetchSpy = deadBackend();

    await backendReachability.reportNetworkFailure();
    const afterConfirm = fetchSpy.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchSpy).toHaveBeenCalledTimes(afterConfirm + 2);
    expect(backendReachability.isDown()).toBe(true);
  });

  it("probes immediately when the device comes back online", async () => {
    // Without this the banner lingers for up to one probe interval after a
    // device-offline period, while OfflineBanner already disappeared.
    deadBackend();
    await backendReachability.reportNetworkFailure();
    expect(backendReachability.isDown()).toBe(true);

    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchSpy).toHaveBeenCalled();
    expect(backendReachability.isDown()).toBe(false);
  });

  it("retryNow probes immediately and reports the outcome", async () => {
    deadBackend();
    await backendReachability.reportNetworkFailure();
    expect(backendReachability.isDown()).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    const reachable = await backendReachability.retryNow();
    expect(reachable).toBe(true);
    expect(backendReachability.isDown()).toBe(false);
  });
});

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

/**
 * Backend-reachability store semantics (#765).
 *
 * Event-driven, not poll-driven: guardedFetch reports failures and
 * responses; a light /api/health probe runs ONLY while down (10s) and
 * stops on recovery - no polling in the healthy state.
 *
 * Since #770 a reported failure is a SUSPICION that one immediate
 * /api/health probe confirms, so these tests reach the confirmed-down
 * state through `confirmDown()` rather than by calling
 * reportNetworkFailure() alone. `confirmDown` returns the probe-call
 * count it consumed, so the recovery-probe assertions below stay exact.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { backendReachability } from "./backendReachability";

/** Drive the store into the confirmed-down state.
 *
 *  Installs a rejecting fetch, reports the failure and lets the
 *  confirmation probe fail. Returns the number of fetch calls it used, so
 *  a caller that then swaps in its own spy can offset its expectations.
 */
async function confirmDown(): Promise<number> {
  const failing = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", failing);
  backendReachability.reportNetworkFailure();
  await vi.advanceTimersByTimeAsync(0);
  return failing.mock.calls.length;
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
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const listener = vi.fn();
    backendReachability.subscribe(listener);
    backendReachability.reportNetworkFailure();
    backendReachability.reportNetworkFailure();
    backendReachability.reportNetworkFailure();
    await vi.advanceTimersByTimeAsync(0);
    expect(backendReachability.isDown()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("recovers on the next backend response and notifies once", async () => {
    await confirmDown();
    const listener = vi.fn();
    backendReachability.subscribe(listener);
    backendReachability.reportBackendResponse();
    backendReachability.reportBackendResponse();
    expect(backendReachability.isDown()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("probes /api/health only while down and stops after recovery", async () => {
    await confirmDown();
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    // The confirmation probe is spent; nothing else fires until the
    // recovery interval elapses.
    expect(fetchSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/health");
    expect(backendReachability.isDown()).toBe(false);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps probing while the backend stays down", async () => {
    await confirmDown();
    const fetchSpy = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchSpy);

    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(backendReachability.isDown()).toBe(true);
  });

  it("probes immediately when the device comes back online", async () => {
    // Without this the banner lingers for up to one probe interval after a
    // device-offline period, while OfflineBanner already disappeared.
    await confirmDown();
    expect(backendReachability.isDown()).toBe(true);

    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchSpy).toHaveBeenCalled();
    expect(backendReachability.isDown()).toBe(false);
  });

  it("retryNow probes immediately and reports the outcome", async () => {
    await confirmDown();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    const reachable = await backendReachability.retryNow();
    expect(reachable).toBe(true);
    expect(backendReachability.isDown()).toBe(false);
  });
});

/**
 * Confirm-before-flip (#770).
 *
 * The store used to flip to "down" on the FIRST network-level failure, so a
 * request-specific failure on a healthy backend (a reset on one oversized
 * upload, a stalled export) raised the global outage banner AND suppressed
 * that request's toast - the user saw a banner that vanished without ever
 * learning what actually failed. A failure is now a SUSPICION that an
 * immediate /api/health probe confirms or clears.
 */
describe("backendReachability confirm-before-flip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    backendReachability.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    backendReachability.resetForTests();
  });

  it("does not report down until the probe confirms", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchSpy);

    backendReachability.reportNetworkFailure();

    expect(backendReachability.isDown()).toBe(false);
    expect(backendReachability.isSuspected()).toBe(true);

    await vi.advanceTimersByTimeAsync(0);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/health");
    expect(backendReachability.isDown()).toBe(true);
    expect(backendReachability.isSuspected()).toBe(false);
  });

  it("clears the suspicion when the probe proves the backend healthy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    const listener = vi.fn();
    backendReachability.subscribe(listener);

    backendReachability.reportNetworkFailure();
    await vi.advanceTimersByTimeAsync(0);

    expect(backendReachability.isDown()).toBe(false);
    expect(backendReachability.isSuspected()).toBe(false);
    // Never went down, so the banner never flickered.
    expect(listener).not.toHaveBeenCalled();
  });

  it("resolves the suspicion to false for a request-specific failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    const resolved = vi.fn();
    backendReachability.subscribeSuspicion(resolved);

    backendReachability.reportNetworkFailure();
    await vi.advanceTimersByTimeAsync(0);

    expect(resolved).toHaveBeenCalledWith(false);
  });

  it("resolves the suspicion to true for a real outage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const resolved = vi.fn();
    backendReachability.subscribeSuspicion(resolved);

    backendReachability.reportNetworkFailure();
    await vi.advanceTimersByTimeAsync(0);

    expect(resolved).toHaveBeenCalledWith(true);
  });

  it("collapses parallel failures into one confirmation probe", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchSpy);

    backendReachability.reportNetworkFailure();
    backendReachability.reportNetworkFailure();
    backendReachability.reportNetworkFailure();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("marks down when the confirmation probe hangs past the timeout", async () => {
    // A dead network can leave the probe's TCP connection hanging; the
    // suspicion must not stay unresolved (and its toasts withheld) forever.
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const resolved = vi.fn();
    backendReachability.subscribeSuspicion(resolved);

    backendReachability.reportNetworkFailure();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(backendReachability.isDown()).toBe(true);
    expect(resolved).toHaveBeenCalledWith(true);
  });

  it("ignores further failures once confirmed down", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchSpy);

    backendReachability.reportNetworkFailure();
    await vi.advanceTimersByTimeAsync(0);
    expect(backendReachability.isDown()).toBe(true);

    const callsAfterConfirm = fetchSpy.mock.calls.length;
    backendReachability.reportNetworkFailure();
    await vi.advanceTimersByTimeAsync(0);

    // No second confirmation round; the 10s recovery probe owns it now.
    expect(fetchSpy.mock.calls.length).toBe(callsAfterConfirm);
  });
});

/**
 * The probe must classify its own response (#770).
 *
 * A reverse proxy in front of a dead backend RESOLVES the fetch with a
 * 502/503/504, so "the probe did not throw" is not proof of reachability.
 * Before this the confirmation probe read a proxy 502 as healthy and the
 * banner never appeared in the deployed topologies - and the recovery probe
 * had the same blind spot, clearing the banner on a proxy 502.
 */
describe("backendReachability probe classification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    backendReachability.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    backendReachability.resetForTests();
  });

  it("treats a proxy gateway 502 as still down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", { status: 502, headers: { "Content-Type": "text/plain" } }),
      ),
    );

    backendReachability.reportNetworkFailure();
    await vi.advanceTimersByTimeAsync(0);

    expect(backendReachability.isDown()).toBe(true);
  });

  it("treats a backend-authored JSON 502 as reachable", async () => {
    // app.exceptions.ExternalServiceError -> HTTP 502 application/json. The
    // backend answered, so it is up; only the downstream service failed.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"detail":"Pandoc down"}', {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    backendReachability.reportNetworkFailure();
    await vi.advanceTimersByTimeAsync(0);

    expect(backendReachability.isDown()).toBe(false);
  });

  it("does not clear the banner on a proxy 502 recovery probe", async () => {
    await confirmDown();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", { status: 503, headers: { "Content-Type": "text/html" } }),
      ),
    );

    await vi.advanceTimersByTimeAsync(10_000);

    expect(backendReachability.isDown()).toBe(true);
  });
});

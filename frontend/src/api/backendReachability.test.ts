/**
 * Backend-reachability store semantics (#765).
 *
 * Event-driven, not poll-driven: guardedFetch reports failures and
 * responses; a light /api/health probe runs ONLY while down (10s) and
 * stops on recovery - no polling in the healthy state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { backendReachability } from "./backendReachability";

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

  it("many parallel failures collapse into one down transition", () => {
    const listener = vi.fn();
    backendReachability.subscribe(listener);
    backendReachability.reportNetworkFailure();
    backendReachability.reportNetworkFailure();
    backendReachability.reportNetworkFailure();
    expect(backendReachability.isDown()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("recovers on the next backend response and notifies once", () => {
    const listener = vi.fn();
    backendReachability.subscribe(listener);
    backendReachability.reportNetworkFailure();
    backendReachability.reportBackendResponse();
    backendReachability.reportBackendResponse();
    expect(backendReachability.isDown()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("probes /api/health only while down and stops after recovery", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    backendReachability.reportNetworkFailure();
    expect(fetchSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/health");
    expect(backendReachability.isDown()).toBe(false);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps probing while the backend stays down", async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchSpy);

    backendReachability.reportNetworkFailure();
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(backendReachability.isDown()).toBe(true);
  });

  it("probes immediately when the device comes back online", async () => {
    // Without this the banner lingers for up to one probe interval after a
    // device-offline period, while OfflineBanner already disappeared.
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    backendReachability.reportNetworkFailure();
    expect(backendReachability.isDown()).toBe(true);

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchSpy).toHaveBeenCalled();
    expect(backendReachability.isDown()).toBe(false);
  });

  it("retryNow probes immediately and reports the outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    backendReachability.reportNetworkFailure();
    const reachable = await backendReachability.retryNow();
    expect(reachable).toBe(true);
    expect(backendReachability.isDown()).toBe(false);
  });
});

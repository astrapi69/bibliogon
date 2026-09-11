/**
 * Persistent backend-unreachable banner (#765).
 *
 * Shows exactly while the reachability store is down AND the browser
 * itself is online (a device-offline situation belongs to the
 * existing OfflineBanner - both at once would be noise); disappears
 * on recovery without a reload.
 *
 * Since #770 "down" means CONFIRMED down, so the banner cases below drive
 * the store with `markDownForTests()`; an unconfirmed suspicion must leave
 * the banner hidden, which is its own case at the end.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

import BackendUnreachableBanner from "./BackendUnreachableBanner";
import { backendReachability } from "../../api/backendReachability";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_key: string, fallback: string) => fallback,
    lang: "de",
    setLang: () => {},
  }),
}));

describe("BackendUnreachableBanner", () => {
  beforeEach(() => {
    backendReachability.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    backendReachability.resetForTests();
  });

  it("renders nothing while the backend is reachable", () => {
    render(<BackendUnreachableBanner />);
    expect(screen.queryByTestId("backend-unreachable-banner")).toBeNull();
  });

  it("appears on down and disappears again on recovery", () => {
    render(<BackendUnreachableBanner />);
    act(() => {
      backendReachability.markDownForTests();
    });
    expect(screen.getByTestId("backend-unreachable-banner")).toBeTruthy();

    act(() => {
      backendReachability.reportBackendResponse();
    });
    expect(screen.queryByTestId("backend-unreachable-banner")).toBeNull();
  });

  it("offers a retry action that probes the backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    render(<BackendUnreachableBanner />);
    act(() => {
      backendReachability.markDownForTests();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("backend-unreachable-retry"));
    });
    expect(screen.queryByTestId("backend-unreachable-banner")).toBeNull();
  });

  // #770: a request-specific failure (one oversized upload reset, one
  // stalled export) must not raise the GLOBAL outage banner. The banner
  // waits for the confirmation probe.
  it("stays hidden while a failure is still unconfirmed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<BackendUnreachableBanner />);

    await act(async () => {
      backendReachability.reportNetworkFailure();
    });

    expect(backendReachability.isSuspected()).toBe(true);
    expect(screen.queryByTestId("backend-unreachable-banner")).toBeNull();
  });

  it("appears once the confirmation probe fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<BackendUnreachableBanner />);

    await act(async () => {
      backendReachability.reportNetworkFailure();
    });

    expect(screen.getByTestId("backend-unreachable-banner")).toBeTruthy();
  });
});

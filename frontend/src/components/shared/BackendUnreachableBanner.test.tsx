/**
 * Persistent backend-unreachable banner (#765).
 *
 * Shows exactly while the reachability store is down AND the browser
 * itself is online (a device-offline situation belongs to the
 * existing OfflineBanner - both at once would be noise); disappears
 * on recovery without a reload.
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
      backendReachability.reportNetworkFailure();
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
      backendReachability.reportNetworkFailure();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("backend-unreachable-retry"));
    });
    expect(screen.queryByTestId("backend-unreachable-banner")).toBeNull();
  });
});

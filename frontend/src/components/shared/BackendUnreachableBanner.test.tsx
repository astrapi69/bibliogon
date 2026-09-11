/**
 * Persistent backend-unreachable banner (#765).
 *
 * Shows exactly while the reachability store is down AND the browser
 * itself is online (a device-offline situation belongs to the
 * existing OfflineBanner - both at once would be noise); disappears
 * on recovery without a reload.
 *
 * Since #770 the store confirms a reported failure with one /api/health
 * probe before going down, so these cases keep the backend dead for
 * that probe too.
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

/** Establish a CONFIRMED outage (#770): request and probe both fail. */
async function goDown() {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  await act(async () => {
    await backendReachability.reportNetworkFailure();
  });
}

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

  it("appears on down and disappears again on recovery", async () => {
    render(<BackendUnreachableBanner />);
    await goDown();
    expect(screen.getByTestId("backend-unreachable-banner")).toBeTruthy();

    act(() => {
      backendReachability.reportBackendResponse();
    });
    expect(screen.queryByTestId("backend-unreachable-banner")).toBeNull();
  });

  it("offers a retry action that probes the backend", async () => {
    render(<BackendUnreachableBanner />);
    await goDown();

    // The backend comes back; the retry button is what notices.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("backend-unreachable-retry"));
    });
    expect(screen.queryByTestId("backend-unreachable-banner")).toBeNull();
  });
});

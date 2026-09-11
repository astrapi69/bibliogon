/**
 * Toast suppression for network-classified errors (#765).
 *
 * While the backend is unreachable the persistent banner is the ONE
 * surface; every ApiError{network} routed through notify.error is
 * downgraded to a console warning (same shape as the existing
 * backendless-offline downgrade). Business errors (4xx with a running
 * backend) keep toasting exactly as before.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toast } from "react-toastify";

import { notify } from "./notify";
import { ApiError } from "../../api/errors";
import { backendReachability } from "../../api/backendReachability";

vi.mock("react-toastify", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

describe("notify.error network suppression", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockReset();
    backendReachability.resetForTests();
  });

  // Until #770 a network-classified ApiError was dropped on the spot. It is
  // now parked behind the confirmation probe instead, because the flag says
  // the request died at the network level - NOT that the backend is gone.
  it("suppresses the toast for a network-classified ApiError once the outage is confirmed", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    backendReachability.markDownForTests();
    const networkError = new ApiError(0, "Backend unreachable: /api/books", "/api/books", "GET");
    networkError.network = true;

    notify.error("Wiederherstellen fehlgeschlagen.", networkError);

    expect(toast.error).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("keeps toasting business errors (4xx) unchanged", () => {
    const validationError = new ApiError(422, "Titel fehlt", "/api/books", "POST");

    notify.error("Speichern fehlgeschlagen.", validationError);

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  // 22 call sites pass only a message (no error object), so per-error
  // classification can never reach them. While the banner is up they must
  // stay silent too - that IS the dedup requirement of #765.
  it("suppresses message-only toasts while the backend is down", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    backendReachability.markDownForTests();

    notify.error("Konnte Autoren nicht laden");

    expect(toast.error).not.toHaveBeenCalled();
    backendReachability.resetForTests();
    warnSpy.mockRestore();
  });

  it("resumes toasting message-only errors after recovery", () => {
    backendReachability.markDownForTests();
    backendReachability.reportBackendResponse();

    notify.error("Konnte Autoren nicht laden");

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  // Autosave uses notify.saveError (its own retry toast), which bypassed the
  // network branch entirely - during an outage every autosave tick raised a
  // persistent "Speichern fehlgeschlagen" toast.
  it("suppresses saveError toasts while the backend is down", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    backendReachability.markDownForTests();

    notify.saveError("Speichern fehlgeschlagen.", () => {}, "Erneut versuchen");

    expect(toast.error).not.toHaveBeenCalled();
    backendReachability.resetForTests();
    warnSpy.mockRestore();
  });
});

/**
 * Withheld toasts released after a false alarm (#770).
 *
 * A request-specific failure (one oversized upload reset, one stalled
 * export) used to raise the global outage banner AND lose its own toast.
 * The toast is now parked while the confirmation probe runs and released
 * when the probe proves the backend healthy.
 */
describe("notify.error withheld-toast release", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockReset();
    backendReachability.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    backendReachability.resetForTests();
  });

  it("parks the toast while the failure is unconfirmed", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    backendReachability.reportNetworkFailure();

    notify.error("Upload fehlgeschlagen.");

    expect(toast.error).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    // Settle the suspicion so the parked entry cannot leak into a later
    // test and release a phantom toast there.
    backendReachability.markDownForTests();
    expect(toast.error).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("releases the parked toast when the backend turns out healthy", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    backendReachability.reportNetworkFailure();
    notify.error("Upload fehlgeschlagen.");
    expect(toast.error).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(backendReachability.isDown()).toBe(false);
    warnSpy.mockRestore();
  });

  it("discards the parked toast when the outage is confirmed", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    backendReachability.reportNetworkFailure();
    notify.error("Upload fehlgeschlagen.");

    await vi.waitFor(() => expect(backendReachability.isDown()).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("releases a parked saveError toast on a false alarm", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    backendReachability.reportNetworkFailure();
    notify.saveError("Speichern fehlgeschlagen.", () => {}, "Erneut versuchen");
    expect(toast.error).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    warnSpy.mockRestore();
  });
});

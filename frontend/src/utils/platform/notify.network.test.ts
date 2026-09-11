/**
 * Toast suppression for network-classified errors (#765).
 *
 * While the backend is unreachable the persistent banner is the ONE
 * surface; every ApiError{network} routed through notify.error is
 * downgraded to a console warning (same shape as the existing
 * backendless-offline downgrade). Business errors (4xx with a running
 * backend) keep toasting exactly as before.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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

  it("suppresses the toast for a network-classified ApiError", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
    backendReachability.reportNetworkFailure();

    notify.error("Konnte Autoren nicht laden");

    expect(toast.error).not.toHaveBeenCalled();
    backendReachability.resetForTests();
    warnSpy.mockRestore();
  });

  it("resumes toasting message-only errors after recovery", () => {
    backendReachability.reportNetworkFailure();
    backendReachability.reportBackendResponse();

    notify.error("Konnte Autoren nicht laden");

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  // Autosave uses notify.saveError (its own retry toast), which bypassed the
  // network branch entirely - during an outage every autosave tick raised a
  // persistent "Speichern fehlgeschlagen" toast.
  it("suppresses saveError toasts while the backend is down", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    backendReachability.reportNetworkFailure();

    notify.saveError("Speichern fehlgeschlagen.", () => {}, "Erneut versuchen");

    expect(toast.error).not.toHaveBeenCalled();
    backendReachability.resetForTests();
    warnSpy.mockRestore();
  });
});

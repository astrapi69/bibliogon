/**
 * Toast suppression for network-classified errors (#765).
 *
 * While the backend is unreachable the persistent banner is the ONE
 * surface; every ApiError whose network failure a probe CONFIRMED as an
 * outage (``backendDown``) is downgraded to a console warning (same
 * shape as the existing backendless-offline downgrade). Business errors
 * (4xx with a running backend) keep toasting exactly as before, and so
 * does a network failure the probe did not confirm (#770).
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

/** Establish a CONFIRMED outage: the request failed and so does the
 *  /api/health probe that decides whether it was global (#770). */
async function goDown() {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  await backendReachability.reportNetworkFailure();
}

describe("notify.error network suppression", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockReset();
    backendReachability.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    backendReachability.resetForTests();
  });

  it("suppresses the toast for a confirmed-outage ApiError", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const networkError = new ApiError(0, "Backend unreachable: /api/books", "/api/books", "GET");
    networkError.network = true;
    // Post-#770 the verdict, not the raw classification, is the gate.
    networkError.backendDown = true;

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
  it("suppresses message-only toasts while the backend is down", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await goDown();

    notify.error("Konnte Autoren nicht laden");

    expect(toast.error).not.toHaveBeenCalled();
    backendReachability.resetForTests();
    warnSpy.mockRestore();
  });

  it("resumes toasting message-only errors after recovery", async () => {
    await goDown();
    backendReachability.reportBackendResponse();

    notify.error("Konnte Autoren nicht laden");

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  // Autosave uses notify.saveError (its own retry toast), which bypassed the
  // network branch entirely - during an outage every autosave tick raised a
  // persistent "Speichern fehlgeschlagen" toast.
  it("suppresses saveError toasts while the backend is down", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await goDown();

    notify.saveError("Speichern fehlgeschlagen.", () => {}, "Erneut versuchen");

    expect(toast.error).not.toHaveBeenCalled();
    backendReachability.resetForTests();
    warnSpy.mockRestore();
  });
});

describe("notify.error request-specific failures (#770)", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockReset();
    backendReachability.resetForTests();
  });

  it("keeps the toast for a network failure the probe did NOT confirm", () => {
    // The failure that motivated #770: one oversized upload is reset while
    // the backend is fine. Suppressing it lost the only explanation the
    // user would ever get.
    const requestFailure = new ApiError(
      0,
      "Backend unreachable: TypeError: Failed to fetch",
      "/api/books/b1/assets",
      "POST",
    );
    requestFailure.network = true;
    requestFailure.backendDown = false;

    notify.error("Bild konnte nicht hochgeladen werden.", requestFailure);

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("still suppresses a failure the probe confirmed as an outage", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const outageFailure = new ApiError(0, "Backend unreachable", "/api/books", "GET");
    outageFailure.network = true;
    outageFailure.backendDown = true;

    notify.error("Konnte Buecher nicht laden.", outageFailure);

    expect(toast.error).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("defaults backendDown to false so an unclassified error still toasts", () => {
    const plainFailure = new ApiError(0, "Backend unreachable", "/api/books", "GET");
    plainFailure.network = true;

    notify.error("Etwas ist schiefgelaufen.", plainFailure);

    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

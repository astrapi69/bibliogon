/**
 * Pins the three-event contract of `useFlushOnUnload`:
 * beforeunload + pagehide + visibilitychange (when hidden) all fire
 * the flush callback. Critical because each browser prefers a
 * different event, and losing any one of the three degrades a specific
 * platform (desktop, mobile Safari, iOS backgrounding).
 */
import {describe, it, expect, vi} from "vitest";
import {renderHook} from "@testing-library/react";
import {useFlushOnUnload} from "./useFlushOnUnload";

describe("useFlushOnUnload", () => {
  it("fires flush on beforeunload", () => {
    const flush = vi.fn();
    renderHook(() => useFlushOnUnload(flush));
    window.dispatchEvent(new Event("beforeunload"));
    expect(flush).toHaveBeenCalled();
  });

  it("fires flush on pagehide", () => {
    const flush = vi.fn();
    renderHook(() => useFlushOnUnload(flush));
    window.dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalled();
  });

  it("fires flush on visibilitychange when document is hidden", () => {
    const flush = vi.fn();
    renderHook(() => useFlushOnUnload(flush));
    Object.defineProperty(document, "hidden", {configurable: true, value: true});
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flush).toHaveBeenCalled();
  });

  it("does NOT fire flush on visibilitychange when document is visible", () => {
    const flush = vi.fn();
    renderHook(() => useFlushOnUnload(flush));
    Object.defineProperty(document, "hidden", {configurable: true, value: false});
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flush).not.toHaveBeenCalled();
  });

  it("does not register handlers when disabled", () => {
    const flush = vi.fn();
    renderHook(() => useFlushOnUnload(flush, false));
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("pagehide"));
    expect(flush).not.toHaveBeenCalled();
  });

  it("unregisters handlers on unmount", () => {
    const flush = vi.fn();
    const {unmount} = renderHook(() => useFlushOnUnload(flush));
    unmount();
    window.dispatchEvent(new Event("beforeunload"));
    expect(flush).not.toHaveBeenCalled();
  });
});

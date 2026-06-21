/**
 * Tests the online/offline hook. Pins the critical contract that
 * OfflineBanner and the Editor's save-failure path rely on: the hook
 * must reflect the current `navigator.onLine` value AND update
 * reactively on `online` / `offline` window events.
 */
import {describe, it, expect, beforeEach, afterEach, vi} from "vitest";
import {renderHook, act} from "@testing-library/react";
import {useOnlineStatus} from "./useOnlineStatus";

describe("useOnlineStatus", () => {
  const originalOnLine = navigator.onLine;

  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", {configurable: true, value: true, writable: true});
  });
  afterEach(() => {
    Object.defineProperty(navigator, "onLine", {configurable: true, value: originalOnLine, writable: true});
  });

  it("returns the initial navigator.onLine value", () => {
    const {result} = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("flips to false on an `offline` window event", () => {
    const {result} = renderHook(() => useOnlineStatus());
    act(() => {
      Object.defineProperty(navigator, "onLine", {configurable: true, value: false, writable: true});
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
  });

  it("flips back to true on an `online` window event", () => {
    Object.defineProperty(navigator, "onLine", {configurable: true, value: false, writable: true});
    const {result} = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
    act(() => {
      Object.defineProperty(navigator, "onLine", {configurable: true, value: true, writable: true});
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });

  it("removes its event listeners on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const {unmount} = renderHook(() => useOnlineStatus());
    expect(addSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith("offline", expect.any(Function));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

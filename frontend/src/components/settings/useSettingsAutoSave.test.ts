/**
 * Tests for useSettingsAutoSave (#472).
 *
 * Pins the auto-save contract the Settings panels rely on:
 * - a single triggerSave fires onSave(buildData()) after the debounce,
 * - five rapid triggers collapse into ONE onSave (one write, one toast),
 * - buildData is read at fire time, so the freshest local state is saved.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useSettingsAutoSave, SETTINGS_AUTOSAVE_DELAY_MS } from "./useSettingsAutoSave";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useSettingsAutoSave", () => {
    it("calls onSave with the built data once after the debounce", () => {
        const onSave = vi.fn();
        const buildData = vi.fn(() => ({ theme: "nord" }));
        const { result } = renderHook(() => useSettingsAutoSave(buildData, onSave));

        act(() => {
            result.current();
        });
        expect(onSave).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(SETTINGS_AUTOSAVE_DELAY_MS);
        });
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledWith({ theme: "nord" });
    });

    it("collapses five rapid triggers into a single onSave", () => {
        const onSave = vi.fn();
        const { result } = renderHook(() => useSettingsAutoSave(() => ({ n: 1 }), onSave));

        act(() => {
            for (let i = 0; i < 5; i++) {
                result.current();
                vi.advanceTimersByTime(50);
            }
        });
        expect(onSave).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(SETTINGS_AUTOSAVE_DELAY_MS);
        });
        expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("reads buildData at fire time (latest local state wins)", () => {
        let current = "a";
        const onSave = vi.fn();
        const { result } = renderHook(() =>
            useSettingsAutoSave(() => ({ value: current }), onSave),
        );

        act(() => {
            result.current();
        });
        current = "b";
        act(() => {
            vi.advanceTimersByTime(SETTINGS_AUTOSAVE_DELAY_MS);
        });
        expect(onSave).toHaveBeenCalledWith({ value: "b" });
    });
});

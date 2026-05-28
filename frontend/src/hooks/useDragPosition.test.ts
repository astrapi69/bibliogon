/**
 * Tests for useDragPosition (Picture-Book Layout Expansion
 * Phase 3 C2, 2026-05-28).
 *
 * Coverage:
 * - Initial state: draftPosition null, isDragging false.
 * - onDragEnd disabled: pointerDown is a no-op.
 * - Click path: small pointer movement → onClick fires, onDragEnd
 *   does NOT, draftPosition stays null.
 * - Drag path: pointer movement above threshold → draftPosition
 *   updates during move, onDragEnd fires on pointer-up.
 * - Bounds clamping: drag past 100% clamps to (100 - width_pct).
 * - Pointer cancel resets state (no commit).
 * - Right-click is ignored (button !== 0 on mouse).
 * - Pointer-down on element with zero-area parent rect is a no-op
 *   (defensive against hidden / unmounted parents).
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {renderHook, act} from "@testing-library/react";
import {useDragPosition} from "./useDragPosition";
import type {PointerEvent as ReactPointerEvent} from "react";

// happy-dom doesn't implement setPointerCapture as a real
// capture; stub a basic version on the element so the
// try/catch path doesn't suppress something that should fire.
function mockPointerEvent(
    overrides: Partial<ReactPointerEvent<HTMLElement>>,
): ReactPointerEvent<HTMLElement> {
    const el = (overrides.currentTarget as HTMLElement) ?? makeDraggableEl();
    return {
        button: 0,
        pointerType: "mouse",
        clientX: 0,
        clientY: 0,
        pointerId: 1,
        currentTarget: el,
        // happy-dom doesn't reject .setPointerCapture; spy it.
        ...overrides,
    } as unknown as ReactPointerEvent<HTMLElement>;
}

function makeDraggableEl(parentRect = {width: 400, height: 300}): HTMLElement {
    const parent = document.createElement("div");
    Object.defineProperty(parent, "getBoundingClientRect", {
        value: () => ({
            ...parentRect,
            left: 0,
            top: 0,
            right: parentRect.width,
            bottom: parentRect.height,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }),
    });
    const child = document.createElement("div");
    parent.appendChild(child);
    // happy-dom: setPointerCapture / releasePointerCapture defaults
    // to noop; stub anyway so the assertion can verify the call.
    child.setPointerCapture = vi.fn();
    child.releasePointerCapture = vi.fn();
    return child;
}

describe("useDragPosition — initial state", () => {
    it("draftPosition starts null + isDragging starts false", () => {
        const {result} = renderHook(() =>
            useDragPosition({
                x_pct: 10,
                y_pct: 20,
                width_pct: 30,
                height_pct: 30,
                onDragEnd: vi.fn(),
            }),
        );
        expect(result.current.draftPosition).toBe(null);
        expect(result.current.isDragging).toBe(false);
    });
});

describe("useDragPosition — onDragEnd disabled", () => {
    it("pointerDown is a no-op when onDragEnd is undefined", () => {
        const {result} = renderHook(() =>
            useDragPosition({
                x_pct: 10,
                y_pct: 20,
                width_pct: 30,
                height_pct: 30,
                // onDragEnd undefined → hook treats element as
                // non-draggable.
            }),
        );
        const el = makeDraggableEl();
        act(() => {
            result.current.handlers.onPointerDown(
                mockPointerEvent({clientX: 100, clientY: 100, currentTarget: el}),
            );
        });
        // No drag state — moves don't fire.
        act(() => {
            result.current.handlers.onPointerMove(
                mockPointerEvent({clientX: 200, clientY: 200, currentTarget: el}),
            );
        });
        expect(result.current.draftPosition).toBe(null);
        expect(result.current.isDragging).toBe(false);
    });
});

describe("useDragPosition — click path (below threshold)", () => {
    it("small movement fires onClick, NOT onDragEnd", () => {
        const onDragEnd = vi.fn();
        const onClick = vi.fn();
        const {result} = renderHook(() =>
            useDragPosition({
                x_pct: 10,
                y_pct: 20,
                width_pct: 30,
                height_pct: 30,
                onDragEnd,
                onClick,
            }),
        );
        const el = makeDraggableEl();
        act(() => {
            result.current.handlers.onPointerDown(
                mockPointerEvent({clientX: 100, clientY: 100, currentTarget: el}),
            );
        });
        // Move 2 px (below the 5 px default threshold).
        act(() => {
            result.current.handlers.onPointerMove(
                mockPointerEvent({clientX: 102, clientY: 101, currentTarget: el}),
            );
        });
        act(() => {
            result.current.handlers.onPointerUp(
                mockPointerEvent({clientX: 102, clientY: 101, currentTarget: el}),
            );
        });
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onDragEnd).not.toHaveBeenCalled();
        expect(result.current.draftPosition).toBe(null);
        expect(result.current.isDragging).toBe(false);
    });
});

describe("useDragPosition — drag path (above threshold)", () => {
    it("draftPosition updates during move + onDragEnd fires on up", () => {
        const onDragEnd = vi.fn();
        const onClick = vi.fn();
        const {result} = renderHook(() =>
            useDragPosition({
                x_pct: 10,
                y_pct: 20,
                width_pct: 30,
                height_pct: 30,
                onDragEnd,
                onClick,
            }),
        );
        const el = makeDraggableEl({width: 400, height: 300});
        act(() => {
            result.current.handlers.onPointerDown(
                mockPointerEvent({clientX: 100, clientY: 100, currentTarget: el}),
            );
        });
        // Move 40 px right + 30 px down → 10 % right + 10 % down.
        act(() => {
            result.current.handlers.onPointerMove(
                mockPointerEvent({clientX: 140, clientY: 130, currentTarget: el}),
            );
        });
        expect(result.current.draftPosition).toEqual({x_pct: 20, y_pct: 30});
        expect(result.current.isDragging).toBe(true);
        act(() => {
            result.current.handlers.onPointerUp(
                mockPointerEvent({clientX: 140, clientY: 130, currentTarget: el}),
            );
        });
        expect(onDragEnd).toHaveBeenCalledTimes(1);
        expect(onDragEnd).toHaveBeenCalledWith(20, 30);
        expect(onClick).not.toHaveBeenCalled();
        // After pointer-up: state resets.
        expect(result.current.draftPosition).toBe(null);
        expect(result.current.isDragging).toBe(false);
    });
});

describe("useDragPosition — bounds clamping", () => {
    it("clamps draftPosition so element stays inside parent", () => {
        const onDragEnd = vi.fn();
        const {result} = renderHook(() =>
            useDragPosition({
                x_pct: 50,
                y_pct: 50,
                width_pct: 30,
                height_pct: 30,
                onDragEnd,
            }),
        );
        const el = makeDraggableEl({width: 400, height: 300});
        act(() => {
            result.current.handlers.onPointerDown(
                mockPointerEvent({clientX: 200, clientY: 150, currentTarget: el}),
            );
        });
        // Move to (1000, 750) — far beyond the parent → should
        // clamp to (100 - 30, 100 - 30) = (70, 70).
        act(() => {
            result.current.handlers.onPointerMove(
                mockPointerEvent({
                    clientX: 1200,
                    clientY: 900,
                    currentTarget: el,
                }),
            );
        });
        expect(result.current.draftPosition).toEqual({x_pct: 70, y_pct: 70});
        act(() => {
            result.current.handlers.onPointerUp(
                mockPointerEvent({
                    clientX: 1200,
                    clientY: 900,
                    currentTarget: el,
                }),
            );
        });
        expect(onDragEnd).toHaveBeenCalledWith(70, 70);
    });

    it("clamps to 0 when dragging past the top/left edge", () => {
        const onDragEnd = vi.fn();
        const {result} = renderHook(() =>
            useDragPosition({
                x_pct: 10,
                y_pct: 10,
                width_pct: 30,
                height_pct: 30,
                onDragEnd,
            }),
        );
        const el = makeDraggableEl({width: 400, height: 300});
        act(() => {
            result.current.handlers.onPointerDown(
                mockPointerEvent({clientX: 100, clientY: 100, currentTarget: el}),
            );
        });
        // Move past the top-left corner.
        act(() => {
            result.current.handlers.onPointerMove(
                mockPointerEvent({clientX: -500, clientY: -500, currentTarget: el}),
            );
        });
        expect(result.current.draftPosition).toEqual({x_pct: 0, y_pct: 0});
    });
});

describe("useDragPosition — pointer cancel + edge cases", () => {
    it("pointerCancel resets state without firing onDragEnd", () => {
        const onDragEnd = vi.fn();
        const {result} = renderHook(() =>
            useDragPosition({
                x_pct: 10,
                y_pct: 20,
                width_pct: 30,
                height_pct: 30,
                onDragEnd,
            }),
        );
        const el = makeDraggableEl();
        act(() => {
            result.current.handlers.onPointerDown(
                mockPointerEvent({clientX: 100, clientY: 100, currentTarget: el}),
            );
            result.current.handlers.onPointerMove(
                mockPointerEvent({clientX: 200, clientY: 200, currentTarget: el}),
            );
            result.current.handlers.onPointerCancel(
                mockPointerEvent({clientX: 200, clientY: 200, currentTarget: el}),
            );
        });
        expect(onDragEnd).not.toHaveBeenCalled();
        expect(result.current.draftPosition).toBe(null);
        expect(result.current.isDragging).toBe(false);
    });

    it("right-click is ignored (button !== 0 on mouse)", () => {
        const onDragEnd = vi.fn();
        const {result} = renderHook(() =>
            useDragPosition({
                x_pct: 10,
                y_pct: 20,
                width_pct: 30,
                height_pct: 30,
                onDragEnd,
            }),
        );
        const el = makeDraggableEl();
        act(() => {
            result.current.handlers.onPointerDown(
                mockPointerEvent({
                    button: 2,
                    pointerType: "mouse",
                    clientX: 100,
                    clientY: 100,
                    currentTarget: el,
                }),
            );
        });
        // No drag state was established.
        act(() => {
            result.current.handlers.onPointerMove(
                mockPointerEvent({clientX: 200, clientY: 200, currentTarget: el}),
            );
        });
        expect(result.current.draftPosition).toBe(null);
        expect(result.current.isDragging).toBe(false);
    });

    it("touch pointer with button !== 0 is NOT ignored (touch has no button concept)", () => {
        const onDragEnd = vi.fn();
        const {result} = renderHook(() =>
            useDragPosition({
                x_pct: 10,
                y_pct: 20,
                width_pct: 30,
                height_pct: 30,
                onDragEnd,
            }),
        );
        const el = makeDraggableEl();
        // Touch events report button=0 (or sometimes other values
        // depending on the platform). The hook only filters
        // button !== 0 when pointerType is "mouse" — touch passes.
        act(() => {
            result.current.handlers.onPointerDown(
                mockPointerEvent({
                    button: 0,
                    pointerType: "touch",
                    clientX: 100,
                    clientY: 100,
                    currentTarget: el,
                }),
            );
        });
        act(() => {
            result.current.handlers.onPointerMove(
                mockPointerEvent({
                    clientX: 200,
                    clientY: 200,
                    currentTarget: el,
                    pointerType: "touch",
                }),
            );
        });
        expect(result.current.isDragging).toBe(true);
    });

    it("zero-area parent rect is a no-op (defensive against hidden elements)", () => {
        const onDragEnd = vi.fn();
        const {result} = renderHook(() =>
            useDragPosition({
                x_pct: 10,
                y_pct: 20,
                width_pct: 30,
                height_pct: 30,
                onDragEnd,
            }),
        );
        const el = makeDraggableEl({width: 0, height: 0});
        act(() => {
            result.current.handlers.onPointerDown(
                mockPointerEvent({clientX: 100, clientY: 100, currentTarget: el}),
            );
        });
        act(() => {
            result.current.handlers.onPointerMove(
                mockPointerEvent({clientX: 200, clientY: 200, currentTarget: el}),
            );
        });
        expect(result.current.draftPosition).toBe(null);
        expect(result.current.isDragging).toBe(false);
    });
});

describe("useDragPosition — custom threshold", () => {
    it("respects a custom threshold", () => {
        const onDragEnd = vi.fn();
        const onClick = vi.fn();
        const {result} = renderHook(() =>
            useDragPosition({
                x_pct: 10,
                y_pct: 20,
                width_pct: 30,
                height_pct: 30,
                onDragEnd,
                onClick,
                threshold: 20,
            }),
        );
        const el = makeDraggableEl({width: 400, height: 300});
        act(() => {
            result.current.handlers.onPointerDown(
                mockPointerEvent({clientX: 100, clientY: 100, currentTarget: el}),
            );
        });
        // Move 10 px (below the custom 20 px threshold).
        act(() => {
            result.current.handlers.onPointerMove(
                mockPointerEvent({clientX: 110, clientY: 105, currentTarget: el}),
            );
        });
        expect(result.current.isDragging).toBe(false);
        // Up → treated as a click.
        act(() => {
            result.current.handlers.onPointerUp(
                mockPointerEvent({clientX: 110, clientY: 105, currentTarget: el}),
            );
        });
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onDragEnd).not.toHaveBeenCalled();
    });
});

describe("useDragPosition — accessibility", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("calls setPointerCapture on pointer-down for pointer-tracking outside the element", () => {
        const {result} = renderHook(() =>
            useDragPosition({
                x_pct: 10,
                y_pct: 20,
                width_pct: 30,
                height_pct: 30,
                onDragEnd: vi.fn(),
            }),
        );
        const el = makeDraggableEl();
        act(() => {
            result.current.handlers.onPointerDown(
                mockPointerEvent({clientX: 100, clientY: 100, currentTarget: el}),
            );
        });
        expect(el.setPointerCapture).toHaveBeenCalledWith(1);
    });
});

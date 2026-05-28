/**
 * Tests for CollageCanvas (Picture-Book Layout Expansion Phase 3
 * C1, 2026-05-28).
 *
 * Coverage:
 * - Empty collage: renders empty hint, zero images, zero text
 *   regions.
 * - Single image: renders <img> with the correct percentage-based
 *   positioning + size + z-index.
 * - Multiple images: renders all of them in document order;
 *   data-image-count reflects the array length.
 * - Image with no asset_id: renders a placeholder div instead of
 *   <img>.
 * - Text regions: renders absolute-positioned divs with content
 *   + percentage coords.
 * - Background color from layout_config.collage.background_color
 *   applies as canvas inline style.
 * - Defensive shape-guards: invalid coords clamp to 0..100;
 *   non-string asset_id treated as null; out-of-range rotation
 *   normalises.
 * - readCollageImages / readCollageTextRegions helpers exposed
 *   for downstream consumers (C2 will use these to compute drag
 *   targets).
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent, act} from "@testing-library/react";
import CollageCanvas, {
    readCollageImages,
    readCollageTextRegions,
    readCollageBackgroundColor,
} from "./CollageCanvas";
import type {Page} from "../api/client";

function makeCollagePage(layoutConfig: Record<string, unknown> | null): Page {
    return {
        id: "p-collage",
        book_id: "b1",
        position: 1,
        layout: "collage",
        text_content: null,
        image_asset_id: null,
        layout_config: layoutConfig,
        notes: null,
        story_beat: null,
        mood_color: null,
        act_group: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
}

describe("CollageCanvas — empty state", () => {
    it("renders the empty hint when no images + no text regions", () => {
        render(<CollageCanvas page={makeCollagePage(null)} bookId="b1" />);
        expect(screen.getByTestId("collage-empty-hint")).toBeInTheDocument();
    });

    it("data-image-count + data-text-region-count both 0 on empty config", () => {
        render(<CollageCanvas page={makeCollagePage(null)} bookId="b1" />);
        const root = screen.getByTestId("page-canvas-root");
        expect(root.getAttribute("data-image-count")).toBe("0");
        expect(root.getAttribute("data-text-region-count")).toBe("0");
    });

    it("data-layout attribute is 'collage' on the canvas root", () => {
        render(<CollageCanvas page={makeCollagePage(null)} bookId="b1" />);
        expect(
            screen.getByTestId("page-canvas-root").getAttribute("data-layout"),
        ).toBe("collage");
    });
});

describe("CollageCanvas — images", () => {
    it("renders one image at the stored percentage coords", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        images: [
                            {
                                asset_id: "asset-A",
                                x_pct: 10,
                                y_pct: 20,
                                width_pct: 40,
                                height_pct: 30,
                                z_index: 3,
                            },
                        ],
                    },
                })}
                bookId="b1"
            />,
        );
        const wrapper = screen.getByTestId("collage-image-0");
        expect(wrapper.getAttribute("data-x-pct")).toBe("10");
        expect(wrapper.getAttribute("data-y-pct")).toBe("20");
        expect(wrapper.getAttribute("data-width-pct")).toBe("40");
        expect(wrapper.getAttribute("data-height-pct")).toBe("30");
        expect(wrapper.getAttribute("data-z-index")).toBe("3");
        // Inline style: percentages applied directly.
        expect(wrapper.style.left).toBe("10%");
        expect(wrapper.style.top).toBe("20%");
        expect(wrapper.style.width).toBe("40%");
        expect(wrapper.style.height).toBe("30%");
        // The <img> renders the asset URL.
        const img = screen.getByTestId("collage-image-img-0");
        expect(img.getAttribute("src")).toContain("asset-A");
    });

    it("renders multiple images in array order", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        images: [
                            {asset_id: "a-1"},
                            {asset_id: "a-2"},
                            {asset_id: "a-3"},
                        ],
                    },
                })}
                bookId="b1"
            />,
        );
        expect(screen.getByTestId("collage-image-0")).toBeInTheDocument();
        expect(screen.getByTestId("collage-image-1")).toBeInTheDocument();
        expect(screen.getByTestId("collage-image-2")).toBeInTheDocument();
        expect(
            screen.getByTestId("page-canvas-root").getAttribute("data-image-count"),
        ).toBe("3");
    });

    it("renders the placeholder for an image with no asset_id", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        images: [{x_pct: 10, y_pct: 10}],
                    },
                })}
                bookId="b1"
            />,
        );
        expect(
            screen.getByTestId("collage-image-placeholder-0"),
        ).toBeInTheDocument();
        // No <img> for this entry.
        expect(
            screen.queryByTestId("collage-image-img-0"),
        ).not.toBeInTheDocument();
    });

    it("does NOT render the empty-hint when at least one image is present", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {images: [{asset_id: "a-1"}]},
                })}
                bookId="b1"
            />,
        );
        expect(
            screen.queryByTestId("collage-empty-hint"),
        ).not.toBeInTheDocument();
    });

    it("applies rotation_deg as a CSS transform when non-zero", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        images: [{asset_id: "a-1", rotation_deg: 45}],
                    },
                })}
                bookId="b1"
            />,
        );
        expect(screen.getByTestId("collage-image-0").style.transform).toBe(
            "rotate(45deg)",
        );
    });

    it("rotation_deg === 0 produces NO transform inline style", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        images: [{asset_id: "a-1", rotation_deg: 0}],
                    },
                })}
                bookId="b1"
            />,
        );
        expect(screen.getByTestId("collage-image-0").style.transform).toBe("");
    });
});

describe("CollageCanvas — text regions", () => {
    it("renders a text region with content + position", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        text_regions: [
                            {
                                id: "caption-1",
                                x_pct: 5,
                                y_pct: 70,
                                width_pct: 90,
                                height_pct: 20,
                                content: "Hello, collage!",
                            },
                        ],
                    },
                })}
                bookId="b1"
            />,
        );
        const region = screen.getByTestId("collage-text-region-caption-1");
        expect(region).toHaveTextContent("Hello, collage!");
        expect(region.style.left).toBe("5%");
        expect(region.style.top).toBe("70%");
        expect(region.style.width).toBe("90%");
        expect(region.style.height).toBe("20%");
    });

    it("renders multiple text regions", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        text_regions: [
                            {id: "t-1", content: "Region one"},
                            {id: "t-2", content: "Region two"},
                        ],
                    },
                })}
                bookId="b1"
            />,
        );
        expect(
            screen.getByTestId("collage-text-region-t-1"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("collage-text-region-t-2"),
        ).toBeInTheDocument();
        expect(
            screen
                .getByTestId("page-canvas-root")
                .getAttribute("data-text-region-count"),
        ).toBe("2");
    });

    it("falls back to text-N id when entry's id is missing", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {text_regions: [{content: "no id here"}]},
                })}
                bookId="b1"
            />,
        );
        // First entry gets id "text-0" per the helper.
        expect(
            screen.getByTestId("collage-text-region-text-0"),
        ).toBeInTheDocument();
    });
});

describe("CollageCanvas — background color", () => {
    it("applies a valid #rrggbb background color from the namespace", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {background_color: "#ffcc00"},
                })}
                bookId="b1"
            />,
        );
        // jsdom normalizes hex colors to rgb() in some cases.
        const bg = screen.getByTestId("page-canvas-root").style.background;
        expect(bg.toLowerCase()).toMatch(/#ffcc00|rgb\(255,\s*204,\s*0\)/);
    });

    it("ignores a malformed background color", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {background_color: "not-a-hex"},
                })}
                bookId="b1"
            />,
        );
        // No inline background — CSS module default applies.
        expect(screen.getByTestId("page-canvas-root").style.background).toBe("");
    });
});

describe("CollageCanvas helpers — defensive shape-guards", () => {
    it("readCollageImages: returns [] for null / undefined config", () => {
        expect(readCollageImages(null)).toEqual([]);
        expect(readCollageImages(undefined)).toEqual([]);
    });

    it("readCollageImages: returns [] when namespace has no images key", () => {
        expect(readCollageImages({collage: {}})).toEqual([]);
    });

    it("readCollageImages: returns [] when images is not an array", () => {
        expect(
            readCollageImages({collage: {images: "not an array"}}),
        ).toEqual([]);
    });

    it("readCollageImages: clamps out-of-range pct values to 0..100", () => {
        const result = readCollageImages({
            collage: {
                images: [
                    {asset_id: "a-1", x_pct: -50, y_pct: 200, width_pct: 150},
                ],
            },
        });
        expect(result[0].x_pct).toBe(0);
        expect(result[0].y_pct).toBe(100);
        expect(result[0].width_pct).toBe(100);
    });

    it("readCollageImages: normalises out-of-range rotation_deg to -180..180", () => {
        const result = readCollageImages({
            collage: {
                images: [{asset_id: "a-1", rotation_deg: 540}],
            },
        });
        // 540 % 360 = 180 → stays at 180 (boundary).
        expect(result[0].rotation_deg).toBe(180);
        const result2 = readCollageImages({
            collage: {
                images: [{asset_id: "a-1", rotation_deg: -450}],
            },
        });
        // -450 % 360 = -90 → -90 stays in range.
        expect(result2[0].rotation_deg).toBe(-90);
    });

    it("readCollageImages: filters out non-object entries", () => {
        const result = readCollageImages({
            collage: {
                images: [null, "string", 42, {asset_id: "good"}],
            },
        });
        expect(result.length).toBe(1);
        expect(result[0].asset_id).toBe("good");
    });

    it("readCollageImages: non-string asset_id becomes null", () => {
        const result = readCollageImages({
            collage: {
                images: [{asset_id: 12345 as unknown}],
            },
        });
        expect(result[0].asset_id).toBe(null);
    });

    it("readCollageImages: invalid fit value falls back to 'cover'", () => {
        const result = readCollageImages({
            collage: {images: [{asset_id: "a-1", fit: "bogus"}]},
        });
        expect(result[0].fit).toBe("cover");
    });

    it("readCollageTextRegions: returns [] for null / undefined config", () => {
        expect(readCollageTextRegions(null)).toEqual([]);
        expect(readCollageTextRegions(undefined)).toEqual([]);
    });

    it("readCollageTextRegions: filters non-object entries + clamps coords", () => {
        const result = readCollageTextRegions({
            collage: {
                text_regions: [
                    null,
                    {id: "t-1", x_pct: -10, y_pct: 105, content: "ok"},
                ],
            },
        });
        expect(result.length).toBe(1);
        expect(result[0].x_pct).toBe(0);
        expect(result[0].y_pct).toBe(100);
    });

    it("readCollageBackgroundColor: accepts only #rrggbb shape", () => {
        expect(
            readCollageBackgroundColor({collage: {background_color: "#ffcc00"}}),
        ).toBe("#ffcc00");
        expect(
            readCollageBackgroundColor({collage: {background_color: "ffcc00"}}),
        ).toBeUndefined();
        expect(
            readCollageBackgroundColor({collage: {background_color: "rgb(255,0,0)"}}),
        ).toBeUndefined();
    });
});

// Phase 3 C2 (2026-05-28). Image drag-to-position. Each collage
// image wraps in a CollageImageItem that owns a useDragPosition
// hook. Drag-end calls onUpdate with a writeLayoutNamespace-
// updated layout_config preserving sibling-layout namespaces.

function stubParentRect(width: number, height: number) {
    // Spy getBoundingClientRect on every wrapper's parent so the
    // hook's coord math gets a non-zero rect (happy-dom defaults
    // to zero for unmounted parents). Returns a teardown.
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
        return {
            width,
            height,
            left: 0,
            top: 0,
            right: width,
            bottom: height,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        };
    };
    return () => {
        HTMLElement.prototype.getBoundingClientRect = original;
    };
}

describe("CollageCanvas — image drag-to-position", () => {
    it("does NOT attach pointer handlers when onUpdate is omitted (read-only mode)", () => {
        // Phase 3 C1 read-only path: omitting onUpdate keeps the
        // canvas immutable. The CollageImageItem renders the
        // wrapper without onPointerDown so any pointer interaction
        // is a no-op.
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {images: [{asset_id: "a-1"}]},
                })}
                bookId="b1"
            />,
        );
        // The data-dragging attr stays "false".
        expect(
            screen.getByTestId("collage-image-0").getAttribute("data-dragging"),
        ).toBe("false");
        // The cursor: grab indicator should NOT appear.
        expect(screen.getByTestId("collage-image-0").style.cursor).toBe("");
    });

    it("attaches grab cursor when onUpdate is provided (drag-enabled mode)", () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        images: [{asset_id: "a-1", x_pct: 10, y_pct: 20}],
                    },
                })}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        );
        expect(screen.getByTestId("collage-image-0").style.cursor).toBe("grab");
    });

    it("drag-end fires onUpdate with the new x_pct/y_pct preserved in the namespace", () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        const restore = stubParentRect(400, 300);
        try {
            render(
                <CollageCanvas
                    page={makeCollagePage({
                        collage: {
                            images: [
                                {
                                    asset_id: "a-1",
                                    x_pct: 10,
                                    y_pct: 20,
                                    width_pct: 30,
                                    height_pct: 30,
                                },
                                {asset_id: "a-2", x_pct: 50, y_pct: 50},
                            ],
                            background_color: "#ffcc00",
                        },
                    })}
                    bookId="b1"
                    onUpdate={onUpdate}
                />,
            );
            const wrapper = screen.getByTestId("collage-image-0");
            // Simulate a drag from (100, 100) → (180, 160) — 80 px
            // right + 60 px down on a 400x300 parent → 20 % + 20 %.
            act(() => {
                fireEvent.pointerDown(wrapper, {
                    clientX: 100,
                    clientY: 100,
                    pointerId: 1,
                    button: 0,
                    pointerType: "mouse",
                });
            });
            act(() => {
                fireEvent.pointerMove(wrapper, {
                    clientX: 180,
                    clientY: 160,
                    pointerId: 1,
                });
            });
            act(() => {
                fireEvent.pointerUp(wrapper, {
                    clientX: 180,
                    clientY: 160,
                    pointerId: 1,
                });
            });
            // onUpdate fires with the namespace updated for the
            // first image only — the second image's coords are
            // preserved untouched (sibling preservation).
            expect(onUpdate).toHaveBeenCalledTimes(1);
            const call = onUpdate.mock.calls[0][0];
            expect(call.layout_config.collage.images[0].x_pct).toBe(30);
            expect(call.layout_config.collage.images[0].y_pct).toBe(40);
            // Second image untouched.
            expect(call.layout_config.collage.images[1].x_pct).toBe(50);
            expect(call.layout_config.collage.images[1].y_pct).toBe(50);
            // Background color preserved.
            expect(call.layout_config.collage.background_color).toBe("#ffcc00");
        } finally {
            restore();
        }
    });

    it("small movement does NOT fire onUpdate (treated as a click)", () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        const restore = stubParentRect(400, 300);
        try {
            render(
                <CollageCanvas
                    page={makeCollagePage({
                        collage: {images: [{asset_id: "a-1"}]},
                    })}
                    bookId="b1"
                    onUpdate={onUpdate}
                />,
            );
            const wrapper = screen.getByTestId("collage-image-0");
            act(() => {
                fireEvent.pointerDown(wrapper, {
                    clientX: 100,
                    clientY: 100,
                    pointerId: 1,
                    button: 0,
                    pointerType: "mouse",
                });
            });
            // Move 2 px (below the 5 px threshold).
            act(() => {
                fireEvent.pointerMove(wrapper, {
                    clientX: 102,
                    clientY: 101,
                    pointerId: 1,
                });
            });
            act(() => {
                fireEvent.pointerUp(wrapper, {
                    clientX: 102,
                    clientY: 101,
                    pointerId: 1,
                });
            });
            expect(onUpdate).not.toHaveBeenCalled();
        } finally {
            restore();
        }
    });
});

// Phase 3 C3 (2026-05-28). Image add / delete / z-index controls.
// The toolbar's "Add image" button uploads + appends; per-image
// controls (delete + bring-forward + send-back) update the
// namespace via writeLayoutNamespace.

describe("CollageCanvas — C3 controls visibility (read-only vs editable)", () => {
    it("does NOT render the toolbar in read-only mode (no onUpdate)", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {images: [{asset_id: "a-1"}]},
                })}
                bookId="b1"
            />,
        );
        expect(screen.queryByTestId("collage-toolbar")).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("collage-add-image"),
        ).not.toBeInTheDocument();
    });

    it("renders the toolbar with Add image button in edit mode", () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        render(
            <CollageCanvas
                page={makeCollagePage(null)}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        );
        expect(screen.getByTestId("collage-toolbar")).toBeInTheDocument();
        expect(screen.getByTestId("collage-add-image")).toBeInTheDocument();
    });

    it("does NOT render per-image controls in read-only mode", () => {
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {images: [{asset_id: "a-1"}]},
                })}
                bookId="b1"
            />,
        );
        expect(
            screen.queryByTestId("collage-image-controls-0"),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("collage-image-delete-0"),
        ).not.toBeInTheDocument();
    });

    it("renders per-image controls (delete + z-index) in edit mode", () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {images: [{asset_id: "a-1"}, {asset_id: "a-2"}]},
                })}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        );
        expect(
            screen.getByTestId("collage-image-controls-0"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("collage-image-delete-0"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("collage-image-move-forward-0"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("collage-image-move-backward-0"),
        ).toBeInTheDocument();
    });
});

describe("CollageCanvas — C3 delete image", () => {
    it("clicking delete removes that image + preserves others", () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        images: [
                            {asset_id: "a-1", x_pct: 10},
                            {asset_id: "a-2", x_pct: 50},
                            {asset_id: "a-3", x_pct: 80},
                        ],
                        background_color: "#abcdef",
                    },
                })}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        );
        fireEvent.click(screen.getByTestId("collage-image-delete-1"));
        expect(onUpdate).toHaveBeenCalledTimes(1);
        const call = onUpdate.mock.calls[0][0];
        expect(call.layout_config.collage.images).toHaveLength(2);
        expect(call.layout_config.collage.images[0].asset_id).toBe("a-1");
        expect(call.layout_config.collage.images[1].asset_id).toBe("a-3");
        // Background preserved.
        expect(call.layout_config.collage.background_color).toBe("#abcdef");
    });
});

describe("CollageCanvas — C3 z-index controls", () => {
    it("move-forward increments z_index; sibling preserved", () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        images: [
                            {asset_id: "a-1", z_index: 1},
                            {asset_id: "a-2", z_index: 2},
                            {asset_id: "a-3", z_index: 3},
                        ],
                    },
                })}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        );
        // Move image 0 forward (1 → 2).
        fireEvent.click(screen.getByTestId("collage-image-move-forward-0"));
        const call = onUpdate.mock.calls[0][0];
        expect(call.layout_config.collage.images[0].z_index).toBe(2);
        expect(call.layout_config.collage.images[1].z_index).toBe(2);
        expect(call.layout_config.collage.images[2].z_index).toBe(3);
    });

    it("move-backward decrements z_index", () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        images: [
                            {asset_id: "a-1", z_index: 1},
                            {asset_id: "a-2", z_index: 2},
                        ],
                    },
                })}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        );
        fireEvent.click(screen.getByTestId("collage-image-move-backward-1"));
        const call = onUpdate.mock.calls[0][0];
        expect(call.layout_config.collage.images[1].z_index).toBe(1);
    });

    it("move-forward is disabled for the top-most image", () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        images: [
                            {asset_id: "a-1", z_index: 1},
                            {asset_id: "a-2", z_index: 2},
                        ],
                    },
                })}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        );
        const btn = screen.getByTestId("collage-image-move-forward-1");
        expect(btn).toBeDisabled();
    });

    it("move-backward is disabled for the bottom-most image", () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        images: [
                            {asset_id: "a-1", z_index: 1},
                            {asset_id: "a-2", z_index: 2},
                        ],
                    },
                })}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        );
        const btn = screen.getByTestId("collage-image-move-backward-0");
        expect(btn).toBeDisabled();
    });
});

describe("CollageCanvas — C3 add image upload flow", () => {
    it("file upload appends a new image entry with default geometry + sane z_index", async () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        // Mock the api.assets.upload to return a known asset.
        vi.mock("../api/client", async () => {
            const actual = (await vi.importActual(
                "../api/client",
            )) as Record<string, unknown>;
            return {
                ...actual,
                api: {
                    assets: {
                        upload: vi
                            .fn()
                            .mockResolvedValue({id: "asset-new-1"}),
                    },
                },
            };
        });

        render(
            <CollageCanvas
                page={makeCollagePage({
                    collage: {
                        images: [
                            {asset_id: "a-existing", z_index: 5},
                        ],
                    },
                })}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        );
        const input = screen.getByTestId(
            "collage-add-image-file-input",
        ) as HTMLInputElement;
        const file = new File(["x"], "img.png", {type: "image/png"});
        await act(async () => {
            fireEvent.change(input, {target: {files: [file]}});
        });
        expect(onUpdate).toHaveBeenCalledTimes(1);
        const call = onUpdate.mock.calls[0][0];
        const newImages = call.layout_config.collage.images;
        expect(newImages).toHaveLength(2);
        // First image preserved.
        expect(newImages[0].asset_id).toBe("a-existing");
        expect(newImages[0].z_index).toBe(5);
        // New image at default position + size + z_index above
        // the previous max.
        expect(newImages[1].asset_id).toBe("asset-new-1");
        expect(newImages[1].x_pct).toBe(10);
        expect(newImages[1].y_pct).toBe(10);
        expect(newImages[1].width_pct).toBe(30);
        expect(newImages[1].height_pct).toBe(30);
        expect(newImages[1].z_index).toBe(6);
        expect(newImages[1].fit).toBe("cover");
    });
});

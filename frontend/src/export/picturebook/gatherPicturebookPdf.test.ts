import { describe, it, expect, vi, afterEach } from "vitest";
import {
  computeImageTarget,
  blobToDataUrlForPdf,
  MAX_IMAGE_DIM,
} from "./gatherPicturebookPdf";

const realCreateElement = document.createElement.bind(document);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("computeImageTarget (no distortion: aspect ratio preserved)", () => {
  it("leaves an in-cap image untouched (needsResize false)", () => {
    expect(computeImageTarget(800, 600)).toEqual({
      width: 800,
      height: 600,
      needsResize: false,
    });
  });

  it("treats an image exactly at the cap as not needing a resize", () => {
    expect(computeImageTarget(MAX_IMAGE_DIM, MAX_IMAGE_DIM)).toEqual({
      width: MAX_IMAGE_DIM,
      height: MAX_IMAGE_DIM,
      needsResize: false,
    });
  });

  it("downscales a 2:1 landscape image without distorting it", () => {
    const t = computeImageTarget(MAX_IMAGE_DIM * 2, MAX_IMAGE_DIM);
    expect(t.needsResize).toBe(true);
    expect(t.width).toBe(MAX_IMAGE_DIM);
    expect(t.height).toBe(MAX_IMAGE_DIM / 2);
    // ratio preserved
    expect(t.width / t.height).toBeCloseTo(2, 5);
  });

  it("downscales a 1:2 portrait image without distorting it", () => {
    const t = computeImageTarget(MAX_IMAGE_DIM, MAX_IMAGE_DIM * 2);
    expect(t.needsResize).toBe(true);
    expect(t.width).toBe(MAX_IMAGE_DIM / 2);
    expect(t.height).toBe(MAX_IMAGE_DIM);
    expect(t.height / t.width).toBeCloseTo(2, 5);
  });

  it("caps both edges of an oversized square", () => {
    const t = computeImageTarget(MAX_IMAGE_DIM * 3, MAX_IMAGE_DIM * 3);
    expect(t).toEqual({
      width: MAX_IMAGE_DIM,
      height: MAX_IMAGE_DIM,
      needsResize: true,
    });
  });

  it("never returns a zero dimension for an extreme aspect ratio", () => {
    const t = computeImageTarget(MAX_IMAGE_DIM * 100, 10);
    expect(t.width).toBe(MAX_IMAGE_DIM);
    expect(t.height).toBeGreaterThanOrEqual(1);
  });
});

type FakeCtx = {
  fillStyle: string;
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
};

function fakeCanvas() {
  const state = { fillStyleAtFillRect: "", drawCallsAtFillRect: -1 };
  const ctx: FakeCtx = {
    fillStyle: "",
    fillRect: vi.fn(() => {
      state.fillStyleAtFillRect = ctx.fillStyle;
      state.drawCallsAtFillRect = ctx.drawImage.mock.calls.length;
    }),
    drawImage: vi.fn(),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn(() => "data:image/jpeg;base64,RESIZED"),
  };
  return { canvas, ctx, state };
}

function stubBitmap(width: number, height: number) {
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width, height, close })),
  );
  return close;
}

describe("blobToDataUrlForPdf (colour fidelity: no black background)", () => {
  it("white-fills the canvas BEFORE drawing when downscaling (repro #691)", async () => {
    stubBitmap(MAX_IMAGE_DIM * 2, MAX_IMAGE_DIM);
    const { canvas, ctx, state } = fakeCanvas();
    vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
      tag === "canvas" ? (canvas as unknown as HTMLElement) : realCreateElement(tag),
    );

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const result = await blobToDataUrlForPdf(blob);

    expect(canvas.width).toBe(MAX_IMAGE_DIM);
    expect(canvas.height).toBe(MAX_IMAGE_DIM / 2);
    // A white backdrop must be painted so transparent PNGs don't go black.
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(state.fillStyleAtFillRect.toLowerCase()).toBe("#ffffff");
    // ...and it must happen BEFORE the image is drawn.
    expect(state.drawCallsAtFillRect).toBe(0);
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(result).toBe("data:image/jpeg;base64,RESIZED");
  });

  it("returns the ORIGINAL bytes (no re-encode) for an in-cap image", async () => {
    stubBitmap(800, 600);
    const createSpy = vi.spyOn(document, "createElement");

    const blob = new Blob(["hello"], { type: "image/png" });
    const result = await blobToDataUrlForPdf(blob);

    expect(result.startsWith("data:")).toBe(true);
    // NOT the canvas re-encode sentinel — original quality + transparency kept.
    expect(result).not.toBe("data:image/jpeg;base64,RESIZED");
    // No canvas is created at all for an in-cap image.
    expect(createSpy.mock.calls.some((c) => c[0] === "canvas")).toBe(false);
  });

  it("falls back to original bytes when the 2D context is unavailable", async () => {
    stubBitmap(MAX_IMAGE_DIM * 3, MAX_IMAGE_DIM * 3);
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
      toDataURL: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
      tag === "canvas" ? (canvas as unknown as HTMLElement) : realCreateElement(tag),
    );

    const blob = new Blob(["x"], { type: "image/png" });
    const result = await blobToDataUrlForPdf(blob);

    expect(canvas.toDataURL).not.toHaveBeenCalled();
    expect(result.startsWith("data:")).toBe(true);
  });

  it("falls back to original bytes when createImageBitmap throws", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("decode failed");
      }),
    );

    const blob = new Blob(["y"], { type: "image/png" });
    const result = await blobToDataUrlForPdf(blob);

    expect(result.startsWith("data:")).toBe(true);
  });
});
